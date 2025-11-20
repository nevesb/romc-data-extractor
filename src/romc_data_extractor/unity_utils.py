"""Helpers around UnityPy loading and compression handling."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Union

import UnityPy
import zstandard as zstd
from UnityPy.enums import CompressionFlags
from UnityPy.helpers import CompressionHelper

PathLike = Union[str, Path]

_ZSTD_FLAG = CompressionFlags(5)
_zstd_ready = False


def _install_zstd_support() -> None:
    global _zstd_ready
    if _zstd_ready:
        return

    if _ZSTD_FLAG not in CompressionHelper.DECOMPRESSION_MAP:
        dctx = zstd.ZstdDecompressor()

        def _decompress(data: bytes, expected_size: int | None) -> bytes:
            if expected_size and expected_size > 0:
                return dctx.decompress(data, max_output_size=expected_size)
            return dctx.decompress(data)

        CompressionHelper.DECOMPRESSION_MAP[_ZSTD_FLAG] = _decompress
    _zstd_ready = True


@lru_cache(maxsize=8)
def load_bundle(path: PathLike) -> UnityPy.environment.Environment:
    """Load an asset bundle, patching UnityPy if needed."""

    _install_zstd_support()
    return UnityPy.load(str(path))
