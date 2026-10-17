import { describe, expect, it } from 'vitest';
import { vec3 } from 'wgpu-matrix';
import { OrbitCamera } from '../render/camera';
import { pickCell, type HeightfieldView } from './pick';

// 10 x 10 flat ground at 0 m with a 5 m "building" at column 6, row 4.
function field(): HeightfieldView {
  const surface = new Float32Array(100);
  surface[4 * 10 + 6] = 5;
  return { width: 10, height: 10, cellSize: 1, surface, baseElevation: 0, verticalScale: 1 };
}

describe('pickCell', () => {
  it('hits the ground straight below the ray', () => {
    const hit = pickCell(field(), vec3.create(2.5, 20, 7.5), vec3.create(0, -1, 0));
    expect(hit).toEqual({ col: 2, row: 7 });
  });

  it('stops at a building wall rather than the ground behind it', () => {
    // Shallow ray travelling east at 2 m height along row 4: hits the building side.
    const hit = pickCell(field(), vec3.create(0.5, 2, 4.5), vec3.normalize(vec3.create(1, -0.01, 0)));
    expect(hit).toEqual({ col: 6, row: 4 });
  });

  it('returns null when the ray misses the grid', () => {
    expect(pickCell(field(), vec3.create(50, 20, 50), vec3.create(0, -1, 0))).toBeNull();
  });

  it('agrees with the camera ray through the screen centre', () => {
    const camera = new OrbitCamera();
    camera.target = vec3.create(5.5, 0, 5.5);
    camera.distance = 30;
    const { origin, dir } = camera.ray(0, 0, 1.5);
    expect(pickCell(field(), origin, dir)).toEqual({ col: 5, row: 5 });
  });
});
