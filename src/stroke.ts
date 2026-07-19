/**
 * Stroke-aware bounding box expansion.
 *
 * v2 padded the geometric bounds by half the stroke width in every
 * direction. That under-measures two real cases — square line caps (which
 * stick out by up to half·√2 at the corners) and miter joins (which spike
 * out by half·miter-ratio) — so stroked icons could be clipped.
 *
 * The `accurate` policy analyzes the path: it keeps the uniform half-width
 * expansion (an exact cover for round/bevel joins and butt/round caps) and
 * adds the exact corner points of square caps plus the exact tip of every
 * miter join within the miter limit.
 */
import svgpath from 'svgpath';

export type StrokePolicy = 'accurate' | 'half' | 'ignore';

export interface StrokeStyle {
  /** Stroke width in the same coordinate space as the path data. */
  width: number;
  /** stroke-linecap: butt | round | square. */
  linecap: string;
  /** stroke-linejoin: miter | miter-clip | round | bevel | arcs. */
  linejoin: string;
  /** stroke-miterlimit. */
  miterlimit: number;
}

export type Box = [number, number, number, number];

interface Pt {
  x: number;
  y: number;
}

interface Seg {
  end: Pt;
  startDir: Pt | null;
  endDir: Pt | null;
}

interface Subpath {
  start: Pt;
  segs: Seg[];
  closed: boolean;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPS = 1e-9;

function direction(from: Pt, to: Pt): Pt | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  return { x: dx / len, y: dy / len };
}

function firstDefined(...candidates: (Pt | null)[]): Pt | null {
  for (const c of candidates) if (c !== null) return c;
  return null;
}

/** Split a path into subpaths with unit tangents at each segment boundary. */
function analyze(d: string): Subpath[] {
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;

  svgpath(d)
    .abs()
    .unshort()
    .unarc()
    .iterate((segment, _index, lastX, lastY) => {
      const cmd = segment[0];
      const from: Pt = { x: lastX, y: lastY };
      switch (cmd) {
        case 'M': {
          current = {
            start: { x: segment[1], y: segment[2] },
            segs: [],
            closed: false,
          };
          subpaths.push(current);
          break;
        }
        case 'L':
        case 'H':
        case 'V': {
          const end: Pt =
            cmd === 'L'
              ? { x: segment[1], y: segment[2] }
              : cmd === 'H'
                ? { x: segment[1], y: lastY }
                : { x: lastX, y: segment[1] };
          const dir = direction(from, end);
          if (current && dir !== null) {
            current.segs.push({ end, startDir: dir, endDir: dir });
          }
          break;
        }
        case 'C': {
          const c1: Pt = { x: segment[1], y: segment[2] };
          const c2: Pt = { x: segment[3], y: segment[4] };
          const end: Pt = { x: segment[5], y: segment[6] };
          const startDir = firstDefined(
            direction(from, c1),
            direction(from, c2),
            direction(from, end),
          );
          const endDir = firstDefined(direction(c2, end), direction(c1, end), direction(from, end));
          if (current && (startDir !== null || endDir !== null)) {
            current.segs.push({ end, startDir, endDir });
          }
          break;
        }
        case 'Q': {
          const c: Pt = { x: segment[1], y: segment[2] };
          const end: Pt = { x: segment[3], y: segment[4] };
          const startDir = firstDefined(direction(from, c), direction(from, end));
          const endDir = firstDefined(direction(c, end), direction(from, end));
          if (current && (startDir !== null || endDir !== null)) {
            current.segs.push({ end, startDir, endDir });
          }
          break;
        }
        case 'Z':
        case 'z': {
          if (current) {
            const dir = direction(from, current.start);
            if (dir !== null) {
              current.segs.push({ end: current.start, startDir: dir, endDir: dir });
            }
            current.closed = true;
          }
          break;
        }
        default:
          break;
      }
    });

  return subpaths;
}

function include(bounds: Bounds, x: number, y: number): void {
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
}

/** Union the exact corner points of a square cap at `end` facing `outward`. */
function includeSquareCap(bounds: Bounds, end: Pt, outward: Pt, half: number): void {
  const nx = -outward.y;
  const ny = outward.x;
  include(bounds, end.x + outward.x * half + nx * half, end.y + outward.y * half + ny * half);
  include(bounds, end.x + outward.x * half - nx * half, end.y + outward.y * half - ny * half);
}

/** Union the exact miter tip at a join, when it stays within the limit. */
function includeMiterJoin(
  bounds: Bounds,
  vertex: Pt,
  inDir: Pt,
  outDir: Pt,
  half: number,
  miterlimit: number,
): void {
  const dot = Math.max(-1, Math.min(1, inDir.x * outDir.x + inDir.y * outDir.y));
  // The angle between the segments is the angle between -inDir and outDir:
  // sin(theta/2) = sqrt((1 + dot) / 2).
  const sinHalf = Math.sqrt((1 + dot) / 2);
  if (sinHalf < EPS) return; // full reversal: infinite miter renders as bevel
  const ratio = 1 / sinHalf;
  if (ratio > miterlimit + EPS) return; // beyond the limit it becomes a bevel
  const bx = inDir.x - outDir.x;
  const by = inDir.y - outDir.y;
  const blen = Math.hypot(bx, by);
  if (blen < EPS) return; // collinear: covered by the uniform expansion
  const reach = half * ratio;
  include(bounds, vertex.x + (bx / blen) * reach, vertex.y + (by / blen) * reach);
}

/** Expand a geometric bounding box to cover the stroke painted along `d`. */
export function expandBoundsForStroke(
  geometry: Box,
  d: string,
  stroke: StrokeStyle,
  policy: StrokePolicy,
): Box {
  if (policy === 'ignore' || stroke.width <= 0) {
    return geometry;
  }
  const half = stroke.width / 2;
  const bounds: Bounds = {
    minX: geometry[0] - half,
    minY: geometry[1] - half,
    maxX: geometry[2] + half,
    maxY: geometry[3] + half,
  };
  if (policy === 'half') {
    return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  }

  const squareCaps = stroke.linecap === 'square';
  const miterJoins =
    stroke.linejoin === 'miter' || stroke.linejoin === 'miter-clip' || stroke.linejoin === 'arcs';

  if (squareCaps || miterJoins) {
    for (const subpath of analyze(d)) {
      const segs = subpath.segs;
      const first = segs[0];
      const last = segs[segs.length - 1];
      if (first === undefined || last === undefined) continue;

      if (miterJoins) {
        for (let i = 0; i + 1 < segs.length; i += 1) {
          const inDir = segs[i]?.endDir;
          const outDir = segs[i + 1]?.startDir;
          const vertex = segs[i]?.end;
          if (inDir && outDir && vertex) {
            includeMiterJoin(bounds, vertex, inDir, outDir, half, stroke.miterlimit);
          }
        }
        if (subpath.closed && last.endDir && first.startDir) {
          includeMiterJoin(
            bounds,
            subpath.start,
            last.endDir,
            first.startDir,
            half,
            stroke.miterlimit,
          );
        }
      }

      if (squareCaps && !subpath.closed) {
        if (first.startDir) {
          includeSquareCap(
            bounds,
            subpath.start,
            { x: -first.startDir.x, y: -first.startDir.y },
            half,
          );
        }
        if (last.endDir) {
          includeSquareCap(bounds, last.end, last.endDir, half);
        }
      }
    }
  }

  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
}
