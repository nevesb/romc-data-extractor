"""Bindings to the game's slua runtime for decoding encrypted Lua blobs."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
from typing import Any, Optional


class SluaRuntimeError(RuntimeError):
    """Raised when the slua runtime cannot process a blob."""


_RUNTIME_CACHE: dict[Path, "_SluaRuntime"] = {}


LUA_REGISTRYINDEX = -10000
LUA_TNIL = 0
LUA_TBOOLEAN = 1
LUA_TNUMBER = 3
LUA_TSTRING = 4
LUA_TTABLE = 5


def _default_dll_path() -> Path:
    env_override = os.environ.get("SLUA_DLL")
    if env_override:
        return Path(env_override)
    base_dir = Path(__file__).resolve().parent.parent
    return base_dir / "third_party" / "slua" / "slua_encrypt.dll"


def dump_lua_chunk(script_bytes: bytes, dll_path: Optional[Path] = None) -> bytes:
    """Use slua_encrypt.dll to turn an encrypted TextAsset payload into a luac chunk."""

    if not script_bytes:
        return b""

    dll = Path(dll_path) if dll_path else _default_dll_path()
    runtime = _RUNTIME_CACHE.get(dll)
    if runtime is None:
        runtime = _SluaRuntime(dll)
        _RUNTIME_CACHE[dll] = runtime
    return runtime.dump_chunk(script_bytes)


def dump_lua_table_runtime(
    script_bytes: bytes, table_name: str, dll_path: Optional[Path] = None
) -> Any:
    """Execute the Lua chunk and return a Python representation of the table."""

    if not script_bytes:
        return {}
    dll = Path(dll_path) if dll_path else _default_dll_path()
    runtime = _RUNTIME_CACHE.get(dll)
    if runtime is None:
        runtime = _SluaRuntime(dll)
        _RUNTIME_CACHE[dll] = runtime
    return runtime.dump_table(script_bytes, table_name)


class _SluaRuntime:
    def __init__(self, dll_path: Path) -> None:
        if not dll_path.exists():
            raise FileNotFoundError(f"slua_encrypt.dll not found at {dll_path}")
        self._dll_path = dll_path
        self._lib = ctypes.CDLL(str(dll_path))
        self._configure()

    def _configure(self) -> None:
        self._lib.luaL_newstate.restype = ctypes.c_void_p
        self._lib.luaL_newstate.argtypes = []
        self._lib.lua_close.restype = None
        self._lib.lua_close.argtypes = [ctypes.c_void_p]
        self._lib.luaL_openlibs.restype = None
        self._lib.luaL_openlibs.argtypes = [ctypes.c_void_p]
        self._lib.luaRO_loadbufferx.restype = ctypes.c_int
        self._lib.luaRO_loadbufferx.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_char_p,
            ctypes.c_char_p,
        ]
        self._writer_proto = ctypes.CFUNCTYPE(
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_void_p,
        )
        self._lib.lua_dump.restype = ctypes.c_int
        self._lib.lua_dump.argtypes = [
            ctypes.c_void_p,
            self._writer_proto,
            ctypes.c_void_p,
            ctypes.c_int,
        ]
        self._lib.lua_pcallk.restype = ctypes.c_int
        self._lib.lua_pcallk.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_size_t,
            ctypes.c_void_p,
        ]
        self._lib.lua_getglobal.restype = ctypes.c_int
        self._lib.lua_getglobal.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self._lib.lua_type.restype = ctypes.c_int
        self._lib.lua_type.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self._lib.lua_tolstring.restype = ctypes.c_char_p
        self._lib.lua_tolstring.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_size_t),
        ]
        self._lib.lua_tointegerx.restype = ctypes.c_longlong
        self._lib.lua_tointegerx.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_int),
        ]
        self._lib.lua_tonumberx.restype = ctypes.c_double
        self._lib.lua_tonumberx.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_int),
        ]
        self._lib.lua_toboolean.restype = ctypes.c_int
        self._lib.lua_toboolean.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self._lib.lua_pushnil.restype = None
        self._lib.lua_pushnil.argtypes = [ctypes.c_void_p]
        self._lib.lua_next.restype = ctypes.c_int
        self._lib.lua_next.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self._lib.lua_gettop.restype = ctypes.c_int
        self._lib.lua_gettop.argtypes = [ctypes.c_void_p]
        self._lib.lua_settop.restype = None
        self._lib.lua_settop.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self._lib.lua_isinteger.restype = ctypes.c_int
        self._lib.lua_isinteger.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self._lib.lua_topointer.restype = ctypes.c_void_p
        self._lib.lua_topointer.argtypes = [ctypes.c_void_p, ctypes.c_int]

    def dump_chunk(self, script_bytes: bytes) -> bytes:
        state = self._lib.luaL_newstate()
        if not state:
            raise SluaRuntimeError("Failed to create Lua state")
        try:
            self._lib.luaL_openlibs(state)
            buf = (ctypes.c_char * len(script_bytes)).from_buffer_copy(script_bytes)
            load_rc = self._lib.luaRO_loadbufferx(
                state, buf, len(script_bytes), b"romc", None
            )
            if load_rc != 0:
                raise SluaRuntimeError(f"luaRO_loadbufferx failed with code {load_rc}")

            output = bytearray()

            @self._writer_proto
            def _writer(_state, payload, size, _userdata):
                output.extend(ctypes.string_at(payload, size))
                return 0

            dump_rc = self._lib.lua_dump(state, _writer, None, 0)
            if dump_rc != 0:
                raise SluaRuntimeError(f"lua_dump failed with code {dump_rc}")
            return bytes(output)
        finally:
            self._lib.lua_close(state)

    def dump_table(self, script_bytes: bytes, table_name: str) -> Any:
        state = self._lib.luaL_newstate()
        if not state:
            raise SluaRuntimeError("Failed to create Lua state")
        try:
            self._lib.luaL_openlibs(state)
            buf = (ctypes.c_char * len(script_bytes)).from_buffer_copy(script_bytes)
            load_rc = self._lib.luaRO_loadbufferx(
                state, buf, len(script_bytes), b"romc", None
            )
            if load_rc != 0:
                raise SluaRuntimeError(f"luaRO_loadbufferx failed with code {load_rc}")
            if self._lib.lua_pcallk(state, 0, 0, 0, 0, None) != 0:
                raise SluaRuntimeError(self._stack_error(state))
            name_bytes = table_name.encode("utf-8")
            self._lib.lua_getglobal(state, name_bytes)
            if self._lib.lua_type(state, -1) != LUA_TTABLE:
                raise SluaRuntimeError(f"table '{table_name}' not found")
            return self._lua_to_python(state, -1, set())
        finally:
            self._lib.lua_close(state)

    def _stack_error(self, state: ctypes.c_void_p) -> str:
        err = self._lua_to_python(state, -1, set())
        self._lua_pop(state, 1)
        if isinstance(err, str):
            return err
        return "lua runtime error"

    def _abs_index(self, state: ctypes.c_void_p, idx: int) -> int:
        if idx > 0 or idx <= LUA_REGISTRYINDEX:
            return idx
        top = self._lib.lua_gettop(state)
        return top + idx + 1

    def _lua_pop(self, state: ctypes.c_void_p, count: int) -> None:
        self._lib.lua_settop(state, -count - 1)

    def _lua_to_python(
        self, state: ctypes.c_void_p, idx: int, seen: set[int]
    ) -> Any:
        lua_type = self._lib.lua_type(state, idx)
        if lua_type == LUA_TNIL:
            return None
        if lua_type == LUA_TBOOLEAN:
            return bool(self._lib.lua_toboolean(state, idx))
        if lua_type == LUA_TNUMBER:
            is_int = self._lib.lua_isinteger(state, idx)
            if is_int:
                success = ctypes.c_int(0)
                value = self._lib.lua_tointegerx(state, idx, ctypes.byref(success))
                return int(value)
            success = ctypes.c_int(0)
            value = self._lib.lua_tonumberx(state, idx, ctypes.byref(success))
            return float(value)
        if lua_type == LUA_TSTRING:
            size = ctypes.c_size_t(0)
            ptr = self._lib.lua_tolstring(state, idx, ctypes.byref(size))
            if not ptr:
                return ""
            data = ctypes.string_at(ptr, size.value)
            return data.decode("utf-8", "surrogatepass")
        if lua_type == LUA_TTABLE:
            return self._lua_table_to_python(state, idx, seen)
        return None

    def _lua_table_to_python(
        self, state: ctypes.c_void_p, idx: int, seen: set[int]
    ) -> Any:
        abs_idx = self._abs_index(state, idx)
        ptr = self._lib.lua_topointer(state, abs_idx)
        ident = ptr if isinstance(ptr, int) else None
        if ident is not None:
            if ident in seen:
                return None
            seen.add(ident)

        self._lib.lua_pushnil(state)
        array_values: dict[int, Any] = {}
        map_values: dict[Any, Any] = {}
        max_index = 0
        array_candidate = True

        while self._lib.lua_next(state, abs_idx):
            value = self._lua_to_python(state, -1, seen)
            key = self._lua_to_python(state, -2, seen)
            self._lua_pop(state, 1)
            if isinstance(key, int) and key >= 1:
                array_values[key] = value
                if key > max_index:
                    max_index = key
            else:
                array_candidate = False
                map_values[key] = value

        result: Any
        if array_candidate and array_values and len(array_values) == max_index:
            result = [array_values.get(i) for i in range(1, max_index + 1)]
        else:
            combined: dict[Any, Any] = {}
            combined.update(map_values)
            for k, v in array_values.items():
                combined[k] = v
            result = combined
        if ident is not None:
            seen.discard(ident)
        return result
