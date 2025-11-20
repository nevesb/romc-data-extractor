"""Shared extraction context (languages, translators, metadata)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .translation import TranslationLookup


@dataclass(frozen=True)
class ExtractionContext:
    languages: List[str]
    translators: Dict[str, TranslationLookup]
    extracted_at: str

    def translate_all(self, token: str, fallback: Optional[str] = None) -> Dict[str, str]:
        if token is None:
            token = ""
        results: Dict[str, str] = {}
        for lang, translator in self.translators.items():
            value = translator.translate(token)
            if fallback and (value == token or not value):
                value = fallback
            results[lang] = value
        return results
