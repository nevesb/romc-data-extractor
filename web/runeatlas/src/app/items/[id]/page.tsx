import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemById, describeItem } from "@/lib/queries";
import { resolveLocalizedText } from "@/lib/utils";
import { getEquipmentSlotByType, getCardSlotByType } from "@/lib/item-taxonomy";

type PageProps = {
  params: Promise<{ id: string }>;
};

const LANGUAGE_LABELS: Record<string, string> = {
  portuguese: "Portuguese",
  english: "English",
  spanish: "Spanish",
  german: "German",
  chinesesimplified: "Chinese (Simplified)",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const itemId = Number(id);
  if (Number.isNaN(itemId)) {
    return { title: "Item not found" };
  }
  const item = await getItemById(itemId);
  if (!item) {
    return { title: "Item not found" };
  }
  const { title } = describeItem(item);
  return {
    title: `${title} | ROMClassic Wiki`,
    description: resolveLocalizedText(item.description, item.description_token ?? ""),
  };
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const itemId = Number(id);
  if (Number.isNaN(itemId)) {
    notFound();
  }

  const item = await getItemById(itemId);
  if (!item) {
    notFound();
  }

  const { title, description, meta } = describeItem(item);
  const raw = (item.raw ?? {}) as Record<string, unknown>;

  const slot =
    item.category === "cards"
      ? getCardSlotByType(item.type)
      : item.category === "equipment"
        ? getEquipmentSlotByType(item.type)
        : undefined;

  const descriptionEntries = item.description
    ? Object.entries(item.description).filter(([, value]) => value?.trim().length)
    : [];
  const languages = descriptionEntries.sort((a, b) => a[0].localeCompare(b[0]));

  const rawEntries = Object.entries(raw).filter(
    ([key]) => !["id", "NameZh", "Icon"].includes(key),
  );

  return (
    <div className="space-y-8">
      <nav className="text-sm">
        <Link href="/items" className="hover:text-[var(--accent)]">
          Items
        </Link>{" "}
        / <span className="font-semibold">{title}</span>
      </nav>

      <section className="romc-panel romc-panel--soft p-8 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="romc-eyebrow">Item detail</p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            {description && <p className="mt-2 text-[var(--muted)]">{description}</p>}
          </div>
          <div className="text-sm space-y-1 text-right">
            {meta && <p className="text-base font-semibold">{meta}</p>}
            <p className="text-[var(--muted)]">ID {item.id}</p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Category</dt>
            <dd className="text-base">{item.category ?? "Unknown"}</dd>
          </div>
          {slot && (
            <div>
              <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Slot</dt>
              <dd className="text-base">{slot.label}</dd>
            </div>
          )}
          {typeof item.type === "number" && (
            <div>
              <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Type code</dt>
              <dd className="text-base">{item.type}</dd>
            </div>
          )}
          {raw.Quality != null && (
            <div>
              <dt className="uppercase text-xs tracking-wide text-[var(--muted)]">Quality</dt>
              <dd className="text-base">{String(raw.Quality)}</dd>
            </div>
          )}
        </dl>
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

      {rawEntries.length > 0 && (
        <section className="romc-panel romc-panel--soft p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Raw data</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pr-4 text-left text-xs uppercase tracking-wide text-[var(--muted)]">Field</th>
                  <th className="py-2 text-left text-xs uppercase tracking-wide text-[var(--muted)]">Value</th>
                </tr>
              </thead>
              <tbody>
                {rawEntries.map(([key, value]) => (
                  <tr key={key} className="border-b border-[var(--border)]/30">
                    <td className="py-2 pr-4 font-mono text-[var(--accent)]">{key}</td>
                    <td className="py-2">
                      {typeof value === "object" ? (
                        <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                      ) : (
                        String(value)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
