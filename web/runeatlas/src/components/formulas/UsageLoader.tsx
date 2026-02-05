'use client';

import { useEffect, useState } from 'react';
import { FormulaUsageList } from './FormulaUsageList';

interface UsageData {
    usage: any | null;
}

export function UsageLoader({
    formulaName
}: {
    formulaName: string;
}) {
    const [data, setData] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadUsage = async () => {
            try {
                setLoading(true);

                const response = await fetch(`/api/formulas/${encodeURIComponent(formulaName)}/usage`);
                if (!response.ok) {
                    throw new Error('Failed to load usage');
                }

                const result = await response.json();
                setData(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        loadUsage();
    }, [formulaName]);

    if (loading) {
        return (
            <article className="romc-panel romc-panel--soft p-5">
                <div className="flex items-center justify-center py-4">
                    <div className="animate-pulse text-sm text-gray-500">Loading usage...</div>
                </div>
            </article>
        );
    }

    if (error) {
        return (
            <article className="romc-panel romc-panel--soft p-5">
                <div className="text-sm text-red-500">Error loading usage: {error}</div>
            </article>
        );
    }

    if (!data?.usage) {
        return null;
    }

    const usageCount = data.usage.usages?.length ?? 0;
    const groupCount = data.usage.usage_groups?.length ?? 0;

    if (usageCount === 0 && groupCount === 0) {
        return null;
    }

    return (
        <article className="romc-panel romc-panel--soft p-5">
            <p className="romc-eyebrow mb-3 text-xs uppercase">
                Usage ({usageCount} direct, {groupCount} grouped)
            </p>
            <FormulaUsageList usage={data.usage} />
        </article>
    );
}
