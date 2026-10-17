from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import LineString, box

WEST, NORTH = 470_000.0, 174_000.0


def write_tile(path: Path, data: np.ndarray, west: float, north: float, crs="EPSG:27700") -> Path:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype="float32",
        crs=crs,
        transform=from_origin(west, north, 1.0, 1.0),
        nodata=-9999.0,
    ) as dst:
        dst.write(data.astype(np.float32), 1)
    return path


@pytest.fixture
def fake_area(tmp_path: Path) -> dict:
    """Two side-by-side 50 x 100 m tiles of a 50 m plane, one building, one road."""
    dtm = np.full((100, 100), 50.0, dtype=np.float32)
    dtm[10, 10] = -9999.0  # a LiDAR dropout to be filled
    dsm = dtm.copy()
    dsm[10, 10] = -9999.0
    dsm[20:30, 20:40] = 58.0  # an 8 m building
    dsm[20:30, 45:60] = 56.0  # a 6 m building crossing the tile seam at x = 50
    dsm[25, 25] = 70.0  # a chimney the median should ignore
    dsm[60:70, 70:80] = 54.0  # 4 m trees, no footprint

    paths = {"dtm": [], "dsm": []}
    for kind, arr in (("dtm", dtm), ("dsm", dsm)):
        for i, west in enumerate((WEST, WEST + 50)):
            p = tmp_path / f"{kind}_{i}.tif"
            paths[kind].append(write_tile(p, arr[:, i * 50 : (i + 1) * 50], west, NORTH))

    def to_geo(col0, row0, col1, row1):
        return box(WEST + col0, NORTH - row1, WEST + col1, NORTH - row0)

    buildings = gpd.GeoDataFrame(
        geometry=[to_geo(20, 20, 40, 30), to_geo(45, 20, 60, 30), to_geo(5, 80, 15, 90)],
        crs="EPSG:27700",
    )
    buildings_path = tmp_path / "buildings.gpkg"
    buildings.to_file(buildings_path)

    roads = gpd.GeoDataFrame(
        geometry=[LineString([(WEST, NORTH - 50.5), (WEST + 100, NORTH - 50.5)])], crs="EPSG:27700"
    )
    # Like OS Open Map Local: several layers in one GeoPackage.
    roads_path = tmp_path / "openmap.gpkg"
    roads.to_file(roads_path, layer="Road")
    buildings.to_file(roads_path, layer="Building")

    return {
        **paths,
        "buildings": buildings_path,
        "roads": roads_path,
        "bounds": (WEST, NORTH - 100, WEST + 100, NORTH),
    }
