from __future__ import annotations

import numpy as np
import pytest

from wsim_prep.build import EA_ATTRIBUTION, build_scene
from wsim_prep.buildings import building_heights
from wsim_prep.cli import main
from wsim_prep.export import read_scene
from wsim_prep.lidar import load_dem
from wsim_prep.scene import LandCover

from .conftest import NORTH, WEST, write_tile


def test_load_dem_mosaics_crops_and_fills(fake_area):
    dem, transform = load_dem(fake_area["dtm"], (WEST + 5, NORTH - 60, WEST + 95, NORTH), 1.0)
    assert dem.shape == (60, 90)
    assert (transform.c, transform.f) == (WEST + 5, NORTH)
    np.testing.assert_allclose(dem, 50.0, atol=1e-4)  # seam and dropout both clean


def test_load_dem_resamples(fake_area):
    dem, _ = load_dem(fake_area["dtm"], fake_area["bounds"], 2.0)
    assert dem.shape == (50, 50)


def test_load_dem_rejects_foreign_crs(tmp_path):
    p = write_tile(tmp_path / "wgs.tif", np.zeros((4, 4)), 0.0, 4.0, crs="EPSG:4326")
    with pytest.raises(ValueError, match="expected EPSG:27700"):
        load_dem([p], (0, 0, 4, 4), 1.0)


def test_building_heights_use_median_and_default():
    ids = np.array([[1, 1, 1], [2, 2, 0]], dtype=np.uint32)
    dtm = np.zeros((2, 3), dtype=np.float32)
    dsm = np.array([[8, 8, 30], [0.5, 0.5, 9]], dtype=np.float32)  # chimney; missed building
    h = building_heights(ids, dsm, dtm, default_height=6.0)
    np.testing.assert_array_equal(h, [[8, 8, 8], [6, 6, 0]])


def test_build_scene_end_to_end(fake_area):
    scene = build_scene(
        name="Test",
        dtm_paths=fake_area["dtm"],
        dsm_paths=fake_area["dsm"],
        buildings_path=fake_area["buildings"],
        roads_path=fake_area["roads"],
        roads_layer="Road",
        bounds=fake_area["bounds"],
    )
    assert scene.shape == (100, 100)
    assert scene.attribution[0] == EA_ATTRIBUTION
    np.testing.assert_allclose(scene.building_height[22, 30], 8.0)  # chimney ignored
    np.testing.assert_allclose(scene.building_height[25, 50], 6.0)  # across the tile seam
    np.testing.assert_allclose(scene.building_height[85, 10], 6.0)  # not in LiDAR: default
    assert scene.land_cover[25, 30] == LandCover.BUILDING
    assert scene.land_cover[65, 75] == LandCover.TREES
    assert scene.land_cover[50, 10] == LandCover.PAVED
    assert scene.land_cover[5, 5] == LandCover.OTHER


def test_cli_build(fake_area, tmp_path):
    out = tmp_path / "out"
    main(
        [
            "build",
            "--name",
            "CLI",
            "--out",
            str(out),
            "--dtm",
            *map(str, fake_area["dtm"]),
            "--dsm",
            *map(str, fake_area["dsm"]),
            "--buildings",
            str(fake_area["roads"]),
            "--buildings-layer",
            "Building",
            "--bbox",
            *map(str, fake_area["bounds"]),
            "--attribution",
            "© OpenStreetMap contributors",
        ]
    )
    scene = read_scene(out)
    assert scene.name == "CLI"
    assert scene.attribution[-1] == "© OpenStreetMap contributors"
