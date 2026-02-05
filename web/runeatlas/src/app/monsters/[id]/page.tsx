import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonsterById } from "@/lib/queries";
import { resolveLocalizedText } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

const STAT_PAIRS: Array<[string, string]> = [
  ["Level", "HP"],
  ["Base Exp", "Job Exp"],
  ["Str", "Agi"],
  ["Vit", "Int"],
  ["Dex", "Luk"],
  ["Atk", "M.Atk"],
  ["Def", "M.Def"],
  ["Hit", "Flee"],
  ["MoveSpd", "ASPD"],
];

const LANGUAGE_LABELS: Record<string, string> = {
  portuguese: "Portuguese",
  english: "English",
  spanish: "Spanish",
  german: "German",
  chinesesimplified: "Chinese (Simplified)",
};

function resolveTier(monster: { class_type?: number; raw?: Record<string, unknown> }) {
  const raw = (monster.raw ?? {}) as Record<string, any>;
  const passive = Number(raw?.PassiveLv ?? 0);
  const rawClass = (raw?.ClassType as number | undefined) ?? monster.class_type ?? 0;
  if (passive >= 999 || rawClass >= 60) {
    return "MVP";
  }
  if (rawClass >= 30) {
    return "Mini";
  }
  if (rawClass >= 10) {
    return "Elite";
  }
  return "Normal";
}

function formatValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US").format(value);
  }
  if (typeof value === "string" && value.length) {
    return value;
  }
  return "--";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const monsterId = Number(id);
  if (Number.isNaN(monsterId)) {
    return { title: "Monster not found" };
  }
  const detail = await getMonsterById(monsterId);
  if (!detail) {
    return { title: "Monster not found" };
  }
  const name = resolveLocalizedText(detail.monster.name, `Monster ${detail.monster.id}`);
  return {
    title: `${name} | ROMClassic Wiki`,
    description: resolveLocalizedText(detail.monster.description, detail.monster.description_token ?? ""),
  };
}

export default async function MonsterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const monsterId = Number(id);
  if (Number.isNaN(monsterId)) {
    notFound();
  }

  const detail = await getMonsterById(monsterId);
  if (!detail) {
    notFound();
  }

  const { monster, drops, transformSkills, copySkill } = detail;
  const title = resolveLocalizedText(monster.name, `Monster ${monster.id}`);
  const description = resolveLocalizedText(monster.description, monster.description_token ?? "");
  const stats = monster.stats ?? {};
  const raw = (monster.raw ?? {}) as Record<string, any>;
  const getRawValue = (key: string) => raw[key];
  const tier = resolveTier(monster);
  const descriptionEntries = monster.description
    ? Object.entries(monster.description).filter(([, value]) => value?.trim().length)
    : [];
  const languages = descriptionEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const statValues: Record<string, unknown> = {
    Level: monster.level ?? getRawValue("Level") ?? "--",
    HP: getRawValue("Hp") ?? stats.hp ?? "--",
    "Base Exp": getRawValue("BaseExp") ?? "--",
    "Job Exp": getRawValue("JobExp") ?? "--",
    Str: getRawValue("Str"),
    Agi: getRawValue("Agi"),
    Vit: getRawValue("Vit"),
    Int: getRawValue("Int"),
    Dex: getRawValue("Dex"),
    Luk: getRawValue("Luk"),
    Atk: getRawValue("Atk") ?? stats.atk,
    "M.Atk": getRawValue("MAtk") ?? stats.matk,
    Def: getRawValue("Def") ?? stats.def,
    "M.Def": getRawValue("MDef") ?? stats.mdef,
    Hit: getRawValue("Hit") ?? stats.hit,
    Flee: getRawValue("Flee") ?? stats.flee,
    MoveSpd: getRawValue("MoveSpd"),
    ASPD: getRawValue("AtkSpd"),
  };

  return (
    <div className="space-y-8">
      <nav className="text-sm">
        <Link href="/monsters" className="hover:text-[var(--accent)]">
          Monsters
        </Link>{" "}
        / <span className="font-semibold">{title}</span>
      </nav>

      <section className="romc-panel romc-panel--soft p-8 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="romc-eyebrow">Monster profile</p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            {description && <p className="mt-2 text-[var(--muted)]">{description}</p>}
          </div>
          <div className="text-sm space-y-1 text-right">
            <p className="text-base font-semibold">{tier}</p>
            <p className="text-[var(--muted)]">
              Level {formatValue(monster.level ?? getRawValue("Level") ?? "--")} · {monster.race ?? "Unknown"} ·{" "}
              {monster.nature ?? "Unknown"}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Race</dt>
            <dd className="text-base">{monster.race ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Element</dt>
            <dd className="text-base">{monster.nature ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Class</dt>
            <dd className="text-base">{monster.class_type ?? "Unknown"}</dd>
          </div>
          <div>
            <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Habitat</dt>
            <dd className="text-base">{monster.zone ?? "Field"}</dd>
          </div>
        </dl>
      </section>

      <section className="romc-panel romc-panel--soft p-8">
        <h2 className="text-2xl font-semibold">Battle stats</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {STAT_PAIRS.map(([leftLabel, rightLabel]) => (
            <div key={leftLabel} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
              <div>
                <p className="uppercase text-xs tracking-wide text-[var(--muted)]">{leftLabel}</p>
                <p className="text-xl font-semibold">{formatValue(statValues[leftLabel])}</p>
              </div>
              <div className="text-right">
                <p className="uppercase text-xs tracking-wide text-[var(--muted)]">{rightLabel}</p>
                <p className="text-xl font-semibold">{formatValue(statValues[rightLabel])}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="romc-panel romc-panel--soft p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Drops</h2>
          <p className="text-sm text-[var(--muted)]">{drops.length || "No"} items catalogued</p>
        </div>
        {drops.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {drops.map((drop) => (
              <li key={drop.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
                <Link
                  href={`/items/${drop.id}`}
                  className="text-lg font-semibold hover:text-[var(--accent)] transition-colors"
                >
                  {drop.title}
                </Link>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{drop.category ?? "Item"}</p>
                {drop.description && <p className="mt-2 text-sm text-[var(--muted)]">{drop.description}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">No drop data available for this monster.</p>
        )}
      </section>

      {languages.length > 0 && (
        <section className="romc-panel romc-panel--soft p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Descriptions</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {languages.map(([lang, text]) => (
              <article key={lang} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{LANGUAGE_LABELS[lang] ?? lang}</p>
                <p className="mt-2 leading-relaxed">{text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="romc-panel romc-panel--soft p-8 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold">Skill loadout</h2>
          <p className="text-sm text-[var(--muted)]">Active skills cast by this monster.</p>
        </div>
        {detail.transformSkills.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {detail.transformSkills.map((skill) => (
              <li key={skill.id} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
                <Link href={`/skills/${skill.id}`} className="text-base font-semibold hover:text-[var(--accent)] transition-colors">
                  {skill.title}
                </Link>
                <p className="text-xs text-[var(--muted)]">ID {skill.id}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">No transform/active skills recorded.</p>
        )}

        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4 text-sm">
          <p className="font-semibold">Plagiarism / Copy skill</p>
          {detail.copySkill ? (
            <Link href={`/skills/${detail.copySkill.id}`} className="text-[var(--accent)] hover:underline">
              {detail.copySkill.title} (ID {detail.copySkill.id})
            </Link>
          ) : (
            <p className="text-[var(--muted)]">This monster does not expose a copyable skill.</p>
          )}
        </div>
      </section>
    </div>
  );
}
