import { getDb } from "./db";
import { describeItem } from "./queries";
import { SearchResult, ItemRecord, MonsterRecord, SkillRecord, FormulaDefinitionRecord } from "./types";
import { escapeRegex, resolveLocalizedText } from "./utils";

type SearchTarget<T> = {
  collection: string;
  kind: SearchResult["kind"];
  limit: number;
  fields: string[];
  build: (doc: T) => SearchResult;
};

const ITEMS_TARGET: SearchTarget<ItemRecord> = {
  collection: "items",
  kind: "items",
  limit: 5,
  fields: ["name.english", "name.portuguese", "description.english", "name_token"],
  build: (doc) => {
    const payload = describeItem(doc);
    return {
      id: `item-${doc.id}`,
      kind: "items",
      title: payload.title,
      description: payload.description || payload.meta,
      badge: payload.meta || "Item",
      href: `/items/${doc.id}`,
    };
  },
};

const MONSTER_TARGET: SearchTarget<MonsterRecord> = {
  collection: "monsters",
  kind: "monsters",
  limit: 5,
  fields: ["name.english", "name.portuguese", "description.english"],
  build: (doc) => ({
    id: `monster-${doc.id}`,
    kind: "monsters",
    title: resolveLocalizedText(doc.name, `Monstro ${doc.id}`),
    description: `${doc.race ?? "Desconhecido"} • ${doc.nature ?? "Neutro"} • Nv ${doc.level ?? "?"}`,
    badge: doc.zone ?? "Campo",
    href: `/monsters/${doc.id}`,
  }),
};

const SKILL_TARGET: SearchTarget<SkillRecord> = {
  collection: "skills",
  kind: "skills",
  limit: 5,
  fields: ["name.english", "description.english"],
  build: (doc) => ({
    id: `skill-${doc.id}`,
    kind: "skills",
    title: resolveLocalizedText(doc.name, `Skill ${doc.id}`),
    description: resolveLocalizedText(doc.description, "").slice(0, 160),
    badge: (doc.levels?.[0]?.SkillType as string) ?? "Skill",
    href: `/skills/${doc.id}`,
  }),
};

const FORMULA_TARGET: SearchTarget<FormulaDefinitionRecord> = {
  collection: "formula_definitions",
  kind: "formulas",
  limit: 5,
  fields: ["name", "code"],
  build: (doc) => ({
    id: doc.name,
    kind: "formulas",
    title: doc.name,
    description: doc.code.split("\n").slice(0, 2).join(" "),
    badge: "CommonFun",
    href: `/formulas?focus=${encodeURIComponent(doc.name)}`,
  }),
};

const TARGETS = [ITEMS_TARGET, MONSTER_TARGET, SKILL_TARGET, FORMULA_TARGET];

export async function searchEverything(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  try {
    const db = await getDb();
    const regex = new RegExp(escapeRegex(trimmed), "i");
    const results: SearchResult[] = [];

    await Promise.all(
      TARGETS.map(async (target) => {
        const filter = {
          $or: target.fields.map((field) => ({ [field]: regex })),
        };
        const docs = await db.collection(target.collection).find(filter).limit(target.limit).toArray();
        docs.forEach((doc) => {
          results.push(target.build(JSON.parse(JSON.stringify(doc))));
        });
      }),
    );

    return results;
  } catch (error) {
    console.error("[search]", error);
    return [];
  }
}
