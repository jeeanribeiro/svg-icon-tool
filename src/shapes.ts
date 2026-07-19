/**
 * Conversion of SVG shape primitives to equivalent <path> data.
 *
 * v2 only measured <path> elements, so icons built from rect/circle/line/
 * polyline/ellipse/polygon produced silently wrong output. Converting every
 * primitive to path data first makes the rest of the pipeline uniform.
 */

export const SHAPE_NAMES: ReadonlySet<string> = new Set([
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

export type ShapeResult =
  | { kind: 'path'; d: string }
  | { kind: 'empty'; reason: string }
  | { kind: 'error'; reason: string };

type Attrs = Record<string, string>;

class LengthError extends Error {}

/** Parse a length attribute; `fallback` covers a missing attribute. */
function num(attrs: Attrs, name: string, fallback: number): number {
  const raw = attrs[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (raw.includes('%')) {
    throw new LengthError(`percentage length in ${name}="${raw}" is not supported`);
  }
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new LengthError(`invalid length ${name}="${raw}"`);
  }
  return value;
}

function rect(attrs: Attrs): ShapeResult {
  const x = num(attrs, 'x', 0);
  const y = num(attrs, 'y', 0);
  const w = num(attrs, 'width', 0);
  const h = num(attrs, 'height', 0);
  if (w <= 0 || h <= 0) return { kind: 'empty', reason: 'rect with zero width or height' };

  // Auto rules: a missing radius falls back to the other one.
  let rx = num(attrs, 'rx', NaN);
  let ry = num(attrs, 'ry', NaN);
  if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
  if (Number.isNaN(ry)) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);

  if (rx === 0 || ry === 0) {
    return { kind: 'path', d: `M${x} ${y}H${x + w}V${y + h}H${x}Z` };
  }
  return {
    kind: 'path',
    d:
      `M${x + rx} ${y}` +
      `H${x + w - rx}` +
      `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
      `V${y + h - ry}` +
      `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
      `H${x + rx}` +
      `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
      `V${y + ry}` +
      `A${rx} ${ry} 0 0 1 ${x + rx} ${y}` +
      `Z`,
  };
}

function circleOrEllipse(attrs: Attrs, isCircle: boolean): ShapeResult {
  const cx = num(attrs, 'cx', 0);
  const cy = num(attrs, 'cy', 0);

  let rx: number;
  let ry: number;
  if (isCircle) {
    rx = num(attrs, 'r', 0);
    ry = rx;
  } else {
    rx = num(attrs, 'rx', NaN);
    ry = num(attrs, 'ry', NaN);
    if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
    if (Number.isNaN(ry)) ry = rx;
  }
  if (rx <= 0 || ry <= 0) {
    return { kind: 'empty', reason: `${isCircle ? 'circle' : 'ellipse'} with zero radius` };
  }

  // Clockwise, starting at the 3 o'clock point, matching the spec's
  // decomposition so fill-rule behavior is preserved.
  return {
    kind: 'path',
    d:
      `M${cx + rx} ${cy}` +
      `A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}` +
      `A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}` +
      `Z`,
  };
}

function line(attrs: Attrs): ShapeResult {
  const x1 = num(attrs, 'x1', 0);
  const y1 = num(attrs, 'y1', 0);
  const x2 = num(attrs, 'x2', 0);
  const y2 = num(attrs, 'y2', 0);
  return { kind: 'path', d: `M${x1} ${y1}L${x2} ${y2}` };
}

function poly(attrs: Attrs, close: boolean): ShapeResult {
  const raw = attrs.points;
  if (raw === undefined || raw.trim() === '') {
    return { kind: 'empty', reason: 'poly element without points' };
  }
  const coords = raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (coords.some((c) => !Number.isFinite(c))) {
    return { kind: 'error', reason: `invalid points attribute "${raw}"` };
  }
  // Per SVG spec, a trailing odd coordinate invalidates only the final pair.
  if (coords.length % 2 === 1) coords.pop();
  if (coords.length < 4) {
    return { kind: 'empty', reason: 'poly element with fewer than two points' };
  }
  let d = `M${String(coords[0])} ${String(coords[1])}`;
  for (let i = 2; i < coords.length; i += 2) {
    d += `L${String(coords[i])} ${String(coords[i + 1])}`;
  }
  if (close) d += 'Z';
  return { kind: 'path', d };
}

/** Convert a shape primitive into path data. */
export function shapeToPathData(name: string, attrs: Attrs): ShapeResult {
  try {
    switch (name) {
      case 'rect':
        return rect(attrs);
      case 'circle':
        return circleOrEllipse(attrs, true);
      case 'ellipse':
        return circleOrEllipse(attrs, false);
      case 'line':
        return line(attrs);
      case 'polyline':
        return poly(attrs, false);
      case 'polygon':
        return poly(attrs, true);
      default:
        return { kind: 'error', reason: `<${name}> is not a shape primitive` };
    }
  } catch (error) {
    if (error instanceof LengthError) {
      return { kind: 'error', reason: error.message };
    }
    throw error;
  }
}
