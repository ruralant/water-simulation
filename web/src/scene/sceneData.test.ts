import { describe, expect, it } from 'vitest';
import { cellToBng, parseScene, type SceneMeta } from './sceneData';

const meta = (width: number, height: number): SceneMeta => ({
  formatVersion: 1,
  name: 'test',
  width,
  height,
  cellSize: 2,
  origin: { x: 470000, y: 174000 },
  crs: 'EPSG:27700',
  layers: {
    ground: { file: 'ground.f32', dtype: 'float32' },
    building_height: { file: 'building_height.f32', dtype: 'float32' },
    land_cover: { file: 'land_cover.u8', dtype: 'uint8' },
  },
  stats: { groundMin: 0, groundMax: 1, buildingHeightMax: 8 },
  landCover: [],
  attribution: [],
});

describe('parseScene', () => {
  it('combines ground and building height into the surface', () => {
    const scene = parseScene(meta(2, 1), {
      ground: new Float32Array([10, 11]).buffer,
      building_height: new Float32Array([0, 7]).buffer,
      land_cover: new Uint8Array([0, 2]).buffer,
    });
    expect([...scene.surface]).toEqual([10, 18]);
  });

  it('rejects layers of the wrong size', () => {
    expect(() =>
      parseScene(meta(2, 2), {
        ground: new Float32Array(4).buffer,
        building_height: new Float32Array(3).buffer,
        land_cover: new Uint8Array(4).buffer,
      }),
    ).toThrow(/building_height/);
  });

  it('rejects unknown format versions', () => {
    const m = { ...meta(1, 1), formatVersion: 99 };
    const one = { ground: new ArrayBuffer(4), building_height: new ArrayBuffer(4), land_cover: new ArrayBuffer(1) };
    expect(() => parseScene(m, one)).toThrow(/version 99/);
  });
});

describe('cellToBng', () => {
  it('returns the cell centre with northing decreasing by row', () => {
    expect(cellToBng(meta(10, 10), 0, 0)).toEqual({ easting: 470001, northing: 173999 });
    expect(cellToBng(meta(10, 10), 3, 2)).toEqual({ easting: 470007, northing: 173995 });
  });
});
