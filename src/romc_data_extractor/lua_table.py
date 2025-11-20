"""Utilities to turn Unity TextAssets into Python dictionaries."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, List, Sequence

from slpp import slpp as lua

from .lua_decoder import decode_lua_bytes
from .unity_utils import load_bundle


def get_text_from_asset(asset, raw_blob: bytes | None = None) -> str:
    script = asset.m_Script
    if isinstance(script, bytes):
        raw = script
    else:
        raw = script.encode("utf-8", "surrogatepass")

    if raw and raw[0] == 0x2A:
        try:
            return decode_lua_bytes(raw, raw_blob=raw_blob)
        except Exception:
            pass

    return raw.decode("utf-8", errors="ignore")


def _consume_lua_block(text: str, start: int) -> tuple[str, int] | tuple[None, int]:
    """Return the full `{...}` block starting at `start` and the next position."""
    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if ch == "'" and not escape:
            in_string = not in_string
        if in_string:
            escape = ch == "\\" and not escape
            if ch != "\\":
                escape = False
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1], idx + 1
        escape = False
    return None, start


def iter_lua_entries(text: str) -> Iterator[str]:
    """Yield every `{...}` snippet that contains an `id=` field."""
    pos = 0
    while True:
        idx = text.find("id=", pos)
        if idx == -1:
            break
        start = text.rfind("{", 0, idx)
        if start == -1:
            pos = idx + 3
            continue
        if start > 0:
            prev = text[start - 1]
            if prev == "=":
                pos = idx + 3
                continue
            if prev == "{" and start > 1 and text[start - 2] == "=":
                pos = idx + 3
                continue

        block, end = _consume_lua_block(text, start)
        if block:
            yield block
            pos = end
        else:
            pos = idx + 3


def parse_lua_dicts(text: str) -> List[dict]:
    """Parse all entries in a Lua-like text blob."""
    records: list[dict] = []
    for snippet in iter_lua_entries(text):
        try:
            records.append(lua.decode(snippet))
        except Exception:
            continue
    return records


@dataclass(frozen=True)
class LuaTableSource:
    bundle_path: Path
    asset_name: str

    def load_entries(self) -> List[dict]:
        env = load_bundle(self.bundle_path)
        for obj in env.objects:
            if obj.type.name != "TextAsset":
                continue
            asset = obj.read()
            if asset.m_Name == self.asset_name:
                text = get_text_from_asset(asset, raw_blob=obj.get_raw_data())
                return parse_lua_dicts(text)
        raise FileNotFoundError(f"TextAsset {self.asset_name} not found in {self.bundle_path}")
