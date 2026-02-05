"use client";

import { useCallback, useMemo, useState } from "react";
import type { BundleDiffSummary } from "@/lib/types";

type DiffData = {
  added: string[];
  removed: string[];
  changed: string[];
};

const DISPLAY_LIMIT = 200;

async function fetchDiff(tag: string): Promise<DiffData> {
  const response = await fetch(`/api/bundles/${encodeURIComponent(tag)}`);
  if (!response.ok) {
    let message = "Failed to load bundle diff.";
    try {
      const payload = await response.json();
      message = payload.error ?? message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
  const payload = await response.json();
  const diff = payload.diff ?? {};
  return {
    added: diff.added ?? [],
    removed: diff.removed ?? [],
    changed: diff.changed ?? [],
  };
}

type DiffSectionProps = {
  label: string;
  count: number;
  entries: string[] | null;
  loading: boolean;
  error?: string | null;
  onOpen: () => void;
  datasetTag: string;
};

function DiffSection({ label, count, entries, loading, error, onOpen, datasetTag }: DiffSectionProps) {
  const [open, setOpen] = useState(false);
  const hasEntries = !!entries?.length;

  return (
    <details
      className="romc-diff"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        if (next && count > 0) {
          onOpen();
        }
      }}
    >
      <summary>
        {label} · {count}
        {loading && <span className="ml-2 text-xs ">Loading...</span>}
      </summary>
      {error && <p className="romc-error mt-2">{error}</p>}
      {!count && <p className="text-xs ">No entries.</p>}
      {hasEntries && <DiffEntries entries={entries!} datasetTag={datasetTag} />}
    </details>
  );
}

type DiffEntriesProps = {
  entries: string[];
  datasetTag: string;
};

function DiffEntries({ entries, datasetTag }: DiffEntriesProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<"expand" | "collapse" | null>(null);
  const visibleEntries = expanded ? entries : entries.slice(0, DISPLAY_LIMIT);
  const remaining = entries.length - visibleEntries.length;

  const handleExpand = () => {
    setPending("expand");
    setTimeout(() => {
      setExpanded(true);
      setPending(null);
    }, 50);
  };

  const handleCollapse = () => {
    setPending("collapse");
    setTimeout(() => {
      setExpanded(false);
      setPending(null);
    }, 50);
  };

  return (
    <div className="space-y-2">
      <ul className="romc-diff__list max-h-64 overflow-auto">
        {visibleEntries.map((entry) => {
          const segments = entry.split("/").map((segment) => encodeURIComponent(segment));
          const href = `/bundles/${encodeURIComponent(datasetTag)}/${segments.join("/")}`;
          return (
            <li key={entry}>
              <a className="romc-link" href={href}>
                {entry}
              </a>
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <button className="romc-chip romc-chip--active" onClick={handleExpand} disabled={pending !== null}>
          {pending === "expand" ? "Loading..." : `Show all (${remaining} more)`}
        </button>
      )}
      {expanded && entries.length > DISPLAY_LIMIT && (
        <button className="romc-chip romc-chip--active" onClick={handleCollapse} disabled={pending !== null}>
          {pending === "collapse" ? "Loading..." : "Collapse list"}
        </button>
      )}
    </div>
  );
}

type BundleDiffViewerProps = {
  datasetTag: string;
  summary?: BundleDiffSummary;
};

export function BundleDiffViewer({ datasetTag, summary }: BundleDiffViewerProps) {
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiff = useCallback(async () => {
    if (diff || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDiff(datasetTag);
      setDiff(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bundle diff.");
    } finally {
      setLoading(false);
    }
  }, [datasetTag, diff, loading]);

  const sections = useMemo(
    () => [
      { key: "added" as const, label: "Added", count: summary?.added ?? 0 },
      { key: "removed" as const, label: "Removed", count: summary?.removed ?? 0 },
      { key: "changed" as const, label: "Changed", count: summary?.changed ?? 0 },
    ],
    [summary]
  );

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {sections.map((section) => (
        <DiffSection
          key={section.key}
          label={section.label}
          count={section.count}
          entries={diff ? diff[section.key] : null}
          loading={loading}
          error={error}
          onOpen={loadDiff}
          datasetTag={datasetTag}
        />
      ))}
    </div>
  );
}

