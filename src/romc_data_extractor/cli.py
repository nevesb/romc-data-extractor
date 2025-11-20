"""Command line entrypoint for the ROMC data extractor."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from .config import GamePaths
from .context import ExtractionContext
from .processors.assets import extract_icons
from .processors.classes import extract_classes
from .processors.formulas import extract_formulas
from .processors.items import extract_items
from .processors.monsters import extract_monsters
from .processors.skills import extract_skills
from .processors.buffs import extract_buffs
from .processors.rewards import extract_rewards
from .translation import TranslationLookup, discover_languages


PROCESSOR_MAP = {
    "items": extract_items,
    "monsters": extract_monsters,
    "skills": extract_skills,
    "classes": extract_classes,
    "formulas": extract_formulas,
    "icons": extract_icons,
    "buffs": extract_buffs,
    "rewards": extract_rewards,
}


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ROMC data tables to JSON.")
    parser.add_argument("--game-root", required=True, help="Path to the game installation directory.")
    parser.add_argument("--output", required=True, help="Directory where JSON files will be written.")
    parser.add_argument(
        "--modules",
        nargs="+",
        default=list(PROCESSOR_MAP.keys()),
        choices=list(PROCESSOR_MAP.keys()),
        help="Choose which data sets to extract.",
    )
    parser.add_argument(
        "--extracted-at",
        default=None,
        help="Optional ISO-8601 timestamp to store as the extraction moment (defaults to current UTC).",
    )
    return parser.parse_args(argv)


def _normalize_extracted_at(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    cleaned = value.strip()
    if not cleaned:
        return datetime.now(timezone.utc).isoformat()
    normalized = cleaned.replace("Z", "+00:00")
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(f"{normalized}T00:00:00")
        except ValueError as exc:
            raise ValueError(f"Invalid --extracted-at value: {value}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat()


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    paths = GamePaths(Path(args.game_root))
    output_dir = Path(args.output)

    languages = discover_languages(paths.translate_dir)
    if not languages:
        languages = ["english"]
    translators = {lang: TranslationLookup(paths.translate_dir, language=lang) for lang in languages}
    extracted_at = _normalize_extracted_at(args.extracted_at)
    context = ExtractionContext(languages=languages, translators=translators, extracted_at=extracted_at)

    for module in args.modules:
        processor = PROCESSOR_MAP[module]
        out_files = processor(paths, context, output_dir)
        if isinstance(out_files, (list, tuple)):
            for produced in out_files:
                print(f"{module} -> {produced}")
        else:
            print(f"{module} -> {out_files}")


if __name__ == "__main__":
    main()
