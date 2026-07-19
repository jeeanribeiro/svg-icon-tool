#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { normalizeIcon, NormalizeError } from './core.js';

const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

program
  .name('svg-icon-tool')
  .description('Square, center, and resize SVG icons — strokes included')
  .version(pkg.version)
  .argument('<input>', 'input SVG file')
  .argument('<output>', 'output SVG file')
  .option('-s, --size <number>', 'target size in user units', '24')
  .action((input: string, output: string, options: { size: string }) => {
    const size = Number(options.size);
    try {
      const raw = readFileSync(input, 'utf8');
      const result = normalizeIcon(raw, { size });
      for (const warning of result.warnings) {
        console.error(`warning: ${input}: ${warning}`);
      }
      writeFileSync(output, result.svg);
      console.error(`normalized ${input} -> ${output}`);
    } catch (error) {
      if (error instanceof NormalizeError) {
        console.error(`error: ${input}: ${error.message}`);
      } else {
        console.error(`error: ${(error as Error).message}`);
      }
      process.exitCode = 1;
    }
  });

program.parse();
