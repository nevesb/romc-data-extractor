"""Scan a game root for Unity bundles and emit a manifest."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
import hashlib
from pathlib import Path
from typing import Iterable
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from romc_data_extractor.unity_utils import load_bundle  # noqa: E402


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a bundle manifest.")
    parser.add_argument("--game-root", required=True, help="Path to the extracted Android assets.")
    parser.add_argument("--output", required=True, help="Destination JSON file.")
    parser.add_argument("--dataset-tag", required=True, help="Logical tag for this snapshot.")
    return parser.parse_args(argv)


def _file_checksum(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _collect_bundles(game_root: Path) -> list[dict[str, object]]:
    if not game_root.exists():
        raise FileNotFoundError(f"Game root not found: {game_root}")
    bundles: list[dict[str, object]] = []
    for path in sorted(game_root.rglob("*.unity3d")):
        rel_path = str(path.relative_to(game_root)).replace("\\", "/")
        stat = path.stat()
        assets = _extract_bundle_assets(path)
        bundles.append(
            {
                "path": rel_path,
                "size": stat.st_size,
                "checksum": _file_checksum(path),
                "asset_count": len(assets),
                "assets": assets,
            }
        )
    return bundles


def _extract_bundle_assets(bundle_path: Path) -> list[dict[str, object]]:
    assets: list[dict[str, object]] = []
    try:
        env = load_bundle(bundle_path)
    except Exception:
        return assets

    for obj in env.objects:
        type_name = obj.type.name
        name = None
        try:
            asset = obj.read()
            name = getattr(asset, "name", None) or getattr(asset, "m_Name", None)
        except Exception:
            name = None
        if not name:
            name = f"{type_name}_{obj.path_id}"
        assets.append(
            {
                "name": str(name),
                "type": type_name,
                "path_id": obj.path_id,
                "hash": _asset_hash(obj),
            }
        )
    assets.sort(key=lambda entry: (entry.get("type") or "", entry.get("name") or ""))
    return assets


def _asset_hash(obj) -> str | None:
    try:
        raw = obj.get_raw_data()
        if not raw:
            return None
        return hashlib.sha256(raw).hexdigest()
    except Exception:
        return None


def main(argv: Iterable[str] | None = None) -> None:
    args = _parse_args(argv)
    root = Path(args.game_root).resolve()
    bundles = _collect_bundles(root)
    manifest = {
        "dataset_tag": args.dataset_tag,
        "game_root": str(root),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bundle_count": len(bundles),
        "bundles": bundles,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Bundle manifest written to {output_path} ({manifest['bundle_count']} entries)")


if __name__ == "__main__":
    main()
