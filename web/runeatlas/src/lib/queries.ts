import path from "node:path";
import { promises as fs } from "node:fs";
import { Db, Filter, Sort } from "mongodb";
import { getDb } from "./db";
import {
  CARD_SLOT_MAP,
  EQUIPMENT_SLOT_MAP,
  getCardSlotByType,
  getEquipmentSlotByType,
  ITEM_CATEGORIES,
} from "./item-taxonomy";
import { escapeRegex, resolveLocalizedText } from "./utils";
import {
  BuffRecord,
  BundleSnapshot,
  FormulaDefinitionRecord,
  FormulaUsageRecord,
  ItemRecord,
  LocalizedMap,
  MonsterRecord,
  SkillRecord,
} from "./types";

type Dictionary<T> = Record<string, T>;

const DATASET_BASE_DIR = path.resolve(process.cwd(), "..", "..", "exports", "datasets");
const FORMULA_DATASET_CACHE = new Map<string, Map<string, string> | null>();
const BUFF_DATASET_CACHE = new Map<string, Map<number, Record<string, unknown>> | null>();
const PLACEHOLDER_TOKEN_PREFIX = "##";

async function readDatasetFile<T>(datasetTag: string, fileName: string): Promise<T | null> {
  const filePath = path.join(DATASET_BASE_DIR, datasetTag, fileName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[dataset] Unable to read ${fileName} for ${datasetTag}: ${(error as Error).message}`);
    return null;
  }
}

async function getFormulaMapForTag(datasetTag: string): Promise<Map<string, string> | null> {
  if (FORMULA_DATASET_CACHE.has(datasetTag)) {
    return FORMULA_DATASET_CACHE.get(datasetTag) ?? null;
  }
  const data = await readDatasetFile<{ formulas?: Array<{ name?: string; code?: string }> }>(
    datasetTag,
    "formula_definitions.json",
  );
  if (!data?.formulas) {
    FORMULA_DATASET_CACHE.set(datasetTag, null);
    return null;
  }
  const map = new Map<string, string>();
  for (const entry of data.formulas) {
    if (entry?.name && typeof entry.code === "string") {
      map.set(entry.name, entry.code);
    }
  }
  FORMULA_DATASET_CACHE.set(datasetTag, map);
  return map;
}

async function getBuffMapForTag(datasetTag: string): Promise<Map<number, Record<string, unknown>> | null> {
  if (BUFF_DATASET_CACHE.has(datasetTag)) {
    return BUFF_DATASET_CACHE.get(datasetTag) ?? null;
  }
  const data = await readDatasetFile<{ buffs?: Array<{ id?: number; raw?: Record<string, unknown> }> }>(
    datasetTag,
    "buffs.json",
  );
  if (!data?.buffs) {
    BUFF_DATASET_CACHE.set(datasetTag, null);
    return null;
  }
  const map = new Map<number, Record<string, unknown>>();
  for (const entry of data.buffs) {
    if (typeof entry?.id === "number") {
      map.set(entry.id, entry.raw ?? (entry as Record<string, unknown>));
    }
  }
  BUFF_DATASET_CACHE.set(datasetTag, map);
  return map;
}

async function findPreviousDatasetTag(db: Db, currentTag?: string | null): Promise<string | null> {
  const docs = await db
    .collection<BundleSnapshot>("bundles")
    .find({}, { projection: { dataset_tag: 1, extracted_at: 1 } })
    .sort({ extracted_at: -1 })
    .toArray();
  if (!docs.length) {
    return null;
  }
  if (!currentTag) {
    return docs.length > 1 ? docs[1].dataset_tag : null;
  }
  const currentIndex = docs.findIndex((doc) => doc.dataset_tag === currentTag);
  if (currentIndex >= 0 && currentIndex < docs.length - 1) {
    return docs[currentIndex + 1].dataset_tag;
  }
  return null;
}

export function cleanDocs<T>(docs: T[]): T[] {
  return docs.map((doc) => JSON.parse(JSON.stringify(doc)));
}

function hasDescriptionBlock(map?: LocalizedMap | null): boolean {
  if (!map) {
    return false;
  }
  return Object.values(map).some((entry) => typeof entry === "string" && entry.trim().length > 0);
}

async function findSkillChainHead(db: Db, skill: SkillRecord): Promise<SkillRecord> {
  let current = skill;
  const visited = new Set<number>();
  while (current) {
    const previous = await db
      .collection<SkillRecord>("skills")
      .findOne({ "levels.NextID": current.id }, { projection: { levels: 1, id: 1, name: 1, icon: 1 } });
    if (!previous || visited.has(previous.id)) {
      break;
    }
    current = previous;
    visited.add(previous.id);
  }
  return current;
}

async function collectSkillChainLevels(
  db: Db,
  head: SkillRecord,
): Promise<{ levels: Array<Record<string, unknown>>; chainIds: number[] }> {
  const visitedSkills = new Set<number>();
  const levelMap = new Map<number, Record<string, unknown>>();
  const chainIds: number[] = [];
  let current: SkillRecord | null = head;

  const preferCandidate = (existing?: Record<string, unknown>, candidate?: Record<string, unknown>) => {
    if (!candidate) {
      return false;
    }
    if (!existing) {
      return true;
    }
    const candidateName = String((candidate as { NameZh?: string }).NameZh ?? "");
    const existingName = String((existing as { NameZh?: string }).NameZh ?? "");
    if (existingName.startsWith(PLACEHOLDER_TOKEN_PREFIX) && !candidateName.startsWith(PLACEHOLDER_TOKEN_PREFIX)) {
      return true;
    }
    return false;
  };

  while (current && !visitedSkills.has(current.id)) {
    chainIds.push(current.id);
    const levels: Array<Record<string, unknown>> = Array.isArray(current.levels) ? current.levels : [];
    for (const level of levels) {
      const levelNumber = (level as { Level?: number }).Level;
      const key = typeof levelNumber === "number" ? levelNumber : levelMap.size + 1;
      if (!levelMap.has(key) || preferCandidate(levelMap.get(key), level)) {
        levelMap.set(key, level);
      }
    }
    visitedSkills.add(current.id);
    const nextId = levels
      .flatMap((entry) => {
        const withNext = entry as { NextID?: number; NextBreakID?: number };
        return [withNext.NextID, withNext.NextBreakID];
      })
      .find((id) => typeof id === "number" && id > 0 && !visitedSkills.has(id));
    if (!nextId) {
      break;
    }
    current = await db.collection<SkillRecord>("skills").findOne({ id: nextId });
  }

  const orderedLevels = Array.from(levelMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, level]) => level);

  return { levels: orderedLevels, chainIds };
}

export async function getCollectionCounts() {
  try {
    const db = await getDb();
    const monsterFilter: Filter<MonsterRecord> = { level: { $ne: null } as never };
    const [items, monsters, skills, formulas] = await Promise.all([
      db.collection("items").estimatedDocumentCount(),
      db.collection<MonsterRecord>("monsters").countDocuments(monsterFilter),
      db.collection("skills").estimatedDocumentCount(),
      db.collection("formula_definitions").estimatedDocumentCount(),
    ]);
    const latest = await db
      .collection("items")
      .find({}, { projection: { extracted_at: 1 } })
      .sort({ extracted_at: -1 })
      .limit(1)
      .toArray();

    const sections = [
      { key: "items", label: "Items", count: items, href: "/items" },
      { key: "monsters", label: "Monsters", count: monsters, href: "/monsters" },
      { key: "skills", label: "Skills", count: skills, href: "/skills" },
      { key: "formulas", label: "Formulas", count: formulas, href: "/formulas" },
    ];

    return {
      stats: sections,
      extractedAt: latest[0]?.extracted_at ?? null,
    };
  } catch (error) {
    console.error("[counts]", error);
    return {
      stats: [],
      extractedAt: null,
      error: (error as Error).message,
    };
  }
}

type ItemQueryOptions = {
  category?: string;
  slot?: string;
  query?: string;
  limit?: number;
  page?: number;
};

export async function getItemsDataset(options: ItemQueryOptions) {
  try {
    const filter: Filter<ItemRecord> = {};
    const limit = Math.min(options.limit ?? 48, 96);
    const page = Math.max(options.page ?? 1, 1);
    const db = await getDb();

    if (options.category && ITEM_CATEGORIES.some((cat) => cat.key === options.category)) {
      filter.category = options.category;
    }

    let slotDefinition:
      | (typeof EQUIPMENT_SLOT_MAP[number])
      | (typeof CARD_SLOT_MAP[number])
      | undefined;
    if (options.slot && filter.category) {
      if (filter.category === "cards") {
        slotDefinition = CARD_SLOT_MAP.find((slot) => slot.key === options.slot);
      } else if (filter.category === "equipment") {
        slotDefinition = EQUIPMENT_SLOT_MAP.find((slot) => slot.key === options.slot);
      }
      if (slotDefinition) {
        filter.type = { $in: slotDefinition.typeCodes };
      }
    }

    if (options.query) {
      const regex = new RegExp(escapeRegex(options.query), "i");
      filter.$or = [{ "name.english": regex }, { "name.portuguese": regex }, { name_token: regex }];
    }

    const cursor = db
      .collection<ItemRecord>("items")
      .find(filter)
      .sort({ id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const [items, total] = await Promise.all([
      cursor.toArray(),
      db.collection<ItemRecord>("items").countDocuments(filter as Filter<ItemRecord>),
    ]);

    return {
      items: cleanDocs(items),
      total,
      slotDefinition,
    };
  } catch (error) {
    console.error("[items]", error);
    return {
      items: [],
      total: 0,
      error: (error as Error).message,
    };
  }
}

type MonsterQueryOptions = {
  race?: string;
  nature?: string;
  minLevel?: number;
  maxLevel?: number;
  query?: string;
};

export async function getMonstersDataset(options: MonsterQueryOptions) {
  try {
    const filter: Filter<MonsterRecord> = { level: { $ne: null } as never };
    if (options.race) {
      filter.race = options.race;
    }
    if (options.nature) {
      filter.nature = options.nature;
    }
    if (options.minLevel || options.maxLevel) {
      filter.level = {};
      if (options.minLevel) {
        filter.level.$gte = options.minLevel;
      }
      if (options.maxLevel) {
        filter.level.$lte = options.maxLevel;
      }
    }
    if (options.query) {
      const regex = new RegExp(escapeRegex(options.query), "i");
      filter.$or = [{ "name.english": regex }, { "name.portuguese": regex }];
    }

    const db = await getDb();
    const cursor = db.collection<MonsterRecord>("monsters").find(filter).sort({ level: -1 }).limit(60);
    const [monsters, total, races, natures] = await Promise.all([
      cursor.toArray(),
      db.collection<MonsterRecord>("monsters").countDocuments(filter as Filter<MonsterRecord>),
      db.collection("monsters").distinct("race"),
      db.collection("monsters").distinct("nature"),
    ]);
    return {
      monsters: cleanDocs(monsters),
      total,
      races: (races.filter(Boolean) as string[]).sort(),
      natures: (natures.filter(Boolean) as string[]).sort(),
    };
  } catch (error) {
    console.error("[monsters]", error);
    return { monsters: [], total: 0, races: [], natures: [], error: (error as Error).message };
  }
}

export type MonsterDetail = {
  monster: MonsterRecord;
  drops: Array<{ id: number; title: string; category?: string; description?: string }>;
  transformSkills: Array<{ id: number; title: string }>;
  copySkill: { id: number; title: string } | null;
};

export async function getMonsterById(id: number): Promise<MonsterDetail | null> {
  const db = await getDb();
  const monster = await db.collection<MonsterRecord>("monsters").findOne({ id });
  if (!monster) {
    return null;
  }

  const rewards = Array.isArray(monster.rewards)
    ? monster.rewards.filter((entry): entry is number => typeof entry === "number")
    : [];

  let drops: MonsterDetail["drops"] = [];
  if (rewards.length) {
    const items = await db.collection<ItemRecord>("items").find({ id: { $in: rewards } }).toArray();
    drops = items.map((item) => ({
      id: item.id,
      title: resolveLocalizedText(item.name, item.name_token ?? `Item ${item.id}`),
      category: item.category,
      description: resolveLocalizedText(item.description, item.description_token ?? ""),
    }));
  }

  const raw = (monster.raw ?? {}) as Record<string, unknown>;
  const transformSkillIds = Array.isArray(raw?.Transform_Skill)
    ? (raw.Transform_Skill as Array<number | string>).map((value) => Number(value)).filter((value) => !Number.isNaN(value))
    : [];
  const copySkillId = raw?.CopySkill ? Number(raw.CopySkill) : undefined;
  const skillIds = Array.from(new Set([...transformSkillIds, copySkillId].filter((value): value is number => typeof value === "number" && !Number.isNaN(value))));

  let transformSkills: MonsterDetail["transformSkills"] = [];
  let copySkill: MonsterDetail["copySkill"] = null;

  if (skillIds.length) {
    const skillDocs = await db.collection<SkillRecord>("skills").find({ id: { $in: skillIds } }).toArray();
    const skillMap = new Map(skillDocs.map((skill) => [skill.id, skill]));

    transformSkills = transformSkillIds.map((skillId) => {
      const skill = skillMap.get(skillId);
      return {
        id: skillId,
        title: resolveLocalizedText(skill?.name, skill?.name_token ?? `Skill ${skillId}`),
      };
    });

    if (copySkillId) {
      const skill = skillMap.get(copySkillId);
      copySkill = {
        id: copySkillId,
        title: resolveLocalizedText(skill?.name, skill?.name_token ?? `Skill ${copySkillId}`),
      };
    }
  }

  return {
    monster: JSON.parse(JSON.stringify(monster)),
    drops: drops.map((entry) => JSON.parse(JSON.stringify(entry))),
    transformSkills,
    copySkill,
  };
}

type SkillQueryOptions = {
  skillType?: string;
  query?: string;
  limit?: number;
  page?: number;
};

export async function getSkillsDataset(options: SkillQueryOptions) {
  try {
    const filter: Filter<SkillRecord> = {};
    if (options.skillType) {
      filter["levels.SkillType" as keyof SkillRecord] = options.skillType as never;
    }
    if (options.query) {
      const regex = new RegExp(escapeRegex(options.query), "i");
      filter.$or = [{ "name.english": regex }, { "description.english": regex }];
    }
    const db = await getDb();
    const limit = Math.min(options.limit ?? 60, 120);
    const page = Math.max(options.page ?? 1, 1);
    const groupKeyStage: Record<string, unknown> = {
      $addFields: {
        groupKey: {
          $ifNull: [
            { $cond: [{ $ne: ["$name_token", ""] }, "$name_token", null] },
            {
              $ifNull: [
                { $cond: [{ $ne: ["$name.english", ""] }, "$name.english", null] },
                { $toString: "$id" },
              ],
            },
          ],
        },
      },
    };
    const aggregationBase: Array<Record<string, unknown>> = [
      { $match: filter },
      groupKeyStage,
      {
        $group: {
          _id: "$groupKey",
          representative: { $first: "$$ROOT" },
          ids: { $addToSet: "$id" },
          levelCount: { $sum: 1 },
          minId: { $min: "$id" },
        },
      },
    ];
    const pipeline = [
      ...aggregationBase,
      { $sort: { minId: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];
    type SkillGroupDoc = {
      _id: string;
      representative: SkillRecord;
      ids: number[];
      levelCount: number;
    };
    const grouped = await db
      .collection<SkillRecord>("skills")
      .aggregate<SkillGroupDoc>(pipeline)
      .toArray();
    const skills = grouped.map((entry) => {
      const representative = entry.representative ?? ({} as SkillRecord);
      const sortedIds = [...(entry.ids ?? [])].sort((a, b) => a - b);
      return {
        ...representative,
        group_key: entry._id,
        grouped_ids: sortedIds,
        grouped_levels: entry.levelCount,
      };
    });
    const totalAgg = await db
      .collection<SkillRecord>("skills")
      .aggregate<{ count: number }>([...aggregationBase, { $count: "count" }])
      .toArray();
    const total = totalAgg[0]?.count ?? 0;
    const skillTypes = await db.collection<SkillRecord>("skills").distinct("levels.SkillType");
    return {
      skills: cleanDocs(skills),
      total,
      skillTypes: (skillTypes.filter(Boolean) as string[]).sort(),
    };
  } catch (error) {
    console.error("[skills]", error);
    return { skills: [], total: 0, skillTypes: [], error: (error as Error).message };
  }
}

export type FormulaCatalogResult = {
  definitions: FormulaDefinitionRecord[];
  usageMap: Dictionary<FormulaUsageRecord>;
  error?: string;
};

export async function getFormulaCatalog(nameQuery?: string, codeQuery?: string): Promise<FormulaCatalogResult> {
  try {
    const db = await getDb();
    const filter: Filter<FormulaDefinitionRecord> = {};
    const conditions: Filter<FormulaDefinitionRecord>[] = [];

    if (nameQuery) {
      const nameRegex = new RegExp(escapeRegex(nameQuery), "i");
      conditions.push({ name: nameRegex });
    }

    if (codeQuery) {
      const codeRegex = new RegExp(escapeRegex(codeQuery), "i");
      conditions.push({ code: codeRegex });
    }

    if (conditions.length > 0) {
      filter.$and = conditions;
    }

    // Use aggregation to sort and limit on the DB side
    const pipeline: any[] = [
      { $match: filter },
      {
        $addFields: {
          hasDiff: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$code_diff", ""] } }, 0] },
              1,
              0
            ]
          }
        }
      },
      {
        $sort: {
          hasDiff: -1,
          extracted_at: -1,
          name: 1
        }
      },
      { $limit: 80 }
    ];

    const definitionDocs = await db
      .collection<FormulaDefinitionRecord>("formula_definitions")
      .aggregate<FormulaDefinitionRecord>(pipeline)
      .toArray();

    // Only fetch usages for the formulas we are actually returning
    const names = definitionDocs.map(d => d.name);
    const usageDocs = await db.collection<FormulaUsageRecord>("formula_usages")
      .find({ formula: { $in: names } })
      .toArray();

    const usageMap: Dictionary<FormulaUsageRecord> = {};
    for (const usage of usageDocs) {
      usageMap[usage.formula] = JSON.parse(JSON.stringify(usage));
    }

    return {
      definitions: cleanDocs(definitionDocs),
      usageMap,
    };
  } catch (error) {
    console.error("[Formulas]", error);
    return { definitions: [], usageMap: {} as Dictionary<FormulaUsageRecord>, error: (error as Error).message };
  }
}

export async function getItemById(id: number) {
  const db = await getDb();
  const item = await db.collection<ItemRecord>("items").findOne({ id });
  if (!item) {
    return null;
  }
  return JSON.parse(JSON.stringify(item)) as ItemRecord;
}

export function describeItem(item: ItemRecord): { title: string; description: string; meta: string } {
  const title = resolveLocalizedText(item.name, item.name_token ?? "Sem nome");
  const description = resolveLocalizedText(item.description, item.description_token ?? "");
  const slot =
    item.category === "cards"
      ? getCardSlotByType(item.type)?.label
      : item.category === "equipment"
        ? getEquipmentSlotByType(item.type)?.label
        : undefined;
  const meta = [item.category, slot].filter(Boolean).join(" · ");
  return { title, description, meta };
}

export async function getBundleHistory(limit = 12) {
  try {
    const db = await getDb();
    const pipeline = [
      { $sort: { extracted_at: -1, dataset_tag: -1 } },
      { $limit: limit },
      {
        $project: {
          dataset_tag: 1,
          extracted_at: 1,
          bundle_count: 1,
          diff_summary: {
            previous_tag: {
              $ifNull: ["$diff_summary.previous_tag", "$diff.previous_tag"],
            },
            added: {
              $ifNull: ["$diff_summary.added", { $size: { $ifNull: ["$diff.added", []] } }],
            },
            removed: {
              $ifNull: ["$diff_summary.removed", { $size: { $ifNull: ["$diff.removed", []] } }],
            },
            changed: {
              $ifNull: ["$diff_summary.changed", { $size: { $ifNull: ["$diff.changed", []] } }],
            },
          },
        },
      },
    ];
    const docs = await db.collection<BundleSnapshot>("bundles").aggregate(pipeline).toArray();
    return {
      history: cleanDocs(docs),
    };
  } catch (error) {
    console.error("[bundles]", error);
    return {
      history: [],
      error: (error as Error).message,
    };
  }
}

export async function getSkillDetails(skillId: number) {
  try {
    const db = await getDb();
    const baseSkill = await db.collection<SkillRecord>("skills").findOne({ id: skillId });
    if (!baseSkill) {
      return {
        skill: null,
        formulas: [],
        formulaDefinitions: [],
        buffs: [],
        datasetTag: null,
        previousDatasetTag: null,
        previousFormulas: {},
        previousBuffs: {},
        error: "Skill not found",
      };
    }

    const headSkill = await findSkillChainHead(db, baseSkill);
    const cleanSkill = cleanDocs([headSkill])[0];
    const datasetTag = headSkill.dataset_tag ?? null;

    const { levels: aggregatedLevels, chainIds } = await collectSkillChainLevels(db, headSkill);
    const normalizedLevels = cleanDocs(aggregatedLevels);
    cleanSkill.levels = normalizedLevels;
    cleanSkill.grouped_ids = chainIds;
    cleanSkill.grouped_levels = normalizedLevels.length;
    cleanSkill.group_key = cleanSkill.name_token ?? cleanSkill.name?.english ?? String(cleanSkill.id);

    if (!hasDescriptionBlock(cleanSkill.description)) {
      const fallbackDescription = await db
        .collection<SkillRecord>("skills")
        .findOne({
          "name.english": cleanSkill.name?.english ?? null,
          "description.english": { $nin: [null, ""] },
        })
        .catch(() => null);
      if (fallbackDescription?.description) {
        cleanSkill.description = fallbackDescription.description;
        cleanSkill.description_token = fallbackDescription.description_token;
      }
    }

    const levelIds = normalizedLevels
      .map((level: Record<string, unknown>) => {
        const levelId = (level as { id?: number }).id;
        return typeof levelId === "number" ? levelId : null;
      })
      .filter((value): value is number => typeof value === "number");

    const formulaFilter: Filter<FormulaUsageRecord> =
      levelIds.length > 0
        ? ({ "usages.level_id": { $in: levelIds } } as Filter<FormulaUsageRecord>)
        : ({ "usages.level_id": cleanSkill.id } as Filter<FormulaUsageRecord>);
    if (datasetTag) {
      (formulaFilter as { dataset_tag: string }).dataset_tag = datasetTag;
    }

    const formulas = await db
      .collection<FormulaUsageRecord>("formula_usages")
      .find(formulaFilter)
      .sort({ formula: 1 } as Sort)
      .toArray();

    const formulaNames = Array.from(new Set(formulas.map((entry) => entry.formula))).filter(
      (value): value is string => typeof value === "string",
    );

    const buffIds = new Set<number>();
    const relatedSkillIds = new Set<number>();
    // Buffs referenced by formulas
    for (const record of formulas) {
      for (const usage of record.usages ?? []) {
        if (typeof usage.buff_id === "number") {
          buffIds.add(usage.buff_id);
        }
      }
      for (const group of record.usage_groups ?? []) {
        for (const entry of group.levels ?? []) {
          if (typeof entry.buff_id === "number") {
            buffIds.add(entry.buff_id);
          }
        }
      }
    }
    // Buffs attached directly on skill levels (Buff / Pvp_buff)
    for (const level of normalizedLevels) {
      const sources = [level?.Buff, level?.Pvp_buff];
      for (const src of sources) {
        if (!src || typeof src !== "object") continue;
        for (const buffList of Object.values(src)) {
          if (!Array.isArray(buffList)) continue;
          for (const entry of buffList) {
            const bid = typeof entry === "number" ? entry : (entry as any)?.id;
            if (typeof bid === "number") {
              buffIds.add(bid);
            }
          }
        }
      }
    }

    // Load formula dependency docs to pick up extra buff/skill refs from code (HasBuffID, GetLernedSkillLevel, etc.)
    const dependencyDocs = formulaNames.length
      ? await db
          .collection("formula_dependencies")
          .find({
            name: { $in: formulaNames },
            ...(datasetTag ? { dataset_tag: datasetTag } : {}),
          })
          .toArray()
      : [];

    for (const dep of dependencyDocs) {
      const deps = (dep as any)?.dependencies?.dependencies || {};
      if (Array.isArray(deps.buffs)) {
        deps.buffs.forEach((id: any) => {
          if (typeof id === "number") buffIds.add(id);
        });
      }
      if (Array.isArray(deps.skills)) {
        deps.skills.forEach((id: any) => {
          if (typeof id === "number") relatedSkillIds.add(id);
        });
      }
    }

    const [definitionDocs, buffDocs, relatedSkillDocs, previousDatasetTag] = await Promise.all([
      formulaNames.length
        ? db
            .collection<FormulaDefinitionRecord>("formula_definitions")
            .find({ name: { $in: formulaNames } })
            .toArray()
        : Promise.resolve([]),
      buffIds.size
        ? db
            .collection<BuffRecord>("buffs")
            .find({ id: { $in: Array.from(buffIds) } })
            .toArray()
        : Promise.resolve([]),
      relatedSkillIds.size
        ? db
            .collection<SkillRecord>("skills")
            .find({ id: { $in: Array.from(relatedSkillIds).filter((id) => id !== skillId) } })
            .project({ id: 1, name: 1 })
            .toArray()
        : Promise.resolve([]),
      findPreviousDatasetTag(db, datasetTag),
    ]);

    const previousFormulas: Record<string, string> = {};
    const previousBuffs: Record<number, Record<string, unknown>> = {};

    if (previousDatasetTag) {
      const [previousFormulaMap, previousBuffMap] = await Promise.all([
        getFormulaMapForTag(previousDatasetTag),
        buffIds.size ? getBuffMapForTag(previousDatasetTag) : Promise.resolve(null),
      ]);

      if (previousFormulaMap) {
        for (const name of formulaNames) {
          const entry = previousFormulaMap.get(name);
          if (typeof entry === "string") {
            previousFormulas[name] = entry;
          }
        }
      }

      if (previousBuffMap) {
        for (const id of buffIds) {
          const prevBuff = previousBuffMap.get(id);
          if (prevBuff) {
            previousBuffs[id] = prevBuff;
          }
        }
      }
    }

    return {
      skill: cleanSkill,
      formulas: cleanDocs(formulas),
      formulaDefinitions: cleanDocs(definitionDocs),
      buffs: cleanDocs(buffDocs),
      relatedSkills: cleanDocs(relatedSkillDocs),
      datasetTag,
      previousDatasetTag: previousDatasetTag ?? null,
      previousFormulas,
      previousBuffs,
    };
  } catch (error) {
    console.error("[skill-details]", error);
    return {
      skill: null,
      formulas: [],
      formulaDefinitions: [],
      buffs: [],
      relatedSkills: [],
      datasetTag: null,
      previousDatasetTag: null,
      previousFormulas: {},
      previousBuffs: {},
      error: (error as Error).message,
    };
  }
}
let formulaDependencyMap: Record<string, {
  dependencies: { formulas: string[]; skills: number[]; buffs: number[] };
  dependents: string[];
}> | null = null;

async function loadFormulaDependencyMap(datasetTag?: string | null): Promise<Record<string, {
  dependencies: { formulas: string[]; skills: number[]; buffs: number[] };
  dependents: string[];
}> | null> {
  if (formulaDependencyMap && !datasetTag) {
    return formulaDependencyMap;
  }

  try {
    const db = await getDb();

    // If no dataset tag provided, get the latest one
    let targetTag = datasetTag;
    if (!targetTag) {
      const latestSnapshot = await db.collection("_meta_snapshots").findOne({ _id: "latest" as any });
      if (latestSnapshot?.dataset_tag) {
        targetTag = latestSnapshot.dataset_tag;
      } else {
        // Fallback: get the most recent dependency map
        const allMaps = await db.collection("formula_dependencies").find({}).sort({ dataset_tag: -1 }).limit(1).toArray();
        if (allMaps.length > 0) {
          targetTag = allMaps[0].dataset_tag;
        }
      }
    }

    if (!targetTag) {
      console.error("[formula-dependencies]", "No dataset tag available");
      return null;
    }

    // Load ALL formula dependency documents for this dataset
    const dependencyDocs = await db.collection("formula_dependencies").find({ dataset_tag: targetTag }).toArray();

    if (!dependencyDocs || dependencyDocs.length === 0) {
      console.error("[formula-dependencies]", `No dependency documents found for dataset ${targetTag}`);
      return null;
    }



    // Build the map from the documents
    const map: Record<string, {
      dependencies: { formulas: string[]; skills: number[]; buffs: number[] };
      dependents: string[];
    }> = {};

    for (const doc of dependencyDocs) {
      const docAny = doc as any;
      if (docAny.name && docAny.dependencies) {
        // Handle dependents - it can be an object with formulas array or a direct array
        let dependentsList: string[] = [];
        if (docAny.dependents) {
          if (Array.isArray(docAny.dependents)) {
            dependentsList = docAny.dependents;
          } else if (docAny.dependents.formulas && Array.isArray(docAny.dependents.formulas)) {
            dependentsList = docAny.dependents.formulas;
          }
        }

        // The structure is:
        // dependencies.dependencies.formulas
        // dependencies.dependencies.skills
        // dependencies.dependencies.buffs
        const innerDeps = docAny.dependencies.dependencies || {};

        map[docAny.name] = {
          dependencies: {
            formulas: Array.isArray(innerDeps.formulas) ? innerDeps.formulas : [],
            skills: Array.isArray(innerDeps.skills) ? innerDeps.skills : [],
            buffs: Array.isArray(innerDeps.buffs) ? innerDeps.buffs : []
          },
          dependents: dependentsList
        };


      }
    }



    formulaDependencyMap = map;
    return formulaDependencyMap;
  } catch (error) {
    console.error("[formula-dependencies]", "Failed to load dependency map:", error);
    return null;
  }
}

export async function getFormulaDetails(formulaName: string, targetTag?: string) {
  try {
    const db = await getDb();

    // Fetch all versions of this formula (sorted desc by extracted_at)
    const formulaCursor = db.collection<FormulaDefinitionRecord>("formula_definitions").find({ name: formulaName }).sort({ extracted_at: -1 });
    const allVersions = await formulaCursor.toArray();

    let formula = allVersions[0] || null;
    if (targetTag && allVersions.length > 0) {
      const selected = allVersions.find(v => v.dataset_tag === targetTag);
      if (selected) {
        formula = selected;
      }
    }

    if (!formula) {
      return {
        formula: null,
        usage: null,
        dependencies: null,
        datasetTag: null,
        previousDatasetTag: null,
        previousCode: null,
        diffCurrentCode: null,
        history: [],
        error: "Formula not found",
      };
    }


    const cleanFormula = cleanDocs([formula])[0];
    const datasetTag = (formula as { dataset_tag?: string }).dataset_tag ?? null;

    // Handle version history from the embedded versions array
    let history: Array<{ dataset_tag: string; extracted_at: string | Date }> = [];
    const formulaVersions = (formula as any).versions;

    if (Array.isArray(formulaVersions)) {
      history = formulaVersions.map((v: any) => ({
        dataset_tag: v.dataset_tag,
        extracted_at: v.extracted_at
      }));

      // Add the current version to history if not already there
      if (formula.dataset_tag && !history.some(h => h.dataset_tag === formula.dataset_tag)) {
        history.unshift({
          dataset_tag: formula.dataset_tag,
          extracted_at: formula.extracted_at || new Date()
        });
      }
    } else if (allVersions.length > 1) {
      // Fallback: use DB documents
      history = allVersions
        .filter(v => v.dataset_tag)
        .map(v => ({
          dataset_tag: v.dataset_tag as string,
          extracted_at: v.extracted_at || new Date()
        }));
    }

    // Smart Diff Logic: Find the last version where code actually changed
    const getCode = (v: any) => v.code || (v.payload && v.payload.code) || "";
    const getTag = (v: any) => v.dataset_tag;

    let versionsList: any[] = [];
    if (Array.isArray(formulaVersions) && formulaVersions.length > 0) {
      versionsList = formulaVersions;
      if (formula.dataset_tag && !versionsList.some(v => v.dataset_tag === formula.dataset_tag)) {
        versionsList = [{ dataset_tag: formula.dataset_tag, payload: { code: formula.code }, extracted_at: formula.extracted_at }, ...versionsList];
      }
    } else {
      versionsList = allVersions;
    }

    let compareVersion = null;
    let compareTag = null;
    let diffCurrentCode = formula.code;

    if (versionsList.length > 1) {
      const effectiveTargetTag = targetTag || datasetTag;
      let startIndex = 0;

      if (effectiveTargetTag) {
        startIndex = versionsList.findIndex(v => getTag(v) === effectiveTargetTag);
        if (startIndex === -1) startIndex = 0;
      }

      for (let i = startIndex; i < versionsList.length - 1; i++) {
        const currentV = versionsList[i];
        const nextV = versionsList[i + 1];

        const currentCode = getCode(currentV);
        const nextCode = getCode(nextV);

        if (currentCode !== nextCode) {
          compareVersion = nextV;
          compareTag = getTag(nextV);
          diffCurrentCode = currentCode;
          break;
        }
      }
    }

    const previousCode = compareVersion ? getCode(compareVersion) : null;
    const previousDatasetTag = compareTag;

    return {
      formula: cleanFormula,
      datasetTag,
      previousDatasetTag: previousDatasetTag ?? null,
      previousCode,
      diffCurrentCode,
      history,
      error: null,
    };
  } catch (error) {
    console.error("[formula-details]", error);
    return {
      formula: null,
      usage: null,
      dependencies: null,
      datasetTag: null,
      previousDatasetTag: null,
      previousCode: null,
      diffCurrentCode: null,
      history: [],
      error: (error as Error).message,
    };
  }
}

export async function getBundleDetails(datasetTag: string, bundlePath: string) {
  try {
    const db = await getDb();
    const entry = await db.collection("bundle_assets").findOne({ dataset_tag: datasetTag, path: bundlePath });
    if (!entry) {
      return { entry: null, error: "Bundle snapshot not found." };
    }
    return { entry: cleanDocs([entry])[0] };
  } catch (error) {
    console.error("[bundle-details]", error);
    return { entry: null, error: (error as Error).message };
  }
}


