"""Item extraction logic."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import LuaTableSource

CARD_TYPES = {81, 82, 83, 84, 85, 86, 87}
HEADGEAR_MIN = 800
HEADGEAR_MAX = 900
FURNITURE_MIN = 900
FURNITURE_MAX = 1000


def _categorize_item(record: dict, name: str) -> str:
    item_type = record.get("Type")
    if isinstance(item_type, int):
        if item_type in CARD_TYPES:
            return "cards"
        if HEADGEAR_MIN <= item_type < HEADGEAR_MAX:
            return "headgears"
        if FURNITURE_MIN <= item_type < FURNITURE_MAX:
            return "furniture"
    if "[1]" in name or "Weapon" in name or "Armor" in name:
        return "equipment"
    return "consumables"


def extract_items(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    source = LuaTableSource(paths.item_bundle, "Table_Item")
    items = source.load_entries()
    results: List[dict] = []
    category_index: Dict[str, List[int]] = {
        "equipment": [],
        "headgears": [],
        "cards": [],
        "consumables": [],
        "furniture": [],
    }

    for item in items:
        item_id = item.get("id")
        name_token = item.get("NameZh", "")
        desc_token = item.get("Desc", "")
        names = context.translate_all(name_token)
        descs = context.translate_all(desc_token)
        representative_name = next(iter(names.values()), "")
        category = _categorize_item(item, representative_name)
        record = {
            "id": item_id,
            "type": item.get("Type"),
            "category": category,
            "name": names,
            "name_token": name_token,
            "description": descs,
            "description_token": desc_token,
            "raw": item,
            "extracted_at": context.extracted_at,
        }
        category_index.setdefault(category, []).append(item_id)
        results.append(record)

    payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(results),
        "items": results,
        "categories": category_index,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "items.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
