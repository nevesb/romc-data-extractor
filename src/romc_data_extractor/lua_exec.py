"""Helpers to execute decrypted Lua chunks via an external Lua interpreter."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .lua_decoder import _build_luac_payload, _coerce_script_bytes
from .slua_runtime import dump_lua_chunk, dump_lua_table_runtime, SluaRuntimeError

DEFAULT_LUA_PATH = Path("temp/lua-5.3.6/src/lua32.exe")

_LUA_SCRIPT = r"""
local chunk_path, table_name = ...
local env = {}
setmetatable(env, { __index = _G })
local chunk = assert(loadfile(chunk_path, "b", env))
assert(chunk())
local target = env[table_name] or _G[table_name]
if type(target) ~= "table" then
  error(string.format("table '%s' not found", table_name))
end

local function escape(str)
  return str:gsub("\\", "\\\\"):gsub("\"", "\\\""):gsub("\n", "\\n"):gsub("\r", "\\r")
end

local function is_array(tab)
  local count = 0
  for k in pairs(tab) do
    if type(k) ~= "number" then return false end
    if k > count then count = k end
  end
  return count == #tab
end

local function encode(val)
  local t = type(val)
  if t == "number" or t == "boolean" then
    return tostring(val)
  elseif t == "string" then
    return '"' .. escape(val) .. '"'
  elseif t == "table" then
    if is_array(val) then
      local parts = {}
      for i = 1, #val do
        parts[i] = encode(val[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local keys = {}
      for k in pairs(val) do
        keys[#keys + 1] = k
      end
      table.sort(keys, function(a, b)
        if type(a) == type(b) then
          return a < b
        end
        return tostring(a) < tostring(b)
      end)
      local parts = {}
      for i, k in ipairs(keys) do
        local key_repr
        if type(k) == "number" then
          key_repr = '"' .. k .. '"'
        else
          key_repr = '"' .. escape(tostring(k)) .. '"'
        end
        parts[i] = key_repr .. ":" .. encode(val[k])
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  else
    return "null"
  end
end

io.write(encode(target))
"""


def _lua_executable() -> Path:
    override = os.environ.get("ROMC_LUA_PATH")
    if override:
        path = Path(override)
    else:
        path = DEFAULT_LUA_PATH
    if not path.exists():
        raise FileNotFoundError(
            f"Lua interpreter not found at {path}. "
            "Build Lua 5.3.x (32-bit) and set ROMC_LUA_PATH."
        )
    return path


def dump_lua_table(script_data: bytes | str, table_name: str) -> Any:
    """Execute the Lua chunk and return the target table as Python data."""

    script_bytes = _coerce_script_bytes(script_data)

    try:
        return dump_lua_table_runtime(script_bytes, table_name)
    except (SluaRuntimeError, FileNotFoundError, OSError):
        pass

    try:
        luac = dump_lua_chunk(script_bytes)
    except (SluaRuntimeError, OSError):
        luac = _build_luac_payload(script_bytes)
    lua_path = _lua_executable()

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        chunk_path = tmpdir / "chunk.luac"
        script_path = tmpdir / "dump.lua"
        chunk_path.write_bytes(luac)
        script_path.write_text(_LUA_SCRIPT, encoding="utf-8")

        proc = subprocess.run(
            [str(lua_path), str(script_path), str(chunk_path), table_name],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"Lua execution failed (code {proc.returncode}): {proc.stderr.strip()}"
            )
        output = proc.stdout.strip()
        if not output:
            return {}
        return json.loads(output)
