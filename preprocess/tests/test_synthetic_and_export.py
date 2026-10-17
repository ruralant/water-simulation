from __future__ import annotations

import json

import numpy as np

from wsim_prep.export import read_scene, write_scene
from wsim_prep.scene import LandCover
from wsim_prep.synthetic import make_synthetic_scene


def test_synthetic_scene_is_plausible():
    scene = make_synthetic_scene(size_m=200, cell_size=1.0)
    assert scene.shape == (200, 200)
    assert np.isfinite(scene.ground).all()
    is_building = scene.land_cover == LandCover.BUILDING
    assert 0.1 < is_building.mean() < 0.5
    assert (scene.building_height[is_building] > 6).all()
    assert (scene.building_height[~is_building] == 0).all()
    assert (scene.land_cover == LandCover.PAVED).any()


def test_synthetic_scene_is_deterministic():
    a, b = make_synthetic_scene(size_m=100), make_synthetic_scene(size_m=100)
    assert np.array_equal(a.ground, b.ground)
    assert np.array_equal(a.building_height, b.building_height)


def test_export_round_trip(tmp_path):
    scene = make_synthetic_scene(size_m=120, cell_size=2.0)
    write_scene(scene, tmp_path)

    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["width"] == meta["height"] == 60
    assert meta["cellSize"] == 2.0
    assert (tmp_path / "ground.f32").stat().st_size == 60 * 60 * 4
    assert (tmp_path / "land_cover.u8").stat().st_size == 60 * 60
    assert {lc["code"] for lc in meta["landCover"]} == {int(lc) for lc in LandCover}

    back = read_scene(tmp_path)
    assert np.array_equal(back.ground, scene.ground)
    assert np.array_equal(back.building_height, scene.building_height)
    assert np.array_equal(back.land_cover, scene.land_cover)
    assert back.origin_x == scene.origin_x and back.origin_y == scene.origin_y
