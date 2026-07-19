import { parseSync, type INode } from 'svgson';
import pathBounds from 'svg-path-bounds';

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
 * path by half of its own stroke-width. Used to verify that normalized output
 * actually fills and centers within the target box.
 */
export function measurePaths(svg: string): Extent {
  const root = parseSync(svg);
  const paths: INode[] = [];
  collect(root, paths);
  if (paths.length === 0) throw new Error('no <path> elements found');

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of paths) {
    const [x1, y1, x2, y2] = pathBounds(node.attributes.d ?? '');
    const half = (parseFloat(node.attributes['stroke-width'] ?? '0') || 0) / 2;
    minX = Math.min(minX, x1 - half);
    minY = Math.min(minY, y1 - half);
    maxX = Math.max(maxX, x2 + half);
    maxY = Math.max(maxY, y2 + half);
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
