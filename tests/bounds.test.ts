import { describe, expect, it } from 'vitest';
import { pathBounds } from '../src/bounds.js';

function expectBox(actual: readonly number[], expected: readonly number[], precision = 6): void {
  for (let i = 0; i < 4; i += 1) {
    expect(actual[i], `bounds[${String(i)}]`).toBeCloseTo(expected[i] ?? NaN, precision);
  }
}

describe('pathBounds', () => {
  it('measures lines and closes exactly', () => {
    expectBox(pathBounds('M1 2L5 -3H-2V7Z'), [-2, -3, 5, 7]);
  });

  it('measures a cubic whose extrema fall mid-segment', () => {
    // B(t) peaks at t=0.5 with y = 0.75 * 100: control points reach 100
    // but the curve itself only reaches 75.
    expectBox(pathBounds('M0 0C0 100 100 100 100 0'), [0, 0, 100, 75]);
  });

  it('measures a quadratic whose extremum falls mid-segment', () => {
    // Peak at t=0.5 with y = 0.5 * 80 = 40.
    expectBox(pathBounds('M0 0Q50 80 100 0'), [0, 0, 100, 40]);
  });

  it('measures semicircle arcs exactly', () => {
    expectBox(pathBounds('M1 0A1 1 0 1 1 -1 0 1 1 0 1 1 1 0Z'), [-1, -1, 1, 1]);
  });

  it('is stable under coordinate rounding of arc endpoints', () => {
    // Rounded output of the tool itself: endpoints marginally closer than
    // 2r, forcing a slightly-over-180-degree large arc. Control-point
    // bounds overshoot this by ~4% of the radius; exact bounds must not.
    const d = 'M18.857 17.143A6.857 6.857 0 1 1 5.143 17.143 6.857 6.857 0 1 1 18.857 17.143Z';
    const [minX, minY, maxX, maxY] = pathBounds(d);
    expect(minX).toBeCloseTo(5.143, 3);
    expect(maxX).toBeCloseTo(18.857, 3);
    expect(minY).toBeCloseTo(10.286, 2);
    expect(maxY).toBeCloseTo(24, 2);
  });

  it('measures rotated arcs (off-quadrant segment boundaries)', () => {
    // A circle is rotation-invariant: bounds must be identical no matter
    // where the arc segmentation starts.
    const circle = 'M1 0A1 1 0 1 1 -1 0 1 1 0 1 1 1 0Z';
    const c30 = Math.cos(Math.PI / 6);
    const rotated = pathBounds(
      // rotate(30) about the origin
      `M${String(c30)} 0.5A1 1 30 1 1 ${String(-c30)} -0.5 1 1 30 1 1 ${String(c30)} 0.5Z`,
    );
    // Arc-to-cubic conversion is accurate to ~3e-4 of the radius.
    expectBox(rotated, pathBounds(circle), 3);
  });

  it('returns a point box for a lone moveto', () => {
    expectBox(pathBounds('M3 4'), [3, 4, 3, 4]);
  });

  it('throws on unparsable path data', () => {
    expect(() => pathBounds('definitely not a path')).toThrow();
  });
});
