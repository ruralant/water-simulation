"""Command line entry point: ``wsim-prep synthetic`` and ``wsim-prep build``."""

from __future__ import annotations

import argparse
from pathlib import Path

from .build import build_scene
from .export import write_scene
from .synthetic import make_synthetic_scene


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="wsim-prep", description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    syn = sub.add_parser("synthetic", help="generate a procedural test neighbourhood")
    syn.add_argument("--out", type=Path, required=True, help="output directory")
    syn.add_argument("--size", type=float, default=400.0, help="side length in metres")
    syn.add_argument("--cell-size", type=float, default=1.0)
    syn.add_argument("--seed", type=int, default=7)

    b = sub.add_parser("build", help="build a scene from EA LiDAR and vector data")
    b.add_argument("--name", required=True)
    b.add_argument("--out", type=Path, required=True, help="output directory")
    b.add_argument("--dtm", type=Path, nargs="+", required=True, help="DTM tiles")
    b.add_argument("--dsm", type=Path, nargs="+", required=True, help="DSM tiles")
    b.add_argument("--buildings", type=Path, required=True, help="building footprints file")
    b.add_argument("--roads", type=Path, help="road lines or polygons (optional)")
    b.add_argument("--greenspace", type=Path, help="parks/greenspace polygons (optional)")
    for kind in ("buildings", "roads", "greenspace"):
        b.add_argument(f"--{kind}-layer", help=f"layer name if the {kind} file has several")
    b.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        required=True,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
        help="area in British National Grid metres",
    )
    b.add_argument("--cell-size", type=float, default=1.0)
    b.add_argument(
        "--attribution",
        action="append",
        default=[],
        help="extra attribution line for vector data (repeatable)",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    if args.command == "synthetic":
        scene = make_synthetic_scene(args.size, args.cell_size, args.seed)
    else:
        scene = build_scene(
            name=args.name,
            dtm_paths=args.dtm,
            dsm_paths=args.dsm,
            buildings_path=args.buildings,
            bounds=tuple(args.bbox),
            cell_size=args.cell_size,
            roads_path=args.roads,
            greenspace_path=args.greenspace,
            attribution=args.attribution,
            buildings_layer=args.buildings_layer,
            roads_layer=args.roads_layer,
            greenspace_layer=args.greenspace_layer,
        )
    meta = write_scene(scene, args.out)
    rows, cols = scene.shape
    print(f"wrote {scene.name!r} ({cols} x {rows} cells @ {scene.cell_size} m) to {meta.parent}")


if __name__ == "__main__":
    main()
