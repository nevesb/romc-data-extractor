import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { diffLines } from "diff";

import { SkillFormulasLoader } from "@/components/skills/SkillFormulasLoader";
import { LinkedFormulaCode } from "@/components/formulas/LinkedFormulaCode";
import { getSkillDetails } from "@/lib/queries";
import { resolveLocalizedText } from "@/lib/utils";
import type { FormulaDefinitionRecord, FormulaUsageGroup } from "@/lib/types";

type PageProps = {
  params: Promise<{ id: string }>;
};

type SkillLevel = Record<string, unknown>;
type BuffScope = "self" | "enemy";



const diffBlockStyle = {
  fontSize: "0.8rem",
  background: "rgba(6, 12, 18, 0.92)",
  borderRadius: "1rem",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "1rem",
  margin: 0,
  lineHeight: "1.4",
};

const buffScopeStyles: Record<BuffScope, { backgroundColor: string; color: string }> = {
  self: {
    backgroundColor: "rgba(34, 197, 94, 0.25)",
    color: "#bbf7d0",
  },
  enemy: {
    backgroundColor: "rgba(248, 113, 113, 0.25)",
    color: "#fecdd3",
  },
};

function collectLevelParams(level?: SkillLevel | null): string[] {
  if (!level) {
    return [];
  }
  const rawTokens = level["Desc"];
  if (!Array.isArray(rawTokens)) {
    return [];
  }
  const params: string[] = [];
  for (const entry of rawTokens as Array<{ params?: unknown[] }>) {
    const values = entry?.params;
    if (!Array.isArray(values)) {
      continue;
    }
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      params.push(String(value));
    }
  }
  return params;
}

function applyTemplateParams(template: string, params: string[]): string {
  if (!template) {
    return "";
  }
  if (!params.length) {
    return template.replace(/%%/g, "%");
  }
  let index = 0;
  const lastIndex = params.length - 1;
  return template
    .replace(/%s/g, () => {
      const current = params[Math.min(index, lastIndex)] ?? "";
      index += 1;
      return current;
    })
    .replace(/%%/g, "%");
}

function renderPlainText(fragment: string, keyPrefix: string, color?: string): ReactNode[] {
  if (!fragment.length) {
    return [];
  }
  const nodes: ReactNode[] = [];
  const parts = fragment.split(/\n/);
  parts.forEach((part, idx) => {
    if (part.length) {
      nodes.push(
        <span key={`${keyPrefix}-text-${idx}`} style={color ? { color } : undefined}>
          {part}
        </span>,
      );
    }
    if (idx < parts.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${idx}`} />);
    }
  });
  return nodes;
}

function renderDescriptionNodes(text: string): ReactNode[] {
  if (!text) {
    return [];
  }
  const segments: ReactNode[] = [];
  const colorRegex = /\[([0-9a-fA-F]{6})](.*?)\[-]/gs;
  let cursor = 0;
  let segmentIndex = 0;
  for (const match of text.matchAll(colorRegex)) {
    const [full, hex, content] = match;
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      segments.push(
        ...renderPlainText(text.slice(cursor, matchIndex), `plain-${segmentIndex}`),
      );
      segmentIndex += 1;
    }
    const color = `#${hex}`;
    segments.push(...renderPlainText(content, `color-${segmentIndex}`, color));
    segmentIndex += 1;
    cursor = matchIndex + full.length;
  }
  if (cursor < text.length) {
    segments.push(...renderPlainText(text.slice(cursor), `plain-${segmentIndex}`));
  }
  return segments;
}

function formatLevelDescription(level: SkillLevel, fallbackTemplate?: string, fallbackSkillDesc?: string): ReactNode | string | null {
  const localized = level["description"];
  const descBlocks = Array.isArray(level["Desc"]) ? (level["Desc"] as Array<{ id?: number; text?: string; params?: unknown[] }>) : [];
  const firstBlock = descBlocks[0];
  const templateToken =
    (typeof firstBlock?.text === "string" && firstBlock.text) ||
    (typeof firstBlock?.id === "number" ? `##${firstBlock.id}` : undefined) ||
    fallbackTemplate;
  const params = collectLevelParams(level);
  if (localized && typeof localized === "object") {
    const resolved = resolveLocalizedText(localized as Record<string, string>, "");
    if (resolved.trim().length && !/^##\d+$/.test(resolved.trim())) {
      return renderDescriptionNodes(resolved);
    }
  }
  // Try to render from the explicit template (even if it's a token) using params.
  if (templateToken && templateToken.trim().length) {
    const formatted = applyTemplateParams(templateToken, params);
    const trimmed = formatted.trim();
    if (trimmed.length && !/^##\d+$/.test(trimmed)) {
      return renderDescriptionNodes(formatted);
    }
    if (trimmed.length && params.length) {
      return renderDescriptionNodes(`${trimmed} (${params.join(", ")})`);
    }
  }
  // Fall back to the skill-level description as a template, applying params.
  if (fallbackSkillDesc && fallbackSkillDesc.trim().length) {
    const formatted = applyTemplateParams(fallbackSkillDesc, params);
    return renderDescriptionNodes(formatted);
  }
  // Absolute fallback: show token/params as plain text so levels are not empty.
  if (templateToken) {
    return renderDescriptionNodes(applyTemplateParams(templateToken, params));
  }
  return null;
}

function formatMeta(level: SkillLevel): string {
  const cd = level["CD"];
  const type = level["SkillType"];
  const parts: string[] = [];
  if (cd !== undefined) {
    parts.push(`CD ${cd}s`);
  }
  if (type) {
    if (typeof type === "string") {
      const filtered = type
        .split("|")
        .map((p) => p.trim())
        .filter((p) => p.length && !p.toLowerCase().startsWith("cost"));
      if (filtered.length) {
        parts.push(filtered.join(" | "));
      }
    } else {
      parts.push(String(type));
    }
  }
  return parts.join(" | ");
}

function deriveBuffScopeFromGroups(groups?: FormulaUsageGroup[]): BuffScope | null {
  if (!groups?.length) {
    return null;
  }
  const targets = new Set<string>();
  for (const group of groups) {
    for (const entry of group.levels ?? []) {
      const target = typeof entry.buff_target === "string" ? entry.buff_target.toLowerCase() : null;
      if (target) {
        targets.add(target);
      }
    }
  }
  if (targets.has("enemy")) {
    return "enemy";
  }
  if (targets.has("self")) {
    return "self";
  }
  return null;
}

type DiffPreviewProps = {
  previous?: string | null;
  current?: string | null;
  label: string;
};

function DiffPreview({ previous, current, label }: DiffPreviewProps) {
  if (!previous || !current || previous === current) {
    return null;
  }
  const segments = diffLines(previous, current);
  return (
    <div className="mt-3">
      <p className="romc-eyebrow mb-1 text-[10px] uppercase tracking-wide">{label}</p>
      <pre className="overflow-x-auto" style={diffBlockStyle}>
        {segments.map((part, index) => {
          const prefix = part.added ? "+" : part.removed ? "-" : " ";
          const tone = part.added ? "text-emerald-300" : part.removed ? "text-rose-400" : "text-slate-200";
          return (
            <span key={`${label}-${index}`} className={`${tone} block whitespace-pre-wrap`}>
              {prefix}
              {part.value}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

import JsonHighlighter from "@/components/skills/JsonHighlighter";

export default async function SkillDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const skillId = Number(resolvedParams.id);
  if (!Number.isFinite(skillId)) {
    notFound();
  }

  const {
    skill,
    formulas,
    formulaDefinitions,
    buffs,
    relatedSkills,
    previousDatasetTag,
    previousFormulas,
    error,
  } =
    await getSkillDetails(skillId);
  if (!skill) {
    notFound();
  }

  const title = resolveLocalizedText(skill.name, `Skill ${skill.id}`);
  const description = resolveLocalizedText(skill.description, skill.description_token ?? "");
  const rawLevels = (skill.levels ?? []) as SkillLevel[];
  const levelIds = new Set(
    rawLevels
      .map((level) => {
        const levelId = (level as { id?: number }).id;
        return typeof levelId === "number" ? levelId : null;
      })
      .filter((value): value is number => typeof value === "number"),
  );
  const displayLevels = [...rawLevels].sort((a, b) => {
    const levelA = (a as { Level?: number }).Level ?? 0;
    const levelB = (b as { Level?: number }).Level ?? 0;
    if (levelA !== levelB) {
      return levelB - levelA;
    }
    const idA = (a as { id?: number }).id ?? 0;
    const idB = (b as { id?: number }).id ?? 0;
    return idB - idA;
  });
  const highestLevel = displayLevels[0];
  const definitionMap = new Map((formulaDefinitions ?? []).map((entry) => [entry.name, entry]));
  const previousFormulaMap: Record<string, string> = previousFormulas ?? {};
  const uniqueBuffs = Array.from(
    new Map(
      (buffs ?? []).map((buff) => [
        buff.id,
        { id: buff.id, name: resolveLocalizedText(buff.name, `Buff ${buff.id}`) },
      ]),
    ).values(),
  );
  const uniqueFormulas = Array.from(
    new Set((formulas ?? []).map((f) => f.formula).filter((v): v is string => typeof v === "string")),
  );
  const uniqueRelatedSkills = Array.from(
    new Map(
      (relatedSkills ?? []).map((s: any) => [
        s.id,
        { id: s.id, name: resolveLocalizedText(s.name, `Skill ${s.id}`) },
      ]),
    ).values(),
  );
  const datasetTag = skill.dataset_tag ?? null;

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft space-y-3 p-6">
        <p className="romc-eyebrow">Skill #{skill.id}</p>
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        {description && <p className="text-sm text-[var(--muted)]">{description}</p>}
        {error && <p className="romc-error mt-2 text-xs">{error}</p>}
      </header>

      <section className="romc-panel p-0">
        <div className="romc-list">
          {displayLevels.map((level) => {
            const levelId = (level as { id?: number }).id ?? undefined;
            const levelNumber = (level as { Level?: number }).Level ?? "?";
            const desc = formatLevelDescription(level, undefined, description);
            const meta = formatMeta(level);
            return (
              <article key={levelId ?? `${skill.id}-${levelNumber}`} className="romc-list-row">
                <div className="flex-1">
                  <p className="romc-list-row__title">Level {levelNumber}</p>
                  {desc && <p className="romc-list-row__desc">{desc}</p>}
                  {meta && <p className="romc-meta mt-2">{meta}</p>}
                </div>
                <div className="romc-list-row__meta">
                  {levelId && <span className="romc-pill">ID {levelId}</span>}
                </div>
              </article>
            );
          })}
          {!(skill.levels ?? []).length && <p className="p-4 text-sm text-[var(--muted)]">No level data recorded.</p>}
        </div>
      </section>

      <SkillFormulasLoader skillId={skillId} datasetTag={skill.dataset_tag ?? null} />

      {(uniqueBuffs.length > 0 || uniqueFormulas.length > 0 || uniqueRelatedSkills.length > 0) && (
        <section className="romc-panel space-y-3">
          <div>
            <p className="romc-eyebrow">Related</p>
            <h2 className="text-2xl font-semibold text-white">Buffs, Skills & Formulas</h2>
          </div>
          {uniqueBuffs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uniqueBuffs.map((buff) => (
                <Link
                  key={buff.id}
                  href={`/buffs/${buff.id}`}
                  className="romc-pill romc-pill--new text-xs hover:opacity-80 transition-opacity"
                >
                  {buff.name}
                </Link>
              ))}
            </div>
          )}
          {uniqueRelatedSkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uniqueRelatedSkills.map((s) => (
                <Link
                  key={s.id}
                  href={`/skills/${s.id}`}
                  className="romc-pill romc-pill--active text-xs hover:opacity-80 transition-opacity"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          )}
          {uniqueFormulas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {uniqueFormulas.map((fname) => (
                <Link
                  key={fname}
                  href={`/formulas/${encodeURIComponent(fname)}`}
                  className="romc-pill romc-pill--updated text-xs hover:opacity-80 transition-opacity"
                >
                  {fname}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="romc-panel space-y-4">
        <div>
          <p className="romc-eyebrow">Formulas & functions</p>
          <h2 className="text-2xl font-semibold text-white">CommonFun links</h2>
        </div>
        {!formulas.length && <p className="text-sm text-[var(--muted)]">No CommonFun references found for this skill.</p>}
        {formulas.map((formula) => {
          const relevantGroups = (formula.usage_groups ?? []).filter((group) =>
            (group.level_ids ?? []).some((id) => typeof id === "number" && levelIds.has(id)),
          );
          const definition: FormulaDefinitionRecord | undefined = definitionMap.get(formula.formula);
          const codeSample = (definition?.code ?? "").trim() || "-- Lua source unavailable --";
          const previousCode =
            typeof previousFormulaMap[formula.formula] === "string" ? previousFormulaMap[formula.formula] : null; const scopeGroups = relevantGroups.length ? relevantGroups : formula.usage_groups ?? [];
          const buffScope = deriveBuffScopeFromGroups(scopeGroups);

          return (
            <article key={formula.formula} className="romc-panel romc-panel--soft p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide">
                <Link href={`/formulas?q=${encodeURIComponent(formula.formula)}`} className="font-semibold hover:underline">
                  {formula.formula}
                </Link>
                <div className="flex items-center gap-2">
                  {formula.category && <span className="romc-pill">{formula.category}</span>}
                  {buffScope && (
                    <span className="romc-pill" style={buffScopeStyles[buffScope]}>
                      {buffScope === "enemy" ? "Enemy" : "Self"}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(relevantGroups.length ? relevantGroups : formula.usage_groups ?? []).map((group) => {
                  const label = group.display_name || group.skill_name || group.skill_token || group.key || "Skill";
                  const levelsList = (group.levels ?? [])
                    .filter((entry) => typeof entry.level === "number")
                    .map((entry) => entry.level as number);
                  let levelLabel = "";
                  if (levelsList.length) {
                    const min = Math.min(...levelsList);
                    const max = Math.max(...levelsList);
                    levelLabel = min === max ? `Lv ${min}` : `Lv ${min}-${max}`;
                  }
                  const categories = Array.from(
                    new Set(
                      (group.levels ?? [])
                        .map((entry) => entry.category)
                        .filter((value): value is string => typeof value === "string" && value.length > 0),
                    ),
                  );
                  const categoryLabel = categories.length ? categories.join("/") : "";
                  const uniqueBuffs = Array.from(
                    new Set(
                      (group.levels ?? [])
                        .map((entry) => entry.buff_id)
                        .filter((value): value is number => typeof value === "number"),
                    ),
                  );

                  return (
                    <div key={`${group.key}-${label}`} className="romc-chip flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{label}</span>
                      <div className="flex items-center gap-2 text-[var(--muted)] text-xs">
                        {levelLabel && <span>{levelLabel}</span>}
                        {categoryLabel && (
                          <>
                            <span className="text-white/20">|</span>
                            <span>{categoryLabel}</span>
                          </>
                        )}
                        {uniqueBuffs.length > 0 && (
                          <>
                            <span className="text-white/20">|</span>
                            <span className="flex items-center gap-1">
                              Buffs
                              {uniqueBuffs.map((buffId, idx) => (
                                <span key={buffId}>
                                  {idx > 0 && ", "}
                                  <Link
                                    href={`/buffs/${buffId}`}
                                    className="hover:text-white hover:underline text-[var(--accent)]"
                                  >
                                    {buffId}
                                  </Link>
                                </span>
                              ))}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 space-y-4 text-sm">
                <div className="space-y-2">
                  <LinkedFormulaCode formulaName={formula.formula} code={codeSample} datasetTag={datasetTag} />
                  <DiffPreview
                    previous={previousDatasetTag ? previousCode : null}
                    current={codeSample}
                    label={
                      previousDatasetTag ? `Changes vs ${previousDatasetTag}` : "Changes vs previous version"
                    }
                  />
                </div>
              </div>
            </article>
          );
        })}

        {highestLevel && (
          <div className="space-y-2 text-xs">
            <p className="romc-eyebrow">Skill JSON (Level {String((highestLevel as { Level?: number }).Level ?? "?")})</p>
            <div className="rounded-2xl border border-white/10 bg-black/30">
              <JsonHighlighter data={highestLevel} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
