"""Utilities to read the localized string tables bundled with the client."""

from __future__ import annotations

import re
import struct
from bisect import bisect_right
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from .unity_utils import load_bundle


_RANGE_RE = re.compile(
    r"noen_(?P<lang>[a-z]+)_int_(?P<start>\d+)_(?P<end>\d+)\.unity3d", re.IGNORECASE
)


def _align_four(offset: int) -> int:
    return (offset + 3) & ~3


def _parse_translation_blob(blob: bytes) -> Dict[str, str]:
    offset = 0

    def read_u32() -> int:
        nonlocal offset
        if offset + 4 > len(blob):
            raise ValueError("unexpected EOF while reading uint32")
        val = struct.unpack_from("<I", blob, offset)[0]
        offset += 4
        return val

    def read_u64() -> int:
        nonlocal offset
        if offset + 8 > len(blob):
            raise ValueError("unexpected EOF while reading uint64")
        val = struct.unpack_from("<Q", blob, offset)[0]
        offset += 8
        return val

    # skip header noise
    for _ in range(5):
        read_u32()
    read_u64()  # hash/guid
    name_len = read_u32()
    offset += name_len
    offset = _align_four(offset)

    entry_count = read_u32()
    entries: Dict[str, str] = {}

    for _ in range(entry_count):
        key_len = read_u32()
        key = blob[offset : offset + key_len].decode("utf-8")
        offset += key_len
        offset = _align_four(offset)
        value_len = read_u32()
        value = blob[offset : offset + value_len].decode("utf-8")
        offset += value_len
        offset = _align_four(offset)
        entries[key] = value
    return entries


class TranslationLookup:
    """Lazy loader for the segmented translation tables."""

    def __init__(self, translate_dir: Path, language: str = "english") -> None:
        self.translate_dir = Path(translate_dir)
        self.language = language.lower()
        self._ranges: List[Tuple[int, int, Path]] = []
        self._starts: List[int] = []
        self._cache: Dict[Path, Dict[str, str]] = {}
        self._direct_table: Dict[str, str] | None = None
        self._index_files()

    def _index_files(self) -> None:
        pattern = f"noen_{self.language}_int_*.unity3d"
        ranges: List[Tuple[int, int, Path]] = []
        for path in self.translate_dir.glob(pattern):
            match = _RANGE_RE.match(path.name)
            if not match:
                continue
            start = int(match.group("start"))
            end = int(match.group("end"))
            ranges.append((start, end, path))

        ranges.sort(key=lambda item: item[0])
        self._ranges = ranges
        self._starts = [start for start, *_ in ranges]

    def _load_file(self, path: Path) -> Dict[str, str]:
        if path in self._cache:
            return self._cache[path]
        env = load_bundle(path)
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            raw = obj.get_raw_data()
            table = _parse_translation_blob(raw)
            self._cache[path] = table
            return table
        raise FileNotFoundError(f"No MonoBehaviour payload found inside {path}")

    def _file_for_id(self, text_id: int) -> Path | None:
        if not self._ranges:
            return None
        idx = bisect_right(self._starts, text_id) - 1
        if idx < 0:
            return None
        start, end, path = self._ranges[idx]
        if start <= text_id <= end:
            return path
        return None

    def translate(self, token: str) -> str:
        """Translate a token like '##125001'. Returns original token if missing."""
        if not token or not token.startswith("##"):
            return self._direct_translate(token)
        try:
            text_id = int(token[2:])
        except ValueError:
            return token
        bundle = self._file_for_id(text_id)
        if not bundle:
            return token
        table = self._load_file(bundle)
        return table.get(str(text_id), token)

    def _direct_translate(self, text: str) -> str:
        if not text:
            return text
        table = self._load_direct_table()
        return table.get(text, text)

    def _load_direct_table(self) -> Dict[str, str]:
        if self._direct_table is not None:
            return self._direct_table
        bundle_path = self.translate_dir / f"{self.language}.unity3d"
        if not bundle_path.exists():
            self._direct_table = {}
            return self._direct_table
        env = load_bundle(bundle_path)
        for obj in env.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            raw = obj.get_raw_data()
            self._direct_table = _parse_translation_blob(raw)
            return self._direct_table
        self._direct_table = {}
        return self._direct_table


def discover_languages(translate_dir: Path) -> List[str]:
    """Return a sorted list of languages available under translate_dir."""

    langs: set[str] = set()
    for path in Path(translate_dir).glob("noen_*_int_*.unity3d"):
        match = _RANGE_RE.match(path.name)
        if not match:
            continue
        langs.add(match.group("lang").lower())
    return sorted(langs)
