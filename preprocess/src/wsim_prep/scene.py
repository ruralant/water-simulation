"""The in-memory scene: aligned rasters on one regular grid, ready to export."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum

import numpy as np


class LandCover(IntEnum):
    """Land cover classes. Codes are stored as uint8 in the exported grid."""

    OTHER = 0  # unclassified open ground (gardens, yards); treated as semi-pervious
    PAVED = 1  # roads, pavements, car parks
    BUILDING = 2
    GRASS = 3  # parks, playing fields
    TREES = 4
    WATER = 5


# Default hydraulic properties per class, exported into meta.json so the browser
# can tune them live. Manning's n in s/m^(1/3); imperviousness is the fraction of
# rain that cannot infiltrate (1 = none soaks in).
LAND_COVER_PROPERTIES: dict[LandCover, dict[str, float]] = {
    LandCover.OTHER: {"manning_n": 0.035, "imperviousness": 0.5},
    LandCover.PAVED: {"manning_n": 0.015, "imperviousness": 1.0},
    LandCover.BUILDING: {"manning_n": 0.015, "imperviousness": 1.0},
    LandCover.GRASS: {"manning_n": 0.035, "imperviousness": 0.2},
    LandCover.TREES: {"manning_n": 0.08, "imperviousness": 0.1},
    LandCover.WATER: {"manning_n": 0.03, "imperviousness": 1.0},
}


@dataclass
class Scene:
    """Aligned grids describing one neighbourhood.

    Arrays are indexed ``[row, col]`` with row 0 at the north edge, matching
    GeoTIFF/raster convention. ``origin_x``/``origin_y`` are the easting and
    northing of the north-west corner of the grid.
    """

    name: str
    cell_size: float
    origin_x: float
    origin_y: float
    crs: str
    ground: np.ndarray  # float32 bare-earth elevation (m above datum)
    building_height: np.ndarray  # float32 height above ground, 0 outside buildings
    land_cover: np.ndarray  # uint8 LandCover codes
    attribution: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.ground = np.ascontiguousarray(self.ground, dtype=np.float32)
        self.building_height = np.ascontiguousarray(self.building_height, dtype=np.float32)
        self.land_cover = np.ascontiguousarray(self.land_cover, dtype=np.uint8)
        shapes = {self.ground.shape, self.building_height.shape, self.land_cover.shape}
        if len(shapes) != 1:
            raise ValueError(f"grid shapes differ: {shapes}")
        if self.ground.ndim != 2:
            raise ValueError("grids must be 2D")
        if not np.isfinite(self.ground).all():
            raise ValueError("ground elevation contains NaN or inf; fill nodata first")

    @property
    def shape(self) -> tuple[int, int]:
        return self.ground.shape  # type: ignore[return-value]
