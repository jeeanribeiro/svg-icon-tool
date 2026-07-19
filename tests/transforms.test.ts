import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  isIdentity,
  isNonUniform,
  multiply,
  parseTransform,
  scaleFactor,
} from '../src/transforms.js';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';
import { measurePaths } from './measure.js';

describe('parseTransform', () => {
  it('parses translate, scale, rotate, and matrix', () => {
    expect(parseTransform('translate(3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
    const rot = parseTransform('rotate(90)');
    expect(rot[0]).toBeCloseTo(0, 12);
    expect(rot[1]).toBeCloseTo(1, 12);
  });

  it('applies a transform list left to right', () => {
    const m = parseTransform('translate(10 0) scale(2)');
    // point (1, 1) -> scale -> (2, 2) -> translate -> (12, 2)
    expect(m[0] * 1 + m[2] * 1 + m[4]).toBeCloseTo(12);
    expect(m[1] * 1 + m[3] * 1 + m[5]).toBeCloseTo(2);
  });

  it('supports rotate around a center point', () => {
    const m = parseTransform('rotate(180 5 5)');
    // point (0, 0) rotated 180deg around (5, 5) -> (10, 10)
    expect(m[4]).toBeCloseTo(10);
    expect(m[5]).toBeCloseTo(10);
  });

  it('rejects malformed input', () => {
    expect(() => parseTransform('spin(45)')).toThrow(/unknown transform/);
    expect(() => parseTransform('scale(1 2 3)')).toThrow(/wrong number/);
    expect(() => parseTransform('translate(a)')).toThrow(/invalid/);
    expect(() => parseTransform('garbage')).toThrow(/invalid transform/);
  });
});

describe('matrix helpers', () => {
  it('multiplies in SVG order', () => {
    const t = parseTransform('translate(1 2)');
    const s = parseTransform('scale(3)');
    expect(multiply(t, s)).toEqual([3, 0, 0, 3, 1, 2]);
  });

  it('computes the uniform scale factor', () => {
    expect(scaleFactor(parseTransform('scale(2)'))).toBeCloseTo(2);
    expect(scaleFactor(parseTransform('rotate(37) scale(3)'))).toBeCloseTo(3);
  });

  it('detects non-uniform scale and skew', () => {
    expect(isNonUniform(parseTransform('scale(2 2)'))).toBe(false);
    expect(isNonUniform(parseTransform('rotate(45)'))).toBe(false);
    expect(isNonUniform(parseTransform('scale(2 1)'))).toBe(true);
    expect(isNonUniform(parseTransform('skewX(20)'))).toBe(true);
  });

  it('recognizes the identity', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(parseTransform('scale(2)'))).toBe(false);
  });
});

describe('normalizeIcon with transforms', () => {
  it('flattens nested transforms before measuring', () => {
    const { svg, warnings } = normalizeIcon(fixture('transforms.svg'));
    expect(warnings).toEqual([]);
    expect(svg).not.toContain('transform=');

    const extent = measurePaths(svg);
    expect(Math.max(extent.width, extent.height)).toBeCloseTo(24, 1);
    expect(extent.centerX).toBeCloseTo(12, 1);
    expect(extent.centerY).toBeCloseTo(12, 1);

    expect(svg).toMatchSnapshot();
  });

  it('scales stroke widths by the flattened transform', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path transform="scale(2)" d="M2 10h16" fill="none" stroke="#000" stroke-width="1"/>' +
      '</svg>';
    const { svg } = normalizeIcon(input, { size: 40 });
    // Geometry spans 32 wide (2..18 scaled by 2) plus stroke caps; the
    // effective stroke is 2 units before the final fit scale.
    const sw = /stroke-width="([^"]+)"/.exec(svg);
    expect(sw).not.toBeNull();
    expect(parseFloat(sw?.[1] ?? '0')).toBeGreaterThan(1.9);
  });

  it('warns when a non-uniform transform distorts a stroke', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path transform="scale(2 1)" d="M2 10h16v10h-16Z" fill="none" stroke="#000" stroke-width="2"/>' +
      '</svg>';
    const { warnings } = normalizeIcon(input);
    expect(warnings.some((w) => w.includes('non-uniform'))).toBe(true);
  });

  it('warns on an invalid transform instead of failing silently', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path transform="wobble(3)" d="M2 10h16v10h-16Z" fill="#000"/>' +
      '</svg>';
    const { warnings } = normalizeIcon(input);
    expect(warnings.some((w) => w.includes('unknown transform'))).toBe(true);
  });
});
