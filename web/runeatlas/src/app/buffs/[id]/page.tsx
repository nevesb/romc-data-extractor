import Link from "next/link";
import { notFound } from "next/navigation";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { duotoneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { getBuffDetails } from "@/lib/buffs-queries";
import { resolveLocalizedText } from "@/lib/utils";

type PageProps = {
    params: Promise<{ id: string }>;
};

const baseCodeStyle = {
    background: "transparent",
    borderRadius: 0,
    border: "none",
    fontSize: "0.85rem",
    lineHeight: "1.45",
    padding: "1rem",
    margin: 0,
};

function renderPlainText(fragment: string, keyPrefix: string, color?: string) {
    if (!fragment.length) {
        return [];
    }
    const nodes: React.ReactNode[] = [];
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

function renderDescriptionNodes(text: string) {
    if (!text) {
        return null;
    }
    const segments: React.ReactNode[] = [];
    const colorRegex = /\[([0-9a-fA-F]{6})](.*?)\[-]/gs;
    let cursor = 0;
    let segmentIndex = 0;
    for (const match of text.matchAll(colorRegex)) {
        const [full, hex, content] = match;
        const matchIndex = match.index ?? 0;
        if (matchIndex > cursor) {
            segments.push(...renderPlainText(text.slice(cursor, matchIndex), `plain-${segmentIndex}`));
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

export default async function BuffDetailPage({ params }: PageProps) {
    const resolvedParams = await params;
    const buffId = Number(resolvedParams.id);

    if (!Number.isFinite(buffId)) {
        notFound();
    }

    const { buff, formulas, skills, error } = await getBuffDetails(buffId);

    if (!buff) {
        notFound();
    }

    const title = resolveLocalizedText(buff.name, `Buff ${buff.id}`);
    const description = resolveLocalizedText(buff.description, "");
    const uniqueSkills = Array.from(
        new Map(
            (skills ?? []).map((skill: any) => [
                skill.id,
                { id: skill.id, name: resolveLocalizedText(skill.name, `Skill ${skill.id}`) },
            ]),
        ).values(),
    );

    return (
        <div className="space-y-8">
            <header className="romc-panel romc-panel--soft space-y-3 p-6">
                <p className="romc-eyebrow">Buff #{buff.id}</p>
                <h1 className="text-3xl font-semibold text-white">{title}</h1>
                {description && <p className="text-sm text-[var(--muted)]">{renderDescriptionNodes(description)}</p>}
                {error && <p className="romc-error mt-2 text-xs">{error}</p>}
            </header>

            {/* Buff Data */}
            <section className="romc-panel space-y-4">
                <div>
                    <p className="romc-eyebrow">Buff Data</p>
                    <h2 className="text-2xl font-semibold text-white">Raw JSON</h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30">
                    <SyntaxHighlighter
                        language="json"
                        style={duotoneDark}
                        customStyle={baseCodeStyle}
                        showLineNumbers={false}
                    >
                        {JSON.stringify(buff, null, 2)}
                    </SyntaxHighlighter>
                </div>
            </section>

            {/* Skills using this buff */}
            {uniqueSkills && uniqueSkills.length > 0 && (
                <section className="romc-panel space-y-3">
                    <div>
                        <p className="romc-eyebrow">Related Skills</p>
                        <h2 className="text-2xl font-semibold text-white">Skills that activate this buff</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {uniqueSkills.map((skill: any) => (
                            <Link
                                key={skill.id}
                                href={`/skills/${skill.id}`}
                                className="romc-pill romc-pill--new text-xs hover:opacity-80 transition-opacity"
                            >
                                {skill.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Formulas using this buff */}
            {formulas.length > 0 && (
                <section className="romc-panel space-y-3">
                    <div>
                        <p className="romc-eyebrow">Related Formulas</p>
                        <h2 className="text-2xl font-semibold text-white">Formulas that reference this buff</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {formulas.map((formula: any) => (
                            <Link
                                key={formula.name}
                                href={`/formulas/${encodeURIComponent(formula.name)}`}
                                className="romc-pill romc-pill--updated text-xs hover:opacity-80 transition-opacity"
                            >
                                {formula.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
