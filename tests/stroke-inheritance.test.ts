import { describe, expect, it } from 'vitest';
import { parseSync, type INode } from 'svgson';
import { normalizeIcon } from '../src/index.js';
import { fixture } from './helpers.js';
import { measurePaths } from './measure.js';

function collectByName(node: INode, name: string, out: INode[]): INode[] {
  if (node.name === name) out.push(node);
  for (const child of node.children) collectByName(child, name, out);
  return out;
}

describe('stroke inheritance', () => {
  it('resolves stroke-width inherited from ancestor groups', () => {
    const { svg, warnings } = normalizeIcon(fixture('inherited-stroke.svg'));
    expect(warnings).toEqual([]);

    const root = parseSync(svg);
    const paths = collectByName(root, 'path', []);
    expect(paths).toHaveLength(4);

    const widths = paths.map((p) =>
      p.attributes['stroke-width'] === undefined ? null : parseFloat(p.attributes['stroke-width']),
    );

    // Fixture content spans 42 wide (2..44 including strokes) -> scale 24/42.
    const scale = 24 / 42;
    expect(widths[0]).toBeCloseTo(4 * scale, 5);
    expect(widths[1]).toBeCloseTo(2 * scale, 5);
    // Painted stroke with no stroke-width anywhere defaults to 1.
    expect(widths[2]).toBeCloseTo(1 * scale, 5);
    // stroke-width with no stroke paints nothing and is dropped.
    expect(widths[3]).toBeNull();

    // Groups no longer carry stroke lengths that we cannot rescale.
    const groups = collectByName(root, 'g', []);
    for (const g of groups) {
      expect(g.attributes['stroke-width']).toBeUndefined();
    }

    expect(svg).toMatchSnapshot();
  });

  it('ignores stroke-width when no stroke is painted (v2 over-measured)', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<path d="M0 0h40v40Z" fill="#000" stroke-width="30"/>' +
      '</svg>';
    const { svg } = normalizeIcon(input);
    const extent = measurePaths(svg);
    // Pure geometry must fill the box exactly; a phantom stroke would shrink it.
    expect(extent.width).toBeCloseTo(24, 5);
    expect(extent.height).toBeCloseTo(24, 5);
  });

  it('rescales stroke-dasharray and stroke-dashoffset with the geometry', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<g stroke-dasharray="4 2" stroke-dashoffset="3">' +
      '<path d="M0 24h48" fill="none" stroke="#000" stroke-width="2"/>' +
      '</g></svg>';
    const { svg } = normalizeIcon(input);
    const root = parseSync(svg);
    const path = collectByName(root, 'path', [])[0];
    expect(path).toBeDefined();
    // Geometry spans 48 wide plus half the stroke on each side -> 50.
    const scale = 24 / 50;
    const dash = (path?.attributes['stroke-dasharray'] ?? '').split(' ').map(Number);
    expect(dash[0]).toBeCloseTo(4 * scale, 5);
    expect(dash[1]).toBeCloseTo(2 * scale, 5);
    expect(parseFloat(path?.attributes['stroke-dashoffset'] ?? '0')).toBeCloseTo(3 * scale, 5);
  });
});
