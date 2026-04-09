import type { VerticalDefinition } from "./types";
import { hospitalityVertical } from "./hospitality/index";
import { ticketingVertical } from "./ticketing/index";
import { generalVertical } from "./general/index";

const verticals = new Map<string, VerticalDefinition>();

verticals.set("hospitality", hospitalityVertical);
verticals.set("hotel", hospitalityVertical);
verticals.set("hotels", hospitalityVertical);
verticals.set("lodging", hospitalityVertical);
verticals.set("accommodation", hospitalityVertical);

verticals.set("ticketing", ticketingVertical);
verticals.set("tickets", ticketingVertical);
verticals.set("events", ticketingVertical);
verticals.set("live events", ticketingVertical);

verticals.set("general", generalVertical);

/**
 * Resolve a vertical definition from a merchant industry string.
 * Falls back to "general" if the vertical is not recognized.
 */
export function resolve(industry?: string | null): VerticalDefinition {
  if (!industry) return generalVertical;
  const key = industry.toLowerCase().trim();
  return verticals.get(key) ?? generalVertical;
}

export function getVertical(id: string): VerticalDefinition | undefined {
  return verticals.get(id);
}

export function getAllVerticals(): VerticalDefinition[] {
  const seen = new Set<string>();
  const result: VerticalDefinition[] = [];
  for (const v of verticals.values()) {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      result.push(v);
    }
  }
  return result;
}

export function registerVertical(
  definition: VerticalDefinition,
  aliases?: string[],
): void {
  verticals.set(definition.id, definition);
  if (aliases) {
    for (const alias of aliases) {
      verticals.set(alias.toLowerCase(), definition);
    }
  }
}

export const verticalRegistry = {
  resolve,
  getVertical,
  getAllVerticals,
  registerVertical,
};
