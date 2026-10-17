// Land cover colours, indexed by LandCover code (see preprocess/src/wsim_prep/scene.py).
// Shared by the terrain shader (as a uniform array) and the HTML legend.
export const LAND_COVER_COLOURS: readonly (readonly [number, number, number])[] = [
  [0.56, 0.6, 0.42], // other: gardens and yards
  [0.42, 0.43, 0.45], // paved
  [0.66, 0.44, 0.35], // building
  [0.5, 0.68, 0.35], // grass
  [0.25, 0.48, 0.23], // trees
  [0.23, 0.47, 0.71], // water
];

export const MAX_LAND_COVER_CLASSES = 8;

export function cssColour([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
