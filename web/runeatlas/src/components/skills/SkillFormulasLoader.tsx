'use client';

import { useEffect, useState } from 'react';

interface SkillFormulasData {
    formulas: any[];
    formulaDefinitions: any[];
    buffs: any[];
}

export function SkillFormulasLoader({
    skillId,
    datasetTag
}: {
    skillId: number;
    datasetTag: string | null;
}) {
    const [data, setData] = useState<SkillFormulasData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadFormulas = async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams();
                if (datasetTag) {
                    params.set('tag', datasetTag);
                }

                const response = await fetch(`/api/skills/${skillId}/formulas?${params}`);
                if (!response.ok) {
                    throw new Error('Failed to load formulas');
                }

                const result = await response.json();
                setData(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        loadFormulas();
    }, [skillId, datasetTag]);

    if (loading) {
        return (
            <section className="romc-panel space-y-4">
                <div className="flex items-center justify-center py-8">
                    <div className="animate-pulse text-sm text-gray-500">Loading formulas...</div>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="romc-panel space-y-4">
                <div className="text-sm text-red-500">Error loading formulas: {error}</div>
            </section>
        );
    }

    if (!data || data.formulas.length === 0) {
        return (
            <section className="romc-panel space-y-4">
                <div>
                    <p className="romc-eyebrow">Formulas & functions</p>
                    <h2 className="text-2xl font-semibold text-white">CommonFun links</h2>
                </div>
                <p className="text-sm text-[var(--muted)]">No CommonFun references found for this skill.</p>
            </section>
        );
    }

    // Render will be handled by the parent component with the loaded data
    return null;
}
