# Building the real RG1 4EB scene

All data below is free and published under the Open Government Licence (OGL).

## 1. Choose the area

Find the postcode's British National Grid coordinates (e.g. from
<https://api.postcodes.io/postcodes/RG14EB>, fields `eastings` / `northings`, or any
grid reference finder). Start with a box of about **1.5 × 1.5 km** centred on it:

```
WEST  = easting  - 750      SOUTH = northing - 750
EAST  = easting  + 750      NORTH = northing + 750
```

Later, catchment delineation (Phase 1, still to do) will tell us how far uphill the box
really needs to extend.

## 2. LiDAR (Environment Agency)

1. Open the DEFRA Survey Data Download portal: <https://environment.data.gov.uk/survey>.
2. Draw a polygon slightly larger than your box.
3. Download the latest **LIDAR Composite DTM, 1 m** and **LIDAR Composite First Return DSM, 1 m**.
4. Unzip the tiles into `preprocess/data/raw/lidar/dtm/` and `preprocess/data/raw/lidar/dsm/`.

GeoTIFF and ESRI ASCII (`.asc`) tiles both work.

## 3. Buildings, roads and greenspace (Ordnance Survey)

From the OS Data Hub (<https://osdatahub.os.uk/downloads/open>), download as GeoPackage:

* **OS OpenMap Local**, tile **SU**: layers `Building` and `Road`
* **OS Open Greenspace** (optional)

Put them in `preprocess/data/raw/os/`. OpenStreetMap data (e.g. a Berkshire extract from
Geofabrik) also works; pass the matching files and layers instead.

## 4. Build the scene

```bash
cd preprocess
uv run wsim-prep build \
  --name "RG1 4EB, Reading" \
  --out ../web/public/data/rg1 \
  --dtm data/raw/lidar/dtm/*.tif \
  --dsm data/raw/lidar/dsm/*.tif \
  --buildings data/raw/os/opmplc_gb.gpkg --buildings-layer Building \
  --roads data/raw/os/opmplc_gb.gpkg --roads-layer Road \
  --bbox WEST SOUTH EAST NORTH \
  --attribution "Contains OS data © Crown copyright and database right"
```

(The GeoPackage file name depends on the download; check it after unzipping.)

## 5. View it

```bash
cd web && npm run dev
```

Open <http://localhost:5173/?scene=rg1>. Hover to check BNG coordinates, ground levels
and building heights against what you know of the street.

`web/public/data/*` is git-ignored except the synthetic scene. Commit real exports
deliberately if you want them hosted (they are OGL, so this is allowed with attribution).
