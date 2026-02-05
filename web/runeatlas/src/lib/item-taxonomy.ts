type SlotDefinition = {
  key: string;
  label: string;
  description: string;
  typeCodes: number[];
};

export const ITEM_CATEGORIES = [
  { key: "equipment", label: "Equipment" },
  { key: "cards", label: "Cards" },
  { key: "consumables", label: "Consumables" },
  { key: "headgears", label: "Headgear" },
  { key: "furniture", label: "Housing" },
] as const;

const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, idx) => start + idx);

export const EQUIPMENT_SLOT_MAP: SlotDefinition[] = [
  {
    key: "weapon",
    label: "Weapons",
    description: "Spears, swords, bows and instrument variants.",
    typeCodes: [...range(450, 469)],
  },
  {
    key: "offhand",
    label: "Off-hand",
    description: "Shields, tomes and secondary tools.",
    typeCodes: [30, 510, 511, 515],
  },
  {
    key: "armor",
    label: "Armor",
    description: "Chest pieces and defensive suits.",
    typeCodes: [500, 501],
  },
  {
    key: "garment",
    label: "Garment",
    description: "Mantles and cloaks.",
    typeCodes: [520],
  },
  {
    key: "footgear",
    label: "Footgear",
    description: "Boots, greaves and shoes.",
    typeCodes: [530],
  },
  {
    key: "accessory",
    label: "Accessory",
    description: "Rings, bangles and pendants.",
    typeCodes: [512, 513, 514, 540, 541],
  },
  {
    key: "relic",
    label: "Artifacts",
    description: "Special relics focused on late-game growth.",
    typeCodes: [830, 840],
  },
];

export const CARD_SLOT_MAP: SlotDefinition[] = [
  {
    key: "weapon",
    label: "Weapon Card",
    description: "Fits into weapons and instruments.",
    typeCodes: [81],
  },
  {
    key: "armor",
    label: "Armor Card",
    description: "Standard armor sockets.",
    typeCodes: [82],
  },
  {
    key: "headgear",
    label: "Headgear Card",
    description: "Top / mid / lower headgear slots.",
    typeCodes: [83],
  },
  {
    key: "garment",
    label: "Garment Card",
    description: "Caped and mantle slots.",
    typeCodes: [84],
  },
  {
    key: "footgear",
    label: "Footgear Card",
    description: "Boot and shoe sockets.",
    typeCodes: [85],
  },
  {
    key: "accessory",
    label: "Accessory Card",
    description: "Rings, talismans and pendants.",
    typeCodes: [86],
  },
  {
    key: "special",
    label: "Special Card",
    description: "Shadow or alternate slots.",
    typeCodes: [87],
  },
];

const equipmentIndex = new Map<number, SlotDefinition>();
const cardIndex = new Map<number, SlotDefinition>();

for (const slot of EQUIPMENT_SLOT_MAP) {
  for (const code of slot.typeCodes) {
    equipmentIndex.set(code, slot);
  }
}

for (const slot of CARD_SLOT_MAP) {
  for (const code of slot.typeCodes) {
    cardIndex.set(code, slot);
  }
}

export function getEquipmentSlotByType(type?: number): SlotDefinition | undefined {
  if (typeof type !== "number") {
    return undefined;
  }
  return equipmentIndex.get(type);
}

export function getCardSlotByType(type?: number): SlotDefinition | undefined {
  if (typeof type !== "number") {
    return undefined;
  }
  return cardIndex.get(type);
}
