"""Asset (icon) extraction utilities."""

from __future__ import annotations

import json
import re
import struct
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import LuaTableSource
from .skills import load_master_entries, load_skill_branches
from ..unity_utils import load_bundle


ICON_SUBDIRS = [
    Path("resources/public/item"),
    Path("resources/public/gui"),
    Path("resources/public/role"),
    Path("resources/public/gme"),
    Path("resources/gui"),
    Path("resources/gui/pic"),
    Path("resources/gui/atlas"),
    Path("art/public/texture"),
    Path("art/public/texture/gui"),
    Path("art/public/texture/general"),
    Path("art/public/texture/scene"),
    Path("art"),
]

FALLBACK_DIRS = [
    Path("resources"),
    Path("art"),
    Path("art_oversea"),
    Path("engine"),
    Path("scene"),
]


def _gather_item_icons(paths: GamePaths) -> Set[str]:
    source = LuaTableSource(paths.item_bundle, "Table_Item")
    icons = {entry.get("Icon") for entry in source.load_entries()}
    return {icon for icon in icons if icon}


def _gather_skill_icons(paths: GamePaths) -> Set[str]:
    icons = {entry.get("Icon") for entry in load_skill_branches(paths)}
    master_entries = load_master_entries(paths)
    icons.update(entry.get("Icon") for entry in master_entries.values())
    return {icon for icon in icons if icon}


def _gather_monster_icons(paths: GamePaths) -> Set[str]:
    source = LuaTableSource(paths.monster_bundle, "Table_Monster")
    icons = {entry.get("Icon") for entry in source.load_entries()}
    return {icon for icon in icons if icon}


def _export_sprite(sprite, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    # UnityPy sprite.image returns PIL Image
    sprite.image.save(target_path)


def _export_texture(texture, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    image = texture.image
    image.save(target_path)


def _sanitize_icon_name(name: str) -> str:
    return name.replace("/", "_").replace("\\", "_")


def _parse_uiatlas_blob(blob: bytes) -> Dict[str, Tuple[int, int, int, int]]:
    """Parse the raw bytes of a UIAtlas MonoBehaviour."""

    data_len = len(blob)

    def _parse_from(offset: int) -> Dict[str, Tuple[int, int, int, int]]:
        entries: Dict[str, Tuple[int, int, int, int]] = {}
        ptr = offset
        while ptr + 4 <= data_len:
            name_len = int.from_bytes(blob[ptr : ptr + 4], "little", signed=False)
            if not (0 < name_len < 512):
                if entries:
                    break
                ptr += 4
                continue
            ptr += 4
            name_end = ptr + name_len
            if name_end > data_len:
                break
            name = blob[ptr:name_end].decode("utf-8", "ignore").strip("\x00")
            ptr = (name_end + 3) & ~3
            if not name or ptr + 12 * 4 > data_len:
                break
            values = struct.unpack_from("<12i", blob, ptr)
            ptr += 12 * 4
            x, y, width, height = values[0], values[1], values[2], values[3]
            if width <= 0 or height <= 0:
                continue
            entries[name] = (x, y, width, height)
        return entries

    entries = _parse_from(0)
    if entries:
        return entries
    match = re.search(rb"[A-Za-z0-9_]{3,}", blob)
    if match and match.start() >= 4:
        entries = _parse_from(match.start() - 4)
    return entries


def _discover_atlas_pairs(resource_root: Path) -> List[Tuple[Path, Path]]:
    pairs: List[Tuple[Path, Path]] = []
    seen: Set[Tuple[Path, Path]] = set()
    search_root = resource_root / "resources"
    if not search_root.exists():
        search_root = resource_root
    for prefab_dir in search_root.rglob("*"):
        if prefab_dir.name.lower() not in {"prefab", "preferb"}:
            continue
        if not prefab_dir.is_dir():
            continue
        picture_dir = prefab_dir.parent / "picture"
        if not picture_dir.exists():
            continue
        key = (prefab_dir.resolve(), picture_dir.resolve())
        if key in seen:
            continue
        seen.add(key)
        pairs.append((prefab_dir, picture_dir))
    return pairs


def _load_atlas_index(resource_root: Path) -> Dict[str, Tuple[Path, Tuple[int, int, int, int]]]:
    atlas_pairs = _discover_atlas_pairs(resource_root)
    if not atlas_pairs:
        return {}

    index: Dict[str, Tuple[Path, Tuple[int, int, int, int]]] = {}
    for prefab_dir, picture_dir in atlas_pairs:
        for prefab in prefab_dir.rglob("*.unity3d"):
            picture = picture_dir / prefab.relative_to(prefab_dir)
            if picture.is_dir():
                picture = picture / prefab.name
            if not picture.exists():
                continue
            env = load_bundle(prefab)
            combined_entries: Dict[str, Tuple[int, int, int, int]] = {}
            for obj in env.objects:
                if obj.type.name != "MonoBehaviour":
                    continue
                blob = obj.get_raw_data()
                if not blob:
                    continue
                combined_entries.update(_parse_uiatlas_blob(blob))
            for sprite_name, rect in combined_entries.items():
                index.setdefault(sprite_name, (picture, rect))
    return index


def _load_texture_image(bundle_path: Path):
    env = load_bundle(bundle_path)
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        texture = obj.read()
        image = texture.image
        if image:
            return image.convert("RGBA")
    return None


def _export_from_atlas(
    icon_meta: Dict[str, dict],
    icons_needed: Set[str],
    atlas_index: Dict[str, Tuple[Path, Tuple[int, int, int, int]]],
    output_dir: Path,
) -> None:
    if not atlas_index:
        return

    texture_cache: Dict[Path, object] = {}
    for icon in list(icons_needed):
        match = atlas_index.get(icon)
        if not match:
            continue
        picture_path, (x, y, width, height) = match
        image = texture_cache.get(picture_path)
        if image is None:
            image = _load_texture_image(picture_path)
            if image is None:
                continue
            texture_cache[picture_path] = image
        tex_w, tex_h = image.size
        if width <= 0 or height <= 0:
            continue
        left = max(0, x)
        right = min(tex_w, left + width)
        top = max(0, y)
        bottom = min(tex_h, top + height)
        if right <= left or bottom <= top:
            continue
        crop = image.crop((left, top, right, bottom))
        target = output_dir / "icons" / f"{_sanitize_icon_name(icon)}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        crop.save(target)
        info = icon_meta[icon]
        info["file"] = str(target.relative_to(output_dir))
        info["found"] = True
        icons_needed.discard(icon)


def extract_icons(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    categories = {
        "items": _gather_item_icons(paths),
        "skills": _gather_skill_icons(paths),
        "monsters": _gather_monster_icons(paths),
    }

    icon_meta: Dict[str, dict] = {}
    for category, icon_names in categories.items():
        for icon in icon_names:
            info = icon_meta.setdefault(icon, {"categories": set(), "file": None, "found": False})
            info["categories"].add(category)

    icons_needed = set(icon_meta.keys())
    processed_bundles: Set[Path] = set()

    def _scan_directories(directories: List[Path]) -> None:
        for subdir in directories:
            search_dir = subdir if subdir.is_absolute() else resource_root / subdir
            if not search_dir.exists():
                continue
            for bundle_path in search_dir.rglob("*.unity3d"):
                resolved = bundle_path.resolve()
                if resolved in processed_bundles:
                    continue
                processed_bundles.add(resolved)
                env = load_bundle(resolved)
                for obj in env.objects:
                    if not icons_needed:
                        return
                    target_name = None
                    if obj.type.name == "Sprite":
                        sprite = obj.read()
                        target_name = getattr(sprite, "name", None) or getattr(sprite, "m_Name", None)
                        if target_name in icons_needed:
                            target = output_dir / "icons" / f"{_sanitize_icon_name(target_name)}.png"
                            _export_sprite(sprite, target)
                            info = icon_meta[target_name]
                            info["file"] = str(target.relative_to(output_dir))
                            info["found"] = True
                            icons_needed.remove(target_name)
                    elif obj.type.name == "Texture2D":
                        texture = obj.read()
                        target_name = getattr(texture, "name", None) or getattr(texture, "m_Name", None)
                        if target_name in icons_needed:
                            target = output_dir / "icons" / f"{_sanitize_icon_name(target_name)}.png"
                            _export_texture(texture, target)
                            info = icon_meta[target_name]
                            info["file"] = str(target.relative_to(output_dir))
                            info["found"] = True
                            icons_needed.remove(target_name)

    resource_root = paths.streaming_root

    _scan_directories(ICON_SUBDIRS)

    if icons_needed:
        fallback_dirs: List[Path] = []
        for extra in FALLBACK_DIRS:
            base = extra if extra.is_absolute() else paths.root / extra
            if base.exists():
                fallback_dirs.append(base)
        if not fallback_dirs:
            fallback_dirs = [paths.root]
        _scan_directories(fallback_dirs)

    if icons_needed:
        atlas_index = _load_atlas_index(resource_root)
        if not atlas_index and paths.root != resource_root:
            atlas_index = _load_atlas_index(paths.root)
        _export_from_atlas(icon_meta, icons_needed, atlas_index, output_dir)

    manifest = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(icon_meta),
        "found": len([info for info in icon_meta.values() if info["found"]]),
        "missing": sorted(name for name, info in icon_meta.items() if not info["found"]),
        "icons": [
            {
                "name": name,
                "file": info["file"],
                "categories": sorted(info["categories"]),
                "found": info["found"],
            }
            for name, info in sorted(icon_meta.items())
        ],
    }

    manifest_path = output_dir / "icon_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path
