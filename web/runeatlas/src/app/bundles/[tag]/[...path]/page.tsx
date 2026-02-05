import Link from "next/link";
import { getBundleDetails } from "@/lib/queries";

type PageProps = {
  params: Promise<{
    tag: string;
    path: string[];
  }>;
};

function decodeBundlePath(pathSegments: string[]): string {
  return pathSegments.map((segment) => decodeURIComponent(segment)).join("/");
}

function formatPathId(value: unknown): string {
  if (value === null || typeof value === "undefined") {
    return "?";
  }
  if (typeof value === "object") {
    if (typeof (value as { toString: () => string }).toString === "function") {
      try {
        const result = (value as { toString: () => string }).toString();
        if (result && result !== "[object Object]") {
          return result;
        }
      } catch {
        // ignore
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function assetKey(asset: any) {
  return `${asset?.name ?? ""}::${asset?.type ?? ""}`;
}

export default async function BundleDetailPage({ params }: PageProps) {
  const { tag, path } = await params;
  const bundlePath = decodeBundlePath(path);
  const { entry, error } = await getBundleDetails(tag, bundlePath);

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link href="/bundles" className="romc-link">
          Bundles
        </Link>
        <span className="mx-2 text-[var(--muted)]">/</span>
        <span>{bundlePath}</span>
      </nav>

      <header className="romc-panel space-y-2">
        <p className="romc-eyebrow">Bundle</p>
        <h1 className="text-2xl font-semibold text-white break-all">{bundlePath}</h1>
        <p className="text-sm text-[var(--muted)]">Snapshot · {tag}</p>
      </header>

      {error && <p className="romc-error">Failed to load bundle: {error}</p>}
      {!entry && !error && <p className="text-sm text-[var(--muted)]">Bundle not found in this snapshot.</p>}

      {entry && (
        <section className="romc-panel space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-[var(--muted)]">
            <div>
              <p className="uppercase text-xs tracking-wide text-[var(--accent)]">Size</p>
              <p className="text-lg text-white">{entry.size ? `${entry.size.toLocaleString()} bytes` : "Unknown"}</p>
            </div>
            <div>
              <p className="uppercase text-xs tracking-wide text-[var(--accent)]">Checksum</p>
              <p className="text-lg text-white break-all">{entry.checksum ?? "Unknown"}</p>
            </div>
            <div>
              <p className="uppercase text-xs tracking-wide text-[var(--accent)]">Assets</p>
              <p className="text-lg text-white">{entry.asset_count ?? entry.assets?.length ?? 0}</p>
            </div>
          </div>

          {entry.diff && (
            <div className="romc-panel p-4 space-y-2">
              <p className="romc-eyebrow">Asset changes vs {entry.diff.previous_tag}</p>
              <div className="flex flex-wrap gap-4 text-sm text-[var(--muted)]">
                <span className="romc-pill romc-pill--new">New {entry.diff.added?.length ?? 0}</span>
                <span className="romc-pill romc-pill--removed">Removed {entry.diff.removed?.length ?? 0}</span>
                <span className="romc-pill romc-pill--updated">Updated {entry.diff.updated?.length ?? 0}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--accent)]">Added assets</p>
                  {(entry.diff.added ?? []).map((asset: any) => (
                    <p key={`added-${asset.name}-${asset.type}`} className="text-sm">
                      {asset.name} ({asset.type})
                    </p>
                  ))}
                  {!entry.diff.added?.length && <p className="text-sm text-[var(--muted)]">No additions</p>}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--accent)]">Removed assets</p>
                  {(entry.diff.removed ?? []).map((asset: any) => (
                    <div key={`removed-${asset.name}-${asset.type}`} className="flex items-center gap-2 text-sm">
                      <span className="romc-pill romc-pill--removed">Removed</span>
                      <span>
                        {asset.name} ({asset.type})
                      </span>
                    </div>
                  ))}
                  {!entry.diff.removed?.length && <p className="text-sm text-[var(--muted)]">No removals</p>}
                </div>
              </div>
            </div>
          )}

          <div className="romc-panel romc-panel--soft p-0">
            <div className="romc-list">
              {(() => {
                const addedKeys = new Set((entry.diff?.added ?? []).map(assetKey));
                const updatedKeys = new Set((entry.diff?.updated ?? []).map((item: any) => assetKey(item.current)));
                return (entry.assets ?? []).map((asset: any) => {
                  const key = assetKey(asset);
                  let badge: "new" | "updated" | null = null;
                  if (addedKeys.has(key)) {
                    badge = "new";
                  } else if (updatedKeys.has(key)) {
                    badge = "updated";
                  }
                  return (
                    <div key={`${asset.type}-${asset.path_id}-${asset.name}`} className="romc-list-row">
                      <div>
                        <p className="romc-list-row__title flex items-center gap-2">
                          {asset.name || "(unnamed asset)"}
                          {badge === "new" && <span className="romc-pill romc-pill--new">New</span>}
                          {badge === "updated" && <span className="romc-pill romc-pill--updated">Updated</span>}
                        </p>
                        <p className="romc-list-row__desc">{asset.type ?? "Unknown type"}</p>
                      </div>
                      <div className="romc-meta">Path ID: {formatPathId(asset.path_id)}</div>
                    </div>
                  );
                });
              })()}
              {(!entry.assets || entry.assets.length === 0) && <p className="p-4 text-sm text-[var(--muted)]">No asset metadata recorded for this bundle.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
