"""Class metadata extraction."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

from slpp import slpp as lua

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_decoder import decode_lua_bytes
from ..unity_utils import load_bundle

CLASS_BUNDLE = "config_property_zhiye_shuxing.unity3d"
CLASS_ASSETS = ("Table_Class", "Table_Class_NoviceServer")


def _extract_asset_text(bundle, asset_name: str) -> str:
    for obj in bundle.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        if asset.m_Name != asset_name:
            continue
        script = asset.m_Script
        if isinstance(script, bytes):
            data = script
        else:
            data = script.encode("utf-8", "surrogateescape")
        return decode_lua_bytes(data, raw_blob=obj.get_raw_data())
    raise FileNotFoundError(f"{asset_name} not found in bundle")


def _iter_class_blocks(text: str) -> Tuple[int, str]:
    start = text.index("Table_Class = {")
    end = text.index("\nfor _, d in pairs", start)
    body = text[start:]
    inner = body[body.index("{") + 1 : body.rfind("}")]
    idx = 0
    while idx < len(inner):
        if inner[idx] == "[":
            close = inner.index("]", idx)
            class_id = int(inner[idx + 1 : close])
            brace_start = inner.index("{", close)
            depth = 1
            pos = brace_start + 1
            while pos < len(inner) and depth > 0:
                if inner[pos] == "{":
                    depth += 1
                elif inner[pos] == "}":
                    depth -= 1
                pos += 1
            block = inner[brace_start + 1 : pos - 1]
            yield class_id, block
            idx = pos
        else:
            idx += 1


def _parse_block(class_id: int, block: str) -> Dict:
    simple_lines = [
        line
        for line in block.splitlines()
        if line.strip()
        and "Table_Class_t" not in line
        and "_EmptyTable" not in line
    ]
    data = lua.decode("{" + "\n".join(simple_lines) + "}")
    data["id"] = data.get("id", class_id)
    return data


def _load_class_entries(paths: GamePaths) -> Dict[int, dict]:
    bundle = load_bundle(paths.script_bundle(CLASS_BUNDLE))
    entries: Dict[int, dict] = {}
    for asset_name in CLASS_ASSETS:
        try:
            text = _extract_asset_text(bundle, asset_name)
        except FileNotFoundError:
            continue
        for class_id, block in _iter_class_blocks(text):
            try:
                data = _parse_block(class_id, block)
            except Exception:
                continue
            entries[class_id] = data
    return entries


def extract_classes(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    classes = _load_class_entries(paths)
    records: List[dict] = []

    for class_id, data in sorted(classes.items()):
        name_token = data.get("NameZh", "")
        desc_token = data.get("Desc", "")
        record = {
            "id": class_id,
            "name": context.translate_all(name_token, fallback=data.get("NameEn")),
            "name_token": name_token,
            "description": context.translate_all(desc_token),
            "description_token": desc_token,
            "english_name": data.get("NameEn"),
            "icon": data.get("icon"),
            "type": data.get("Type"),
            "type_branch": data.get("TypeBranch"),
            "race": data.get("Race"),
            "default_weapon": data.get("DefaultWeapon"),
            "raw": data,
            "extracted_at": context.extracted_at,
        }
        records.append(record)

    payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(records),
        "classes": records,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "classes.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
