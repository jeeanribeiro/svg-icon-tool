import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureCliBuilt, fixture, fixturePath, makeTmpDir, runCli } from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

/** Forward-slash the path so it doubles as a glob pattern on Windows. */
function slash(p: string): string {
  return p.replaceAll('\\', '/');
}

describe('stdin / stdout piping', () => {
  it('reads stdin and writes stdout with "- -"', () => {
    const result = runCli(['-', '-'], { input: fixture('path-basic.svg') });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('viewBox="0 0 24 24"');
  });

  it('writes a single input to stdout when no output is given', () => {
    const result = runCli([fixturePath('path-basic.svg')]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('viewBox="0 0 24 24"');
  });

  it('keeps warnings on stderr so stdout stays clean SVG', () => {
    const result = runCli(['-', '-'], { input: fixture('unsupported.svg') });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('warning');
    expect(result.stdout.trimStart().startsWith('<svg')).toBe(true);
  });
});

describe('glob batch mode', () => {
  it('expands globs and writes each icon into --out-dir', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'a.svg'), fixture('path-basic.svg'));
    writeFileSync(join(dir, 'b.svg'), fixture('shapes.svg'));
    const result = runCli([slash(join(dir, '*.svg')), '--out-dir', join(dir, 'out')]);
    expect(result.status).toBe(0);
    for (const name of ['a.svg', 'b.svg']) {
      expect(readFileSync(join(dir, 'out', name), 'utf8')).toContain('viewBox="0 0 24 24"');
    }
  });

  it('fails when a glob matches nothing', () => {
    const dir = makeTmpDir();
    const result = runCli([slash(join(dir, '*.svg')), '--out-dir', join(dir, 'out')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no files match');
  });

  it('refuses to write two different files to one basename', () => {
    const dir = makeTmpDir();
    for (const sub of ['x', 'y']) {
      mkdirSync(join(dir, sub));
      writeFileSync(join(dir, sub, 'icon.svg'), fixture('path-basic.svg'));
    }
    const result = runCli([slash(join(dir, '*', 'icon.svg')), '--out-dir', join(dir, 'out')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('would both be written');
  });

  it('keeps going after a broken file and exits non-zero', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'bad.svg'), 'not svg');
    writeFileSync(join(dir, 'good.svg'), fixture('path-basic.svg'));
    const result = runCli([slash(join(dir, '*.svg')), '--out-dir', join(dir, 'out')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('error');
    expect(readFileSync(join(dir, 'out', 'good.svg'), 'utf8')).toContain('viewBox');
  });

  it('rejects multiple matches without --out-dir or --check', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'a.svg'), fixture('path-basic.svg'));
    writeFileSync(join(dir, 'b.svg'), fixture('path-basic.svg'));
    const result = runCli([slash(join(dir, '*.svg')), join(dir, 'out.svg')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--out-dir');
  });
});

describe('--check', () => {
  it('exits 1 when an icon is not normalized and writes nothing', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'raw.svg');
    writeFileSync(file, fixture('path-basic.svg'));
    const before = readFileSync(file, 'utf8');
    const result = runCli(['--check', file]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not normalized');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('exits 0 once icons have been normalized', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'icon.svg');
    writeFileSync(file, fixture('path-basic.svg'));
    expect(runCli([file, file]).status).toBe(0);
    const result = runCli(['--check', file]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('all 1 icon normalized');
  });

  it('honors the same flags as the write mode', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'icon.svg');
    writeFileSync(file, fixture('path-basic.svg'));
    expect(runCli([file, file, '--size', '32', '--padding', '2']).status).toBe(0);
    // Checked with the same flags: clean. With different flags: drift.
    expect(runCli(['--check', file, '--size', '32', '--padding', '2']).status).toBe(0);
    expect(runCli(['--check', file]).status).toBe(1);
  });
});

describe('--optimize', () => {
  it('still emits a valid, normalized icon', () => {
    const result = runCli(['-', '-', '--optimize'], { input: fixture('shapes.svg') });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('viewBox="0 0 24 24"');
    expect(result.stdout.trimStart().startsWith('<svg')).toBe(true);
  });

  it('never produces larger output than the plain pipeline', () => {
    const plain = runCli(['-', '-'], { input: fixture('transforms.svg') });
    const optimized = runCli(['-', '-', '--optimize'], { input: fixture('transforms.svg') });
    expect(optimized.status).toBe(0);
    expect(optimized.stdout.length).toBeLessThanOrEqual(plain.stdout.length);
  });

  it('round-trips through --check', () => {
    const dir = makeTmpDir();
    const file = join(dir, 'icon.svg');
    writeFileSync(file, fixture('caps-joins.svg'));
    expect(runCli([file, file, '--optimize']).status).toBe(0);
    expect(runCli(['--check', file, '--optimize']).status).toBe(0);
  });
});

describe('option pass-through', () => {
  it('applies --color-mode preserve', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8Z" fill="#0ea5e9"/></svg>';
    const result = runCli(['-', '-', '--color-mode', 'preserve'], { input });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('#0ea5e9');
    expect(result.stdout).not.toContain('currentColor');
  });

  it('rejects an unknown --color-mode', () => {
    const result = runCli(['-', '-', '--color-mode', 'sepia'], { input: '<svg/>' });
    expect(result.status).not.toBe(0);
  });

  it('applies --stroke-policy ignore', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 2h8" fill="none" stroke="#000" stroke-width="4"/></svg>';
    const ignored = runCli(['-', '-', '--stroke-policy', 'ignore'], { input });
    const accurate = runCli(['-', '-'], { input });
    expect(ignored.status).toBe(0);
    expect(ignored.stdout).not.toBe(accurate.stdout);
  });

  it('applies --precision', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L7 13L1 13Z"/></svg>';
    const result = runCli(['-', '-', '--precision', '0'], { input });
    expect(result.status).toBe(0);
    const d = /d="([^"]*)"/.exec(result.stdout)?.[1] ?? '';
    expect(d).not.toContain('.');
  });

  it('rejects a non-numeric --size', () => {
    const result = runCli(['-', '-', '--size', 'big'], { input: '<svg/>' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('size');
  });
});
