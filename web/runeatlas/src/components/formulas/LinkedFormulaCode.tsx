'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-lua';
import 'prismjs/themes/prism-tomorrow.css';

type DependenciesData = {
  formulas: Array<{ name: string }>;
  skills: Array<{ id: number; name?: any }>;
  buffs: Array<{ id: number; name?: any }>;
};

type Props = {
  formulaName: string;
  code: string;
  datasetTag: string | null;
};

const baseCodeStyle: React.CSSProperties = {
  background: 'rgba(6,12,18,0.8)',
  borderRadius: '1rem',
  border: '1px solid rgba(255,255,255,0.1)',
  fontSize: '0.85rem',
  lineHeight: '1.45',
  padding: '1rem',
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: '#e5e7eb',
};

function safeName(maybe: any, fallback: string) {
  if (typeof maybe === 'string') return maybe;
  if (maybe && typeof maybe === 'object') {
    return (
      maybe.english ||
      maybe.portuguese ||
      maybe.spanish ||
      maybe.german ||
      maybe.chinesesimplified ||
      fallback
    );
  }
  return fallback;
}

function addMarkers(code: string, deps: DependenciesData) {
  let working = code;
  const replacements: Array<{ token: string; html: string }> = [];
  let counter = 0;

  const add = (rx: RegExp, htmlBuilder: (match: string) => string) => {
    working = working.replace(rx, (match) => {
      const token = `__ROMC_LINK_${counter}__`;
      counter += 1;
      replacements.push({ token, html: htmlBuilder(match) });
      return token;
    });
  };

  for (const f of deps.formulas ?? []) {
    const escaped = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    add(new RegExp(`\\b${escaped}\\b`, 'g'), () =>
      `<a class="romc-link" href="/formulas/${encodeURIComponent(f.name)}">${f.name}</a>`,
    );
  }

  for (const s of deps.skills ?? []) {
    const id = s.id;
    const name = safeName(s.name, `Skill ${id}`);
    add(new RegExp(`GetLernedSkillLevel\\(${id}\\)`, 'g'), (m) => `<a class="romc-link" href="/skills/${id}" title="${name}">${m}</a>`);
    add(new RegExp(`skillID\\s*==\\s*${id}`, 'g'), (m) => `<a class="romc-link" href="/skills/${id}" title="${name}">${m}</a>`);
  }

  for (const b of deps.buffs ?? []) {
    const id = b.id;
    const name = safeName(b.name, `Buff ${id}`);
    add(new RegExp(`HasBuffID\\(${id}\\)`, 'g'), (m) => `<a class="romc-link" href="/buffs/${id}" title="${name}">${m}</a>`);
    add(new RegExp(`GetBuffLevel\\(${id}\\)`, 'g'), (m) => `<a class="romc-link" href="/buffs/${id}" title="${name}">${m}</a>`);
    add(new RegExp(`buffid\\s*==\\s*${id}`, 'g'), (m) => `<a class="romc-link" href="/buffs/${id}" title="${name}">${m}</a>`);
  }

  return { markedCode: working, replacements };
}

function injectLinks(highlighted: string, replacements: Array<{ token: string; html: string }>): string {
  let html = highlighted;
  for (const { token, html: replacement } of replacements) {
    const rx = new RegExp(token, 'g');
    html = html.replace(rx, replacement);
  }
  return html;
}

export function LinkedFormulaCode({ formulaName, code, datasetTag }: Props) {
  const [deps, setDeps] = useState<DependenciesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (datasetTag) params.set('tag', datasetTag);
        const res = await fetch(
          `/api/formulas/${encodeURIComponent(formulaName)}/dependencies?${params}`,
        );
        if (!res.ok) throw new Error('Failed to load dependencies');
        const json = await res.json();
        setDeps({
          formulas: json.formulas ?? [],
          skills: json.skills ?? [],
          buffs: json.buffs ?? [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };
    load();
  }, [formulaName, datasetTag]);

  const { markedCode, replacements } = useMemo(() => addMarkers(code, deps ?? { formulas: [], skills: [], buffs: [] }), [code, deps]);
  const highlighted = useMemo(() => Prism.highlight(markedCode, Prism.languages.lua, 'lua'), [markedCode]);
  const linkedHtml = useMemo(() => injectLinks(highlighted, replacements), [highlighted, replacements]);

  return (
    <div className="space-y-2" suppressHydrationWarning>
      <div className="flex items-center justify-between gap-2">
        <p className="romc-eyebrow">Formula Source</p>
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
      <pre
        style={baseCodeStyle}
        className="language-lua"
        dangerouslySetInnerHTML={{ __html: linkedHtml }}
      />
      <div className="flex flex-wrap gap-2 text-[10px] text-[var(--muted)]">
        {deps?.formulas?.length ? (
          <span>{deps.formulas.length} formulas linked</span>
        ) : (
          <span>No formula links</span>
        )}
        {deps?.skills?.length ? <span>| {deps.skills.length} skills linked</span> : null}
        {deps?.buffs?.length ? <span>| {deps.buffs.length} buffs linked</span> : null}
      </div>
    </div>
  );
}
