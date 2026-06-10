export type WallType = "exterior" | "interior" | "partition" | "double";

export type DoorType = "hinged" | "sliding" | "folding" | "pocket" | "double";

export type WindowType = "fixed" | "sliding" | "casement" | "bay";

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: WallType;
  bgImageId?: string;
}

export interface Door {
  id: string;
  x: number;
  y: number;
  width: number;
  orientation: "h" | "v";
  swing: "n" | "s" | "e" | "w";
  doorType?: DoorType;
  bgImageId?: string;
}

export interface WindowLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  orientation: "h" | "v";
  windowType?: WindowType;
  bgImageId?: string;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  estimatedAreaM2?: number;
  bgImageId?: string;
}

export interface BgImageCard {
  id: string;
  url: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number; // in degrees
  width: number;
  height: number;
}

export interface ScaleConfig {
  calibrated: boolean;
  pixelDistance: number; // pixel distance representing physical distance
  physicalLength: number; // in meters or feet or cm/in
  unit: "m" | "cm" | "ft" | "in";
}

export type EditorTool =
  | "select"
  | "add_wall"
  | "add_door"
  | "add_window"
  | "add_room"
  | "add_fixture"
  | "calibrate";

export interface Fixture {
  id: string;
  type: string; // e.g. 'bed' | 'sofa' | 'table' | 'toilet' | 'bathtub' | 'shower' | 'sink' | 'staircase' | 'stove' | 'column'
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in degrees
  label?: string;
  bgImageId?: string;
}

export interface DimensionLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  physicalLength: number;
  unit: "m" | "cm" | "ft" | "in";
  note: string;
  bgImageId?: string;
}

export interface FloorplanData {
  walls: Wall[];
  doors: Door[];
  windows: WindowLayout[];
  rooms: Room[];
  scale: ScaleConfig;
  bgImages?: BgImageCard[];
  dimensionLines?: DimensionLine[];
  fixtures?: Fixture[];
}

export interface HistoryItem {
  walls: Wall[];
  doors: Door[];
  windows: WindowLayout[];
  rooms: Room[];
  scale: ScaleConfig;
  bgImages?: BgImageCard[];
  dimensionLines?: DimensionLine[];
  fixtures?: Fixture[];
}

export interface ExtractedFloorplan {
  walls: Wall[];
  doors: Door[];
  windows: WindowLayout[];
  rooms: Room[];
  fixtures?: Fixture[];
}
