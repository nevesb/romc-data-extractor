const LANGUAGE_PRIORITY = ["english", "portuguese", "spanish", "german", "chinesesimplified"] as const;

export function resolveLocalizedText(
  map: Record<string, string> | undefined,
  fallback = "",
): string {
  if (!map) {
    return fallback;
  }
  for (const lang of LANGUAGE_PRIORITY) {
    if (map[lang]) {
      return map[lang];
    }
  }
  const [first] = Object.values(map);
  return first ?? fallback;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
