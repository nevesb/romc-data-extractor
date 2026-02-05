/** Client component that renders grouped skill usage chips for a formula. */
"use client";

import Link from "next/link";
import { useState } from "react";
import { FormulaUsageGroup, FormulaUsageRecord } from "@/lib/types";

const DEFAULT_VISIBLE_GROUPS = 6;

type Props = {
  usage?: FormulaUsageRecord;
};

function resolveHref(group: FormulaUsageGroup): string {
  const firstLevelId = group.level_ids?.find((id) => typeof id === "number");
  if (typeof firstLevelId === "number") {
    return `/skills/${firstLevelId}`;
  }
  const candidate = group.skill_token || group.skill_name;
  if (!candidate) {
    return "/skills";
  }
  return `/skills?q=${encodeURIComponent(candidate)}`;
}

function formatDetails(group: FormulaUsageGroup): string {
  const levels = group.levels ?? [];
  const levelNumbers = levels
    .map((entry) => (typeof entry.level === "number" ? entry.level : undefined))
    .filter((value): value is number => typeof value === "number");
  let levelLabel = "";
  if (levelNumbers.length) {
    const min = Math.min(...levelNumbers);
    const max = Math.max(...levelNumbers);
    levelLabel = min === max ? `Lv ${min}` : `Lv ${min}-${max}`;
  }
  const categories = Array.from(
    new Set(
      levels
        .map((entry) => entry.category)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const categoryLabel = categories.length
    ? categories.map((cat) => cat.charAt(0).toUpperCase() + cat.slice(1)).join("/")
    : "";
  const buffIds = Array.from(
    new Set(
      levels
        .map((entry) => entry.buff_id)
        .filter((value): value is number => typeof value === "number"),
    ),
  );
  const detailParts = [levelLabel, categoryLabel];
  if (buffIds.length) {
    detailParts.push(buffIds.length === 1 ? `Buff ${buffIds[0]}` : `Buffs ${buffIds.slice(0, 3).join(", ")}`);
  }
  return detailParts.filter(Boolean).join(" | ");
}

export function FormulaUsageList({ usage }: Props) {
  const groups = usage?.usage_groups ?? [];
  const [expanded, setExpanded] = useState(false);
  if (!groups.length) {
    return null;
  }
  const visibleGroups = expanded ? groups : groups.slice(0, DEFAULT_VISIBLE_GROUPS);

  return (
    <div className="mt-3 text-xs ">
      <p className="font-semibold ">Related skills</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {visibleGroups.map((group: FormulaUsageGroup) => {
          const label =
            group.display_name || group.skill_name || group.skill_token || group.key || "Unknown skill";
          const details = formatDetails(group);
          const href = resolveHref(group);
          return (
            <li key={`${group.key}-${details}`} className="romc-chip">
              <Link href={href}>
                <span className="font-semibold">{label}</span>
                {details && <span className="ml-1 text-[var(--muted)]">{details}</span>}
              </Link>
            </li>
          );
        })}
        {!expanded && groups.length > visibleGroups.length && (
          <li>
            <button
              type="button"
              className="romc-chip"
              onClick={() => setExpanded(true)}
              aria-label="Show all related skills"
            >
              Show all {groups.length - visibleGroups.length} more
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}