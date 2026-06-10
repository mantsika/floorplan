export type WallType = "exterior" | "interior" | "partition" | "double";

export type DoorType = "hinged" | "sliding" | "folding" | "pocket" | "double";

export type WindowType = "fixed" | "sliding" | "casement" | "bay";

export const DEFAULT_SHEET_ID = "sheet_1";

export interface PlaygroundSheet {
  id: string;
  name: string;
  viewBox?: { x: number; y: number; w: number; h: number };
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: WallType;
  bgImageId?: string;
  sheetId?: string;
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
  sheetId?: string;
}

export interface WindowLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  orientation: "h" | "v";
  windowType?: WindowType;
  bgImageId?: string;
  sheetId?: string;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  estimatedAreaM2?: number;
  /** Real-world room width in meters (longer wall unless clearly otherwise) */
  estimatedWidthM?: number;
  /** Real-world room depth in meters */
  estimatedDepthM?: number;
  bgImageId?: string;
  sheetId?: string;
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
  /** Set after AI extraction — vectors linked as a room group */
  extracted?: boolean;
  /** Clipped source photo under vectors until user hides it (default true after extraction) */
  showReferencePhoto?: boolean;
  /** Real-world direction the main window/glass wall faces on the property */
  windowFacing?: "north" | "south" | "east" | "west" | "auto";
  /** Calibrated real-world dimensions for this room group */
  roomWidthM?: number;
  roomDepthM?: number;
  /** Meters per playground pixel for wall labels in this group */
  metersPerPixel?: number;
  sheetId?: string;
}

/** User-drawn region over reference photo to mark missed doors/windows/fixtures */
export interface MissedItemHighlight {
  id: string;
  bgImageId: string;
  sheetId?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: "door" | "window" | "fixture";
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
  | "calibrate"
  | "highlight_miss";

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
  sheetId?: string;
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
  sheetId?: string;
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
  missedHighlights?: MissedItemHighlight[];
  playgroundSheets?: PlaygroundSheet[];
  activeSheetId?: string;
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
  missedHighlights?: MissedItemHighlight[];
  playgroundSheets?: PlaygroundSheet[];
  activeSheetId?: string;
}

export interface ExtractedFloorplan {
  walls: Wall[];
  doors: Door[];
  windows: WindowLayout[];
  rooms: Room[];
  fixtures?: Fixture[];
}
