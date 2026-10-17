"""Write a Scene to the browser format described in docs/DATA_FORMAT.md."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .scene import LAND_COVER_PROPERTIES, LandCover, Scene

FORMAT_VERSION = 1

# layer name -> (file name, little-endian dtype)
LAYERS: dict[str, tuple[str, str]] = {
    "ground": ("ground.f32", "<f4"),
    "building_height": ("building_height.f32", "<f4"),
    "land_cover": ("land_cover.u8", "u1"),
}


def write_scene(scene: Scene, out_dir: str | Path) -> Path:
    """Write ``meta.json`` plus one raw binary file per layer. Returns the meta path."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    layers_meta = {}
    for name, (filename, dtype) in LAYERS.items():
        data = np.ascontiguousarray(getattr(scene, name), dtype=dtype)
        (out / filename).write_bytes(data.tobytes(order="C"))
        layers_meta[name] = {"file": filename, "dtype": np.dtype(dtype).name}

    rows, cols = scene.shape
    meta = {
        "formatVersion": FORMAT_VERSION,
        "name": scene.name,
        "width": cols,
        "height": rows,
        "cellSize": scene.cell_size,
        "origin": {"x": scene.origin_x, "y": scene.origin_y},
        "crs": scene.crs,
        "layers": layers_meta,
        "stats": {
            "groundMin": float(scene.ground.min()),
            "groundMax": float(scene.ground.max()),
            "buildingHeightMax": float(scene.building_height.max()),
        },
        "landCover": [
            {"code": int(lc), "name": lc.name.lower(), **LAND_COVER_PROPERTIES[lc]}
            for lc in LandCover
        ],
        "attribution": scene.attribution,
    }
    meta_path = out / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    return meta_path


def read_scene(out_dir: str | Path) -> Scene:
    """Inverse of :func:`write_scene`; used by tests and for inspecting exports."""
    out = Path(out_dir)
    meta = json.loads((out / "meta.json").read_text())
    if meta["formatVersion"] != FORMAT_VERSION:
        raise ValueError(f"unsupported format version {meta['formatVersion']}")
    shape = (meta["height"], meta["width"])
    arrays = {
        name: np.fromfile(out / filename, dtype=dtype).reshape(shape)
        for name, (filename, dtype) in LAYERS.items()
    }
    return Scene(
        name=meta["name"],
        cell_size=meta["cellSize"],
        origin_x=meta["origin"]["x"],
        origin_y=meta["origin"]["y"],
        crs=meta["crs"],
        attribution=meta["attribution"],
        **arrays,
    )
