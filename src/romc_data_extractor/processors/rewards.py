"""Extract reward-related tables."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import get_text_from_asset, parse_lua_dicts
from ..unity_utils import load_bundle

REWARD_PREFIXES = (
    "Table_Reward",
    "Table_Drop",
    "Table_Loot",
)


def extract_rewards(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    bucket: Dict[str, List[dict]] = defaultdict(list)
    env = load_bundle(paths.item_bundle)

    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        name = asset.m_Name or ""
        if not name.startswith(REWARD_PREFIXES):
            continue
        try:
            text = get_text_from_asset(asset, raw_blob=obj.get_raw_data())
            entries = parse_lua_dicts(text)
        except Exception:
            continue
        if entries:
            bucket[name] = entries

    records = [
        {
            "table": table_name,
            "entries": entries,
            "dataset_tag": context.extracted_at,
        }
        for table_name, entries in sorted(bucket.items())
    ]

    payload = {
        "extracted_at": context.extracted_at,
        "tables": records,
        "total": len(records),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "rewards.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
