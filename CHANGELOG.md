# svg-icon-tool

## 3.0.1

### Patch changes

- Path bounds are now computed from true curve extrema instead of the control-point hull. Curves whose control points reach outside the drawn geometry — most hand-drawn cubics, and every arc segment that does not start and end on a quadrant boundary — were measured too large, so those icons came out under-scaled with phantom margins (up to 25% of the box for a plain two-cubic lens shape). The same overestimate made re-normalizing the tool's own arc output report drift, so `--check` failed on clean icon sets. Both are fixed, the `svg-path-bounds` dependency is gone, and idempotence is now covered by tests.

## 3.0.0

### Major changes

- Restructured as a typed library plus a thin CLI: `import { normalizeIcon } from 'svg-icon-tool'` (ESM + CJS + TypeScript types), with the `svg-icon-tool` binary built on top.
- Shape primitives (`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`) are now converted to paths and measured; v2 silently ignored them.
- `transform` attributes are flattened into path data before measuring; v2 ignored them and produced mis-centered output.
- Inherited `stroke-width` is resolved through groups, and stroke bounds account for square caps and miter joins (`--stroke-policy accurate`, the new default). The v2 half-width approximation remains available as `--stroke-policy half`.
- Unsupported content (`<text>`, `<image>`, `<use>`, hidden elements) now produces explicit warnings instead of silence, and per-file errors no longer abort a batch.
- The v2 behavior of repainting every fill/stroke with `currentColor` is now an explicit, documented default with an escape hatch: `--color-mode preserve`.
- Requires Node 24+.

### Minor changes

- Glob batch mode with `--out-dir`; `-` reads stdin and writes stdout.
- `--check` dry-runs the pipeline and exits non-zero when icons are not normalized — an icon-set lint step for CI.
- `--optimize` runs the result through SVGO 4.
- `--padding` keeps a margin inside the box; `--precision` controls emitted decimals (default 3).
- Browser playground at <https://jeeanribeiro.github.io/svg-icon-tool/> built on the same library.
