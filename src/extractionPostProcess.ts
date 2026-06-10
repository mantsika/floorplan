type WallSeg = { id?: string; x1: number; y1: number; x2: number; y2: number; type?: string; [k: string]: unknown };
type Opening = { id?: string; x: number; y: number; width: number; orientation?: string; [k: string]: unknown };
type Fixture = {
  id?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label?: string;
  [k: string]: unknown;
};

type RoomMeta = {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  estimatedAreaM2?: number;
  estimatedWidthM?: number;
  estimatedDepthM?: number;
  [k: string]: unknown;
};

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return fallback;
}

function isFiniteCoord(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}

function extractWallCoords(raw: Record<string, unknown>): { x1: number; y1: number; x2: number; y2: number } | null {
  if (
    raw.x1 != null ||
    raw.startX != null ||
    raw.start_x != null ||
    raw.start != null ||
    raw.points != null
  ) {
    const start = raw.start as { x?: unknown; y?: unknown } | undefined;
    const end = raw.end as { x?: unknown; y?: unknown } | undefined;
    const points = raw.points as Array<{ x?: unknown; y?: unknown }> | undefined;

    const x1 = toInt(raw.x1 ?? raw.startX ?? raw.start_x ?? start?.x, NaN);
    const y1 = toInt(raw.y1 ?? raw.startY ?? raw.start_y ?? start?.y, NaN);
    const x2 = toInt(raw.x2 ?? raw.endX ?? raw.end_x ?? end?.x ?? points?.[1]?.x, NaN);
    const y2 = toInt(raw.y2 ?? raw.endY ?? raw.end_y ?? end?.y ?? points?.[1]?.y, NaN);

    if (isFiniteCoord(x1, y1, x2, y2)) {
      return { x1, y1, x2, y2 };
    }
  }
  return null;
}

function sanitizeWalls(rawWalls: unknown): WallSeg[] {
  if (!Array.isArray(rawWalls)) return [];
  const result: WallSeg[] = [];

  rawWalls.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const raw = item as Record<string, unknown>;
    const coords = extractWallCoords(raw);
    if (!coords) return;
    const length = Math.hypot(coords.x2 - coords.x1, coords.y2 - coords.y1);
    if (length < 2) return;

    result.push({
      ...raw,
      id: typeof raw.id === "string" ? raw.id : `wall_${index + 1}`,
      type: typeof raw.type === "string" ? raw.type : "interior",
      ...coords,
    });
  });

  return result;
}

function sanitizeOpenings(rawItems: unknown, prefix: string): Opening[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const x = toInt(raw.x ?? raw.centerX ?? raw.center_x, NaN);
      const y = toInt(raw.y ?? raw.centerY ?? raw.center_y, NaN);
      const width = Math.max(8, toInt(raw.width, 60));
      if (!isFiniteCoord(x, y)) return null;

      const orientation = typeof raw.orientation === "string" ? raw.orientation : "h";
      return {
        ...raw,
        id: typeof raw.id === "string" ? raw.id : `${prefix}_${index + 1}`,
        x,
        y,
        width,
        orientation,
      } as Opening;
    })
    .filter((item): item is Opening => item !== null);
}

const MIN_FIXTURE_SIZE: Record<string, { w: number; h: number }> = {
  cabinet: { w: 40, h: 28 },
  wall_cabinet: { w: 40, h: 20 },
  counter: { w: 48, h: 24 },
  island: { w: 60, h: 40 },
  stove: { w: 36, h: 36 },
  sink: { w: 32, h: 28 },
  fireplace: { w: 48, h: 32 },
  light_fitting: { w: 20, h: 20 },
  fridge: { w: 36, h: 40 },
  toilet: { w: 28, h: 40 },
  bathtub: { w: 60, h: 32 },
  shower: { w: 36, h: 36 },
};

function sanitizeFixtures(rawFixtures: unknown): Fixture[] {
  if (!Array.isArray(rawFixtures)) return [];

  return rawFixtures
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const type = normalizeFixtureType(typeof raw.type === "string" ? raw.type : "unknown");
      const mins = MIN_FIXTURE_SIZE[type] ?? { w: 20, h: 20 };
      const x = toInt(raw.x, NaN);
      const y = toInt(raw.y, NaN);
      const width = Math.max(mins.w, toInt(raw.width, mins.w));
      const height = Math.max(mins.h, toInt(raw.height, mins.h));
      if (!isFiniteCoord(x, y)) return null;

      return {
        ...raw,
        id: typeof raw.id === "string" ? raw.id : `fixture_${index + 1}`,
        type,
        x,
        y,
        width,
        height,
        rotation: normalizeFixtureRotation(raw.rotation),
        label: typeof raw.label === "string" ? raw.label : undefined,
      } as Fixture;
    })
    .filter((item): item is Fixture => item !== null);
}

function sanitizeRooms(rawRooms: unknown): RoomMeta[] {
  if (!Array.isArray(rawRooms)) return [];

  return rawRooms
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const x = toInt(raw.x, NaN);
      const y = toInt(raw.y, NaN);
      if (!isFiniteCoord(x, y)) return null;
      return {
        ...raw,
        id: typeof raw.id === "string" ? raw.id : `room_${index + 1}`,
        name: typeof raw.name === "string" ? raw.name : `Room ${index + 1}`,
        x,
        y,
        estimatedWidthM:
          typeof raw.estimatedWidthM === "number" ? raw.estimatedWidthM : undefined,
        estimatedDepthM:
          typeof raw.estimatedDepthM === "number" ? raw.estimatedDepthM : undefined,
        estimatedAreaM2:
          typeof raw.estimatedAreaM2 === "number" ? raw.estimatedAreaM2 : undefined,
      } as RoomMeta;
    })
    .filter((item): item is RoomMeta => item !== null);
}

/** Normalize AI rotation to 0–359 integer degrees */
export function normalizeFixtureRotation(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(((raw % 360) + 360) % 360);
  }
  if (typeof raw === "string") {
    const s = raw.toLowerCase().trim();
    const n = parseInt(s, 10);
    if (!Number.isNaN(n)) return Math.round(((n % 360) + 360) % 360);
    if (s.includes("north") || s.includes("top") || s.includes("0")) return 0;
    if (s.includes("east") || s.includes("right") || s.includes("90")) return 90;
    if (s.includes("south") || s.includes("bottom") || s.includes("180")) return 180;
    if (s.includes("west") || s.includes("left") || s.includes("270")) return 270;
  }
  return 0;
}

function wallBbox(walls: WallSeg[]) {
  const xs = walls.flatMap((w) => [w.x1, w.x2]);
  const ys = walls.flatMap((w) => [w.y1, w.y2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Fixture types kept from AI extraction — no movable furniture */
export const ARCHITECTURAL_FIXTURE_TYPES = new Set([
  "cabinet",
  "wall_cabinet",
  "counter",
  "island",
  "fireplace",
  "light_fitting",
  "stove",
  "sink",
  "fridge",
  "dishwasher",
  "washing_machine",
  "toilet",
  "bathtub",
  "shower",
  "staircase",
  "column",
  "balcony",
  "patio",
]);

export function isArchitecturalFixtureType(type: string): boolean {
  return ARCHITECTURAL_FIXTURE_TYPES.has(type);
}

export function filterArchitecturalFixtures<T extends { type: string }>(fixtures: T[]): T[] {
  return fixtures.filter((f) => isArchitecturalFixtureType(f.type));
}

export function normalizeFixtureType(raw: string): string {
  const t = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (["wall_cabinet", "upper_cabinet", "overhead"].some((k) => t.includes(k))) return "wall_cabinet";
  if (["base_cabinet", "cupboard", "cupboards", "builtin", "built_in"].some((k) => t.includes(k))) return "cabinet";
  if (t.includes("cabinet") || t.includes("cupboard")) return "cabinet";
  if (["counter", "countertop", "worktop", "benchtop"].some((k) => t.includes(k))) return "counter";
  if (t.includes("island") || t.includes("peninsula")) return "island";
  if (["fireplace", "hearth", "wood_burner"].some((k) => t.includes(k))) return "fireplace";
  if (
    ["light_fitting", "light_fixture", "ceiling_light", "pendant", "chandelier", "downlight", "spotlight", "recessed"].some(
      (k) => t.includes(k)
    )
  ) {
    return "light_fitting";
  }
  if (["fridge", "refrigerator", "freezer"].some((k) => t.includes(k))) return "fridge";
  if (["dishwasher", "dish_washer"].some((k) => t.includes(k))) return "dishwasher";
  if (["washing_machine", "washer", "laundry"].some((k) => t.includes(k))) return "washing_machine";
  if (["oven", "cooktop", "hob", "range"].some((k) => t.includes(k))) return "stove";
  if (["vanity", "dresser"].some((k) => t.includes(k))) return "cabinet";
  if (["radiator", "heater"].some((k) => t.includes(k))) return "column";
  if (["balcony", "terrace", "patio", "deck"].some((k) => t.includes(k))) return t.includes("patio") ? "patio" : "balcony";
  if (["toilet", "bathtub", "shower", "sink", "stove", "staircase", "column"].includes(t)) return t;
  if (["lamp", "light", "lighting"].some((k) => t.includes(k))) return "light_fitting";
  // Movable furniture — normalized for filtering, never kept in extraction output
  if (["sofa", "couch", "sectional", "loveseat", "armchair", "chair", "recliner"].some((k) => t.includes(k))) return "sofa";
  if (["coffee_table", "side_table", "table", "desk"].some((k) => t.includes(k))) return "table";
  if (["tv", "television", "monitor", "rug", "carpet"].some((k) => t.includes(k))) return "table";
  if (["bed", "mattress"].some((k) => t.includes(k))) return "bed";
  return "table";
}

/** Infer sliding door left of large glass window when AI omits it */
function enrichGlassWallOpenings(
  walls: WallSeg[],
  windows: Opening[],
  doors: Opening[]
): Opening[] {
  if (walls.length < 4 || windows.length === 0) return doors;

  const box = wallBbox(walls);
  const roomW = box.maxX - box.minX;
  const roomH = box.maxY - box.minY;
  const result = [...doors];

  for (const win of windows) {
    const o = (win.orientation ?? "h").toLowerCase();
    const isHorizontal = o === "h" || o === "horizontal" || o === "top" || o === "bottom";
    const onTopWall = Math.abs(win.y - box.minY) < roomH * 0.08;
    const onBottomWall = Math.abs(win.y - box.maxY) < roomH * 0.08;
    const onLeftWall = Math.abs(win.x - box.minX) < roomW * 0.08;
    const onRightWall = Math.abs(win.x - box.maxX) < roomW * 0.08;

    const wallKey = isHorizontal
      ? onTopWall
        ? "top"
        : onBottomWall
        ? "bottom"
        : "top"
      : onLeftWall
      ? "left"
      : onRightWall
      ? "right"
      : "left";

    const doorOnSameWall = result.some((d) => {
      const dh = (d.orientation ?? "h").toLowerCase();
      const h = dh === "h" || dh === "horizontal";
      if (wallKey === "top" || wallKey === "bottom") {
        return h && Math.abs(d.y - win.y) < roomH * 0.1;
      }
      return !h && Math.abs(d.x - win.x) < roomW * 0.1;
    });

    if (doorOnSameWall) continue;

    const doorWidth = Math.round(Math.min(140, Math.max(70, win.width * 0.22)));
    const gap = Math.round(win.width * 0.05);

    if (wallKey === "top" || wallKey === "bottom") {
      const y = wallKey === "top" ? box.minY : box.maxY;
      const doorX = Math.round(win.x - win.width / 2 - doorWidth / 2 - gap);
      if (doorX > box.minX + 20) {
        result.push({
          id: `door_inferred_${result.length + 1}`,
          x: doorX,
          y,
          width: doorWidth,
          orientation: "h",
          swing: "w",
          doorType: "sliding",
        });
      }
    } else {
      const x = wallKey === "left" ? box.minX : box.maxX;
      const doorY = Math.round(win.y - win.width / 2 - doorWidth / 2 - gap);
      if (doorY > box.minY + 20) {
        result.push({
          id: `door_inferred_${result.length + 1}`,
          x,
          y: doorY,
          width: doorWidth,
          orientation: "v",
          swing: "w",
          doorType: "sliding",
        });
      }
    }
  }

  return result;
}

/** Widen undersized perimeter windows on the main glass wall */
function expandMainGlassWindow(walls: WallSeg[], windows: Opening[]): Opening[] {
  if (walls.length < 4 || windows.length === 0) return windows;
  const box = wallBbox(walls);
  const roomW = box.maxX - box.minX;

  return windows.map((win, i) => {
    const onTop = Math.abs(win.y - box.minY) < (box.maxY - box.minY) * 0.1;
    if (!onTop || win.width >= roomW * 0.45) return win;
    const centerX = (box.minX + box.maxX) / 2;
    return {
      ...win,
      id: win.id ?? `window-${i + 1}`,
      x: Math.round(centerX),
      y: box.minY,
      width: Math.round(roomW * 0.55),
      orientation: "h",
      windowType: win.windowType ?? "fixed",
    };
  });
}

function scaleFixturesToRoom(fixtures: Fixture[], walls: WallSeg[]): Fixture[] {
  if (walls.length === 0) return fixtures;
  const box = wallBbox(walls);
  const roomW = box.maxX - box.minX;
  const roomH = box.maxY - box.minY;

  return fixtures.map((f) => {
    const type = normalizeFixtureType(f.type);
    const isCabinetRun = ["cabinet", "counter", "wall_cabinet", "island"].includes(type);
    const maxW = isCabinetRun
      ? roomW * 0.85
      : type === "sofa"
      ? roomW * 0.35
      : type === "table"
      ? roomW * 0.18
      : roomW * 0.14;
    const maxH = isCabinetRun
      ? type === "wall_cabinet"
        ? roomH * 0.08
        : type === "counter"
        ? roomH * 0.07
        : roomH * 0.12
      : type === "sofa"
      ? roomH * 0.16
      : roomH * 0.12;
    let width = Math.min(f.width, maxW);
    let height = Math.min(f.height, maxH);
    const x = Math.max(box.minX + width / 2, Math.min(box.maxX - width / 2, f.x));
    const y = Math.max(box.minY + height / 2, Math.min(box.maxY - height / 2, f.y));
    const rotation = normalizeFixtureRotation(f.rotation);
    // width = longer plan axis for seating; swap if model inverted aspect for sofas/beds
    const mins = MIN_FIXTURE_SIZE[type] ?? { w: 20, h: 20 };
    let w = Math.max(mins.w, Math.round(width));
    let h = Math.max(mins.h, Math.round(height));
    return { ...f, type, width: w, height: h, x: Math.round(x), y: Math.round(y), rotation };
  });
}

function normalizeRoomDimensions(walls: WallSeg[], rooms: RoomMeta[]): RoomMeta[] {
  if (rooms.length === 0) return rooms;
  const box = wallBbox(walls);
  const roomW = box.maxX - box.minX;
  const roomH = box.maxY - box.minY;
  const aspect = roomW / Math.max(roomH, 1);

  return rooms.map((r) => {
    let widthM = r.estimatedWidthM;
    let depthM = r.estimatedDepthM;
    const areaM2 = r.estimatedAreaM2;

    if (!widthM || !depthM) {
      const area = areaM2 && areaM2 > 0 ? areaM2 : 16;
      const derived = Math.sqrt(area / aspect);
      widthM = widthM ?? Math.round((area / derived) * 10) / 10;
      depthM = depthM ?? Math.round(derived * 10) / 10;
    }

    const computedArea = Math.round(widthM * depthM * 10) / 10;
    return {
      ...r,
      estimatedWidthM: widthM,
      estimatedDepthM: depthM,
      estimatedAreaM2: areaM2 && areaM2 > 0 ? areaM2 : computedArea,
    };
  });
}

export function postProcessExtraction(raw: Record<string, unknown>): Record<string, unknown> {
  const walls = sanitizeWalls(raw.walls);
  let windows = sanitizeOpenings(raw.windows, "window");
  let doors = sanitizeOpenings(raw.doors, "door");
  let fixtures = sanitizeFixtures(raw.fixtures);
  let rooms = sanitizeRooms(raw.rooms);

  windows = expandMainGlassWindow(walls, windows);
  doors = enrichGlassWallOpenings(walls, windows, doors);
  fixtures = filterArchitecturalFixtures(scaleFixturesToRoom(fixtures, walls));
  rooms = normalizeRoomDimensions(walls, rooms);

  return { ...raw, walls, windows, doors, fixtures, rooms };
}
