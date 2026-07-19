import { parseSync, stringify, type INode } from 'svgson';
import svgpath from 'svgpath';
import pathBounds from 'svg-path-bounds';
import { SHAPE_NAMES, shapeToPathData } from './shapes.js';
import {
  IDENTITY,
  isIdentity,
  isNonUniform,
  multiply,
  parseTransform,
  scaleFactor,
  toTransformString,
  type Matrix,
} from './transforms.js';
import { expandBoundsForStroke, type StrokePolicy } from './stroke.js';

export type { StrokePolicy } from './stroke.js';

/** Options accepted by {@link normalizeIcon}. */
export interface NormalizeOptions {
  /** Target square size in user units. Default: 24. */
  size?: number;
  /**
   * How strokes contribute to the measured bounds:
   * - `accurate` (default): half-width expansion plus the exact extents of
   *   square caps and miter joins, so wide strokes are never clipped.
   * - `half`: v2-compatible half-width padding (may clip caps and miters).
   * - `ignore`: measure geometry only.
   */
  strokePolicy?: StrokePolicy;
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

/** Stroke-related presentation attributes that inherit down the tree. */
const STROKE_INHERITED = [
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
] as const;

/** Stroke lengths that must be rescaled and therefore live on the leaves. */
const STROKE_LENGTH_ATTRS = ['stroke-width', 'stroke-dasharray', 'stroke-dashoffset'] as const;

type StrokeContext = Readonly<Record<string, string>>;

interface MeasuredItem {
  node: INode;
  box: Box;
  /** Uniform scale the flattened transform applied to this element. */
  strokeScale: number;
  /** Resolved stroke width in local units, or null when no stroke is painted. */
  strokeWidth: number | null;
  /** Effective stroke context (inherited and own attributes merged). */
  strokeCtx: StrokeContext;
}

interface WalkState {
  warnings: string[];
  items: MeasuredItem[];
  strokePolicy: StrokePolicy;
}

/** Containers whose children participate in measurement. */
const CONTAINER_NAMES = new Set(['svg', 'g', 'a']);

/** Elements preserved verbatim and excluded from measurement. */
const PRESERVED_NAMES = new Set(['title', 'desc', 'metadata', 'defs']);

/** Hints appended to the unsupported-element warning where one helps. */
const UNSUPPORTED_HINTS: Readonly<Record<string, string>> = {
  text: 'convert text to outlines first',
  tspan: 'convert text to outlines first',
  textPath: 'convert text to outlines first',
  use: 'inline the referenced content first',
  style: 'CSS rules are not evaluated',
};

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

/** Scale every number in a length list (e.g. stroke-dasharray) by `factor`. */
function scaleLengthList(raw: string, factor: number): string | null {
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const values = parts.map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  return values.map((v) => String(v * factor)).join(' ');
}

function convertNodeToPath(node: INode, d: string): void {
  node.name = 'path';
  for (const attr of SHAPE_GEOMETRY_ATTRS) {
    delete node.attributes[attr]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
  }
  node.attributes.d = d;
}

/**
 * Flatten the accumulated transform into the element's path data, so the
 * measurement and the output share one coordinate space.
 */
function flattenTransform(node: INode, d: string, matrix: Matrix): string {
  if (isIdentity(matrix)) return d;
  const flattened = svgpath(d).transform(toTransformString(matrix)).toString();
  node.attributes.d = flattened;
  return flattened;
}

/**
 * Resolve the stroke width painted by an element, honoring inheritance.
 * Returns null when no stroke is painted at all — a bare stroke-width with
 * no stroke paints nothing and must not affect measurement (a v2 bug).
 */
function resolveStrokeWidth(node: INode, ctx: StrokeContext, state: WalkState): number | null {
  const paint = ctx.stroke;
  if (paint === undefined || paint.trim() === '' || paint.trim() === 'none') return null;
  const raw = ctx['stroke-width'];
  if (raw === undefined) return 1;
  const width = parseFloat(raw);
  if (!Number.isFinite(width) || width < 0) {
    state.warnings.push(`<${node.name}>: invalid stroke-width "${raw}", using 1`);
    return 1;
  }
  return width;
}

function measureNode(
  node: INode,
  d: string,
  matrix: Matrix,
  ctx: StrokeContext,
  state: WalkState,
): void {
  const flattened = flattenTransform(node, d, matrix);
  let box: Box;
  try {
    box = pathBounds(flattened);
  } catch (error) {
    state.warnings.push(`<${node.name}>: could not measure path data: ${(error as Error).message}`);
    return;
  }
  const strokeScale = scaleFactor(matrix);
  const strokeWidth = resolveStrokeWidth(node, ctx, state);
  const sw = (strokeWidth ?? 0) * strokeScale;
  if (sw > 0 && isNonUniform(matrix)) {
    state.warnings.push(
      `<${node.name}>: non-uniform transform distorts its stroke; the width is approximated`,
    );
  }
  const miterlimitRaw = ctx['stroke-miterlimit'];
  const miterlimit = miterlimitRaw === undefined ? 4 : parseFloat(miterlimitRaw);
  state.items.push({
    node,
    box: expandBoundsForStroke(
      box,
      flattened,
      {
        width: sw,
        linecap: ctx['stroke-linecap'] ?? 'butt',
        linejoin: ctx['stroke-linejoin'] ?? 'miter',
        miterlimit: Number.isFinite(miterlimit) && miterlimit >= 1 ? miterlimit : 4,
      },
      state.strokePolicy,
    ),
    strokeScale,
    strokeWidth,
    strokeCtx: ctx,
  });
}

/** Resolve this element's total transform and strip the attribute. */
function resolveMatrix(node: INode, parent: Matrix, state: WalkState): Matrix {
  const raw = node.attributes.transform;
  delete node.attributes.transform;
  if (raw === undefined || raw.trim() === '') return parent;
  try {
    return multiply(parent, parseTransform(raw));
  } catch (error) {
    state.warnings.push(`<${node.name}>: ignoring ${(error as Error).message}`);
    return parent;
  }
}

/** Merge this element's own stroke attributes over the inherited context. */
function resolveStrokeContext(node: INode, parent: StrokeContext): StrokeContext {
  let ctx: Record<string, string> | null = null;
  for (const key of STROKE_INHERITED) {
    const own = node.attributes[key];
    if (own !== undefined) {
      ctx ??= { ...parent };
      ctx[key] = own;
    }
  }
  return ctx ?? parent;
}

function walk(node: INode, parentMatrix: Matrix, parentCtx: StrokeContext, state: WalkState): void {
  if (PRESERVED_NAMES.has(node.name)) return;
  if (node.type === 'text' || node.name === '') return;

  const display = node.attributes.display?.trim();
  const visibility = node.attributes.visibility?.trim();
  if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') {
    state.warnings.push(`<${node.name}>: hidden element skipped (display/visibility)`);
    return;
  }

  const matrix = resolveMatrix(node, parentMatrix, state);
  const ctx = resolveStrokeContext(node, parentCtx);

  if (node.name === 'path') {
    const d = node.attributes.d;
    if (typeof d === 'string' && d.trim() !== '') {
      measureNode(node, d, matrix, ctx, state);
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
    measureNode(node, result.d, matrix, ctx, state);
    return;
  }

  if (CONTAINER_NAMES.has(node.name)) {
    // Stroke lengths are rescaled per leaf, so containers must not keep
    // stale copies that would re-apply to the scaled geometry.
    for (const attr of STROKE_LENGTH_ATTRS) {
      delete node.attributes[attr]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
    }
    for (const child of node.children) walk(child, matrix, ctx, state);
    return;
  }

  // Anything else is unsupported: v2 dropped these on the floor without a
  // word. The element is left in place untouched, but it does not
  // contribute to measurement and will not line up with the normalized
  // geometry, so say so.
  const hint = UNSUPPORTED_HINTS[node.name];
  state.warnings.push(
    `<${node.name}> is not supported and is excluded from measurement` +
      (hint === undefined ? '' : ` (${hint})`),
  );
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
  const strokePolicy = options.strokePolicy ?? 'accurate';
  if (!['accurate', 'half', 'ignore'].includes(strokePolicy)) {
    throw new NormalizeError(`invalid strokePolicy: ${String(options.strokePolicy)}`);
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

  const state: WalkState = { warnings: [], items: [], strokePolicy };
  walk(root, IDENTITY, {}, state);
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

  for (const { node, strokeScale, strokeWidth, strokeCtx } of items) {
    node.attributes.d = svgpath(node.attributes.d ?? '')
      .translate(-minX, -minY)
      .scale(scale)
      .translate(ox, oy)
      .toString();

    const lengthScale = strokeScale * scale;
    if (strokeWidth !== null) {
      // Stroke lengths land on the leaf, resolved and rescaled, so the
      // output no longer depends on inherited values that we cannot scale.
      node.attributes['stroke-width'] = String(strokeWidth * lengthScale);
      for (const attr of ['stroke-dasharray', 'stroke-dashoffset'] as const) {
        const raw = strokeCtx[attr];
        if (raw !== undefined && raw.trim() !== '' && raw.trim() !== 'none') {
          const scaled = scaleLengthList(raw, lengthScale);
          if (scaled === null) {
            warnings.push(`<path>: could not rescale ${attr}="${raw}"`);
          } else {
            node.attributes[attr] = scaled;
          }
        }
      }
    } else {
      // A stroke-width without a stroke paints nothing; drop the noise.
      delete node.attributes['stroke-width'];
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
