import type { Vec3 } from 'wgpu-matrix';

export interface HeightfieldView {
  width: number;
  height: number;
  cellSize: number;
  /** Surface elevation per cell, row-major. */
  surface: Float32Array;
  /** Elevation subtracted before scaling, so world y = (z - base) * verticalScale. */
  baseElevation: number;
  verticalScale: number;
}

/**
 * Find the cell under a world-space ray by marching across the heightfield,
 * then bisecting the last step. Returns null if the ray misses the grid.
 */
export function pickCell(
  hf: HeightfieldView,
  origin: Vec3,
  dir: Vec3,
): { col: number; row: number } | null {
  const sizeX = hf.width * hf.cellSize;
  const sizeZ = hf.height * hf.cellSize;
  const step = hf.cellSize * 0.5;
  const maxT = Math.hypot(sizeX, sizeZ) * 4 + Math.abs(origin[1]!) * 4;

  const above = (t: number): boolean | null => {
    const x = origin[0]! + dir[0]! * t;
    const y = origin[1]! + dir[1]! * t;
    const z = origin[2]! + dir[2]! * t;
    const col = Math.floor(x / hf.cellSize);
    const row = Math.floor(z / hf.cellSize);
    if (col < 0 || row < 0 || col >= hf.width || row >= hf.height) return null;
    return y > (hf.surface[row * hf.width + col]! - hf.baseElevation) * hf.verticalScale;
  };

  let prevT = 0;
  let enteredGrid = false;
  for (let t = 0; t <= maxT; t += step) {
    const a = above(t);
    if (a === null) {
      if (enteredGrid) return null; // left the grid without hitting anything
      prevT = t;
      continue;
    }
    enteredGrid = true;
    if (!a) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (above(mid) === false) hi = mid;
        else lo = mid;
      }
      const x = origin[0]! + dir[0]! * hi;
      const z = origin[2]! + dir[2]! * hi;
      return {
        col: Math.min(hf.width - 1, Math.max(0, Math.floor(x / hf.cellSize))),
        row: Math.min(hf.height - 1, Math.max(0, Math.floor(z / hf.cellSize))),
      };
    }
    prevT = t;
  }
  return null;
}
