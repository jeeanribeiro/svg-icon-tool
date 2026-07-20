# Contributing

Thanks for helping improve svg-icon-tool!

## Setup

```sh
pnpm install
pnpm build
pnpm test
```

Node 24+ and pnpm 10 are the supported toolchain (`corepack enable` sets up
pnpm from the `packageManager` field).

## Before you open a PR

- `pnpm lint && pnpm typecheck && pnpm test` must pass.
- New behavior needs a test — fixture-based tests live in `tests/`, with
  small SVG inputs under `tests/fixtures/`.
- If you change the output format, regenerate the README assets with
  `pnpm build && pnpm assets` and commit the result. Never hand-edit files
  in `docs/assets/`.
- Add a changeset for user-facing changes: `pnpm changeset`.

## Reporting bugs

Please include the smallest SVG that reproduces the problem and the exact
command or `normalizeIcon` options you used. "Expected vs. actual" as two
SVG snippets is the fastest path to a fix.
