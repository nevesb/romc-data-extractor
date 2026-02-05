import Link from "next/link";
import { EntityCard } from "@/components/cards/EntityCard";
import { getBuffsDataset } from "@/lib/buffs-queries";
import { resolveLocalizedText } from "@/lib/utils";

type PageProps = {
    searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function BuffsPage({ searchParams }: PageProps) {
    const params = (await searchParams) ?? {};
    const query = Array.isArray(params.q) ? params.q[0] : params.q;

    const { buffs, total, error } = await getBuffsDataset({ query });

    return (
        <div className="space-y-8">
            <header className="romc-panel romc-panel--soft p-6 text-sm">
                <p className="romc-eyebrow">Buffs & Debuffs</p>
                <h1 className="text-3xl font-semibold">Search status effects</h1>
                <form className="mt-4 flex gap-3" action="/buffs" method="get">
                    <label className="flex flex-1 flex-col gap-1">
                        <span>Name or description</span>
                        <input
                            name="q"
                            defaultValue={query}
                            placeholder="Blessing, Agi Up, Poison..."
                            className="romc-input"
                        />
                    </label>
                    <div className="flex items-end gap-2">
                        <button type="submit" className="romc-button romc-button--sm">
                            Search
                        </button>
                        <Link href="/buffs" className="romc-chip romc-chip--active">
                            Reset
                        </Link>
                    </div>
                </form>
                <p className="mt-2 text-xs">{total} buffs found.</p>
                {error && <p className="mt-1 text-rose-400">Error: {error}</p>}
            </header>

            <section className="romc-panel p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)]">
                    {buffs.map((buff) => {
                        const title = resolveLocalizedText(buff.name, `Buff ${buff.id}`);
                        const description = resolveLocalizedText(buff.description, "");

                        return (
                            <EntityCard
                                key={buff.id}
                                title={title}
                                description={description}
                                badge={`ID ${buff.id}`}
                                href={`/buffs/${buff.id}`}
                            />
                        );
                    })}
                    {!buffs.length && (
                        <p className="p-4 text-sm text-[var(--muted)] col-span-2">
                            No buffs matched the search.
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
}
