import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cleanDocs } from '@/lib/queries';

// Cache for 5 minutes
export const revalidate = 300;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const skillId = parseInt(resolvedParams.id);
        if (isNaN(skillId)) {
            return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 });
        }

        const searchParams = request.nextUrl.searchParams;
        const datasetTag = searchParams.get('tag');

        const db = await getDb();

        // Get dataset tag
        let targetTag = datasetTag;
        if (!targetTag) {
            const latestSnapshot = await db.collection("_meta_snapshots").findOne({ _id: "latest" as any });
            if (latestSnapshot?.dataset_tag) {
                targetTag = latestSnapshot.dataset_tag;
            }
        }

        if (!targetTag) {
            return NextResponse.json({ error: 'No dataset tag available' }, { status: 404 });
        }

        // Get formulas that use this skill
        const formulaUsages = await db.collection("formula_usages")
            .find({
                dataset_tag: targetTag,
                $or: [
                    { "usages.level_id": skillId },
                    { "usage_groups.levels.level_id": skillId }
                ]
            })
            .toArray();

        const formulaNames = Array.from(new Set(formulaUsages.map((u: any) => u.formula))).filter(Boolean);

        let formulas: any[] = [];
        let formulaDefinitions: any[] = [];

        if (formulaNames.length > 0) {
            const formulaDocs = await db.collection("formula_definitions")
                .find({ name: { $in: formulaNames }, dataset_tag: targetTag })
                .toArray();
            formulaDefinitions = cleanDocs(formulaDocs);
        }

        formulas = cleanDocs(formulaUsages);

        // Get buffs referenced by these formulas
        const buffIds = new Set<number>();
        for (const record of formulaUsages) {
            for (const usage of (record as any).usages ?? []) {
                if (typeof usage.buff_id === "number") {
                    buffIds.add(usage.buff_id);
                }
            }
            for (const group of (record as any).usage_groups ?? []) {
                for (const entry of group.levels ?? []) {
                    if (typeof entry.buff_id === "number") {
                        buffIds.add(entry.buff_id);
                    }
                }
            }
        }

        let buffs: any[] = [];
        if (buffIds.size > 0) {
            const buffDocs = await db.collection("buffs")
                .find({ id: { $in: Array.from(buffIds) } })
                .toArray();
            buffs = cleanDocs(buffDocs);
        }

        return NextResponse.json({
            formulas,
            formulaDefinitions,
            buffs
        });
    } catch (error) {
        console.error('[API] Error loading skill formulas:', error);
        return NextResponse.json({ error: 'Failed to load skill formulas' }, { status: 500 });
    }
}
