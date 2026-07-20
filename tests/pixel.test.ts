/**
 * Pixel-level regression: render normalized output with resvg and assert the
 * painted pixels actually fill and center in the box. This catches measuring
 * bugs (clipped strokes, ignored shapes, transform drift) that string-level
 * snapshots cannot see.
 */
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';

const RENDER = 240; // render 24-unit icons at 10x for sub-unit precision

interface PaintedBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function paintedBounds(svg: string): PaintedBox {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: RENDER } }).render();
  const { width, height } = rendered;
  const rgba = rendered.pixels;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (alpha > 16) {
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }
  }
  expect(right, 'expected at least one painted pixel').toBeGreaterThanOrEqual(0);
  return { left, top, right, bottom };
}

/** Assert painted content fills the larger axis and sits centered. */
function expectFilledAndCentered(svg: string, margin = 0): void {
  const box = paintedBounds(svg);
  const scale = RENDER / 24;
  const expectedMargin = margin * scale;
  const tolerance = scale * 0.15; // 0.15 user units of anti-aliasing slack
  const width = box.right - box.left + 1;
  const height = box.bottom - box.top + 1;
  const larger = Math.max(width, height);
  expect(larger).toBeGreaterThanOrEqual(RENDER - 2 * expectedMargin - tolerance);
  expect(larger).toBeLessThanOrEqual(RENDER - 2 * expectedMargin + tolerance);
  // Centered: left margin mirrors right margin, top mirrors bottom.
  expect(Math.abs(box.left - (RENDER - 1 - box.right))).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(box.top - (RENDER - 1 - box.bottom))).toBeLessThanOrEqual(tolerance);
}

describe('pixel regression (resvg)', () => {
  // inherited-stroke.svg is deliberately absent: its last path paints
  // nothing (a line with fill only), so measured geometry exceeds visible
  // pixels there by design.
  for (const name of ['path-basic.svg', 'shapes.svg', 'transforms.svg', 'caps-joins.svg']) {
    it(`fills and centers ${name}`, () => {
      const { svg } = normalizeIcon(fixture(name));
      expectFilledAndCentered(svg);
    });
  }

  it('respects padding at the pixel level', () => {
    const { svg } = normalizeIcon(fixture('caps-joins.svg'), { padding: 3 });
    expectFilledAndCentered(svg, 3);
  });

  it('never paints outside the view box (strokes included)', () => {
    const { svg } = normalizeIcon(fixture('caps-joins.svg'));
    const box = paintedBounds(svg);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThan(RENDER);
    expect(box.bottom).toBeLessThan(RENDER);
  });
});
