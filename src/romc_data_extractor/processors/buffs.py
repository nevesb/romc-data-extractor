"""Extraction logic for Table_Buffer data."""

from __future__ import annotations

import json
from pathlib import Path

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import LuaTableSource

BUFFER_TABLES = (
    "Table_Buffer",
    "Table_Buffer_bk",
    "Table_Buffer_NoviceServer",
)


def _load_table(paths: GamePaths, table_name: str) -> list[dict]:
    try:
        source = LuaTableSource(paths.skill_bundle, table_name)
        return source.load_entries()
    except FileNotFoundError:
        return []


def extract_buffs(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    merged: dict[int, dict] = {}
    for table in BUFFER_TABLES:
        for entry in _load_table(paths, table):
            buff_id = entry.get("id")
            if buff_id is None:
                continue
            # Later tables overwrite earlier ones (NoviceServer wins).
            merged[buff_id] = entry

    records: list[dict] = []
    for buff_id in sorted(merged.keys()):
        entry = merged[buff_id]
        name_token = entry.get("BuffName", "")
        desc_token = entry.get("BuffDesc", "")
        buff_rate = entry.get("BuffRate", {})
        if isinstance(buff_rate, dict):
            odds = buff_rate.get("Odds")
            if isinstance(odds, dict):
                odds_copy = dict(odds)
                buff_type = odds_copy.get("type")
                type_value = None
                if isinstance(buff_type, int):
                    type_value = buff_type
                elif isinstance(buff_type, str):
                    try:
                        type_value = int(buff_type)
                    except ValueError:
                        type_value = None
                if type_value is not None:
                    odds_copy["formula"] = f"CommonFun.calcBuff_{type_value}"
                buff_rate = dict(buff_rate)
                buff_rate["Odds"] = odds_copy
        record = {
            "id": buff_id,
            "name": context.translate_all(name_token),
            "name_token": name_token,
            "description": context.translate_all(desc_token),
            "description_token": desc_token,
            "buff_type": entry.get("BuffType", {}),
            "buff_rate": buff_rate,
            "logic": entry.get("Logic"),
            "state_effect": entry.get("StateEffect"),
            "buff_effect": entry.get("BuffEffect"),
            "extracted_at": context.extracted_at,
            "raw": entry,
        }
        records.append(record)

    payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(records),
        "buffs": records,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "buffs.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
