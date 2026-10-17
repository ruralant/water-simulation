// Loader for the scene format written by wsim-prep (see docs/DATA_FORMAT.md).

export const FORMAT_VERSION = 1;

export interface LandCoverClass {
  code: number;
  name: string;
  manning_n: number;
  imperviousness: number;
}

export interface SceneMeta {
  formatVersion: number;
  name: string;
  width: number;
  height: number;
  cellSize: number;
  /** Easting/northing of the north-west corner of the grid. */
  origin: { x: number; y: number };
  crs: string;
  layers: Record<'ground' | 'building_height' | 'land_cover', { file: string; dtype: string }>;
  stats: { groundMin: number; groundMax: number; buildingHeightMax: number };
  landCover: LandCoverClass[];
  attribution: string[];
}

export interface SceneData {
  meta: SceneMeta;
  /** Bare-earth elevation, row-major with row 0 at the north edge. */
  ground: Float32Array;
  /** Height above ground, 0 outside buildings. */
  buildingHeight: Float32Array;
  landCover: Uint8Array;
  /** ground + buildingHeight: the surface water flows around and the renderer draws. */
  surface: Float32Array;
}

export function parseScene(
  meta: SceneMeta,
  buffers: { ground: ArrayBuffer; building_height: ArrayBuffer; land_cover: ArrayBuffer },
): SceneData {
  if (meta.formatVersion !== FORMAT_VERSION) {
    throw new Error(`Unsupported scene format version ${meta.formatVersion}`);
  }
  const cells = meta.width * meta.height;
  const ground = new Float32Array(buffers.ground);
  const buildingHeight = new Float32Array(buffers.building_height);
  const landCover = new Uint8Array(buffers.land_cover);
  for (const [name, arr] of [['ground', ground], ['building_height', buildingHeight], ['land_cover', landCover]] as const) {
    if (arr.length !== cells) {
      throw new Error(`Layer ${name} has ${arr.length} cells, expected ${meta.width} x ${meta.height}`);
    }
  }
  const surface = new Float32Array(cells);
  for (let i = 0; i < cells; i++) surface[i] = ground[i]! + buildingHeight[i]!;
  return { meta, ground, buildingHeight, landCover, surface };
}

export async function loadScene(baseUrl: string): Promise<SceneData> {
  const fetchOk = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
    return res;
  };
  const meta = (await (await fetchOk(`${baseUrl}/meta.json`)).json()) as SceneMeta;
  const [ground, building_height, land_cover] = await Promise.all(
    (['ground', 'building_height', 'land_cover'] as const).map(async (layer) =>
      (await fetchOk(`${baseUrl}/${meta.layers[layer].file}`)).arrayBuffer(),
    ),
  );
  return parseScene(meta, { ground: ground!, building_height: building_height!, land_cover: land_cover! });
}

/** British National Grid coordinates of the centre of a cell. */
export function cellToBng(meta: SceneMeta, col: number, row: number): { easting: number; northing: number } {
  return {
    easting: meta.origin.x + (col + 0.5) * meta.cellSize,
    northing: meta.origin.y - (row + 0.5) * meta.cellSize,
  };
}
