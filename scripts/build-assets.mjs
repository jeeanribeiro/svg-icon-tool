/**
 * Regenerates docs/assets from docs/demo by running the built CLI.
 *
 * Every "after" SVG in the README is real output of the tool — never edit
 * them by hand. Run `pnpm build && pnpm assets` after changing the pipeline.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'dist', 'cli.js');
const demoDir = join(root, 'docs', 'demo');
const assetsDir = join(root, 'docs', 'assets');

/** Extra flags per demo icon, mirroring what the README table documents. */
const flags = {
  'bolt.svg': ['--padding', '1'],
};

mkdirSync(assetsDir, { recursive: true });

for (const name of readdirSync(demoDir).filter((f) => f.endsWith('.svg'))) {
  const args = [
    cli,
    join(demoDir, name),
    join(assetsDir, name),
    '--color-mode',
    'preserve',
    ...(flags[name] ?? []),
  ];
  execFileSync(process.execPath, args, { stdio: 'inherit' });
  console.log(`built docs/assets/${name}`);
}
