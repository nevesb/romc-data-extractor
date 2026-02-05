import { Filter } from "mongodb";
import { getDb } from "./db";
import { BuffRecord } from "./types";
import { escapeRegex } from "./utils";

export function cleanDocs<T>(docs: T[]): T[] {
    return docs.map((doc) => JSON.parse(JSON.stringify(doc)));
}

// Buffs queries
export async function getBuffsDataset(options?: { query?: string }) {
    try {
        const db = await getDb();
        const { query } = options ?? {};

        const filter: Filter<BuffRecord> = {};

        if (query) {
            const regex = new RegExp(escapeRegex(query), "i");
            filter.$or = [
                { "name.english": regex },
                { "name.portuguese": regex },
                { "description.english": regex },
                { "description.portuguese": regex },
            ];
        }

        const buffs = await db
            .collection<BuffRecord>("buffs")
            .find(filter)
            .sort({ id: 1 })
            .limit(200)
            .toArray();

        const total = await db.collection<BuffRecord>("buffs").countDocuments(filter);

        return {
            buffs: cleanDocs(buffs),
            total,
            error: null,
        };
    } catch (error) {
        console.error("[buffs-dataset]", error);
        return {
            buffs: [],
            total: 0,
            error: (error as Error).message,
        };
    }
}

export async function getBuffDetails(buffId: number) {
    try {
        const db = await getDb();

        const buff = await db.collection<BuffRecord>("buffs").findOne({ id: buffId });

        if (!buff) {
            return {
                buff: null,
                formulas: [],
                skills: [],
                error: "Buff not found",
            };
        }

        // Find formulas that reference this buff
        const formulaUsages = await db
            .collection("formula_usages")
            .find({
                $or: [
                    { "usages.buff_id": buffId },
                    { "usage_groups.levels.buff_id": buffId },
                ],
            })
            .toArray();

        const formulaNames = Array.from(new Set(formulaUsages.map((u: any) => u.formula))).filter(Boolean);

        let formulas: any[] = [];
        if (formulaNames.length > 0) {
            const formulaDocs = await db
                .collection("formula_definitions")
                .find({ name: { $in: formulaNames } })
                .toArray();
            formulas = cleanDocs(formulaDocs);
        }

        // Find skills that reference this buff (scan Buff / Pvp_buff targets)
        const allSkills = await db
            .collection("skills")
            .find({}, { projection: { id: 1, name: 1, levels: 1 } })
            .toArray();

        const uniqueSkills: Record<string, { id: number; name: any }> = {};

        const seenKeys = new Set<string>();

        for (const skill of allSkills) {
            const levels = Array.isArray(skill.levels) ? skill.levels : [];
            const hasBuff = levels.some((lvl: any) => {
                const sources = [lvl?.Buff, lvl?.Pvp_buff];
                return sources.some((src) => {
                    if (!src || typeof src !== "object") return false;
                    return Object.values(src).some((buffList) => {
                        if (!Array.isArray(buffList)) return false;
                        return buffList.some((entry) => {
                            const bid = typeof entry === "number" ? entry : entry?.id;
                            return bid === buffId;
                        });
                    });
                });
            });

            if (hasBuff) {
                const key =
                    (skill?.name && typeof skill.name === "object" && (skill.name.english || skill.name.portuguese || skill.name.chinesesimplified)) ||
                    (skill as any)?.name_token ||
                    String(skill.id);

                if (typeof key !== "string" || seenKeys.has(key)) {
                    continue;
                }
                seenKeys.add(key);
                uniqueSkills[key] = {
                    id: skill.id,
                    name: skill.name,
                };
            }
        }

        const skills = cleanDocs(Object.values(uniqueSkills));

        return {
            buff: cleanDocs([buff])[0],
            formulas,
            skills,
            error: null,
        };
    } catch (error) {
        console.error("[buff-details]", error);
        return {
            buff: null,
            formulas: [],
            skills: [],
            error: (error as Error).message,
        };
    }
}
