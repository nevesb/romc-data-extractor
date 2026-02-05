"use client";

import { useState } from "react";
import Link from "next/link";

type HistoryItem = {
    dataset_tag: string;
    extracted_at: string | Date;
};

type HistoryViewerProps = {
    history: HistoryItem[];
    currentTag?: string | null;
    formulaName: string;
};

export function HistoryViewer({ history, currentTag, formulaName }: HistoryViewerProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!history || history.length === 0) return null;

    return (
        <article className="romc-panel romc-panel--soft p-5">
            <div className="flex items-center justify-between mb-3">
                <p className="romc-eyebrow text-xs uppercase">Version History</p>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="text-xs font-bold text-[var(--primary)] hover:underline"
                >
                    {isOpen ? "Hide History" : "View History"}
                </button>
            </div>

            {isOpen && (
                <ul className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    {history.map((ver) => (
                        <li key={ver.dataset_tag} className="text-xs">
                            <Link
                                href={`/formulas/${encodeURIComponent(formulaName)}?tag=${ver.dataset_tag}`}
                                className={`flex justify-between items-center p-2 rounded-lg transition-colors ${ver.dataset_tag === currentTag ? "bg-[var(--primary)]/10 font-bold text-[var(--primary)]" : "hover:bg-[var(--accent)]/10 text-[var(--muted-foreground)]"}`}
                            >
                                <span>{ver.dataset_tag}</span>
                                <span className="text-[var(--muted)]">
                                    {ver.extracted_at ? new Date(ver.extracted_at).toLocaleDateString() : ""}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </article>
    );
}
