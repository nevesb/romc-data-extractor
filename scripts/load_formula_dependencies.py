"""Load formula dependency maps into MongoDB."""

import json
import sys
from pathlib import Path
from pymongo import MongoClient


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Load formula dependency maps into MongoDB")
    parser.add_argument(
        "--mongo-uri",
        default="mongodb://romc:romc@localhost:27017",
        help="MongoDB connection URI",
    )
    parser.add_argument(
        "--database",
        default="romc",
        help="Target database name",
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to formula_dependencies JSON file",
    )
    parser.add_argument(
        "--dataset-tag",
        required=True,
        help="Dataset tag for this dependency map",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    print(f"Loading dependency map from {input_path}...")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    client = MongoClient(args.mongo_uri)
    db = client[args.database]
    collection = db["formula_dependencies"]

    # Delete existing entry for this dataset tag
    collection.delete_one({"dataset_tag": args.dataset_tag})

    # Insert new entry
    document = {
        "dataset_tag": args.dataset_tag,
        "formulas": data.get("formulas", {}),
        "skills": data.get("skills", {}),
        "buffs": data.get("buffs", {}),
        "generated_at": data.get("generated_at"),
    }

    result = collection.insert_one(document)
    print(f"Inserted dependency map for dataset {args.dataset_tag} (ID: {result.inserted_id})")

    # Print summary
    formulas_count = len(document["formulas"])
    skills_count = len(document["skills"])
    buffs_count = len(document["buffs"])
    print(f"  Formulas: {formulas_count}")
    print(f"  Skills: {skills_count}")
    print(f"  Buffs: {buffs_count}")


if __name__ == "__main__":
    main()

