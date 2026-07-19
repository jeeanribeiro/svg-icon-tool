/**
 * SVG transform parsing and 2x3 affine matrix math.
 *
 * v2 ignored transform attributes entirely, so any icon using
 * translate/scale/rotate/matrix was measured in the wrong coordinate space
 * and produced mis-centered output without a warning. The pipeline now
 * flattens the accumulated transform of every element into its path data.
 */

/** SVG affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m ∘ n — apply n first, then m (matches SVG transform list order). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

const DEG = Math.PI / 180;

const TRANSFORM_RE = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/** Parse an SVG transform list into a single matrix. Throws on invalid input. */
export function parseTransform(input: string): Matrix {
  let matrix: Matrix = IDENTITY;
  let consumed = '';

  for (const match of input.matchAll(TRANSFORM_RE)) {
    consumed += match[0];
    const name = match[1] ?? '';
    const body = (match[2] ?? '').trim();
    const args = body === '' ? [] : body.split(/[\s,]+/).map(Number);
    if (args.some((a) => !Number.isFinite(a))) {
      throw new Error(`invalid arguments in ${name}(${body})`);
    }
    matrix = multiply(matrix, transformToMatrix(name, args, body));
  }

  const leftover = input.replace(TRANSFORM_RE, '').replace(/[\s,]+/g, '');
  if (leftover !== '' || (consumed === '' && input.trim() !== '')) {
    throw new Error(`invalid transform "${input}"`);
  }
  return matrix;
}

function transformToMatrix(name: string, args: number[], body: string): Matrix {
  switch (name) {
    case 'translate': {
      if (args.length < 1 || args.length > 2) break;
      const [tx = 0, ty = 0] = args;
      return [1, 0, 0, 1, tx, ty];
    }
    case 'scale': {
      if (args.length < 1 || args.length > 2) break;
      const sx = args[0] ?? 1;
      const sy = args.length === 2 ? (args[1] ?? sx) : sx;
      return [sx, 0, 0, sy, 0, 0];
    }
    case 'rotate': {
      if (args.length !== 1 && args.length !== 3) break;
      const [angle = 0, cx = 0, cy = 0] = args;
      const cos = Math.cos(angle * DEG);
      const sin = Math.sin(angle * DEG);
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (args.length === 1) return rot;
      return multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
    }
    case 'skewX': {
      if (args.length !== 1) break;
      return [1, 0, Math.tan((args[0] ?? 0) * DEG), 1, 0, 0];
    }
    case 'skewY': {
      if (args.length !== 1) break;
      return [1, Math.tan((args[0] ?? 0) * DEG), 0, 1, 0, 0];
    }
    case 'matrix': {
      if (args.length !== 6) break;
      return [args[0] ?? 1, args[1] ?? 0, args[2] ?? 0, args[3] ?? 1, args[4] ?? 0, args[5] ?? 0];
    }
    default:
      throw new Error(`unknown transform function "${name}"`);
  }
  throw new Error(`wrong number of arguments in ${name}(${body})`);
}

export function toTransformString(m: Matrix): string {
  return `matrix(${m.join(' ')})`;
}

export function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** Area-preserving uniform scale factor of the matrix: √|det|. */
export function scaleFactor(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/**
 * True when the matrix scales the two axes differently (or skews), meaning a
 * stroke drawn under it is no longer a uniform band.
 */
export function isNonUniform(m: Matrix, tolerance = 1e-6): boolean {
  const [a, b, c, d] = m;
  const e = a * a + b * b;
  const f = c * c + d * d;
  const g = a * c + b * d;
  const trace = e + f;
  const disc = Math.sqrt(Math.max(0, (e - f) * (e - f) + 4 * g * g));
  const sMax = Math.sqrt(Math.max(0, (trace + disc) / 2));
  const sMin = Math.sqrt(Math.max(0, (trace - disc) / 2));
  if (sMax === 0) return false;
  return (sMax - sMin) / sMax > tolerance;
}
