import { DoorType, WallType, WindowType } from "./types";

export interface ArchitecturalItemDef {
  id: string;
  category: "walls" | "doors" | "windows" | "fixtures";
  label: string;
  icon: string;
  description: string;
  defaultWidth?: number;
  defaultHeight?: number;
}

export const WALL_ITEMS: { type: WallType; label: string; icon: string; thickness: number; dashed?: boolean }[] = [
  { type: "exterior", label: "Exterior Wall", icon: "🧱", thickness: 10 },
  { type: "interior", label: "Interior Wall", icon: "▬", thickness: 5 },
  { type: "partition", label: "Partition Wall", icon: "┊", thickness: 3, dashed: true },
  { type: "double", label: "Double Wall", icon: "▌▐", thickness: 14 },
];

export const DOOR_ITEMS: { type: DoorType; label: string; icon: string; defaultWidth: number }[] = [
  { type: "hinged", label: "Hinged Door", icon: "🚪", defaultWidth: 60 },
  { type: "sliding", label: "Sliding Door", icon: "↔️", defaultWidth: 80 },
  { type: "folding", label: "Folding Door", icon: "📐", defaultWidth: 70 },
  { type: "pocket", label: "Pocket Door", icon: "▷", defaultWidth: 55 },
  { type: "double", label: "Double Door", icon: "🚪🚪", defaultWidth: 100 },
];

export const WINDOW_ITEMS: { type: WindowType; label: string; icon: string; defaultWidth: number }[] = [
  { type: "fixed", label: "Fixed Window", icon: "🪟", defaultWidth: 80 },
  { type: "sliding", label: "Sliding Window", icon: "⇄", defaultWidth: 90 },
  { type: "casement", label: "Casement Window", icon: "⤴", defaultWidth: 70 },
  { type: "bay", label: "Bay Window", icon: "⌂", defaultWidth: 120 },
];

export const FIXTURE_ITEMS: ArchitecturalItemDef[] = [
  { id: "staircase", category: "fixtures", label: "Stair Run", icon: "🪜", description: "Stair flight with direction arrow", defaultWidth: 120, defaultHeight: 50 },
  { id: "bed", category: "fixtures", label: "Double Bed", icon: "🛏️", description: "Standard double bed", defaultWidth: 75, defaultHeight: 90 },
  { id: "sofa", category: "fixtures", label: "Sofa", icon: "🛋️", description: "Multi-seat sofa", defaultWidth: 110, defaultHeight: 55 },
  { id: "table", category: "fixtures", label: "Dining Table", icon: "🪑", description: "Dining table set", defaultWidth: 80, defaultHeight: 80 },
  { id: "toilet", category: "fixtures", label: "Toilet", icon: "🚽", description: "Ceramic toilet", defaultWidth: 30, defaultHeight: 42 },
  { id: "bathtub", category: "fixtures", label: "Bathtub", icon: "🛁", description: "Standard bathtub", defaultWidth: 100, defaultHeight: 50 },
  { id: "shower", category: "fixtures", label: "Shower", icon: "🚿", description: "Shower enclosure", defaultWidth: 55, defaultHeight: 55 },
  { id: "sink", category: "fixtures", label: "Sink", icon: "🚰", description: "Basin / vanity sink", defaultWidth: 42, defaultHeight: 36 },
  { id: "stove", category: "fixtures", label: "Stove", icon: "🔥", description: "Cooktop / range", defaultWidth: 45, defaultHeight: 45 },
  { id: "cabinet", category: "fixtures", label: "Base Cabinet", icon: "🗄️", description: "Built-in base cupboard run", defaultWidth: 120, defaultHeight: 40 },
  { id: "wall_cabinet", category: "fixtures", label: "Wall Cabinet", icon: "📦", description: "Upper kitchen cabinet", defaultWidth: 100, defaultHeight: 28 },
  { id: "counter", category: "fixtures", label: "Counter", icon: "▬", description: "Countertop run", defaultWidth: 140, defaultHeight: 35 },
  { id: "island", category: "fixtures", label: "Island", icon: "🏝️", description: "Kitchen island", defaultWidth: 90, defaultHeight: 55 },
  { id: "fridge", category: "fixtures", label: "Fridge", icon: "🧊", description: "Refrigerator", defaultWidth: 40, defaultHeight: 55 },
  { id: "dishwasher", category: "fixtures", label: "Dishwasher", icon: "🫧", description: "Dishwasher", defaultWidth: 40, defaultHeight: 45 },
  { id: "washing_machine", category: "fixtures", label: "Washer", icon: "🧺", description: "Washing machine", defaultWidth: 40, defaultHeight: 45 },
  { id: "column", category: "fixtures", label: "Structural Column", icon: "⬛", description: "Load-bearing column", defaultWidth: 24, defaultHeight: 24 },
  { id: "balcony", category: "fixtures", label: "Balcony / Terrace", icon: "🌿", description: "External balcony or terrace space", defaultWidth: 90, defaultHeight: 55 },
  { id: "patio", category: "fixtures", label: "Patio / Deck", icon: "☀️", description: "Ground-level patio or deck", defaultWidth: 100, defaultHeight: 60 },
];

export function getWallStyle(type: WallType, themeMode: "blueprint" | "classic") {
  const item = WALL_ITEMS.find((w) => w.type === type) ?? WALL_ITEMS[1];
  const isExterior = type === "exterior" || type === "double";
  const color =
    themeMode === "blueprint"
      ? isExterior
        ? "stroke-indigo-400"
        : type === "partition"
        ? "stroke-slate-500"
        : "stroke-slate-400"
      : isExterior
      ? "stroke-slate-800"
      : type === "partition"
      ? "stroke-slate-500"
      : "stroke-slate-400";
  return { thickness: item.thickness, color, dashed: item.dashed ?? false };
}

const VALID_WALL_TYPES = new Set<WallType>(["exterior", "interior", "partition", "double"]);
const VALID_DOOR_TYPES = new Set<DoorType>(["hinged", "sliding", "folding", "pocket", "double"]);
const VALID_WINDOW_TYPES = new Set<WindowType>(["fixed", "sliding", "casement", "bay"]);

export function normalizeWallType(type: string | undefined): WallType {
  if (type && VALID_WALL_TYPES.has(type as WallType)) return type as WallType;
  if (type === "structural") return "exterior";
  return "interior";
}

export function normalizeDoorType(type: string | undefined): DoorType {
  if (type && VALID_DOOR_TYPES.has(type as DoorType)) return type as DoorType;
  const lower = type?.toLowerCase() ?? "";
  if (lower.includes("sliding") || lower.includes("glass") || lower.includes("patio") || lower.includes("french")) {
    return "sliding";
  }
  if (lower.includes("fold")) return "folding";
  if (lower.includes("pocket")) return "pocket";
  if (lower.includes("double")) return "double";
  return "hinged";
}

export function normalizeWindowType(type: string | undefined): WindowType {
  if (type && VALID_WINDOW_TYPES.has(type as WindowType)) return type as WindowType;
  return "fixed";
}

/** AI models return "horizontal", "vertical", "top" — app requires "h" | "v" */
export function normalizeOrientation(orientation: string | undefined): "h" | "v" {
  const o = orientation?.toLowerCase().trim() ?? "";
  if (o === "h" || o === "horizontal" || o === "top" || o === "bottom") return "h";
  if (o === "v" || o === "vertical" || o === "left" || o === "right") return "v";
  return "h";
}

export function normalizeSwing(swing: string | undefined): "n" | "s" | "e" | "w" {
  const s = swing?.toLowerCase().trim() ?? "";
  if (s === "n" || s === "north") return "n";
  if (s === "s" || s === "south") return "s";
  if (s === "e" || s === "east" || s === "right") return "e";
  if (s === "w" || s === "west" || s === "left") return "w";
  return "n";
}

export function getFixtureDefaultSize(type: string): { w: number; h: number } {
  const item = FIXTURE_ITEMS.find((f) => f.id === type);
  if (item?.defaultWidth && item?.defaultHeight) {
    return { w: item.defaultWidth, h: item.defaultHeight };
  }
  return { w: 60, h: 60 };
}
