"""
Export every sprite/texture from Unity bundles into icons/bundle_exports.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Iterable, Tuple

from romc_data_extractor.config import GamePaths
from romc_data_extractor.unity_utils import load_bundle


def sanitize(name: str) -> str:
    """Make a safe filename."""
    forbidden = '<>:"/\\|?*'
    result = []
    for ch in name:
        if ch in forbidden:
            result.append("_")
        else:
            result.append(ch)
    return "".join(result)


def iter_bundle_paths(
    paths: GamePaths, labels: Iterable[str], include_root_fallback: bool
) -> Iterable[Tuple[str, Path, Path]]:
    """Yield (label, root, bundle_path) tuples for every unity3d bundle."""

    candidates: list[Tuple[str, Path]] = []
    seen_roots: set[Path] = set()

    # Explicit directories we definitely want to export, each gets its own label.
    for name in labels:
        candidate = (paths.root / name).resolve()
        if not candidate.exists() or candidate in seen_roots:
            continue
        seen_roots.add(candidate)
        candidates.append((name, candidate))

    if include_root_fallback:
        for label, candidate in (
            ("root", paths.streaming_root),
            ("root", paths.root),
        ):
            candidate = candidate.resolve()
            if not candidate.exists() or candidate in seen_roots:
                continue
            seen_roots.add(candidate)
            candidates.append((label, candidate))

    seen_bundles: set[Path] = set()
    for label, root in candidates:
        for bundle_path in root.rglob("*.unity3d"):
            resolved = bundle_path.resolve()
            if resolved in seen_bundles:
                continue
            seen_bundles.add(resolved)
            yield label, root, resolved


def export_bundle(bundle_path: Path, rel_root: Path, label: str, dest_root: Path) -> int:
    """Export sprites/textures from a single bundle. Returns number of assets."""
    rel_path = bundle_path.relative_to(rel_root)
    if label:
        rel_path = Path(label) / rel_path
    bundle_dir = dest_root / rel_path.with_suffix("")
    exported = 0
    env = load_bundle(bundle_path)
    for obj in env.objects:
        if obj.type.name not in {"Sprite", "Texture2D"}:
            continue
        try:
            asset = obj.read()
        except Exception:
            continue
        name = getattr(asset, "name", None) or getattr(asset, "m_Name", None)
        if not name:
            name = f"{obj.type.name}_{obj.path_id}"
        image = getattr(asset, "image", None)
        if image is None:
            continue
        bundle_dir.mkdir(parents=True, exist_ok=True)
        target = bundle_dir / f"{sanitize(name)}.png"
        try:
            image.save(target)
        except Exception:
            continue
        exported += 1
    return exported


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export all sprites/textures from Unity bundles."
    )
    parser.add_argument("--game-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--limit", type=int, default=None, help="Optional bundle limit for debugging."
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove the existing bundle_exports directory before exporting.",
    )
    parser.add_argument(
        "--roots",
        nargs="*",
        default=None,
        help="Optional list of top-level directories to scan (e.g. art resources scene).",
    )
    args = parser.parse_args()

    paths = GamePaths(Path(args.game_root))
    dest_root = Path(args.output) / "icons" / "bundle_exports"

    if args.clean and dest_root.exists():
        shutil.rmtree(dest_root)

    total_bundles = 0
    total_assets = 0

    default_roots = ["art", "art_oversea", "engine", "resources", "scene"]
    custom_roots = args.roots if args.roots else None
    labels = custom_roots or default_roots
    include_root_fallback = custom_roots is None

    for label, root, bundle_path in iter_bundle_paths(paths, labels, include_root_fallback):
        exported = export_bundle(bundle_path, root, label, dest_root)
        if exported:
            total_bundles += 1
            total_assets += exported
            print(f"[{total_bundles}] {exported} assets -> {bundle_path}")
            if args.limit and total_bundles >= args.limit:
                break

    if custom_roots is None:
        pass
    else:
        # When using explicit roots, do not include the generic fallback directories.
        pass
    print(f"Done. Bundles exported: {total_bundles}, assets: {total_assets}")


if __name__ == "__main__":
    main()
