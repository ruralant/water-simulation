// Heightfield terrain: one vertex per cell centre, positions read from the surface texture.

struct Uniforms {
  viewProj: mat4x4f,
  // x: cell size (m), y: vertical scale, z: base elevation (m), w: colour mode (0 land cover, 1 elevation)
  params: vec4f,
  // xyz: direction towards the sun (world space)
  sun: vec4f,
  // x: ground min, y: ground max (m)
  range: vec4f,
  // x: grid width, y: grid height (cells)
  grid: vec4u,
  palette: array<vec4f, 8>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var surface: texture_2d<f32>;
@group(0) @binding(2) var landCover: texture_2d<u32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let cell = vec2u(vi % u.grid.x, vi / u.grid.x);
  let z = textureLoad(surface, vec2i(cell), 0).r;
  let world = vec3f(
    (f32(cell.x) + 0.5) * u.params.x,
    (z - u.params.z) * u.params.y,
    (f32(cell.y) + 0.5) * u.params.x,
  );
  var out: VOut;
  out.pos = u.viewProj * vec4f(world, 1.0);
  out.world = world;
  return out;
}

// Green to tan to brown ramp for bare-earth elevation.
fn hypsometric(t: f32) -> vec3f {
  let low = vec3f(0.24, 0.52, 0.36);
  let mid = vec3f(0.85, 0.8, 0.5);
  let high = vec3f(0.55, 0.36, 0.24);
  return select(mix(mid, high, (t - 0.5) * 2.0), mix(low, mid, t * 2.0), t < 0.5);
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // Flat shading from screen-space derivatives: crisp kerbs and walls.
  let n = normalize(cross(dpdy(in.world), dpdx(in.world)));

  // A wall triangle spans a building cell and the cell below it; stepping half a
  // cell against the wall's normal samples the building, so walls take its colour.
  let maxCell = vec2i(u.grid.xy) - vec2i(1);
  let samplePos = in.world.xz - n.xz * 0.5 * u.params.x;
  let cell = clamp(vec2i(floor(samplePos / u.params.x)), vec2i(0), maxCell);
  let lc = textureLoad(landCover, cell, 0).r;
  let isBuilding = lc == 2u;

  // Interpolated surface elevation: continuous across cells, unlike per-cell lookups.
  let elevation = in.world.y / u.params.y + u.params.z;
  // 0.5 m contour lines, anti-aliased. Computed outside any branch so derivatives stay valid.
  let c = elevation / 0.5;
  let contour = 1.0 - smoothstep(0.0, 1.5 * fwidth(c), abs(fract(c + 0.5) - 0.5));

  var albedo: vec3f;
  if (u.params.w < 0.5) {
    albedo = u.palette[min(lc, 7u)].rgb;
  } else if (isBuilding) {
    albedo = vec3f(0.8);
  } else {
    let t = clamp((elevation - u.range.x) / max(u.range.y - u.range.x, 0.01), 0.0, 1.0);
    // Only draw contours on near-horizontal ground, not on kerbs or wall bases.
    albedo = mix(hypsometric(t), hypsometric(t) * 0.55, contour * smoothstep(0.85, 0.95, n.y));
  }

  let diffuse = max(dot(n, normalize(u.sun.xyz)), 0.0);
  let sky = 0.5 + 0.5 * n.y; // hemispheric ambient: brighter on upward faces
  let colour = albedo * (0.25 + 0.3 * sky + 0.6 * diffuse);
  return vec4f(pow(colour, vec3f(1.0 / 1.1)), 1.0);
}
