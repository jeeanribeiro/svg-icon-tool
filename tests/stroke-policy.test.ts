import { describe, expect, it } from 'vitest';
import { expandBoundsForStroke, type Box } from '../src/stroke.js';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';
import { measurePaths } from './measure.js';

const butt = { linecap: 'butt', linejoin: 'miter', miterlimit: 4 };

describe('expandBoundsForStroke', () => {
  it('ignore policy returns the geometry untouched', () => {
    const box: Box = [0, 0, 10, 10];
    expect(expandBoundsForStroke(box, 'M0 0L10 10', { width: 4, ...butt }, 'ignore')).toEqual(box);
  });

  it('half policy pads uniformly', () => {
    expect(expandBoundsForStroke([0, 0, 10, 0], 'M0 0H10', { width: 2, ...butt }, 'half')).toEqual([
      -1, -1, 11, 1,
    ]);
  });

  it('square caps on a diagonal line stick out past the half-width box', () => {
    const box = expandBoundsForStroke(
      [0, 0, 10, 10],
      'M0 0L10 10',
      { width: 2, linecap: 'square', linejoin: 'miter', miterlimit: 4 },
      'accurate',
    );
    const sqrt2 = Math.SQRT2;
    expect(box[0]).toBeCloseTo(-sqrt2, 6);
    expect(box[1]).toBeCloseTo(-sqrt2, 6);
    expect(box[2]).toBeCloseTo(10 + sqrt2, 6);
    expect(box[3]).toBeCloseTo(10 + sqrt2, 6);
  });

  it('computes the exact miter tip and square cap corners of a chevron', () => {
    // The caps-joins fixture chevron: arms 3-4-5 triangles, so the apex
    // miter ratio is 1/0.6 and the tip lands exactly at y = -1.
    const box = expandBoundsForStroke(
      [4, 4, 28, 20],
      'M4 20L16 4L28 20',
      { width: 6, linecap: 'square', linejoin: 'miter', miterlimit: 4 },
      'accurate',
    );
    expect(box[0]).toBeCloseTo(-0.2, 6);
    expect(box[1]).toBeCloseTo(-1, 6);
    expect(box[2]).toBeCloseTo(32.2, 6);
    expect(box[3]).toBeCloseTo(24.2, 6);
  });

  it('a miter beyond the limit renders as bevel and adds no spike', () => {
    // Very sharp chevron: ratio exceeds the default miterlimit of 4.
    const box = expandBoundsForStroke(
      [0, 0, 10, 20],
      'M0 20L5 0L10 20',
      { width: 4, ...butt },
      'accurate',
    );
    expect(box).toEqual([-2, -2, 12, 22]);
  });

  it('honors a raised miterlimit', () => {
    const spiky = expandBoundsForStroke(
      [0, 0, 10, 20],
      'M0 20L5 0L10 20',
      { width: 4, linecap: 'butt', linejoin: 'miter', miterlimit: 10 },
      'accurate',
    );
    expect(spiky[1]).toBeLessThan(-2);
  });

  it('handles closed paths, joining the last segment back to the first', () => {
    // A thin closed triangle whose sharp vertex sits exactly at the point
    // where Z joins the last segment back to the first one.
    const box = expandBoundsForStroke(
      [0, 0, 20, 5],
      'M20 0L0 5L0 0Z',
      { width: 2, linecap: 'butt', linejoin: 'miter', miterlimit: 10 },
      'accurate',
    );
    // The closure join at (20,0) spikes right, far past the uniform +1.
    expect(box[2]).toBeGreaterThan(22);
  });

  it('round caps and joins never exceed the half-width box', () => {
    const box = expandBoundsForStroke(
      [4, 4, 28, 20],
      'M4 20L16 4L28 20',
      { width: 6, linecap: 'round', linejoin: 'round', miterlimit: 4 },
      'accurate',
    );
    expect(box).toEqual([1, 1, 31, 23]);
  });
});

describe('normalizeIcon stroke policies', () => {
  it('accurate policy keeps square caps and miter joins inside the box', () => {
    const { svg } = normalizeIcon(fixture('caps-joins.svg'));
    const extent = measurePaths(svg, 'accurate');
    expect(extent.minX).toBeGreaterThanOrEqual(-0.001);
    expect(extent.minY).toBeGreaterThanOrEqual(-0.001);
    expect(extent.maxX).toBeLessThanOrEqual(24.001);
    expect(extent.maxY).toBeLessThanOrEqual(24.001);
    expect(Math.max(extent.width, extent.height)).toBeCloseTo(24, 3);
    expect(svg).toMatchSnapshot();
  });

  it('half policy (v2 behavior) clips the same icon', () => {
    const { svg } = normalizeIcon(fixture('caps-joins.svg'), { strokePolicy: 'half' });
    const extent = measurePaths(svg, 'accurate');
    const overflow =
      Math.max(extent.maxX - 24, extent.maxY - 24, -extent.minX, -extent.minY) > 0.05;
    expect(overflow).toBe(true);
  });

  it('ignore policy measures geometry only', () => {
    const { svg } = normalizeIcon(fixture('caps-joins.svg'), { strokePolicy: 'ignore' });
    const extent = measurePaths(svg, 'ignore');
    expect(Math.max(extent.width, extent.height)).toBeCloseTo(24, 3);
  });

  it('rejects an unknown policy', () => {
    expect(() =>
      normalizeIcon(fixture('caps-joins.svg'), {
        strokePolicy: 'wild' as unknown as 'half',
      }),
    ).toThrow(/strokePolicy/);
  });
});
