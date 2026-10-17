"""Assemble a Scene from real data: EA LiDAR DTM/DSM plus vector layers."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import geopandas as gpd
import numpy as np
from affine import Affine
from rasterio.features import rasterize

from .buildings import building_heights, rasterize_footprints, to_bng
from .lidar import Bounds, load_dem
from .scene import LandCover, Scene

EA_ATTRIBUTION = "Contains Environment Agency information © Environment Agency and database right"


def _rasterize_mask(
    gdf: gpd.GeoDataFrame, transform: Affine, shape: tuple[int, int], line_width: float
) -> np.ndarray:
    """Rasterize polygons as-is and lines/points buffered to ``line_width``."""
    geoms = to_bng(gdf).geometry
    geoms = geoms[~(geoms.isna() | geoms.is_empty)]
    is_area = geoms.geom_type.isin(["Polygon", "MultiPolygon"])
    geoms = geoms.where(is_area, geoms.buffer(line_width / 2))
    if geoms.empty:
        return np.zeros(shape, dtype=bool)
    return rasterize(
        ((g, 1) for g in geoms), out_shape=shape, transform=transform, fill=0, dtype="uint8"
    ).astype(bool)


def read_vector(path: str | Path, bounds: Bounds, layer: str | None = None) -> gpd.GeoDataFrame:
    """Read features intersecting ``bounds``; multi-layer files (e.g. GeoPackage) need ``layer``."""
    return gpd.read_file(path, bbox=bounds, layer=layer)


def classify_land_cover(
    building_ids: np.ndarray,
    dsm: np.ndarray,
    dtm: np.ndarray,
    transform: Affine,
    roads: gpd.GeoDataFrame | None = None,
    greenspace: gpd.GeoDataFrame | None = None,
    road_width: float = 7.0,
    tree_height: float = 2.5,
) -> np.ndarray:
    """Classify each cell. Later rules override earlier ones."""
    shape = building_ids.shape
    land_cover = np.full(shape, LandCover.OTHER, dtype=np.uint8)
    if greenspace is not None:
        land_cover[_rasterize_mask(greenspace, transform, shape, 0.0)] = LandCover.GRASS
    # Tall non-building returns are vegetation.
    land_cover[(dsm - dtm > tree_height) & (building_ids == 0)] = LandCover.TREES
    if roads is not None:
        land_cover[_rasterize_mask(roads, transform, shape, road_width)] = LandCover.PAVED
    land_cover[building_ids > 0] = LandCover.BUILDING
    return land_cover


def build_scene(
    name: str,
    dtm_paths: Sequence[str | Path],
    dsm_paths: Sequence[str | Path],
    buildings_path: str | Path,
    bounds: Bounds,
    cell_size: float = 1.0,
    roads_path: str | Path | None = None,
    greenspace_path: str | Path | None = None,
    attribution: Sequence[str] = (),
    buildings_layer: str | None = None,
    roads_layer: str | None = None,
    greenspace_layer: str | None = None,
) -> Scene:
    dtm, transform = load_dem(dtm_paths, bounds, cell_size)
    dsm, _ = load_dem(dsm_paths, bounds, cell_size)
    # DSM can dip below DTM by a few cm from interpolation noise; clamp it.
    dsm = np.maximum(dsm, dtm)

    footprints = read_vector(buildings_path, bounds, buildings_layer)
    ids = rasterize_footprints(footprints, transform, dtm.shape)
    heights = building_heights(ids, dsm, dtm)

    roads = read_vector(roads_path, bounds, roads_layer) if roads_path else None
    greenspace = read_vector(greenspace_path, bounds, greenspace_layer) if greenspace_path else None
    land_cover = classify_land_cover(ids, dsm, dtm, transform, roads, greenspace)

    return Scene(
        name=name,
        cell_size=cell_size,
        origin_x=transform.c,
        origin_y=transform.f,
        crs="EPSG:27700",
        ground=dtm,
        building_height=heights,
        land_cover=land_cover,
        attribution=[EA_ATTRIBUTION, *attribution],
    )
