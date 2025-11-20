"""Utilities to decode encrypted Lua TextAssets shipped with the client."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import requests
import struct

from .rom_des import decrypt_rom_payload
from .slua_runtime import SluaRuntimeError, dump_lua_chunk

HEADER_BYTES = (
    b"\x1B\x4C\x75\x61\x53"
    b"\x00"
    b"\x19\x93\x0D\x0A\x1A\x0A"
    + bytes([0x04, 0x04, 0x04, 0x08, 0x08])
    + struct.pack("<Q", 0x5678)
    + struct.pack("<d", 370.5)
)

UNLUAC_URL: str | None = None
UNLUAC_PATH = (
    Path(__file__).resolve().parent.parent
    / "third_party"
    / "unluac"
    / "unluac_2025_11_12.jar"
)


def ensure_unluac(path: Path = UNLUAC_PATH) -> Path:
    """Download the unluac jar if needed."""

    if path.exists():
        return path

    if not UNLUAC_URL:
        raise FileNotFoundError(
            f"unluac jar missing at {path}. Build it from https://github.com/viruscamp/unluac and place it there."
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(UNLUAC_URL, timeout=60)
    resp.raise_for_status()
    path.write_bytes(resp.content)
    return path


def _run_unluac(luac_bytes: bytes, jar_path: Optional[Path]) -> str:
    jar = ensure_unluac(jar_path or UNLUAC_PATH)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        luac_path = tmpdir_path / "chunk.luac"
        luac_path.write_bytes(luac_bytes)

        try:
            proc = subprocess.run(
                ["java", "-jar", str(jar), str(luac_path)],
                check=True,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Java runtime not found. Install Java to decode Lua TextAssets.") from exc
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"unluac failed: {exc.stderr}") from exc

        return proc.stdout


def decode_lua_bytes(
    script_data: bytes | str,
    raw_blob: Optional[bytes] = None,
    jar_path: Optional[Path] = None,
) -> str:
    """Return the decompiled Lua text from the encrypted TextAsset bytes."""

    if not script_data:
        return ""

    script_bytes = _coerce_script_bytes(script_data)

    if script_bytes and script_bytes[0] != 0x2A:
        return script_bytes.decode("utf-8", errors="ignore")

    last_error: RuntimeError | None = None

    if script_bytes and script_bytes[0] == 0x2A:
        luac_bytes: bytes | None = None
        try:
            luac_bytes = dump_lua_chunk(script_bytes)
        except (FileNotFoundError, SluaRuntimeError, OSError) as exc:
            try:
                luac_bytes = _build_luac_payload(script_bytes)
            except Exception:
                last_error = RuntimeError(str(exc))
        if luac_bytes:
            try:
                return _run_unluac(luac_bytes, jar_path)
            except RuntimeError as exc:
                last_error = exc

    for blob in (script_bytes, raw_blob):
        if not blob:
            continue
        decrypted = decrypt_rom_payload(blob)
        if not decrypted:
            continue
        if decrypted and decrypted[0] == 0x2A:
            return decode_lua_bytes(decrypted, None, jar_path)
        return decrypted.decode("utf-8", errors="ignore")

    if last_error:
        raise last_error

    raise RuntimeError("Unsupported Lua blob format")


def _build_luac_payload(data: bytes) -> bytes:
    if len(data) < 0x101 or data[0] != 0x2A:
        raise ValueError("Unsupported Lua blob format")

    payload = data[1 + 0x100 :]
    zero_idx = payload.find(b"\x00")
    if zero_idx == -1:
        raise ValueError("Malformed Lua payload (missing null terminator)")

    # Skip the null terminator itself; the chunk starts right after the source path.
    start = zero_idx + 1
    while start < len(payload) and payload[start] == 0:
        start += 1
    payload = payload[start:]
    return HEADER_BYTES + payload


def _coerce_script_bytes(script_data: bytes | str) -> bytes:
    if isinstance(script_data, bytes):
        return script_data
    contains_surrogate = any(0xD800 <= ord(ch) <= 0xDFFF for ch in script_data)
    if contains_surrogate:
        return script_data.encode("utf-16-le", "surrogatepass")
    return script_data.encode("utf-8", "surrogateescape")
