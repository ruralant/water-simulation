"""Load Environment Agency LiDAR tiles (DTM or DSM) onto a target grid."""

from __future__ import annotations

import warnings
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.merge import merge

BNG = CRS.from_epsg(27700)
NODATA = -9999.0

Bounds = tuple[float, float, float, float]  # (west, south, east, north) in metres


def load_dem(
    paths: Sequence[str | Path], bounds: Bounds, cell_size: float
) -> tuple[np.ndarray, Affine]:
    """Mosaic and crop elevation tiles to ``bounds`` at ``cell_size`` resolution.

    EA tiles come as GeoTIFF or ESRI ASCII grids in British National Grid. ASCII
    grids often carry no CRS, so a missing CRS is assumed to be BNG; any other
    CRS is rejected rather than silently reprojected. Small nodata holes (water
    bodies, LiDAR dropouts) are filled by interpolation.
    """
    if not paths:
        raise ValueError("no elevation tiles given")
    datasets = [rasterio.open(p) for p in paths]
    try:
        for ds in datasets:
            if ds.crs is None:
                warnings.warn(f"{ds.name} has no CRS; assuming EPSG:27700", stacklevel=2)
            elif ds.crs != BNG:
                raise ValueError(f"{ds.name} is in {ds.crs}, expected EPSG:27700")
        mosaic, transform = merge(
            datasets,
            bounds=bounds,
            res=cell_size,
            nodata=NODATA,
            dtype="float32",
            resampling=Resampling.bilinear,
        )
    finally:
        for ds in datasets:
            ds.close()

    dem = mosaic[0]
    valid = np.isfinite(dem) & (dem != NODATA)
    if not valid.any():
        raise ValueError(f"tiles do not cover the requested bounds {bounds}")
    if not valid.all():
        dem = fillnodata(dem, mask=valid.astype(np.uint8), max_search_distance=200.0)
        if not np.isfinite(dem).all() or (dem == NODATA).any():
            raise ValueError("could not fill all nodata cells; are tiles missing from the area?")
    return dem.astype(np.float32), transform
