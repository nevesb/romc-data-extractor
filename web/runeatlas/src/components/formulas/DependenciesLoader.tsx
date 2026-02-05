'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface DependenciesData {
    formulas: Array<{ name: string; code?: string }>;
    skills: Array<{ id: number; name?: string }>;
    buffs: Array<{ id: number; name?: string }>;
    npcs: Array<{ id: number; name?: string }>;
    gems: Array<{ id: number; name?: string }>;
    cards: Array<{ id: number; name?: string }>;
    skillFlags: Array<{ id: number; name?: string }>;
    mapTypes: number[];
    zoneTypes: number[];
    dependents: Array<{ name: string; code?: string }>;
}

export function DependenciesLoader({
    formulaName,
    datasetTag
}: {
    formulaName: string;
    datasetTag: string | null;
}) {
    const [data, setData] = useState<DependenciesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadDependencies = async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams();
                if (datasetTag) {
                    params.set('tag', datasetTag);
                }

                const response = await fetch(`/api/formulas/${encodeURIComponent(formulaName)}/dependencies?${params}`);
                if (!response.ok) {
                    throw new Error('Failed to load dependencies');
                }

                const result = await response.json();
                const normalized: DependenciesData = {
                    formulas: result.formulas ?? [],
                    skills: result.skills ?? [],
                    buffs: result.buffs ?? [],
                    npcs: result.npcs ?? [],
                    gems: result.gems ?? [],
                    cards: result.cards ?? [],
                    skillFlags: result.skillFlags ?? [],
                    mapTypes: result.mapTypes ?? [],
                    zoneTypes: result.zoneTypes ?? [],
                    dependents: result.dependents ?? [],
                };
                setData(normalized);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        loadDependencies();
    }, [formulaName, datasetTag]);

    if (loading) {
        return (
            <article className="romc-panel romc-panel--soft p-5">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-pulse text-sm text-gray-500">Loading dependencies...</div>
                </div>
            </article>
        );
    }

    if (error) {
        return (
            <article className="romc-panel romc-panel--soft p-5">
                <div className="text-sm text-red-500">Error loading dependencies: {error}</div>
            </article>
        );
    }

    if (!data) {
        return null;
    }

    const hasAnyDependencies =
        data.formulas.length > 0 ||
        data.skills.length > 0 ||
        data.buffs.length > 0 ||
        data.npcs.length > 0 ||
        data.gems.length > 0 ||
        data.cards.length > 0 ||
        data.skillFlags.length > 0 ||
        data.mapTypes.length > 0 ||
        data.zoneTypes.length > 0 ||
        data.dependents.length > 0;

    if (!hasAnyDependencies) {
        return null;
    }

    const displayName = (maybeName: any, fallback: string) => {
        if (typeof maybeName === 'string') {
            return maybeName;
        }
        if (maybeName && typeof maybeName === 'object') {
            return (
                maybeName.english ||
                maybeName.portuguese ||
                maybeName.spanish ||
                maybeName.german ||
                maybeName.chinesesimplified ||
                fallback
            );
        }
        return fallback;
    };

    return (
        <article className="romc-panel romc-panel--soft p-5">
            <div className="space-y-4">
                {data.formulas.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Dependencies (Formulas used)</p>
                        <div className="flex flex-wrap gap-2">
                            {data.formulas.map((dep) => (
                                <Link
                                    key={dep.name}
                                    href={`/formulas/${encodeURIComponent(dep.name)}`}
                                    className="romc-pill romc-pill--new text-xs hover:opacity-80 transition-opacity"
                                >
                                    {dep.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {data.skills.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Dependencies (Skills referenced)</p>
                        <div className="flex flex-wrap gap-2">
                            {data.skills.map((skill) => (
                                <Link
                                    key={skill.id}
                                    href={`/skills/${skill.id}`}
                                    className="romc-pill text-xs hover:opacity-80 transition-opacity"
                                    title={`Skill ID: ${skill.id}`}
                                >
                                    {displayName(skill.name, `Skill ${skill.id}`)}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {data.buffs.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Dependencies (Buffs referenced)</p>
                        <div className="flex flex-wrap gap-2">
                            {data.buffs.map((buff) => (
                                <Link
                                    key={buff.id}
                                    href={`/buffs/${buff.id}`}
                                    className="romc-pill text-xs hover:opacity-80 transition-opacity"
                                    title={`Buff ID: ${buff.id}`}
                                >
                                    {displayName(buff.name, `Buff ${buff.id}`)}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {data.dependents.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Dependents (Formulas that use this)</p>
                        <div className="flex flex-wrap gap-2">
                            {data.dependents.map((dep) => (
                                <Link
                                    key={dep.name}
                                    href={`/formulas/${encodeURIComponent(dep.name)}`}
                                    className="romc-pill romc-pill--updated text-xs hover:opacity-80 transition-opacity"
                                >
                                    {dep.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {data.npcs.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">NPCs / Monsters</p>
                        <div className="flex flex-wrap gap-2">
                            {data.npcs.map((npc) => (
                                <span key={npc.id} className="romc-pill text-xs" title={`NPC ${npc.id}`}>
                                    {displayName(npc.name, `NPC ${npc.id}`)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {data.gems.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Gems</p>
                        <div className="flex flex-wrap gap-2">
                            {data.gems.map((gem) => (
                                <span key={gem.id} className="romc-pill text-xs" title={`Gem ${gem.id}`}>
                                    {displayName(gem.name, `Gem ${gem.id}`)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {data.cards.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Cards</p>
                        <div className="flex flex-wrap gap-2">
                            {data.cards.map((card) => (
                                <span key={card.id} className="romc-pill text-xs" title={`Card ${card.id}`}>
                                    {displayName(card.name, `Card ${card.id}`)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {data.skillFlags.length > 0 && (
                    <div>
                        <p className="romc-eyebrow mb-2 text-xs uppercase">Skill flags</p>
                        <div className="flex flex-wrap gap-2">
                            {data.skillFlags.map((skill) => (
                                <Link
                                    key={skill.id}
                                    href={`/skills/${skill.id}`}
                                    className="romc-pill text-xs hover:opacity-80 transition-opacity"
                                    title={`Skill flag ${skill.id}`}
                                >
                                    {displayName(skill.name, `Skill ${skill.id}`)}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {(data.mapTypes.length > 0 || data.zoneTypes.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {data.mapTypes.length > 0 && (
                            <div>
                                <p className="romc-eyebrow mb-1 text-[10px] uppercase">Map types</p>
                                <div className="flex flex-wrap gap-2">
                                    {data.mapTypes.map((mt) => (
                                        <span key={`map-${mt}`} className="romc-pill text-xs">
                                            maptype = {mt}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {data.zoneTypes.length > 0 && (
                            <div>
                                <p className="romc-eyebrow mb-1 text-[10px] uppercase">Zone types</p>
                                <div className="flex flex-wrap gap-2">
                                    {data.zoneTypes.map((zt) => (
                                        <span key={`zone-${zt}`} className="romc-pill text-xs">
                                            zoneType = {zt}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}
