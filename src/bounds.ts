/**
 * Exact geometric bounding boxes for SVG path data.
 *
 * The off-the-shelf option (svg-path-bounds) unions the *control points* of
 * the normalized curves, not the curves themselves. Control points sit
 * outside the curve whenever an extremum falls mid-segment — true of most
 * hand-drawn cubics, and of every arc segment that does not start and end
 * exactly on a quadrant boundary — so bounds came out too large, icons were
 * scaled too small inside their box, and re-normalizing the tool's own
 * output reported drift (breaking `--check` on clean icon sets).
 *
 * This module measures the curves for real: every segment contributes its
 * endpoints plus the curve values at the roots of each axis derivative.
 */
import svgpath from 'svgpath';

/** [minX, minY, maxX, maxY] of the path's tight geometric bounding box. */
export type Box = [number, number, number, number];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function include(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

/** Evaluate a cubic Bézier component at `t`. */
function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Evaluate a quadratic Bézier component at `t`. */
function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

/**
 * Interior parameter values (0 < t < 1) where one component of a cubic
 * Bézier reaches an extremum: the roots of the derivative
 * 3·[c0·(1−t)² + 2·c1·(1−t)·t + c2·t²] with c_i the control deltas.
 */
function cubicExtremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const c0 = p1 - p0;
  const c1 = p2 - p1;
  const c2 = p3 - p2;
  const a = c0 - 2 * c1 + c2;
  const b = 2 * (c1 - c0);
  const c = c0;
  const roots: number[] = [];
  const scale = Math.abs(b) + Math.abs(c) + 1;
  if (Math.abs(a) < 1e-12 * scale) {
    // Degenerate quadratic: the derivative is (at most) linear.
    if (Math.abs(b) > 1e-12 * scale) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      roots.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** Interior extremum of one component of a quadratic Bézier, if any. */
function quadExtremaT(p0: number, p1: number, p2: number): number[] {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < 1e-12 * (Math.abs(p0) + Math.abs(p1) + Math.abs(p2) + 1)) return [];
  const t = (p0 - p1) / denom;
  return t > 0 && t < 1 ? [t] : [];
}

/**
 * Compute the tight geometric bounding box of SVG path data.
 * Throws when the path data cannot be parsed.
 */
export function pathBounds(d: string): Box {
  const parsed = svgpath(d) as ReturnType<typeof svgpath> & { err: string };
  if (parsed.err !== '') {
    throw new Error(parsed.err);
  }

  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  // After abs + unshort + unarc only M, L, H, V, C, Q, and Z remain.
  parsed
    .abs()
    .unshort()
    .unarc()
    .iterate((segment, _index, lastX, lastY) => {
      switch (segment[0]) {
        case 'M':
        case 'L':
          include(b, segment[1], segment[2]);
          break;
        case 'H':
          include(b, segment[1], lastY);
          break;
        case 'V':
          include(b, lastX, segment[1]);
          break;
        case 'C': {
          const [, x1, y1, x2, y2, x, y] = segment;
          include(b, x, y);
          for (const t of cubicExtremaT(lastX, x1, x2, x)) {
            include(b, cubicAt(lastX, x1, x2, x, t), cubicAt(lastY, y1, y2, y, t));
          }
          for (const t of cubicExtremaT(lastY, y1, y2, y)) {
            include(b, cubicAt(lastX, x1, x2, x, t), cubicAt(lastY, y1, y2, y, t));
          }
          break;
        }
        case 'Q': {
          const [, x1, y1, x, y] = segment;
          include(b, x, y);
          for (const t of quadExtremaT(lastX, x1, x)) {
            include(b, quadAt(lastX, x1, x, t), quadAt(lastY, y1, y, t));
          }
          for (const t of quadExtremaT(lastY, y1, y)) {
            include(b, quadAt(lastX, x1, x, t), quadAt(lastY, y1, y, t));
          }
          break;
        }
        default:
          // Z closes back to points that are already included.
          break;
      }
    });

  if (b.minX === Infinity) return [0, 0, 0, 0];
  return [b.minX, b.minY, b.maxX, b.maxY];
}
