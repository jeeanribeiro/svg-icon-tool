/**
 * Normalizing already-normalized output must be a no-op: this is the
 * contract behind `changed` and the CLI's `--check` mode. It regressed once
 * when control-point bounds over-measured arc segments, so the second pass
 * saw a "bigger" icon and re-scaled it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeIcon } from '../src/index.js';
import { ensureCliBuilt, fixture, fixturePath, runCli } from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

const FIXTURES = ['path-basic.svg', 'shapes.svg', 'transforms.svg', 'caps-joins.svg', 'curves.svg'];

describe('idempotence', () => {
  for (const name of FIXTURES) {
    it(`re-normalizing ${name} output reports no change`, () => {
      const first = normalizeIcon(fixture(name));
      const second = normalizeIcon(first.svg);
      expect(second.changed).toBe(false);
      expect(second.svg).toBe(first.svg);
    });
  }

  it('holds in preserve color mode too', () => {
    const options = { colorMode: 'preserve' } as const;
    const first = normalizeIcon(fixture('shapes.svg'), options);
    const second = normalizeIcon(first.svg, options);
    expect(second.changed).toBe(false);
  });

  it('--check exits 0 on freshly normalized files and 1 on raw ones', () => {
    const raw = runCli(['--check', fixturePath('shapes.svg')]);
    expect(raw.status).toBe(1);
    expect(raw.stderr).toContain('not normalized');

    const normalized = runCli([fixturePath('shapes.svg'), '-']);
    expect(normalized.status).toBe(0);
    const clean = runCli(['--check', '-'], { input: normalized.stdout });
    expect(clean.stderr).not.toContain('not normalized');
    expect(clean.status).toBe(0);
  });
});
