import Link from "next/link";
import { EntityCard } from "@/components/cards/EntityCard";
import { getSkillsDataset } from "@/lib/queries";
import { resolveLocalizedText } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function SkillsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const skillType = Array.isArray(params.type) ? params.type[0] : params.type;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  const { skills, total, skillTypes, error } = await getSkillsDataset({
    skillType,
    query,
  });

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft p-6 text-sm ">
        <p className="romc-eyebrow">Skills & builds</p>
        <h1 className="text-3xl font-semibold ">Search effects, tags and formulas</h1>
        <form className="mt-4 grid gap-4 md:grid-cols-3" action="/skills" method="get">
          <label className="flex flex-col gap-1">
            <span>Type</span>
            <select name="type" defaultValue={skillType} className="romc-select">
              <option value="">All</option>
              {skillTypes.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span>Name or description</span>
            <input name="q" defaultValue={query} placeholder="Asura Strike, Lex Aeterna..." className="romc-input" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="romc-button romc-button--sm w-full">
              Apply
            </button>
            <Link href="/skills" className="romc-chip romc-chip--active">
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-2 text-xs ">{total} entries found.</p>
        {error && <p className="mt-1 text-rose-400">MongoDB query failed: {error}</p>}
      </header>

      <section className="romc-panel p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)]">
          {skills
            .filter((skill) => {
              const title = resolveLocalizedText(skill.name, "");
              // Filter out skills without names
              if (!title || title.trim() === "") return false;
              // Filter out deleted skills
              if (title.includes("(Delete)")) return false;
              return true;
            })
            .map((skill) => {
              const title = resolveLocalizedText(skill.name, `Skill ${skill.id}`);
              const description = resolveLocalizedText(skill.description, "");
              const level = skill.levels?.[0] ?? {};
              const badge = (level.SkillType as string) ?? "Skill";
              const variations = skill.grouped_levels ?? skill.levels?.length ?? 0;
              const metaParts: string[] = [];
              if (variations > 1) {
                metaParts.push(`${variations} variations`);
              }
              const meta = metaParts.join(" | ");
              return (
                <EntityCard
                  key={skill.group_key ?? skill.id}
                  title={title}
                  description={description}
                  badge={badge}
                  meta={meta}
                  href={`/skills/${skill.id}`}
                />
              );
            })}
          {!skills.filter((skill) => {
            const title = resolveLocalizedText(skill.name, "");
            return title && title.trim() !== "" && !title.includes("(Delete)");
          }).length && <p className="p-4 text-sm text-[var(--muted)] col-span-2">No skills matched the filters.</p>}
        </div>
      </section>
    </div>
  );
}

