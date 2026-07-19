declare module 'svg-path-bounds' {
  /** Returns [left, top, right, bottom] of the path's tight bounding box. */
  export default function pathBounds(d: string): [number, number, number, number];
}
