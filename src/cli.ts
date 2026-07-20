#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { Command, InvalidArgumentError, Option } from 'commander';
import { globSync } from 'tinyglobby';
import { optimize } from 'svgo';
import { normalizeIcon, NormalizeError, type NormalizeOptions } from './core.js';

const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

interface CliOptions {
  size: number;
  padding: number;
  precision: number;
  colorMode: 'currentColor' | 'preserve';
  strokePolicy: 'accurate' | 'half' | 'ignore';
  outDir?: string;
  optimize: boolean;
  check: boolean;
  quiet: boolean;
}

function parseNumber(label: string) {
  return (raw: string): number => {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new InvalidArgumentError(`${label} must be a number.`);
    }
    return value;
  };
}

function parseIntStrict(label: string) {
  return (raw: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      throw new InvalidArgumentError(`${label} must be an integer.`);
    }
    return value;
  };
}

/** One unit of work: where the SVG comes from and where it goes. */
interface Job {
  /** Human-readable source label ("-" for stdin). */
  label: string;
  read: () => string;
  /** Output file path, or null to write to stdout. */
  outFile: string | null;
}

class CliError extends Error {}

function fileJob(file: string, outFile: string | null): Job {
  return { label: file, read: () => readFileSync(file, 'utf8'), outFile };
}

function stdinJob(outFile: string | null): Job {
  return { label: '-', read: () => readFileSync(0, 'utf8'), outFile };
}

/** Expand one input argument into concrete files (globs included). */
function expandInput(arg: string): string[] {
  if (existsSync(arg)) return [arg];
  const matches = globSync(arg.replaceAll('\\', '/')).sort();
  if (matches.length === 0) {
    throw new CliError(`no files match "${arg}"`);
  }
  return matches;
}

/** Turn the positional arguments and options into a list of jobs. */
function planJobs(args: string[], opts: CliOptions): Job[] {
  const batch = opts.check || opts.outDir !== undefined;

  if (args.length === 0) {
    throw new CliError('no input given (use "-" to read stdin)');
  }

  if (!batch) {
    // Classic pair: svg-icon-tool <input> <output>, "-" for stdin/stdout.
    if (args.length === 2) {
      const [input = '', output = ''] = args;
      const outFile = output === '-' ? null : output;
      if (input === '-') return [stdinJob(outFile)];
      const files = expandInput(input);
      if (files.length > 1) {
        throw new CliError(
          `"${input}" matches ${files.length} files; use --out-dir (or --check) for batches`,
        );
      }
      return [fileJob(files[0] ?? input, outFile)];
    }
    if (args.length === 1) {
      // Single input, no destination: write the result to stdout.
      const [input = ''] = args;
      if (input === '-') return [stdinJob(null)];
      const files = expandInput(input);
      if (files.length > 1) {
        throw new CliError(
          `"${input}" matches ${files.length} files; use --out-dir (or --check) for batches`,
        );
      }
      return [fileJob(files[0] ?? input, null)];
    }
    throw new CliError('more than two inputs require --out-dir or --check');
  }

  // Batch mode: every argument is an input; nothing is an output path.
  const jobs: Job[] = [];
  const seen = new Map<string, string>();
  for (const arg of args) {
    if (arg === '-') {
      jobs.push(stdinJob(null));
      continue;
    }
    for (const file of expandInput(arg)) {
      let outFile: string | null = null;
      if (opts.outDir !== undefined) {
        const name = basename(file);
        const clash = seen.get(name);
        if (clash !== undefined && clash !== file) {
          throw new CliError(
            `"${file}" and "${clash}" would both be written to ${join(opts.outDir, name)}`,
          );
        }
        seen.set(name, file);
        outFile = join(opts.outDir, name);
      }
      jobs.push(fileJob(file, outFile));
    }
  }
  return jobs;
}

/** Run the full pipeline (normalize, then optionally svgo) on one source. */
function pipeline(raw: string, opts: CliOptions): { svg: string; warnings: string[] } {
  const options: NormalizeOptions = {
    size: opts.size,
    padding: opts.padding,
    precision: opts.precision,
    colorMode: opts.colorMode,
    strokePolicy: opts.strokePolicy,
  };
  const result = normalizeIcon(raw, options);
  let svg = result.svg;
  if (opts.optimize) {
    // preset-default no longer removes the viewBox in SVGO v4, so the
    // normalized geometry survives optimization untouched.
    svg = optimize(svg, {
      multipass: true,
      plugins: [{ name: 'preset-default', params: { floatPrecision: opts.precision } }],
    }).data;
  }
  return { svg, warnings: result.warnings };
}

function run(args: string[], opts: CliOptions): number {
  let jobs: Job[];
  try {
    jobs = planJobs(args, opts);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`error: ${error.message}`);
      return 1;
    }
    throw error;
  }

  let failures = 0;
  let drifted = 0;

  for (const job of jobs) {
    let raw: string;
    try {
      raw = job.read();
    } catch (error) {
      console.error(`error: ${job.label}: ${(error as Error).message}`);
      failures += 1;
      continue;
    }

    let svg: string;
    try {
      const result = pipeline(raw, opts);
      for (const warning of result.warnings) {
        console.error(`warning: ${job.label}: ${warning}`);
      }
      svg = result.svg;
    } catch (error) {
      if (error instanceof NormalizeError) {
        console.error(`error: ${job.label}: ${error.message}`);
        failures += 1;
        continue;
      }
      throw error;
    }

    if (opts.check) {
      if (svg.trim() !== raw.trim()) {
        console.error(`not normalized: ${job.label}`);
        drifted += 1;
      } else if (!opts.quiet) {
        console.error(`ok: ${job.label}`);
      }
      continue;
    }

    if (job.outFile === null) {
      process.stdout.write(`${svg}\n`);
    } else {
      if (opts.outDir !== undefined) {
        mkdirSync(opts.outDir, { recursive: true });
      }
      writeFileSync(job.outFile, `${svg}\n`);
      if (!opts.quiet) {
        console.error(`normalized ${job.label} -> ${job.outFile}`);
      }
    }
  }

  if (opts.check) {
    const total = jobs.length;
    if (drifted > 0 || failures > 0) {
      console.error(
        `${drifted + failures} of ${total} icon${total === 1 ? '' : 's'} ` +
          `need${drifted + failures === 1 ? 's' : ''} attention ` +
          '(re-run without --check to fix)',
      );
      return 1;
    }
    if (!opts.quiet) {
      console.error(`all ${total} icon${total === 1 ? '' : 's'} normalized`);
    }
    return 0;
  }

  return failures > 0 ? 1 : 0;
}

const program = new Command();

program
  .name('svg-icon-tool')
  .description('Square, center, and resize SVG icons — strokes included')
  .version(pkg.version)
  .argument(
    '[inputs...]',
    'SVG files or glob patterns; "-" reads stdin. ' +
      'With two plain arguments the second is the output file ("-" writes stdout).',
  )
  .option('-s, --size <number>', 'target size in user units', parseNumber('size'), 24)
  .option('-p, --padding <number>', 'margin kept on every side', parseNumber('padding'), 0)
  .option(
    '--precision <int>',
    'decimal places kept in coordinates',
    parseIntStrict('precision'),
    3,
  )
  .addOption(
    new Option('--color-mode <mode>', 'repaint everything with currentColor, or keep paints')
      .choices(['currentColor', 'preserve'] as const)
      .default('currentColor'),
  )
  .addOption(
    new Option('--stroke-policy <policy>', 'how strokes count toward the measured bounds')
      .choices(['accurate', 'half', 'ignore'] as const)
      .default('accurate'),
  )
  .option('-o, --out-dir <dir>', 'batch mode: write each input to this directory')
  .option('--optimize', 'run the result through SVGO', false)
  .option(
    '--check',
    'dry run: exit 1 if any icon is not already normalized (nothing is written)',
    false,
  )
  .option('-q, --quiet', 'suppress per-file progress messages', false)
  .action((inputs: string[], options: CliOptions) => {
    process.exitCode = run(inputs, options);
  });

program.parse();
