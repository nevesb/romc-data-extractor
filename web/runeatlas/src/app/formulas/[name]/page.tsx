import Link from "next/link";
import { notFound } from "next/navigation";
import { diffLines } from "diff";
import { HistoryViewer } from "@/components/formulas/HistoryViewer";
import { DependenciesLoader } from "@/components/formulas/DependenciesLoader";
import { UsageLoader } from "@/components/formulas/UsageLoader";
import { LinkedFormulaCode } from "@/components/formulas/LinkedFormulaCode";
import { getFormulaDetails } from "@/lib/queries";

type PageProps = {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const diffBlockStyle = {
  fontSize: "0.8rem",
  background: "rgba(6, 12, 18, 0.92)",
  borderRadius: "1rem",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "1rem",
  margin: 0,
  lineHeight: "1.4",
};

type DiffPreviewProps = {
  previous?: string | null;
  current?: string | null;
  label: string;
};

function DiffPreview({ previous, current, label }: DiffPreviewProps) {
  if (!previous || !current || previous === current) {
    return null;
  }
  const segments = diffLines(previous, current);
  return (
    <div className="mt-3">
      <p className="romc-eyebrow mb-1 text-[10px] uppercase tracking-wide">{label}</p>
      <pre className="overflow-x-auto" style={diffBlockStyle}>
        {segments.map((part, index) => {
          const prefix = part.added ? "+" : part.removed ? "-" : " ";
          const tone = part.added ? "text-emerald-300" : part.removed ? "text-rose-400" : "text-slate-200";
          return (
            <span key={`${label}-${index}`} className={`${tone} block whitespace-pre-wrap`}>
              {prefix}
              {part.value}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

export default async function FormulaDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const formulaName = decodeURIComponent(resolvedParams.name);
  const targetTag = typeof resolvedSearchParams.tag === 'string' ? resolvedSearchParams.tag : undefined;

  const { formula, datasetTag, previousDatasetTag, previousCode, diffCurrentCode, history, error } = await getFormulaDetails(formulaName, targetTag);

  if (!formula || error) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <nav className="text-sm">
        <Link href="/formulas" className="romc-link">
          Formulas
        </Link>
        <span className="mx-2 text-[var(--muted)]">/</span>
        <span className="break-all">{formulaName}</span>
      </nav>

      <header className="romc-panel romc-panel--soft p-6 text-sm">
        <p className="romc-eyebrow">CommonFun</p>
        <h1 className="text-3xl font-semibold break-all">{formula.name}</h1>
        {datasetTag && <p className="mt-1 text-xs text-[var(--muted)]">Dataset · {datasetTag}</p>}
      </header>

      <section className="space-y-4">
        <article className="romc-panel romc-panel--soft p-5">
          <div className="space-y-4">
            <div>
              <LinkedFormulaCode formulaName={formula.name} code={formula.code} datasetTag={datasetTag} />
              <DiffPreview
                previous={previousCode}
                current={diffCurrentCode || formula.code}
                label={previousDatasetTag ? `Changes: ${datasetTag || "Current"} vs ${previousDatasetTag}` : "Changes vs previous version"}
              />
            </div>
          </div>
        </article>

        <HistoryViewer
          history={history}
          currentTag={datasetTag}
          formulaName={formulaName}
        />



        <DependenciesLoader formulaName={formulaName} datasetTag={datasetTag} />

        <UsageLoader formulaName={formulaName} />
      </section>
    </div>
  );
}


