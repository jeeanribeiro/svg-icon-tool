import { parseSync, stringify, type INode } from 'svgson';
import svgpath from 'svgpath';
import pathBounds from 'svg-path-bounds';

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

function collectPaths(node: INode, out: INode[]): void {
  if (node.name === 'path' && typeof node.attributes.d === 'string' && node.attributes.d !== '') {
    out.push(node);
  }
  for (const child of node.children) collectPaths(child, out);
}

/**
 * Square, center, and resize an SVG icon.
 *
 * Measures the icon's content, scales it to fill a `size`x`size` view box and
 * centers it, scaling stroke widths proportionally.
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
  const before = stringify(root);

  const warnings: string[] = [];
  const paths: INode[] = [];
  collectPaths(root, paths);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const measurable: INode[] = [];
  for (const node of paths) {
    try {
      const [x1, y1, x2, y2] = pathBounds(node.attributes.d ?? '');
      const sw = parseFloat(node.attributes['stroke-width'] ?? '0') || 0;
      const half = sw / 2;
      minX = Math.min(minX, x1 - half);
      minY = Math.min(minY, y1 - half);
      maxX = Math.max(maxX, x2 + half);
      maxY = Math.max(maxY, y2 + half);
      measurable.push(node);
    } catch (error) {
      warnings.push(`<path>: could not measure path data: ${(error as Error).message}`);
    }
  }

  if (measurable.length === 0) {
    throw new NormalizeError(
      warnings.length > 0
        ? `no measurable content found (${warnings.join('; ')})`
        : 'no measurable content found',
    );
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

  for (const node of measurable) {
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
