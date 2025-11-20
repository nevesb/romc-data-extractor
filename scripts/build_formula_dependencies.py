"""Build dependency map for CommonFun formulas.

This script analyzes formula code to extract:
- CommonFun function dependencies
- Skill dependencies (from GetLernedSkillLevel, etc.)
- Buff dependencies (from HasBuffID, GetBuffLayer, etc.)
"""

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set

# Patterns to match in formula code
COMMONFUN_PATTERN = re.compile(r"CommonFun\.(\w+)\s*\(")
SKILL_PATTERN = re.compile(r"(?:srcUser|targetUser):GetLernedSkillLevel\s*\(\s*(\d+)\s*\)")
BUFF_PATTERN = re.compile(r"(?:srcUser|targetUser):HasBuffID\s*\(\s*(\d+)\s*\)")
BUFF_LAYER_PATTERN = re.compile(r"(?:srcUser|targetUser):GetBuffLayer\s*\(\s*(\d+)\s*\)")
BUFF_ACTIVE_PATTERN = re.compile(r"(?:srcUser|targetUser):GetBuffActive\s*\(\s*(\d+)\s*\)")
GEM_VALUE_PATTERN = re.compile(r"(?:srcUser|targetUser):GetGemValue\s*\(\s*(\d+)\s*\)")


def extract_dependencies(code: str) -> Dict[str, Set]:
    """Extract all dependencies from formula code."""
    deps = {
        "formulas": set(),
        "skills": set(),
        "buffs": set(),
    }

    # Extract CommonFun function calls
    for match in COMMONFUN_PATTERN.finditer(code):
        func_name = match.group(1)
        # Skip if it's a property access (e.g., CommonFun.RoleData.EATTRTYPE_STR)
        if "." not in func_name:
            deps["formulas"].add(f"CommonFun.{func_name}")

    # Extract skill IDs
    for pattern in [SKILL_PATTERN]:
        for match in pattern.finditer(code):
            skill_id = int(match.group(1))
            deps["skills"].add(skill_id)

    # Extract buff IDs
    for pattern in [BUFF_PATTERN, BUFF_LAYER_PATTERN, BUFF_ACTIVE_PATTERN, GEM_VALUE_PATTERN]:
        for match in pattern.finditer(code):
            buff_id = int(match.group(1))
            deps["buffs"].add(buff_id)

    return deps


def build_dependency_map(formulas: List[Dict]) -> Dict:
    """Build dependency map from formula definitions."""
    # Maps formula name -> dependencies
    formula_deps: Dict[str, Dict[str, List]] = {}
    # Maps formula name -> formulas that depend on it
    formula_dependents: Dict[str, List[str]] = defaultdict(list)
    # Maps formula name -> skills it depends on
    formula_skills: Dict[str, List[int]] = {}
    # Maps formula name -> buffs it depends on
    formula_buffs: Dict[str, List[int]] = {}
    # Maps skill ID -> formulas that depend on it
    skill_formulas: Dict[int, List[str]] = defaultdict(list)
    # Maps buff ID -> formulas that depend on it
    buff_formulas: Dict[int, List[str]] = defaultdict(list)

    # First pass: extract dependencies from each formula
    for formula in formulas:
        name = formula.get("name", "")
        code = formula.get("code", "")
        if not name or not code:
            continue

        deps = extract_dependencies(code)
        formula_deps[name] = {
            "formulas": sorted(deps["formulas"]),
            "skills": sorted(deps["skills"]),
            "buffs": sorted(deps["buffs"]),
        }
        formula_skills[name] = sorted(deps["skills"])
        formula_buffs[name] = sorted(deps["buffs"])

        # Track which formulas depend on this one
        for dep_formula in deps["formulas"]:
            formula_dependents[dep_formula].append(name)

        # Track which skills/buffs are referenced by which formulas
        for skill_id in deps["skills"]:
            skill_formulas[skill_id].append(name)
        for buff_id in deps["buffs"]:
            buff_formulas[buff_id].append(name)

    # Build final dependency map
    dependency_map = {
        "formulas": {},
        "skills": {str(k): sorted(v) for k, v in sorted(skill_formulas.items())},
        "buffs": {str(k): sorted(v) for k, v in sorted(buff_formulas.items())},
    }

    for formula_name in sorted(formula_deps.keys()):
        dependency_map["formulas"][formula_name] = {
            "dependencies": formula_deps[formula_name],
            "dependents": sorted(formula_dependents.get(formula_name, [])),
        }

    return dependency_map


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Build formula dependency map")
    parser.add_argument(
        "--input",
        type=str,
        default="exports/datasets",
        help="Path to datasets directory or specific formula_definitions.json file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="exports/formula_dependencies.json",
        help="Output path for dependency map JSON",
    )
    parser.add_argument(
        "--dataset-tag",
        type=str,
        help="Specific dataset tag to use (if input is datasets directory)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)

    # Determine source of formulas
    if input_path.is_file() and input_path.name == "formula_definitions.json":
        # Direct file path
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            formulas = data.get("formulas", [])
    elif input_path.is_dir():
        # Dataset directory
        if args.dataset_tag:
            formula_file = input_path / args.dataset_tag / "formula_definitions.json"
        else:
            # Find latest dataset
            datasets = sorted([d for d in input_path.iterdir() if d.is_dir()], reverse=True)
            if not datasets:
                raise FileNotFoundError(f"No datasets found in {input_path}")
            formula_file = datasets[0] / "formula_definitions.json"

        if not formula_file.exists():
            raise FileNotFoundError(f"Formula definitions not found: {formula_file}")

        with open(formula_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            formulas = data.get("formulas", [])
    else:
        raise FileNotFoundError(f"Input path not found: {input_path}")

    print(f"Analyzing {len(formulas)} formulas...")

    # Build dependency map
    dependency_map = build_dependency_map(formulas)

    # Save to output file
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dependency_map, f, ensure_ascii=False, indent=2)

    # Print summary
    total_formulas = len(dependency_map["formulas"])
    formulas_with_deps = sum(1 for v in dependency_map["formulas"].values() if v["dependencies"]["formulas"])
    formulas_with_dependents = sum(1 for v in dependency_map["formulas"].values() if v["dependents"])
    total_skills = len(dependency_map["skills"])
    total_buffs = len(dependency_map["buffs"])

    print(f"\nDependency map generated: {output_path}")
    print(f"  Total formulas: {total_formulas}")
    print(f"  Formulas with dependencies: {formulas_with_deps}")
    print(f"  Formulas with dependents: {formulas_with_dependents}")
    print(f"  Skills referenced: {total_skills}")
    print(f"  Buffs referenced: {total_buffs}")


if __name__ == "__main__":
    main()

