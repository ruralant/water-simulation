# Scene data format (version 1)

`wsim-prep` writes one directory per scene; the browser loads it from
`web/public/data/<scene>/` and selects it with `?scene=<scene>`.

```
<scene>/
  meta.json
  ground.f32            bare-earth elevation, metres above datum
  building_height.f32   height above ground, 0 outside buildings
  land_cover.u8         LandCover class codes
```

## Grids

* Raw little-endian binary, no header.
* Row-major, `width × height` values; **row 0 is the north edge**, column 0 the west edge.
* All layers share one grid. Cell `(col, row)` has its centre at
  `easting = origin.x + (col + 0.5) × cellSize`,
  `northing = origin.y − (row + 0.5) × cellSize`.
* The surface the water flows over (and the renderer draws) is `ground + building_height`.

## meta.json

| Field | Meaning |
|---|---|
| `formatVersion` | `1`; readers reject other versions |
| `name` | Display name |
| `width`, `height` | Grid size in cells |
| `cellSize` | Metres |
| `origin` | `{x, y}`: easting/northing of the north-west corner |
| `crs` | Always `EPSG:27700` (British National Grid) |
| `layers` | `{ground, building_height, land_cover}` → `{file, dtype}` |
| `stats` | `groundMin`, `groundMax`, `buildingHeightMax` |
| `landCover` | Class table: `code`, `name`, `manning_n`, `imperviousness` |
| `attribution` | Lines to display for data licences |

## Land cover classes

| Code | Name | Manning's n | Imperviousness |
|---|---|---|---|
| 0 | other (gardens, yards) | 0.035 | 0.5 |
| 1 | paved | 0.015 | 1.0 |
| 2 | building | 0.015 | 1.0 |
| 3 | grass | 0.035 | 0.2 |
| 4 | trees | 0.08 | 0.1 |
| 5 | water | 0.03 | 1.0 |

The hydraulic values are defaults shipped in `meta.json` so the browser can tune them;
the single source of truth is `preprocess/src/wsim_prep/scene.py`.
