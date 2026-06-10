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
  { id: "column", category: "fixtures", label: "Structural Column", icon: "⬛", description: "Load-bearing column", defaultWidth: 24, defaultHeight: 24 },
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
  return "hinged";
}

export function normalizeWindowType(type: string | undefined): WindowType {
  if (type && VALID_WINDOW_TYPES.has(type as WindowType)) return type as WindowType;
  return "fixed";
}

export function getFixtureDefaultSize(type: string): { w: number; h: number } {
  const item = FIXTURE_ITEMS.find((f) => f.id === type);
  if (item?.defaultWidth && item?.defaultHeight) {
    return { w: item.defaultWidth, h: item.defaultHeight };
  }
  return { w: 60, h: 60 };
}
