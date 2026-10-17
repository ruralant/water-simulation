"""Turn building footprints plus LiDAR into a building height grid."""

from __future__ import annotations

import geopandas as gpd
import numpy as np
from affine import Affine
from rasterio.features import rasterize

from .lidar import BNG


def to_bng(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reproject to British National Grid; a missing CRS is assumed to be BNG already."""
    if gdf.crs is None:
        return gdf.set_crs(BNG)
    return gdf.to_crs(BNG)


def rasterize_footprints(
    footprints: gpd.GeoDataFrame, transform: Affine, shape: tuple[int, int]
) -> np.ndarray:
    """Rasterize polygons to a uint32 grid of building ids (1-based; 0 = no building)."""
    shapes = [
        (geom, i + 1)
        for i, geom in enumerate(to_bng(footprints).geometry)
        if geom is not None and not geom.is_empty
    ]
    if not shapes:
        return np.zeros(shape, dtype=np.uint32)
    return rasterize(shapes, out_shape=shape, transform=transform, fill=0, dtype="uint32")


def building_heights(
    ids: np.ndarray,
    dsm: np.ndarray,
    dtm: np.ndarray,
    default_height: float = 6.0,
    min_height: float = 2.0,
    max_height: float = 150.0,
) -> np.ndarray:
    """Per-cell building height above ground, flat per building.

    Each building gets the median of DSM minus DTM over its cells, which gives
    flat roofs and clean vertical walls (what the flow solver wants) while being
    robust to chimneys and edge pixels. Buildings the LiDAR missed (median below
    ``min_height``, e.g. built after the survey) get ``default_height``.
    """
    heights = np.zeros(ids.shape, dtype=np.float32)
    inside = ids > 0
    if not inside.any():
        return heights

    cell_ids = ids[inside]
    diff = (dsm - dtm)[inside]
    order = np.lexsort((diff, cell_ids))
    sorted_ids, sorted_diff = cell_ids[order], diff[order]
    unique_ids, starts, counts = np.unique(sorted_ids, return_index=True, return_counts=True)
    medians = sorted_diff[starts + (counts - 1) // 2]
    medians = np.where(medians < min_height, default_height, np.minimum(medians, max_height))

    lookup = np.zeros(int(ids.max()) + 1, dtype=np.float32)
    lookup[unique_ids] = medians
    return lookup[ids]
