import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cleanDocs } from '@/lib/queries';

// Cache for 5 minutes
export const revalidate = 300;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    try {
        const resolvedParams = await params;
        const formulaName = decodeURIComponent(resolvedParams.name);

        const db = await getDb();

        const usage = await db.collection("formula_usages").findOne({ formula: formulaName });

        if (!usage) {
            return NextResponse.json({ usage: null });
        }

        const cleanUsage = cleanDocs([usage])[0];

        return NextResponse.json({
            usage: cleanUsage
        });
    } catch (error) {
        console.error('[API] Error loading formula usage:', error);
        return NextResponse.json({ error: 'Failed to load formula usage' }, { status: 500 });
    }
}
