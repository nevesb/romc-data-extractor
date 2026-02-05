import Link from "next/link";
import { EntityCard } from "@/components/cards/EntityCard";
import { getItemsDataset, describeItem } from "@/lib/queries";
import { ITEM_CATEGORIES } from "@/lib/item-taxonomy";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function ItemsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const category = Array.isArray(params.category) ? params.category[0] : params.category;
  const slot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;
  const page = Math.max(Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1, 1);

  const { items, total, error } = await getItemsDataset({ category, slot, query, page, limit: 48 });
  const totalPages = Math.ceil(total / 48);

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft p-6 text-sm">
        <p className="romc-eyebrow">Item compendium</p>
        <h1 className="text-3xl font-semibold">Browse equipment, cards & consumables</h1>
        <form className="mt-4 grid gap-4 md:grid-cols-3" action="/items" method="get">
          <label className="flex flex-col gap-1">
            <span>Category</span>
            <select name="category" defaultValue={category} className="romc-select">
              <option value="">All</option>
              {ITEM_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>
                  {cat.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span>Name</span>
            <input name="q" defaultValue={query} placeholder="Mjolnir, Baphomet Card..." className="romc-input" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="romc-button romc-button--sm w-full">
              Search
            </button>
            <Link href="/items" className="romc-chip romc-chip--active">
              Reset
            </Link>
          </div>
        </form>
        <p className="mt-2 text-xs">{total} items found.</p>
        {error && <p className="mt-1 text-rose-400">MongoDB query failed: {error}</p>}
      </header>

      <section className="romc-panel p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)]">
          {items.map((item) => {
            const { title, description, meta } = describeItem(item);
            return (
              <EntityCard
                key={item.id}
                title={title}
                description={description}
                badge={meta || item.category || "Item"}
                href={`/items/${item.id}`}
              />
            );
          })}
          {!items.length && (
            <p className="p-4 text-sm text-[var(--muted)] col-span-2">No items matched the filters.</p>
          )}
        </div>
      </section>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={{ pathname: "/items", query: { ...(category ? { category } : {}), ...(query ? { q: query } : {}), page: page - 1 } }}
              className="romc-chip"
            >
              Previous
            </Link>
          )}
          <span className="text-[var(--muted)]">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={{ pathname: "/items", query: { ...(category ? { category } : {}), ...(query ? { q: query } : {}), page: page + 1 } }}
              className="romc-chip"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
