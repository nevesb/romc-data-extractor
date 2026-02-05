import { getBundleHistory } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";
import { BundleDiffViewer } from "@/components/bundles/BundleDiffViewer";

function formatTimestamp(value?: string) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  return `${date.toLocaleDateString("en-US")} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} UTC`;
}

export default async function BundlesPage() {
  const { history, error } = await getBundleHistory(24);

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft p-6 text-sm ">
        <p className="romc-eyebrow">Bundles</p>
        <h1 className="mt-2 text-3xl font-semibold ">Client Snapshots</h1>
        <p className="text-sm">
          Every extraction keeps the complete Unity bundle catalog pulled from the Android client. Use this history to track when bundles were added, removed, or modified in the
          game.
        </p>
      </header>

      {error && <p className="romc-error">Failed to load bundle history: {error}</p>}

      <section className="space-y-4">
        {history.map((entry) => (
          <article key={entry.dataset_tag} className="romc-panel p-6 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="romc-eyebrow">Snapshot</p>
                <h2 className="text-2xl font-semibold ">{entry.dataset_tag}</h2>
                <p className="text-sm ">Generated on {formatTimestamp(entry.extracted_at)}</p>
              </div>
              <div className="text-sm text-right">
                <p className="romc-eyebrow">Bundles</p>
                <p className="text-2xl font-semibold ">{formatNumber(entry.bundle_count)}</p>
                {entry.diff_summary?.previous_tag && (
                  <p className="text-xs ">
                    Compared to <span className="font-semibold">{entry.diff_summary.previous_tag}</span>
                  </p>
                )}
              </div>
            </div>

            <BundleDiffViewer datasetTag={entry.dataset_tag} summary={entry.diff_summary} />
          </article>
        ))}

        {!history.length && !error && (
          <p className="text-sm ">No snapshots available yet. Import a dataset to get started.</p>
        )}
      </section>
    </div>
  );
}

