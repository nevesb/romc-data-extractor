"""Orchestrates pulling the Android client via ADB and running the extractor."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from zipfile import ZipFile

from .cli import PROCESSOR_MAP, main as extractor_main


DEFAULT_PACKAGES = ["com.gravity.romcg", "com.gravityus.romgzeny.aos"]

# Datasets that should be exported as newline-delimited JSON for MongoDB.
EXPORTABLE_DATASETS = {
    "items": ("items.json", "items"),
    "monsters": ("monsters.json", "monsters"),
    "skills": ("skills.json", "skills"),
    "classes": ("classes.json", "classes"),
    "formula_definitions": ("formula_definitions.json", "formulas"),
    "formula_usages": ("formula_usages.json", "formulas"),
    "buffs": ("buffs.json", "buffs"),
    "rewards": ("rewards.json", "tables"),
}


class AdbError(RuntimeError):
    """Raised when an ADB command fails."""


def _run_cmd(cmd: Iterable[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise AdbError(f"Command {' '.join(cmd)} failed: {result.stderr.strip()}")
    return result


def _ensure_device(adb_path: str) -> None:
    result = _run_cmd([adb_path, "devices"])
    devices = [
        line.split()[0]
        for line in result.stdout.strip().splitlines()[1:]
        if line.strip() and "device" in line
    ]
    if not devices:
        raise AdbError("No LDPlayer/Android device detected via `adb devices`.")


def _resolve_package(adb_path: str, packages: list[str]) -> str:
    """Try each package name and return the first one installed on the device."""
    for package in packages:
        result = subprocess.run(
            [adb_path, "shell", "pm", "path", package],
            check=False, capture_output=True, text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            return package
    raise AdbError(f"None of the packages found on the device: {packages}")


def _resolve_apk_paths(adb_path: str, package: str) -> list[str]:
    result = _run_cmd([adb_path, "shell", "pm", "path", package])
    candidates = [line.replace("package:", "").strip() for line in result.stdout.splitlines() if line.strip()]
    if not candidates:
        raise AdbError(f"Package {package} not found on the device.")
    ordered: list[str] = []
    base = [c for c in candidates if c.endswith("base.apk")]
    ordered.extend(base)
    ordered.extend([c for c in candidates if c not in ordered])
    return ordered


def _pull_apk(adb_path: str, remote_apk: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([adb_path, "pull", remote_apk, str(destination)], capture_output=True, text=True)
    if result.returncode != 0:
        raise AdbError(f"Failed to pull {remote_apk}: {result.stderr.strip()}")


def _extract_streaming_assets_from_archive(archive_path: Path, extract_dir: Path) -> Path:
    with ZipFile(archive_path) as archive:
        members = [
            name
            for name in archive.namelist()
            if name.startswith("assets/bin/Data") or "StreamingAssets" in name
        ]
        if not members:
            raise RuntimeError("Could not locate Unity data inside the archive.")
        for member in members:
            archive.extract(member, extract_dir)
    located = _locate_streaming_assets_dir(extract_dir)
    if located is None:
        raise RuntimeError("Extracted archive does not contain StreamingAssets.")
    return located


def _locate_streaming_assets_dir(root: Path) -> Path | None:
    # Standard Unity layout: look for StreamingAssets/
    for candidate in root.rglob("StreamingAssets"):
        if candidate.is_dir():
            return candidate.parent
    # Android patch layout: game downloads into a folder that directly contains
    # resources/script2/ (no StreamingAssets wrapper).  Return that folder so
    # GamePaths falls back to using it as the streaming root.
    for candidate in root.rglob("script2"):
        if candidate.is_dir() and candidate.parent.name == "resources":
            return candidate.parent.parent
    return None


def _pull_external_storage(adb_path: str, package: str, temp_root: Path) -> tuple[Path | None, list[str]]:
    external_candidates = [
        f"/sdcard/Android/data/{package}/files",
        f"/storage/emulated/0/Android/data/{package}/files",
        f"/sdcard/Android/obb/{package}",
        f"/storage/emulated/0/Android/obb/{package}",
    ]
    errors: list[str] = []
    for idx, remote_dir in enumerate(external_candidates):
        target_dir = temp_root / "external" / f"{idx}"
        target_dir.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [adb_path, "pull", remote_dir, str(target_dir)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            errors.append(f"{remote_dir}: {result.stderr.strip() or result.stdout.strip()}")
            continue
        located = _locate_streaming_assets_dir(target_dir)
        if located:
            return located, errors
        obb_files = sorted(target_dir.rglob("*.obb"))
        for obb in obb_files:
            obb_extract_dir = target_dir / (obb.stem + "_unpacked")
            obb_extract_dir.mkdir(parents=True, exist_ok=True)
            try:
                located = _extract_streaming_assets_from_archive(obb, obb_extract_dir)
                return located, errors
            except Exception as exc:
                errors.append(f"{obb}: {exc}")
    return None, errors


def _export_for_mongo(raw_dir: Path, mongo_dir: Path, extracted_at: str) -> None:
    mongo_dir.mkdir(parents=True, exist_ok=True)
    for collection, (filename, array_key) in EXPORTABLE_DATASETS.items():
        source_path = raw_dir / filename
        if not source_path.exists():
            continue
        payload = json.loads(source_path.read_text(encoding="utf-8"))
        documents = payload.get(array_key, [])
        if not isinstance(documents, list):
            continue
        target_path = mongo_dir / f"{collection}.jsonl"
        with target_path.open("w", encoding="utf-8") as handle:
            for document in documents:
                document.setdefault("extracted_at", extracted_at)
                json.dump(document, handle, ensure_ascii=False)
                handle.write("\n")

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_extracted_at": extracted_at,
        "raw_dir": str(raw_dir),
        "mongo_dir": str(mongo_dir),
        "collections": [
            collection for collection, (filename, _) in EXPORTABLE_DATASETS.items() if (raw_dir / filename).exists()
        ],
    }
    (mongo_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pull ROMC assets from LDPlayer via ADB and run the extractor.")
    parser.add_argument("--adb-path", default="adb", help="Path to the adb executable.")
    parser.add_argument("--package", default=None, help="Android package name (auto-detected if omitted).")
    parser.add_argument(
        "--tag",
        default=datetime.now(timezone.utc).strftime("%Y%m%d"),
        help="Label used for the dataset folders.",
    )
    parser.add_argument(
        "--modules",
        nargs="+",
        default=list(PROCESSOR_MAP.keys()),
        choices=list(PROCESSOR_MAP.keys()),
        help="Subset of extractor modules to run.",
    )
    parser.add_argument(
        "--raw-output",
        default="exports/datasets",
        help="Base directory where the structured JSON files will be written.",
    )
    parser.add_argument(
        "--mongo-output",
        default="exports/mongo",
        help="Base directory for Mongo-friendly JSONL exports.",
    )
    parser.add_argument("--keep-temp", action="store_true", help="Skip cleanup of the pulled APK artifacts.")
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> None:
    args = _parse_args(argv)
    raw_dir = Path(args.raw_output) / args.tag
    mongo_dir = Path(args.mongo_output) / args.tag
    raw_dir.mkdir(parents=True, exist_ok=True)
    mongo_dir.mkdir(parents=True, exist_ok=True)

    _ensure_device(args.adb_path)
    package = args.package or _resolve_package(args.adb_path, DEFAULT_PACKAGES)
    print(f"Using package: {package}")
    remote_apks = _resolve_apk_paths(args.adb_path, package)

    with tempfile.TemporaryDirectory(prefix="romc_ldplayer_", ignore_cleanup_errors=True) as temp_dir:
        temp_root = Path(temp_dir)
        data_root = None
        apk_path: Path | None = None
        extracted_assets: Path | None = None
        errors: list[str] = []

        for idx, remote_apk in enumerate(remote_apks):
            candidate_dir = temp_root / f"candidate_{idx}"
            candidate_dir.mkdir(parents=True, exist_ok=True)
            candidate_apk = candidate_dir / Path(remote_apk).name.replace("/", "_")
            try:
                _pull_apk(args.adb_path, remote_apk, candidate_apk)
                data_root = _extract_streaming_assets_from_archive(candidate_apk, candidate_dir)
                apk_path = candidate_apk
                extracted_assets = data_root
                break
            except Exception as exc:
                errors.append(f"{remote_apk}: {exc}")

        if data_root is None or apk_path is None or extracted_assets is None:
            external_root, external_errors = _pull_external_storage(args.adb_path, package, temp_root)
            if external_root is not None:
                data_root = external_root
            else:
                details = "\n".join(errors) if errors else "no APK splits were accessible."
                if external_errors:
                    details = f"{details}\nExternal storage attempts:\n" + "\n".join(external_errors)
                raise RuntimeError(f"Could not locate StreamingAssets inside any APK split or external storage:\n{details}")

        extractor_args = [
            "--game-root",
            str(data_root),
            "--output",
            str(raw_dir),
            "--modules",
            *args.modules,
        ]
        extractor_main(extractor_args)

        manifest_path = raw_dir / "items.json"
        extracted_at = datetime.now(timezone.utc).isoformat()
        if manifest_path.exists():
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            extracted_at = payload.get("extracted_at", extracted_at)

        _export_for_mongo(raw_dir, mongo_dir, extracted_at)

        if args.keep_temp and apk_path and extracted_assets:
            kept_apk = raw_dir / "romc.apk"
            kept_assets = raw_dir / "apk_assets"
            kept_assets.mkdir(parents=True, exist_ok=True)
            apk_path.replace(kept_apk)
            for child in extracted_assets.rglob("*"):
                target = kept_assets / child.relative_to(extracted_assets)
                if child.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(child.read_bytes())


if __name__ == "__main__":
    main()
