"""Monster table extraction."""

from __future__ import annotations

import json
from pathlib import Path

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import LuaTableSource


def extract_monsters(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    monster_source = LuaTableSource(paths.monster_bundle, "Table_Monster")
    monsters = monster_source.load_entries()

    records = []
    for monster in monsters:
        mid = monster.get("id")
        name_token = monster.get("NameZh", "")
        desc_token = monster.get("Desc", "")
        record = {
            "id": mid,
            "name": context.translate_all(name_token),
            "name_token": name_token,
            "description": context.translate_all(desc_token),
            "description_token": desc_token,
            "zone": monster.get("Zone"),
            "race": monster.get("Race"),
            "nature": monster.get("Nature"),
            "class_type": monster.get("ClassType"),
            "level": monster.get("Level"),
            "stats": {
                "hp": monster.get("Hp"),
                "atk": monster.get("Atk"),
                "matk": monster.get("MAtk"),
                "def": monster.get("Def"),
                "mdef": monster.get("MDef"),
                "hit": monster.get("Hit"),
                "flee": monster.get("Flee"),
            },
            "rewards": monster.get("Dead_Reward"),
            "raw": monster,
            "extracted_at": context.extracted_at,
        }
        records.append(record)

    payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(records),
        "monsters": records,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "monsters.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
