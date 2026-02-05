import Link from "next/link";

const STEPS = [
  {
    title: "Snapshot capture",
    description:
      "We watch the official game client and archive every new drop as a dated snapshot so the collection mirrors whatever players see.",
  },
  {
    title: "Curation",
    description:
      "Names, descriptions, numeric values and localized strings are grouped into readable entries that link items, jobs, skills and formulas.",
  },
  {
    title: "Version journal",
    description:
      "Past revisions stay attached to each record, turning every entry into its own changelog without juggling multiple files.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-8">
      <section className="romc-panel p-8 space-y-3">
        <p className="romc-eyebrow">About the project</p>
        <h1 className="text-3xl font-semibold text-white">How ROMClassic Wiki keeps its catalog faithful</h1>
        <p className="text-base">
          ROMClassic Wiki is maintained by a tiny crew of fans who describe Ragnarok M Classic as it evolves. The promise is simple: record
          what is available, describe it clearly, and leave a trail so anyone can retrace the story of a skill, item or monster.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.title} className="romc-panel romc-panel--soft p-6">
            <p className="romc-eyebrow mb-3">{step.title}</p>
            <p className="text-sm">{step.description}</p>
          </div>
        ))}
      </section>

      <section className="romc-panel romc-panel--soft p-8">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-white">Transparency oath</h2>
          <p className="text-sm">
            Every record carries the <strong>extracted_at</strong> tag plus a ledger of prior states so changes remain traceable. The
            site only highlights the most current state; the older ones stay preserved inside the same entry.
          </p>
          <p className="text-sm">
            When referencing ROMClassic Wiki, cite the snapshot timestamp listed on the entry. That keeps any discussion anchored to a
            specific moment in the game lifecycle.
          </p>
          <Link href="/" className="romc-button romc-button--ghost inline-flex w-full justify-center py-3 text-sm font-semibold md:w-auto">
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}

