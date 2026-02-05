import Link from "next/link";
import { FormulaUsageList } from "@/components/formulas/FormulaUsageList";
import { getFormulaCatalog } from "@/lib/queries";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function FormulasPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const nameQuery = Array.isArray(params.name) ? params.name[0] : params.name;
  const codeQuery = Array.isArray(params.code) ? params.code[0] : params.code;

  const { definitions, usageMap, error } = await getFormulaCatalog(nameQuery, codeQuery);

  return (
    <div className="space-y-8">
      <header className="romc-panel romc-panel--soft p-6 text-sm ">
        <p className="romc-eyebrow">CommonFun</p>
        <h1 className="text-3xl font-semibold ">calcDamage / calcBuff explorer</h1>
        <form className="mt-4 flex flex-col gap-3" action="/formulas" method="get">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span>Nome da fórmula</span>
              <input name="name" defaultValue={nameQuery} placeholder="calcDamage_18, CommonFun.CalcMDef..." className="romc-input" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span>Contém no código</span>
              <input name="code" defaultValue={codeQuery} placeholder="targetUser, CalcMDef..." className="romc-input" />
            </label>
          </div>
          <button type="submit" className="romc-button romc-button--sm self-start">
            Aplicar
          </button>
        </form>
        {error && <p className="mt-2 text-rose-400">Failed to load formulas: {error}</p>}
        <p className="mt-2 text-xs ">{definitions.length} formulas listed.</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {definitions.map((formula) => {
          const usage = usageMap[formula.name];
          const usageCount = usage?.usages?.length ?? 0;
          const groupCount = usage?.usage_groups?.length ?? 0;

          return (
            <article key={formula.name} className="romc-panel romc-panel--soft p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs uppercase tracking-wide">
                <Link href={`/formulas/${encodeURIComponent(formula.name)}`} className="romc-link font-semibold hover:underline">
                  {formula.name}
                </Link>
                <span>
                  {usageCount} mapped {usage?.category === "buff" ? "buffs" : "uses"}
                  {groupCount ? ` · ${groupCount} skills` : ""}
                </span>
              </div>
              {usageCount > 0 && (
                <div className="mt-3">
                  <FormulaUsageList usage={usage} />
                </div>
              )}
            </article>
          );
        })}
        {!definitions.length && <p className="text-sm col-span-2">No formulas matched the query.</p>}
      </section>
    </div>
  );
}

