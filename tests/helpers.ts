import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, '..');

export function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

export function fixturePath(name: string): string {
  return join(here, 'fixtures', name);
}

export function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'svg-icon-tool-'));
}

const cliPath = join(projectRoot, 'dist', 'cli.js');

/** Build the CLI once if dist/ is missing (CI builds before testing). */
export function ensureCliBuilt(): string {
  if (!existsSync(cliPath)) {
    execSync('pnpm build', { cwd: projectRoot, stdio: 'ignore' });
  }
  return cliPath;
}

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[], options: { input?: string; cwd?: string } = {}): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    input: options.input,
    cwd: options.cwd ?? projectRoot,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
