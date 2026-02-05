import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cleanDocs } from '@/lib/queries';
import fs from 'fs';
import path from 'path';

// Cache for 5 minutes
export const revalidate = 300;

let itemBuffOverride: Record<number, string> | null = null;

function loadItemBuffOverrides(): Record<number, string> {
    if (itemBuffOverride) return itemBuffOverride;
    const map: Record<number, string> = {};
    try {
        const filePath = path.join(process.cwd(), 'data', 'item_buff_links.json');
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const entries = Array.isArray(raw) ? raw : raw?.equip_effects || raw?.links || [];
            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    if (entry && typeof entry === 'object') {
                        const buffId = entry.buff_id;
                        const name = entry.item_name || entry.item_token || entry.buff_token;
                        if (typeof buffId === 'number' && typeof name === 'string' && name.trim()) {
                            map[buffId] = name;
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[dependencies] failed to load item_buff_links.json', err);
    }
    itemBuffOverride = map;
    return map;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    try {
        const resolvedParams = await params;
        const formulaName = decodeURIComponent(resolvedParams.name);
        const searchParams = request.nextUrl.searchParams;
        const datasetTag = searchParams.get('tag');

        const db = await getDb();

        // Load dependency map
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

        // Load dependency documents for this formula
        const dependencyDoc = await db.collection("formula_dependencies")
            .findOne({ dataset_tag: targetTag, name: formulaName });

        if (!dependencyDoc) {
            return NextResponse.json({
                formulas: [],
                skills: [],
                buffs: [],
                npcs: [],
                gems: [],
                cards: [],
                skillFlags: [],
                mapTypes: [],
                zoneTypes: [],
                dependents: []
            });
        }

        const docAny = dependencyDoc as any;
        const innerDeps = docAny.dependencies?.dependencies || {};

        // Get formulas
        let formulas: any[] = [];
        if (Array.isArray(innerDeps.formulas) && innerDeps.formulas.length > 0) {
            const formulaDocs = await db.collection("formula_definitions")
                .find({ name: { $in: innerDeps.formulas } })
                .toArray();
            formulas = cleanDocs(formulaDocs);
        }

        const resolveSkill = (skill: any) => ({
            id: skill.id,
            name: typeof skill.name === "object" ? skill.name.english : skill.name,
        });
    const resolveBuff = (buff: any) => ({
        id: buff.id,
        name: (() => {
            const rawName = typeof buff.name === "object" ? buff.name.english : buff.name;
            const override = loadItemBuffOverrides()[buff.id];
            return override || rawName;
        })(),
    });
        const resolveItem = (item: any) => ({
            id: item.id,
            name: typeof item.name === "object" ? item.name.english : item.name,
        });
    const resolveMonster = (monster: any) => ({
        id: monster.id,
        name: typeof monster.name === "object" ? monster.name.english : monster.name,
    });

        // Get skills (always prefer fresh lookup to avoid stale names)
        let skills: any[] = [];
        const skillIds: number[] = Array.isArray(innerDeps.skills)
            ? innerDeps.skills
            : Array.isArray(innerDeps.skill_details)
                ? (innerDeps.skill_details as any[]).map((s: any) => s?.id).filter((v: any) => typeof v === "number")
                : [];
        if (skillIds.length > 0) {
            const skillDocs = await db.collection("skills")
                .find({ id: { $in: skillIds } })
                .toArray();
            skills = cleanDocs(skillDocs).map(resolveSkill);
        }

        // Get buffs
        let buffs: any[] = [];
        const buffIds: number[] = Array.isArray(innerDeps.buffs)
            ? innerDeps.buffs
            : Array.isArray(innerDeps.buff_details)
                ? (innerDeps.buff_details as any[]).map((b: any) => b?.id).filter((v: any) => typeof v === "number")
                : [];
        if (buffIds.length > 0) {
            const buffDocs = await db.collection("buffs")
                .find({ id: { $in: buffIds } })
                .toArray();
            buffs = cleanDocs(buffDocs).map(resolveBuff);
        }

        // NPCs
        let npcs: any[] = [];
        const npcIds: number[] = Array.isArray(innerDeps.npcs)
            ? innerDeps.npcs
            : Array.isArray(innerDeps.npc_details)
                ? (innerDeps.npc_details as any[]).map((n: any) => n?.id).filter((v: any) => typeof v === "number")
                : [];
        if (npcIds.length > 0) {
            const npcDocs = await db.collection("monsters")
                .find({ id: { $in: npcIds } })
                .toArray();
            npcs = cleanDocs(npcDocs).map(resolveMonster);
        }

        // Gems
        let gems: any[] = [];
        if (Array.isArray(innerDeps.gem_details) && innerDeps.gem_details.length > 0) {
            gems = innerDeps.gem_details;
        } else if (Array.isArray(innerDeps.gems) && innerDeps.gems.length > 0) {
            const gemDocs = await db.collection("items")
                .find({ id: { $in: innerDeps.gems } })
                .toArray();
            gems = cleanDocs(gemDocs).map(resolveItem);
        }

        // Cards
        let cards: any[] = [];
        if (Array.isArray(innerDeps.card_details) && innerDeps.card_details.length > 0) {
            cards = innerDeps.card_details;
        } else if (Array.isArray(innerDeps.cards) && innerDeps.cards.length > 0) {
            const cardDocs = await db.collection("items")
                .find({ id: { $in: innerDeps.cards } })
                .toArray();
            cards = cleanDocs(cardDocs).map(resolveItem);
        }

        const skillFlags: Array<{ id: number; name?: string }> = Array.isArray(innerDeps.skill_flags_named)
            ? innerDeps.skill_flags_named
            : Array.isArray(innerDeps.skill_flags)
                ? (innerDeps.skill_flags as number[]).map((id: number) => ({ id, name: `Skill ${id}` }))
                : [];

        const mapTypes: number[] = Array.isArray(innerDeps.map_types) ? innerDeps.map_types : [];
        const zoneTypes: number[] = Array.isArray(innerDeps.zone_types) ? innerDeps.zone_types : [];

        // Get dependents
        let dependents: any[] = [];
        const dependentsList = Array.isArray(docAny.dependents) ? docAny.dependents : [];
        if (dependentsList.length > 0) {
            const dependentDocs = await db.collection("formula_definitions")
                .find({ name: { $in: dependentsList } })
                .toArray();
            dependents = cleanDocs(dependentDocs);
        }

        return NextResponse.json({
            formulas,
            skills,
            buffs,
            npcs,
            gems,
            cards,
            skillFlags,
            mapTypes,
            zoneTypes,
            dependents
        });
    } catch (error) {
        console.error('[API] Error loading dependencies:', error);
        return NextResponse.json({ error: 'Failed to load dependencies' }, { status: 500 });
    }
}
