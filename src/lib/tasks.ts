// src/lib/tasks.ts

export const TASK_ORDER = [
  "soak",
  "sow",
  "spray",
  "blackout",
  "lights_on",
  "water",
  "harvest",
  "deliver",
] as const;

export type TaskType = (typeof TASK_ORDER)[number];

export const TASK_META: Record<
  TaskType,
  { label: string; emoji: string }
> = {
  soak: { label: "Soak", emoji: "🪣" },
  sow: { label: "Sow", emoji: "🌱" },
  spray: { label: "Spray", emoji: "🚿" },
  blackout: { label: "Blackout", emoji: "🌑" },
  lights_on: { label: "Lights On", emoji: "💡" },
  water: { label: "Water", emoji: "💧" },
  harvest: { label: "Harvest", emoji: "✂️" },
  deliver: { label: "Deliver", emoji: "🚚" },
};
