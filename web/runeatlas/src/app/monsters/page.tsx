import Link from "next/link";
import { EntityCard } from "@/components/cards/EntityCard";
import { getMonstersDataset } from "@/lib/queries";
import { resolveLocalizedText } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function MonstersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const race = Array.isArray(params.race) ? params.race[0] : params.race;
  const nature = Array.isArray(params.nature) ? params.nature[0] : params.nature;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  const { monsters, total, races, natures, error } = await getMonstersDataset({
    race,
    nature,
    query,
  });

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft p-6 text-sm">
        <p className="romc-eyebrow">Monster atlas</p>
        <h1 className="text-3xl font-semibold">Browse monsters, MVPs & minis</h1>
        <form className="mt-4 grid gap-4 md:grid-cols-4" action="/monsters" method="get">
          <label className="flex flex-col gap-1">
            <span>Race</span>
            <select name="race" defaultValue={race} className="romc-select">
              <option value="">All</option>
              {races.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Element</span>
            <select name="nature" defaultValue={nature} className="romc-select">
              <option value="">All</option>
              {natures.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span>Name</span>
            <input name="q" defaultValue={query} placeholder="Poring, Baphomet, Valkyrie..." className="romc-input" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="romc-button romc-button--sm w-full">
              Search
            </button>
            <Link href="/monsters" className="romc-chip romc-chip--active">
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-2 text-xs">{total} monsters found.</p>
        {error && <p className="mt-1 text-rose-400">MongoDB query failed: {error}</p>}
      </header>

      <section className="romc-panel p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)]">
          {monsters.map((monster) => {
            const title = resolveLocalizedText(monster.name, `Monster ${monster.id}`);
            const description = resolveLocalizedText(monster.description, "");
            const badge = monster.zone ?? "Field";
            const metaParts: string[] = [];
            if (monster.level) metaParts.push(`Lv ${monster.level}`);
            if (monster.race) metaParts.push(monster.race);
            if (monster.nature) metaParts.push(monster.nature);
            const meta = metaParts.join(" · ");

            return (
              <EntityCard
                key={monster.id}
                title={title}
                description={description ? description.slice(0, 120) + (description.length > 120 ? "..." : "") : ""}
                badge={badge}
                meta={meta}
                href={`/monsters/${monster.id}`}
              />
            );
          })}
          {!monsters.length && (
            <p className="p-4 text-sm text-[var(--muted)] col-span-2">No monsters matched the filters.</p>
          )}
        </div>
      </section>
    </div>
  );
}
