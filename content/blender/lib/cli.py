"""Argument handling for scene scripts run under `blender --background --python`.

Blender consumes its own argv, so anything meant for the script has to appear
after a bare `--`. Everything before that belongs to Blender.
"""

from __future__ import annotations

import argparse
import os
import sys


def script_args() -> list[str]:
    """The arguments after `--`, or an empty list if there was no separator."""
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build one chapter of the experience.")
    parser.add_argument(
        "--out",
        required=True,
        help="Directory to write the .glb and its baked atlas into.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=64,
        help="Cycles samples. Low for iteration; raise for a release bake.",
    )
    parser.add_argument(
        "--atlas",
        type=int,
        default=2048,
        help="Baked atlas resolution, square.",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Also render a still from the viewer's vantage, for art direction.",
    )
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Render the preview and stop, skipping the bake entirely.",
    )
    args = parser.parse_args(script_args())
    args.out = os.path.abspath(args.out)
    return args


def finish() -> None:
    """Terminate the Blender process immediately.

    Blender 4.2 in `--background` mode reliably hangs on shutdown after a Cycles
    bake -- the render threads and the OIDN denoiser do not always join, so the
    process sits at 0% CPU forever with the work already done. Everything we
    care about (the atlas PNG and the .glb) is written and flushed before this
    point, so bypassing interpreter and Blender teardown costs nothing and turns
    an indefinite hang into a clean exit.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
