import { SearchPanel } from "@/components/search/SearchPanel";

const SECTIONS = [
  { href: "/items", label: "Items", cta: "Browse" },
  { href: "/monsters", label: "Monsters", cta: "Explore" },
  { href: "/skills", label: "Skills", cta: "Search" },
  { href: "/formulas", label: "Formulas", cta: "Inspect" },
  { href: "/buffs", label: "Buffs", cta: "Discover" },
];

export default async function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center space-y-8 px-4 py-12">
      <section className="text-center space-y-4 max-w-3xl">
        <p className="romc-eyebrow">ROMClassic Wiki</p>
        <h1 className="text-5xl md:text-6xl font-bold text-white">
          The living data vault for<br />Ragnarok M: Classic
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto">
          Search through items, monsters, skills, formulas, buffs, and game mechanics.
          Every export mirrors the official client with full history tracking.
        </p>
      </section>

      <section className="w-full max-w-2xl">
        <SearchPanel />
      </section>

      <section className="w-full max-w-4xl mt-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="romc-panel romc-panel--soft p-6 text-center hover:border-[var(--accent)] transition-colors"
            >
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">{section.label}</p>
              <p className="text-2xl font-bold text-white">{section.cta}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
