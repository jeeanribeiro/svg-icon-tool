import { parseSync, stringify, type INode } from 'svgson';
import svgpath from 'svgpath';
import pathBounds from 'svg-path-bounds';
import { SHAPE_NAMES, shapeToPathData } from './shapes.js';

/** Options accepted by {@link normalizeIcon}. */
export interface NormalizeOptions {
  /** Target square size in user units. Default: 24. */
  size?: number;
}

/** Result returned by {@link normalizeIcon}. */
export interface NormalizeResult {
  /** The normalized SVG document. */
  svg: string;
  /** True when normalization meaningfully altered the icon. */
  changed: boolean;
  /** Human-readable warnings collected while processing. */
  warnings: string[];
}

/** Thrown when an icon cannot be normalized at all. */
export class NormalizeError extends Error {
  override name = 'NormalizeError';
}

type Box = [number, number, number, number];

interface MeasuredItem {
  node: INode;
  box: Box;
}

interface WalkState {
  warnings: string[];
  items: MeasuredItem[];
}

/** Containers whose children participate in measurement. */
const CONTAINER_NAMES = new Set(['svg', 'g', 'a']);

/** Elements preserved verbatim and excluded from measurement. */
const PRESERVED_NAMES = new Set(['title', 'desc', 'metadata', 'defs']);

const SHAPE_GEOMETRY_ATTRS = [
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'r',
  'cx',
  'cy',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
];

function convertNodeToPath(node: INode, d: string): void {
  node.name = 'path';
  for (const attr of SHAPE_GEOMETRY_ATTRS) {
    delete node.attributes[attr]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
  }
  node.attributes.d = d;
}

function measureNode(node: INode, d: string, state: WalkState): void {
  let box: Box;
  try {
    box = pathBounds(d);
  } catch (error) {
    state.warnings.push(`<${node.name}>: could not measure path data: ${(error as Error).message}`);
    return;
  }
  const sw = parseFloat(node.attributes['stroke-width'] ?? '0') || 0;
  const half = sw / 2;
  state.items.push({
    node,
    box: [box[0] - half, box[1] - half, box[2] + half, box[3] + half],
  });
}

function walk(node: INode, state: WalkState): void {
  if (PRESERVED_NAMES.has(node.name)) return;

  if (node.name === 'path') {
    const d = node.attributes.d;
    if (typeof d === 'string' && d.trim() !== '') {
      measureNode(node, d, state);
    }
    return;
  }

  if (SHAPE_NAMES.has(node.name)) {
    const result = shapeToPathData(node.name, node.attributes);
    if (result.kind === 'error') {
      state.warnings.push(`<${node.name}>: ${result.reason}`);
      return;
    }
    if (result.kind === 'empty') {
      state.warnings.push(`<${node.name}>: renders nothing (${result.reason})`);
      return;
    }
    convertNodeToPath(node, result.d);
    measureNode(node, result.d, state);
    return;
  }

  if (CONTAINER_NAMES.has(node.name) || node.children.length > 0) {
    for (const child of node.children) walk(child, state);
  }
}

/**
 * Square, center, and resize an SVG icon.
 *
 * Measures the icon's content — paths and shape primitives alike — scales it
 * to fill a `size`x`size` view box and centers it, scaling stroke widths
 * proportionally. Shape primitives are converted to <path> elements.
 */
export function normalizeIcon(svg: string, options: NormalizeOptions = {}): NormalizeResult {
  const size = options.size ?? 24;
  if (!Number.isFinite(size) || size <= 0) {
    throw new NormalizeError(`invalid size: ${String(options.size)}`);
  }

  let root: INode;
  try {
    root = parseSync(svg);
  } catch (error) {
    throw new NormalizeError(`input is not valid SVG: ${(error as Error).message}`);
  }
  if (root.name !== 'svg') {
    throw new NormalizeError(`root element is <${root.name}>, expected <svg>`);
  }
  const before = stringify(parseSync(svg));

  const state: WalkState = { warnings: [], items: [] };
  walk(root, state);
  const { warnings, items } = state;

  if (items.length === 0) {
    throw new NormalizeError(
      warnings.length > 0
        ? `no measurable content found (${warnings.join('; ')})`
        : 'no measurable content found',
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.box[0]);
    minY = Math.min(minY, item.box[1]);
    maxX = Math.max(maxX, item.box[2]);
    maxY = Math.max(maxY, item.box[3]);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);
  if (!(maxDim > 0)) {
    throw new NormalizeError('content has zero extent');
  }

  const scale = size / maxDim;
  const ox = (size - width * scale) / 2;
  const oy = (size - height * scale) / 2;

  for (const { node } of items) {
    node.attributes.d = svgpath(node.attributes.d ?? '')
      .translate(-minX, -minY)
      .scale(scale)
      .translate(ox, oy)
      .toString();
    const sw = parseFloat(node.attributes['stroke-width'] ?? '0');
    if (sw > 0) {
      node.attributes['stroke-width'] = String(sw * scale);
    }
    if (node.attributes.fill) {
      node.attributes.fill = 'currentColor';
    }
    if (node.attributes.stroke) {
      node.attributes.stroke = 'currentColor';
    }
  }

  root.attributes.viewBox = `0 0 ${size} ${size}`;
  root.attributes.width = String(size);
  root.attributes.height = String(size);
  if (!('xmlns' in root.attributes) || root.attributes.xmlns === '') {
    root.attributes.xmlns = 'http://www.w3.org/2000/svg';
  }

  const output = stringify(root);
  return { svg: output, changed: output !== before, warnings };
}
