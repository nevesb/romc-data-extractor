"""Utility CLI to push the exported JSONL datasets into MongoDB."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, Sequence, Any

import difflib
import hashlib
from pymongo import MongoClient

from .ldplayer_pipeline import EXPORTABLE_DATASETS

SKIP_KEYS = {"dataset_tag", "extracted_at", "_content_hash", "versions", "usage_diff", "code_diff"}


def _collection_names(allow_list: Sequence[str] | None) -> list[str]:
    if allow_list:
        return list(allow_list)
    return list(EXPORTABLE_DATASETS.keys())


def _collection_candidates(dataset_dir: Path, name: str) -> list[Path]:
    candidates: list[Path] = []
    candidates.append(dataset_dir / f"{name}.jsonl")
    config = EXPORTABLE_DATASETS.get(name)
    if config:
        candidates.append(dataset_dir / config[0])
    candidates.append(dataset_dir / f"{name}.json")
    return candidates


def _load_documents(path: Path, array_key: str | None) -> list[dict]:
    if path.suffix == ".jsonl":
        return [
            json.loads(line)
            for line in path.read_text(encoding="utf-8-sig").splitlines()
            if line.strip()
        ]
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    docs: list[Any] = []
    if isinstance(payload, list):
        docs = payload
    elif isinstance(payload, dict):
        if array_key and array_key in payload:
            docs = payload.get(array_key) or []
        else:
            key = path.stem
            docs = payload.get(key) or []
    return [doc for doc in docs if isinstance(doc, dict)]


def _set_versions_field(doc: dict, versions: list[dict]) -> None:
    if versions:
        doc["versions"] = versions
    else:
        doc.pop("versions", None)


def _usage_group_key(entry: dict) -> str:
    token = entry.get("skill_token")
    if isinstance(token, str) and token:
        return token
    name = entry.get("skill_name")
    if isinstance(name, str) and name:
        return name
    level_id = entry.get("level_id")
    if level_id is not None:
        return str(level_id)
    return json.dumps(entry, sort_keys=True, ensure_ascii=False)


def _ensure_usage_groups(doc: dict) -> list[dict]:
    groups = doc.get("usage_groups")
    if isinstance(groups, list) and groups:
        return groups
    usages = doc.get("usages") or []
    normalized: dict[str, dict] = {}
    for usage in usages:
        if not isinstance(usage, dict):
            continue
        key = _usage_group_key(usage)
        group = normalized.setdefault(
            key,
            {
                "key": key,
                "skill_name": usage.get("skill_name", ""),
                "skill_token": usage.get("skill_token", ""),
                "level_ids": [],
                "levels": [],
            },
        )
        level_id = usage.get("level_id")
        if level_id is not None:
            group["level_ids"].append(level_id)
        group["levels"].append(
            {
                "level_id": level_id,
                "level": usage.get("level"),
                "damage_params": usage.get("damage_params"),
            }
        )
    for group in normalized.values():
        group["level_ids"] = sorted(group["level_ids"])
        group["levels"].sort(
            key=lambda lvl: ((lvl.get("level") or 0), (lvl.get("level_id") or 0))
        )
    ordered = sorted(normalized.values(), key=lambda entry: entry["key"])
    doc["usage_groups"] = ordered
    return ordered


def _apply_formula_diff(doc: dict, existing: dict | None, dataset_tag: str) -> None:
    previous_tag = existing.get("dataset_tag") if existing else None
    prev_code = (existing or {}).get("code") or ""
    next_code = doc.get("code") or ""
    diff_lines = list(
        difflib.unified_diff(
            prev_code.splitlines(),
            next_code.splitlines(),
            fromfile=str(previous_tag or "previous"),
            tofile=str(dataset_tag),
            lineterm="",
        )
    )
    if diff_lines:
        doc["code_diff"] = "\n".join(diff_lines)
    else:
        doc.pop("code_diff", None)


def _annotate_usage_diff(doc: dict, existing: dict | None) -> None:
    current_keys = set(doc.get("usage_skill_keys") or [])
    prev_groups = _ensure_usage_groups(existing) if existing else []
    prev_keys = {entry.get("key") or "" for entry in prev_groups}
    added = sorted(current_keys - prev_keys)
    removed = sorted(prev_keys - current_keys)
    doc["usage_diff"] = {"added": added, "removed": removed}


def _canonical_payload(payload: dict) -> dict:
    return {k: v for k, v in payload.items() if k not in SKIP_KEYS}


def _content_hash(payload: dict) -> str:
    canonical = _canonical_payload(payload)
    serialized = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()

def _normalize_bundle_entries(entries: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for entry in entries:
        if isinstance(entry, str):
            normalized.append({"path": entry, "checksum": None, "size": None, "asset_count": None, "assets": []})
            continue
        path = entry.get("path") or entry.get("name")
        if not path:
            continue
        assets = _normalize_bundle_assets(entry.get("assets") or [])
        normalized.append(
            {
                "path": path,
                "checksum": entry.get("checksum"),
                "size": entry.get("size"),
                "asset_count": entry.get("asset_count"),
                "assets": assets,
            }
        )
    normalized.sort(key=lambda item: item["path"])
    return normalized


def _normalize_bundle_assets(raw_assets: list[Any]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for asset in raw_assets:
        if not isinstance(asset, dict):
            continue
        name = asset.get("name")
        type_name = asset.get("type")
        entry = {"name": str(name) if name is not None else ""}
        if type_name:
            entry["type"] = str(type_name)
        path_id = asset.get("path_id")
        if path_id is not None:
            entry["path_id"] = path_id
        asset_hash = asset.get("hash")
        if asset_hash:
            entry["hash"] = asset_hash
        cleaned.append(entry)
    cleaned.sort(key=lambda item: (item.get("type") or "", item.get("name") or ""))
    return cleaned


def _summarize_bundle_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for entry in entries:
        summary.append(
            {
                "path": entry.get("path"),
                "checksum": entry.get("checksum"),
                "size": entry.get("size"),
                "asset_count": entry.get("asset_count"),
            }
        )
    summary.sort(key=lambda item: item.get("path") or "")
    return summary


def _asset_key(asset: dict[str, Any]) -> str:
    name = str(asset.get("name", ""))
    type_name = str(asset.get("type", ""))
    return f"{name}::{type_name}"


def _upsert_bundle_manifest(db, dataset_tag: str, dataset_extracted_at: str | None, manifest_path: Path) -> None:
    data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    bundle_entries = _normalize_bundle_entries(data.get("bundles") or [])
    generated_at = data.get("generated_at")
    extracted_at = dataset_extracted_at or generated_at
    doc: dict[str, Any] = {
        "dataset_tag": dataset_tag,
        "extracted_at": extracted_at,
        "bundle_root": data.get("game_root"),
        "bundle_count": len(bundle_entries),
    }
    previous = (
        db["bundles"]
        .find({"dataset_tag": {"$ne": dataset_tag}})
        .sort([("extracted_at", -1), ("dataset_tag", -1)])
        .limit(1)
    )
    prev_doc = next(previous, None)
    prev_tag = prev_doc.get("dataset_tag") if prev_doc else None
    summary_entries = _summarize_bundle_entries(bundle_entries)
    curr_map = {entry["path"]: entry for entry in summary_entries}
    if prev_doc:
        prev_entries = {
            doc["path"]: {"path": doc["path"], "checksum": doc.get("checksum"), "size": doc.get("size")}
            for doc in db["bundle_assets"].find({"dataset_tag": prev_tag}, {"path": 1, "checksum": 1, "size": 1})
        }
        prev_paths = set(prev_entries.keys())
        curr_paths = set(curr_map.keys())
        added = sorted(curr_paths - prev_paths)
        removed = sorted(prev_paths - curr_paths)
        changed = []
        for path in sorted(prev_paths & curr_paths):
            prev_entry = prev_entries[path]
            curr_entry = curr_map[path]
            if prev_entry.get("checksum") and curr_entry.get("checksum"):
                if prev_entry["checksum"] != curr_entry["checksum"]:
                    changed.append(path)
                    continue
            elif prev_entry.get("size") != curr_entry.get("size"):
                changed.append(path)
        doc["diff"] = {
            "previous_tag": prev_doc.get("dataset_tag"),
            "added": added,
            "removed": removed,
            "changed": changed,
        }
        doc["diff_summary"] = {
            "previous_tag": prev_doc.get("dataset_tag"),
            "added": len(added),
            "removed": len(removed),
            "changed": len(changed),
        }
    else:
        doc["diff"] = {
            "previous_tag": None,
            "added": [entry["path"] for entry in bundle_entries],
            "removed": [],
            "changed": [],
        }
        doc["diff_summary"] = {
            "previous_tag": None,
            "added": len(bundle_entries),
            "removed": 0,
            "changed": 0,
        }
    db["bundles"].update_one({"dataset_tag": dataset_tag}, {"$set": doc}, upsert=True)
    _store_bundle_assets(db, dataset_tag, bundle_entries, prev_tag=prev_tag)
    print(f"bundles: stored snapshot for {dataset_tag} ({len(bundle_entries)} entries)")


def _store_bundle_assets(db, dataset_tag: str, bundle_entries: list[dict[str, Any]], prev_tag: str | None = None) -> None:
    db["bundle_assets"].delete_many({"dataset_tag": dataset_tag})
    if not bundle_entries:
        return

    prev_assets_map: dict[str, dict[str, dict[str, Any]]] = {}
    if prev_tag:
        cursor = db["bundle_assets"].find({"dataset_tag": prev_tag}, {"path": 1, "assets": 1})
        for entry in cursor:
            path = entry.get("path")
            if not path:
                continue
            assets = entry.get("assets") or []
            prev_assets_map[path] = {_asset_key(asset): asset for asset in assets if isinstance(asset, dict)}

    docs = []
    for entry in bundle_entries:
        assets = entry.get("assets") or []
        diff = None
        if prev_tag:
            prev_assets = prev_assets_map.get(entry.get("path") or "", {})
            curr_assets = {_asset_key(asset): asset for asset in assets if isinstance(asset, dict)}
            prev_keys = set(prev_assets.keys())
            curr_keys = set(curr_assets.keys())
            updated = []
            shared_keys = prev_keys & curr_keys
            for key in list(shared_keys):
                prev_asset = prev_assets[key]
                curr_asset = curr_assets[key]
                prev_hash = prev_asset.get("hash")
                curr_hash = curr_asset.get("hash")
                if prev_hash and curr_hash:
                    if prev_hash != curr_hash:
                        updated.append({"previous": prev_asset, "current": curr_asset})
                elif prev_asset.get("path_id") != curr_asset.get("path_id"):
                    updated.append({"previous": prev_asset, "current": curr_asset})
                prev_keys.discard(key)
                curr_keys.discard(key)
            added = [curr_assets[key] for key in sorted(curr_keys)]
            removed = [prev_assets[key] for key in sorted(prev_keys)]
            diff = {
                "previous_tag": prev_tag,
                "added": added,
                "removed": removed,
                "updated": updated,
            }
        docs.append(
            {
                "dataset_tag": dataset_tag,
                "path": entry.get("path"),
                "checksum": entry.get("checksum"),
                "size": entry.get("size"),
                "asset_count": entry.get("asset_count"),
                "assets": assets,
                "diff": diff,
            }
        )
    if docs:
        db["bundle_assets"].insert_many(docs)


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load ROMC JSONL datasets into MongoDB.")
    parser.add_argument("--mongo-uri", default="mongodb://romc:romc@localhost:27017", help="MongoDB connection URI.")
    parser.add_argument("--database", default="romc", help="Target database name.")
    parser.add_argument("--dataset", required=True, help="Path to the directory generated by ldplayer_pipeline (JSONL files).")
    parser.add_argument(
        "--collections",
        nargs="+",
        default=None,
        help="Optional subset of collections (defaults to every *.jsonl file in the dataset directory).",
    )
    parser.add_argument("--drop-first", action="store_true", help="Drop each collection before inserting documents.")
    parser.add_argument(
        "--tag",
        default=None,
        help="Logical tag for this dataset (defaults to the dataset directory name). Used to version documents.",
    )
    parser.add_argument(
        "--mark-latest",
        action="store_true",
        help="Update the `_meta_snapshots.latest` record to point at this dataset tag.",
    )
    return parser.parse_args(argv)


def _discover_collections(dataset_dir: Path, allow_list: Sequence[str] | None) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for name in _collection_names(allow_list):
        for candidate in _collection_candidates(dataset_dir, name):
            if candidate.exists():
                files[name] = candidate
                break
    return files


def main(argv: Iterable[str] | None = None) -> None:
    args = _parse_args(argv)
    dataset_dir = Path(args.dataset)
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}")

    collections = _discover_collections(dataset_dir, args.collections)
    if not collections:
        raise RuntimeError(f"No .jsonl collections found in {dataset_dir}")

    client = MongoClient(args.mongo_uri)
    db = client[args.database]
    dataset_tag = args.tag or dataset_dir.name
    metadata_path = dataset_dir / "metadata.json"
    dataset_extracted_at: str | None = None
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
        dataset_extracted_at = metadata.get("source_extracted_at") or metadata.get("generated_at")

    for name, path in collections.items():
        array_key = EXPORTABLE_DATASETS.get(name, (None, name))[1]
        docs = _load_documents(path, array_key)
        if not docs:
            continue
        if dataset_extracted_at:
            for doc in docs:
                doc.setdefault("extracted_at", dataset_extracted_at)
        inserted = 0
        skipped = 0
        updated = 0
        if args.drop_first:
            db[name].drop()
        else:
            db[name].delete_many({"dataset_tag": dataset_tag})
        for doc in docs:
            doc["dataset_tag"] = dataset_tag
            if name == "formula_usages":
                usage_groups = _ensure_usage_groups(doc)
                doc["usage_skill_keys"] = [entry.get("key") or "" for entry in usage_groups]
            elif name == "formula_definitions":
                doc.pop("code_diff", None)
            canonical_doc = _canonical_payload(doc)
            doc["_content_hash"] = _content_hash(doc)
            if args.drop_first:
                _set_versions_field(doc, [])
                if name == "formula_usages":
                    doc["usage_diff"] = {"added": doc.get("usage_skill_keys", []), "removed": []}
                elif name == "formula_definitions":
                    doc.pop("code_diff", None)
                db[name].insert_one(doc)
                inserted += 1
                continue
            if "id" in doc:
                identity_filter = {"id": doc["id"]}
            elif "name" in doc:
                identity_filter = {"name": doc["name"]}
            else:
                identity_filter = {"_content_hash": doc["_content_hash"]}
            existing = db[name].find_one(identity_filter)
            if existing is None:
                _set_versions_field(doc, [])
                if name == "formula_usages":
                    doc["usage_diff"] = {"added": doc.get("usage_skill_keys", []), "removed": []}
                elif name == "formula_definitions":
                    doc.pop("code_diff", None)
                db[name].insert_one(doc)
                inserted += 1
                continue
            if _canonical_payload(existing) == canonical_doc:
                skipped += 1
                continue
            prev_entry = {
                "dataset_tag": existing.get("dataset_tag"),
                "extracted_at": existing.get("extracted_at"),
                "payload": _canonical_payload(existing),
            }
            versions = [prev_entry] + existing.get("versions", [])
            _set_versions_field(doc, versions)
            if name == "formula_definitions":
                _apply_formula_diff(doc, existing, dataset_tag)
            elif name == "formula_usages":
                _annotate_usage_diff(doc, existing)
            else:
                doc.pop("code_diff", None)
                doc.pop("usage_diff", None)
            db[name].replace_one({"_id": existing["_id"]}, doc)
            updated += 1
        print(
            f"{name}: inserted {inserted} new, updated {updated} docs into {args.database}.{name}"
            + (f" (skipped {skipped} unchanged)" if skipped else "")
        )
        if args.mark_latest:
            db["_meta_snapshots"].update_one(
                {"_id": "latest"},
                {"$set": {"dataset_tag": dataset_tag, "extracted_at": dataset_extracted_at}},
                upsert=True,
            )

    bundle_manifest = dataset_dir / "bundle_manifest.json"
    if bundle_manifest.exists():
        _upsert_bundle_manifest(db, dataset_tag, dataset_extracted_at, bundle_manifest)
    else:
        print("bundles: no bundle_manifest.json found, skipping bundle snapshot")


if __name__ == "__main__":
    main()
