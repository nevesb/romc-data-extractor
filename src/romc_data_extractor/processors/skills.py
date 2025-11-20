"""Skill table extraction."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_table import LuaTableSource, get_text_from_asset, parse_lua_dicts
from ..unity_utils import load_bundle


def load_skill_descriptions(
    paths: GamePaths, context: ExtractionContext
) -> tuple[Dict[int, Dict[str, str]], Dict[int, str]]:
    descriptions: Dict[int, Dict[str, str]] = {}
    tokens: Dict[int, str] = {}
    for table_name in ("Table_SkillDesc", "Table_SkillDesc_NoviceServer", "Table_SkillDesc_bk"):
        try:
            desc_source = LuaTableSource(paths.skill_bundle, table_name)
        except FileNotFoundError:
            continue
        for entry in desc_source.load_entries():
            sid = entry.get("id")
            if sid is None:
                continue
            desc_token = entry.get("Desc", "")
            if sid not in descriptions:
                descriptions[sid] = context.translate_all(desc_token)
                tokens[sid] = desc_token
    return descriptions, tokens


def load_skill_branches(paths: GamePaths) -> List[dict]:
    env = load_bundle(paths.skill_bundle)
    branches: List[dict] = []
    for obj in env.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        name = asset.m_Name
        if not name.startswith("Table_Skill_ClsBranch"):
            continue
        text = get_text_from_asset(asset, raw_blob=obj.get_raw_data())
        branches.extend(parse_lua_dicts(text))
    return branches


def load_master_entries(paths: GamePaths) -> Dict[int, dict]:
    """Load the special/master skill tables (Table_Skill_Left*)."""

    entries: Dict[int, dict] = {}
    for table_name in ("Table_Skill_Left", "Table_Skill_Left_NoviceServer"):
        try:
            source = LuaTableSource(paths.skill_bundle, table_name)
        except FileNotFoundError:
            continue
        for raw_entry in source.load_entries():
            entry = dict(raw_entry)
            entry_id = entry.get("id")
            if entry_id is None:
                continue
            name_field = entry.get("NameZh", "")
            if isinstance(name_field, str) and name_field.startswith("##"):
                entry["_name_token"] = name_field

            existing = entries.get(entry_id)
            if existing and "_name_token" in existing and "_name_token" not in entry:
                entry["_name_token"] = existing["_name_token"]

            # Prefer the NoviceServer variant which is parsed last.
            entries[entry_id] = entry
    return entries


def build_master_skills(
    entries: Dict[int, dict],
    context: ExtractionContext,
    desc_map: Dict[int, Dict[str, str]],
    desc_tokens: Dict[int, str],
) -> List[dict]:
    """Chain the Table_Skill_Left entries into regular skill records."""

    if not entries:
        return []

    prev_map: Dict[int, int] = {}
    for entry in entries.values():
        next_id = entry.get("NextID")
        if isinstance(next_id, int) and next_id:
            prev_map[next_id] = entry["id"]

    visited: set[int] = set()
    records: List[dict] = []

    for entry_id in sorted(entries.keys()):
        if entry_id in visited:
            continue

        head = entry_id
        while head in prev_map:
            head = prev_map[head]
        if head in visited:
            continue

        levels: List[dict] = []
        current = head
        chain_guard: set[int] = set()

        while isinstance(current, int) and current not in chain_guard:
            raw_entry = entries.get(current)
            if not raw_entry:
                break
            entry = dict(raw_entry)
            entry.pop("_name_token", None)
            desc_details = _build_level_description(entry, context)
            if desc_details:
                entry["description"] = desc_details
            levels.append(entry)
            visited.add(current)
            chain_guard.add(current)
            next_id = raw_entry.get("NextID")
            if not isinstance(next_id, int) or next_id == 0:
                break
            current = next_id

        if not levels:
            continue

        head_entry = entries.get(head)
        if not head_entry:
            continue
        name_token = head_entry.get("_name_token") or head_entry.get("NameZh", "")
        skill_id = head_entry.get("id")
        if skill_id is None:
            continue

        records.append(
            {
                "id": skill_id,
                "name": context.translate_all(name_token),
                "name_token": name_token,
                "description": desc_map.get(skill_id, context.translate_all("")),
                "description_token": desc_tokens.get(skill_id, ""),
                "levels": levels,
                "icon": levels[0].get("Icon") if levels else None,
                "extracted_at": context.extracted_at,
            }
        )

    return records


def _format_description_text(text: str, params: List[object]) -> str:
    if not params:
        return text
    safe_params: List[object] = []
    for value in params:
        if isinstance(value, (int, float)):
            safe_params.append(value)
        else:
            safe_params.append(str(value))
    try:
        return text % tuple(safe_params)
    except Exception:
        return text


def _build_level_description(entry: dict, context: ExtractionContext) -> Dict[str, str] | None:
    blocks = entry.get("Desc")
    if not isinstance(blocks, list) or not blocks:
        return None
    per_lang: Dict[str, List[str]] = {lang: [] for lang in context.languages}
    for block in blocks:
        token = block.get("text")
        desc_id = block.get("id")
        if not isinstance(token, str) or not token:
            if desc_id is None:
                continue
            token = f"##{desc_id}"
        localized = context.translate_all(token, token)
        params = block.get("params") or []
        for lang in context.languages:
            text = localized.get(lang, "")
            if not text:
                continue
            formatted = _format_description_text(text, params)
            per_lang.setdefault(lang, []).append(formatted)
    result = {lang: "\n".join(parts) for lang, parts in per_lang.items() if parts}
    return result or None


def extract_skills(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> Path:
    desc_map, desc_tokens = load_skill_descriptions(paths, context)
    branch_entries = load_skill_branches(paths)

    grouped: Dict[int, List[dict]] = defaultdict(list)
    for entry in branch_entries:
        sid = entry.get("id")
        if sid is None:
            continue
        desc_details = _build_level_description(entry, context)
        if desc_details:
            entry["description"] = desc_details
        grouped[sid].append(entry)

    records = []
    for sid, levels in grouped.items():
        name_token = levels[0].get("NameZh", "")
        record = {
            "id": sid,
            "name": context.translate_all(name_token),
            "name_token": name_token,
            "description": desc_map.get(sid, context.translate_all("")),
            "description_token": desc_tokens.get(sid, ""),
            "icon": levels[0].get("Icon"),
            "levels": levels,
            "extracted_at": context.extracted_at,
        }
        records.append(record)

    master_entries = load_master_entries(paths)
    records.extend(build_master_skills(master_entries, context, desc_map, desc_tokens))
    records.sort(key=lambda item: item.get("id") or 0)

    payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(records),
        "skills": records,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "skills.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
