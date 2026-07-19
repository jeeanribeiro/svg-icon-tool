import { parseSync, type INode } from 'svgson';
import pathBounds from 'svg-path-bounds';
import { expandBoundsForStroke, type StrokePolicy } from '../src/stroke.js';

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function collect(node: INode, out: INode[]): void {
  if (node.name === 'path' && typeof node.attributes.d === 'string') out.push(node);
  for (const child of node.children) collect(child, out);
}

/**
 * Measure the extent of all <path> geometry in an SVG string, expanding each
 * painted stroke according to `policy` using the path's own attributes.
 * Used to verify that normalized output actually fills and centers within
 * the target box.
 */
export function measurePaths(svg: string, policy: StrokePolicy = 'half'): Extent {
  const root = parseSync(svg);
  const paths: INode[] = [];
  collect(root, paths);
  if (paths.length === 0) throw new Error('no <path> elements found');

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of paths) {
    const d = node.attributes.d ?? '';
    const geometry = pathBounds(d);
    const stroke = node.attributes.stroke;
    const painted = stroke !== undefined && stroke !== 'none';
    const width = painted ? parseFloat(node.attributes['stroke-width'] ?? '1') || 0 : 0;
    const box = expandBoundsForStroke(
      geometry,
      d,
      {
        width,
        linecap: node.attributes['stroke-linecap'] ?? 'butt',
        linejoin: node.attributes['stroke-linejoin'] ?? 'miter',
        miterlimit: parseFloat(node.attributes['stroke-miterlimit'] ?? '4') || 4,
      },
      policy,
    );
    minX = Math.min(minX, box[0]);
    minY = Math.min(minY, box[1]);
    maxX = Math.max(maxX, box[2]);
    maxY = Math.max(maxY, box[3]);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}
