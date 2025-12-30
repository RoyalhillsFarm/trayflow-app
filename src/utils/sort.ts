// src/utils/sort.ts
// Helper to sort any array of objects that have a `name` field (A → Z).

export type Named = { name: string };

export function sortByName<T extends Named>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
