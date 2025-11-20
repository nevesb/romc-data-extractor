"""Paths and constants for the ROMC data files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GamePaths:
    root: Path

    def __post_init__(self) -> None:
        root = Path(self.root)
        object.__setattr__(self, "root", root)
        if not root.exists():
            raise FileNotFoundError(f"Game directory not found: {root}")

        data_root = root / "ro_win_Data"
        if data_root.exists():
            streaming_root = data_root / "StreamingAssets"
        else:
            object.__setattr__(self, "root", root)
            data_root = root
            streaming_root = root / "StreamingAssets"
            if not streaming_root.exists():
                streaming_root = root

        object.__setattr__(self, "data_root", data_root)
        object.__setattr__(self, "streaming_root", streaming_root)

    @property
    def script_root(self) -> Path:
        return self.streaming_root / "resources" / "script2"

    @property
    def translate_dir(self) -> Path:
        return self.streaming_root / "resources" / "lang" / "translate"

    def script_bundle(self, filename: str) -> Path:
        return self.script_root / filename

    @property
    def item_bundle(self) -> Path:
        return self.script_bundle("config_item_daoju.unity3d")

    @property
    def monster_bundle(self) -> Path:
        return self.script_bundle("config_npc_mowu.unity3d")

    @property
    def skill_bundle(self) -> Path:
        return self.script_bundle("config_skill_jineng.unity3d")
