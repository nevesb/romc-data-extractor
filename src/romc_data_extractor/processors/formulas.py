"""Extract CommonFun formulas directly from the client data."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

from ..config import GamePaths
from ..context import ExtractionContext
from ..lua_decoder import decode_lua_bytes
from ..translation import TranslationLookup
from ..unity_utils import load_bundle
from .skills import load_skill_branches, load_master_entries
from ..lua_table import LuaTableSource


def _load_commonfun_chunks(paths: GamePaths) -> Dict[str, str]:
    bundle = load_bundle(paths.script_bundle("mconfig.unity3d"))
    chunks: Dict[str, str] = {}

    for obj in bundle.objects:
        if obj.type.name != "TextAsset":
            continue
        asset = obj.read()
        name = asset.m_Name or ""
        if not name.startswith("CommonFun"):
            continue
        script = asset.m_Script
        if isinstance(script, str):
            script = script.encode("utf-8", "surrogateescape")

        chunks[name] = decode_lua_bytes(script, raw_blob=obj.get_raw_data())

    if not chunks:
        raise RuntimeError("CommonFun TextAssets were not found in mconfig.unity3d")

    return chunks


def _extract_functions(lua_text: str) -> Dict[str, str]:
    functions: Dict[str, str] = {}
    pattern = re.compile(r"function\s+CommonFun\.(\w+)\s*\(", re.MULTILINE)

    for match in pattern.finditer(lua_text):
        func_name = match.group(1)
        start_idx = match.start()
        body = _slice_function(lua_text, start_idx)
        if body:
            functions[func_name] = body.strip()

    return functions


_WORD_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")


def _match_keyword(text: str, idx: int, keyword: str) -> bool:
    if not text.startswith(keyword, idx):
        return False
    prev = text[idx - 1] if idx > 0 else ""
    next_idx = idx + len(keyword)
    next_char = text[next_idx] if next_idx < len(text) else ""
    if prev and prev in _WORD_CHARS:
        return False
    if next_char and next_char in _WORD_CHARS:
        return False
    return True


def _consume_long_bracket(text: str, idx: int) -> tuple[int, int] | None:
    pos = idx + 1
    eqs = 0
    while pos < len(text) and text[pos] == "=":
        eqs += 1
        pos += 1
    if pos < len(text) and text[pos] == "[":
        return eqs, pos + 1
    return None


def _slice_function(text: str, start_idx: int) -> str:
    depth = 0
    i = start_idx
    in_string = False
    string_delim = ""
    long_string = False
    long_string_eqs = 0
    in_comment = False
    comment_type = ""
    comment_eqs = 0
    repeat_blocks = 0

    while i < len(text):
        ch = text[i]
        next_two = text[i : i + 2]

        if in_comment:
            if comment_type == "line":
                if ch == "\n":
                    in_comment = False
                i += 1
                continue
            else:
                close_seq = "]" + "=" * comment_eqs + "]"
                if text.startswith(close_seq, i):
                    in_comment = False
                    i += len(close_seq)
                else:
                    i += 1
                continue

        if in_string:
            if long_string:
                close_seq = "]" + "=" * long_string_eqs + "]"
                if text.startswith(close_seq, i):
                    in_string = False
                    long_string = False
                    i += len(close_seq)
                else:
                    i += 1
                continue
            else:
                if ch == "\\":
                    i += 2
                    continue
                if ch == string_delim:
                    in_string = False
                i += 1
                continue

        if next_two == "--":
            if i + 2 < len(text) and text[i + 2] == "[":
                long = _consume_long_bracket(text, i + 2)
                if long:
                    comment_type = "block"
                    comment_eqs, i = long
                    in_comment = True
                    continue
            in_comment = True
            comment_type = "line"
            comment_eqs = 0
            i += 2
            continue

        if ch in ("'", '"'):
            in_string = True
            string_delim = ch
            long_string = False
            i += 1
            continue

        if ch == "[":
            long = _consume_long_bracket(text, i)
            if long:
                long_string = True
                in_string = True
                long_string_eqs, i = long
                continue

        if _match_keyword(text, i, "function"):
            depth += 1
            i += len("function")
            continue

        matched = False
        for keyword in ("if", "for", "while"):
            if _match_keyword(text, i, keyword):
                depth += 1
                i += len(keyword)
                matched = True
                break
        if matched:
            continue

        if _match_keyword(text, i, "repeat"):
            depth += 1
            repeat_blocks += 1
            i += len("repeat")
            continue

        if _match_keyword(text, i, "until"):
            if repeat_blocks > 0:
                repeat_blocks -= 1
                depth -= 1
            i += len("until")
            if depth == 0:
                return text[start_idx:i]
            continue

        if _match_keyword(text, i, "end"):
            depth -= 1
            i += len("end")
            if depth == 0:
                return text[start_idx:i]
            continue

        i += 1

    return ""


BUFF_TABLES = (
    "Table_Buffer",
    "Table_Buffer_bk",
    "Table_Buffer_NoviceServer",
)


def _load_buff_formula_map(paths: GamePaths) -> Dict[int, dict]:
    merged: Dict[int, dict] = {}
    for table_name in BUFF_TABLES:
        try:
            source = LuaTableSource(paths.skill_bundle, table_name)
        except FileNotFoundError:
            continue
        for entry in source.load_entries():
            buff_id = entry.get("id")
            if buff_id is None:
                continue
            merged[buff_id] = entry

    mapping: Dict[int, dict] = {}
    for buff_id, entry in merged.items():
        buff_rate = entry.get("BuffRate")
        if not isinstance(buff_rate, dict):
            continue
        odds = buff_rate.get("Odds")
        if not isinstance(odds, dict):
            continue
        type_value = odds.get("type")
        type_id: int | None = None
        if isinstance(type_value, int):
            type_id = type_value
        elif isinstance(type_value, str):
            try:
                type_id = int(type_value)
            except ValueError:
                type_id = None
        if type_id is None:
            continue
        mapping[buff_id] = {
            "type_id": type_id,
            "formula": f"CommonFun.calcBuff_{type_id}",
        }
    return mapping


def _build_usage_map(paths: GamePaths, translator: TranslationLookup) -> Dict[tuple[str, int], dict]:
    branches = load_skill_branches(paths)
    master_entries = load_master_entries(paths)
    if master_entries:
        existing_ids = {entry.get("id") for entry in branches if entry.get("id") is not None}
        for entry in master_entries.values():
            entry_id = entry.get("id")
            if entry_id is None or entry_id in existing_ids:
                continue
            branches.append(entry)
            existing_ids.add(entry_id)
    buff_map = _load_buff_formula_map(paths)
    formulas: Dict[tuple[str, int], dict] = defaultdict(
        lambda: {"formula": "", "type_id": None, "category": "", "usages": []}
    )
    seen = set()

    def _ensure_bucket(kind: str, type_id: int, formula_name: str) -> dict:
        bucket = formulas[(kind, type_id)]
        bucket["formula"] = formula_name
        bucket["type_id"] = type_id
        bucket["category"] = kind
        return bucket

    for entry in branches:
        name_token = entry.get("NameZh", "")
        translated_name = translator.translate(name_token) if translator else ""
        level_id = entry.get("id")
        level = entry.get("Level")

        for damage in entry.get("Damage") or []:
            type_id = damage.get("type")
            if type_id is None:
                continue
            key = (
                "damage",
                type_id,
                level_id,
                json.dumps(damage, sort_keys=True, ensure_ascii=False),
            )
            if key in seen:
                continue
            seen.add(key)

            formula_name = f"CommonFun.calcDamage_{type_id}"
            bucket = _ensure_bucket("damage", type_id, formula_name)
            bucket["usages"].append(
                {
                    "category": "damage",
                    "level_id": level_id,
                    "skill_name": translated_name,
                    "skill_token": name_token,
                    "level": level,
                    "damage_params": damage,
                }
            )

        for buff_field in ("Buff", "Pvp_buff"):
            buff_entry = entry.get(buff_field) or {}
            if not isinstance(buff_entry, dict):
                continue
            for target, buff_ids in buff_entry.items():
                if not isinstance(buff_ids, list):
                    continue
                for raw_buff_id in buff_ids:
                    buff_id = raw_buff_id
                    if isinstance(raw_buff_id, dict):
                        buff_id = raw_buff_id.get("id")
                    if not isinstance(buff_id, int):
                        continue
                    info = buff_map.get(buff_id)
                    if not info:
                        continue
                    type_id = info["type_id"]
                    formula_name = info["formula"]
                    key = ("buff", type_id, level_id, buff_id, buff_field, target)
                    if key in seen:
                        continue
                    seen.add(key)
                    bucket = _ensure_bucket("buff", type_id, formula_name)
                    bucket["usages"].append(
                        {
                            "category": "buff",
                            "level_id": level_id,
                            "skill_name": translated_name,
                            "skill_token": name_token,
                            "level": level,
                            "buff_id": buff_id,
                            "buff_target": target,
                            "buff_source": buff_field,
                        }
                    )

    return formulas


def _group_usage_entries(usages: List[dict]) -> List[dict]:
    groups: Dict[str, dict] = {}
    for usage in usages:
        level_id = usage.get("level_id")
        token = usage.get("skill_token") or ""
        name = usage.get("skill_name") or ""
        display_key = name or token
        key = display_key or (str(level_id) if level_id is not None else "")
        if not key:
            key = str(level_id)
        group = groups.setdefault(
            key,
            {
                "key": key,
                "skill_name": name,
                "skill_token": usage.get("skill_token", ""),
                "level_ids": [],
                "levels": [],
            },
        )
        if level_id is not None:
            group["level_ids"].append(level_id)
        group["display_name"] = name or token or key
        level_entry = {
            "level_id": level_id,
            "level": usage.get("level"),
            "damage_params": usage.get("damage_params"),
            "buff_id": usage.get("buff_id"),
            "buff_target": usage.get("buff_target"),
            "buff_source": usage.get("buff_source"),
            "category": usage.get("category"),
        }
        group["levels"].append(level_entry)

    for group in groups.values():
        group["level_ids"] = sorted(group["level_ids"])
        group["levels"].sort(key=lambda lvl: ((lvl.get("level") or 0), (lvl.get("level_id") or 0)))

    return sorted(groups.values(), key=lambda entry: entry["key"])


def extract_formulas(paths: GamePaths, context: ExtractionContext, output_dir: Path) -> List[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    translator = context.translators.get("english") or next(iter(context.translators.values()))

    chunks = _load_commonfun_chunks(paths)

    lua_dir = output_dir / "lua"
    lua_dir.mkdir(parents=True, exist_ok=True)
    for name, text in chunks.items():
        (lua_dir / f"{name}.lua").write_text(text, encoding="utf-8")

    lua_text = "\n".join(chunks.values())
    functions = _extract_functions(lua_text)
    functions_dir = lua_dir / "functions"
    functions_dir.mkdir(parents=True, exist_ok=True)
    for fname, code in functions.items():
        parts = fname.split(".")
        func_path = functions_dir.joinpath(*parts[:-1])
        func_path = func_path / f"{parts[-1]}.lua"
        func_path.parent.mkdir(parents=True, exist_ok=True)
        snippet = code if code.endswith("\n") else f"{code}\n"
        func_path.write_text(snippet, encoding="utf-8")

    # Include all CommonFun functions in the database
    definitions = [
        {"name": f"CommonFun.{name}", "code": code}
        for name, code in sorted(functions.items())
    ]

    definitions_path = output_dir / "formula_definitions.json"
    definitions_payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(definitions),
        "formulas": definitions,
    }
    definitions_path.write_text(
        json.dumps(definitions_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    usage_map = _build_usage_map(paths, translator)
    for payload in usage_map.values():
        payload["usage_groups"] = _group_usage_entries(payload.get("usages") or [])
    usage_path = output_dir / "formula_usages.json"
    usage_payload = {
        "extracted_at": context.extracted_at,
        "languages": context.languages,
        "total": len(usage_map),
        "formulas": sorted(usage_map.values(), key=lambda item: item["type_id"] or 0),
    }
    usage_path.write_text(
        json.dumps(usage_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return [definitions_path, usage_path]
