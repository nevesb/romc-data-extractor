export type LocalizedMap = Record<string, string>;

export interface ItemRecord {
  _id?: string;
  id: number;
  type?: number;
  category?: string;
  name?: LocalizedMap;
  name_token?: string;
  description?: LocalizedMap;
  description_token?: string;
  raw?: Record<string, unknown>;
  extracted_at?: string;
}

export interface MonsterRecord {
  _id?: string;
  id: number;
  name?: LocalizedMap;
  name_token?: string;
  description?: LocalizedMap;
  description_token?: string;
  race?: string;
  nature?: string;
  zone?: string;
  class_type?: number;
  level?: number;
  stats?: Record<string, number>;
  rewards?: number[];
  raw?: Record<string, unknown>;
  extracted_at?: string;
}

export interface SkillRecord {
  _id?: string;
  id: number;
  name?: LocalizedMap;
  name_token?: string;
  description?: LocalizedMap;
  description_token?: string;
  icon?: string;
  levels?: Array<Record<string, unknown>>;
  extracted_at?: string;
  dataset_tag?: string;
  group_key?: string;
  grouped_ids?: number[];
  grouped_levels?: number;
}

export interface BuffRecord {
  _id?: string;
  id: number;
  name?: LocalizedMap;
  name_token?: string;
  description?: LocalizedMap;
  description_token?: string;
  buff_rate?: Record<string, unknown>;
  buff_effect?: Record<string, unknown>;
  buff_type?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface FormulaDefinitionRecord {
  _id?: string;
  name: string;
  code: string;
  code_diff?: string;
  extracted_at?: string;
  dataset_tag?: string;
  versions?: Array<{ dataset_tag?: string; extracted_at?: string }>;
}

export interface FormulaUsageEntry {
  level_id?: number;
  level?: number;
  skill_name?: string;
  skill_token?: string;
  category?: string;
  damage_params?: Record<string, unknown>;
  buff_id?: number;
  buff_target?: string;
  buff_source?: string;
}

export interface FormulaUsageGroup {
  key: string;
  skill_name?: string;
  skill_token?: string;
  level_ids?: number[];
  display_name?: string;
  levels?: FormulaUsageEntry[];
}

export interface FormulaUsageRecord {
  _id?: string;
  formula: string;
  type_id: number;
  category?: string;
  usages: FormulaUsageEntry[];
  usage_groups?: FormulaUsageGroup[];
  usage_skill_keys?: string[];
  usage_diff?: {
    added: string[];
    removed: string[];
  };
}

export interface BundleAsset {
  name: string;
  type?: string;
  path_id?: number;
  hash?: string | null;
}

export interface BundleEntry {
  path: string;
  checksum?: string | null;
  size?: number | null;
  asset_count?: number | null;
  assets?: BundleAsset[];
  diff?: {
    previous_tag?: string | null;
    added?: BundleAsset[];
    removed?: BundleAsset[];
    updated?: { previous: BundleAsset; current: BundleAsset }[];
  };
}

export interface BundleDiffSummary {
  previous_tag?: string | null;
  added?: number;
  removed?: number;
  changed?: number;
}

export interface BundleSnapshot {
  _id?: string;
  dataset_tag: string;
  extracted_at?: string;
  bundle_count: number;
  bundle_root?: string;
  bundles?: BundleEntry[];
  diff?: {
    previous_tag?: string | null;
    added?: string[];
    removed?: string[];
    changed?: string[];
  };
  diff_summary?: BundleDiffSummary;
}

export type SearchResult = {
  id: string;
  title: string;
  description: string;
  kind: "items" | "skills" | "monsters" | "formulas";
  href: string;
  badge?: string;
};
