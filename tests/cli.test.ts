import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureCliBuilt, fixturePath, makeTmpDir, runCli } from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('cli', () => {
  it('normalizes a file to a file', () => {
    const dir = makeTmpDir();
    const out = join(dir, 'out.svg');
    const result = runCli([fixturePath('path-basic.svg'), out]);
    expect(result.status).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 24 24"');
  });

  it('accepts --size', () => {
    const dir = makeTmpDir();
    const out = join(dir, 'out.svg');
    const result = runCli([fixturePath('path-basic.svg'), out, '--size', '48']);
    expect(result.status).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('viewBox="0 0 48 48"');
  });

  it('exits non-zero on unusable input', () => {
    const dir = makeTmpDir();
    const bad = join(dir, 'bad.svg');
    writeFileSync(bad, 'garbage');
    const result = runCli([bad, join(dir, 'out.svg')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('error');
  });

  it('prints its version', () => {
    const result = runCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
