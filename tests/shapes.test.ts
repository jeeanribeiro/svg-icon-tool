import { describe, expect, it } from 'vitest';
import { pathBounds } from '../src/bounds.js';
import { shapeToPathData } from '../src/shapes.js';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';
import { measurePaths } from './measure.js';

function boundsOf(result: ReturnType<typeof shapeToPathData>): number[] {
  if (result.kind !== 'path') throw new Error(`expected path, got ${result.kind}`);
  return pathBounds(result.d);
}

describe('shapeToPathData', () => {
  it('converts a plain rect', () => {
    const result = shapeToPathData('rect', { x: '2', y: '3', width: '10', height: '4' });
    expect(boundsOf(result)).toEqual([2, 3, 12, 7]);
  });

  it('converts a rounded rect and keeps its bounds', () => {
    const result = shapeToPathData('rect', {
      x: '0',
      y: '0',
      width: '20',
      height: '20',
      rx: '6',
    });
    expect(boundsOf(result)).toEqual([0, 0, 20, 20]);
  });

  it('clamps oversized corner radii', () => {
    const result = shapeToPathData('rect', {
      width: '10',
      height: '10',
      rx: '400',
    });
    expect(boundsOf(result)).toEqual([0, 0, 10, 10]);
  });

  it('converts a circle', () => {
    const result = shapeToPathData('circle', { cx: '5', cy: '5', r: '4' });
    const [x1, y1, x2, y2] = boundsOf(result);
    expect(x1).toBeCloseTo(1, 5);
    expect(y1).toBeCloseTo(1, 5);
    expect(x2).toBeCloseTo(9, 5);
    expect(y2).toBeCloseTo(9, 5);
  });

  it('converts an ellipse', () => {
    const result = shapeToPathData('ellipse', { cx: '10', cy: '10', rx: '6', ry: '3' });
    const [x1, y1, x2, y2] = boundsOf(result);
    expect(x1).toBeCloseTo(4, 5);
    expect(y1).toBeCloseTo(7, 5);
    expect(x2).toBeCloseTo(16, 5);
    expect(y2).toBeCloseTo(13, 5);
  });

  it('converts a line', () => {
    const result = shapeToPathData('line', { x1: '1', y1: '2', x2: '9', y2: '2' });
    expect(boundsOf(result)).toEqual([1, 2, 9, 2]);
  });

  it('converts polyline and polygon', () => {
    const open = shapeToPathData('polyline', { points: '0,10 5,0 10,10' });
    expect(boundsOf(open)).toEqual([0, 0, 10, 10]);
    if (open.kind !== 'path') throw new Error('expected path');
    expect(open.d.endsWith('Z')).toBe(false);

    const closed = shapeToPathData('polygon', { points: '0,10 5,0 10,10' });
    if (closed.kind !== 'path') throw new Error('expected path');
    expect(closed.d.endsWith('Z')).toBe(true);
  });

  it('treats zero-sized shapes as empty', () => {
    expect(shapeToPathData('rect', { width: '0', height: '5' }).kind).toBe('empty');
    expect(shapeToPathData('circle', { r: '0' }).kind).toBe('empty');
    expect(shapeToPathData('polyline', { points: '3,4' }).kind).toBe('empty');
  });

  it('rejects unsupported or invalid lengths', () => {
    expect(shapeToPathData('rect', { width: '50%', height: '5' }).kind).toBe('error');
    expect(shapeToPathData('polyline', { points: '1,2 x,y' }).kind).toBe('error');
  });
});

describe('normalizeIcon with shape primitives', () => {
  it('measures shapes instead of ignoring them', () => {
    const { svg, warnings } = normalizeIcon(fixture('shapes.svg'));
    expect(warnings).toEqual([]);

    // Every primitive is converted to a path.
    for (const tag of ['<rect', '<circle', '<ellipse', '<line', '<polyline', '<polygon']) {
      expect(svg).not.toContain(tag);
    }

    // The content actually fills and centers in the 24px box.
    const extent = measurePaths(svg);
    expect(Math.max(extent.width, extent.height)).toBeCloseTo(24, 1);
    expect(extent.centerX).toBeCloseTo(12, 1);
    expect(extent.centerY).toBeCloseTo(12, 1);
    expect(extent.minX).toBeGreaterThanOrEqual(-0.2);
    expect(extent.minY).toBeGreaterThanOrEqual(-0.2);
    expect(extent.maxX).toBeLessThanOrEqual(24.2);
    expect(extent.maxY).toBeLessThanOrEqual(24.2);

    expect(svg).toMatchSnapshot();
  });
});
