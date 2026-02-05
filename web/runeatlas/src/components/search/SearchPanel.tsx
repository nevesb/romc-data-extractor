"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchResult } from "@/lib/types";

const SUGGESTIONS = ["Poring", "Mjolnir", "Asura Strike", "Baphomet", "Lex Aeterna"];

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const shouldFetch = trimmedQuery.length >= 2;

  useEffect(() => {
    if (!shouldFetch) {
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?query=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          setResults(data.results ?? []);
          setError(null);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setError("Search is unavailable right now.");
          }
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [shouldFetch, trimmedQuery]);

  const grouped = useMemo(() => {
    return results.reduce<Record<string, SearchResult[]>>((acc, entry) => {
      acc[entry.kind] = acc[entry.kind] ?? [];
      acc[entry.kind].push(entry);
      return acc;
    }, {});
  }, [results]);

  return (
    <div className="romc-panel romc-search">
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3 text-sm text-[var(--muted)] focus-within:border-[var(--accent)]">
        <svg className="h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items, monsters, skills, formulas..."
          className="w-full bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
        />
        {loading && <span className="text-xs text-[var(--accent)]">Searching...</span>}
      </label>
      {shouldFetch && error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuery(suggestion)} className="romc-search-pill">
            {suggestion}
          </button>
        ))}
      </div>
      {shouldFetch && results.length > 0 && (
        <div className="mt-6 grid gap-4">
          {Object.entries(grouped).map(([kind, entries]) => (
            <div key={kind} className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-[var(--accent)]">{kind}</div>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={entry.href}
                      className="flex flex-col rounded-2xl border border-transparent bg-[rgba(255,255,255,0.02)] px-3 py-2 text-sm text-white transition hover:border-[var(--accent)]/40"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold">{entry.title}</span>
                        {entry.badge && <span className="rounded-full bg-[rgba(95,184,255,0.2)] px-2 py-0.5 text-xs text-[var(--accent)]">{entry.badge}</span>}
                      </div>
                      <p className="text-xs text-[var(--muted)]">{entry.description}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
