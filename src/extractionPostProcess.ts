type WallSeg = { x1: number; y1: number; x2: number; y2: number };
type Opening = { x: number; y: number; width: number; orientation?: string; [k: string]: unknown };
type Fixture = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label?: string;
  [k: string]: unknown;
};

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

export function normalizeFixtureType(raw: string): string {
  const t = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (["wall_cabinet", "upper_cabinet", "overhead"].some((k) => t.includes(k))) return "wall_cabinet";
  if (["base_cabinet", "cupboard", "cupboards", "builtin", "built_in"].some((k) => t.includes(k))) return "cabinet";
  if (t.includes("cabinet") || t.includes("cupboard")) return "cabinet";
  if (["counter", "countertop", "worktop", "benchtop"].some((k) => t.includes(k))) return "counter";
  if (t.includes("island") || t.includes("peninsula")) return "island";
  if (["fridge", "refrigerator", "freezer"].some((k) => t.includes(k))) return "fridge";
  if (["dishwasher", "dish_washer"].some((k) => t.includes(k))) return "dishwasher";
  if (["washing_machine", "washer", "laundry"].some((k) => t.includes(k))) return "washing_machine";
  if (["oven", "cooktop", "hob", "range"].some((k) => t.includes(k))) return "stove";
  if (["sofa", "couch", "sectional", "loveseat"].some((k) => t.includes(k))) return "sofa";
  if (["armchair", "chair", "recliner"].some((k) => t.includes(k))) return "sofa";
  if (["coffee_table", "side_table", "table", "desk"].some((k) => t.includes(k))) return "table";
  if (["tv", "television", "monitor"].some((k) => t.includes(k))) return "table";
  if (["bed", "mattress"].some((k) => t.includes(k))) return "bed";
  if (["lamp", "floor_lamp"].some((k) => t.includes(k))) return "table";
  if (["heater", "radiator", "shelf", "dresser", "vanity"].some((k) => t.includes(k))) return "cabinet";
  if (["balcony", "terrace", "patio", "deck"].some((k) => t.includes(k))) return t.includes("patio") ? "patio" : "balcony";
  if (["toilet", "bathtub", "shower", "sink", "stove", "staircase", "column"].includes(t)) return t;
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
    if (type === "table" && (f.type.includes("lamp") || f.label?.toLowerCase().includes("lamp"))) {
      width = Math.min(width, 35);
      height = Math.min(height, 35);
    }
    if (f.type.includes("tv") || f.label?.toLowerCase().includes("tv")) {
      width = Math.min(width, roomW * 0.08);
      height = Math.min(height, 12);
    }
    const x = Math.max(box.minX + width / 2, Math.min(box.maxX - width / 2, f.x));
    const y = Math.max(box.minY + height / 2, Math.min(box.maxY - height / 2, f.y));
    const rotation = normalizeFixtureRotation(f.rotation);
    // width = longer plan axis for seating; swap if model inverted aspect for sofas/beds
    let w = Math.round(width);
    let h = Math.round(height);
    if ((type === "sofa" || type === "bed") && h > w) {
      [w, h] = [h, w];
      return { ...f, type, width: w, height: h, x: Math.round(x), y: Math.round(y), rotation: (rotation + 90) % 360 };
    }
    return { ...f, type, width: w, height: h, x: Math.round(x), y: Math.round(y), rotation };
  });
}

type RoomMeta = {
  estimatedAreaM2?: number;
  estimatedWidthM?: number;
  estimatedDepthM?: number;
  [k: string]: unknown;
};

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
  const walls = (raw.walls as WallSeg[]) ?? [];
  let windows = (raw.windows as Opening[]) ?? [];
  let doors = (raw.doors as Opening[]) ?? [];
  let fixtures = (raw.fixtures as Fixture[]) ?? [];
  let rooms = (raw.rooms as RoomMeta[]) ?? [];

  windows = expandMainGlassWindow(walls, windows);
  doors = enrichGlassWallOpenings(walls, windows, doors);
  fixtures = scaleFixturesToRoom(fixtures, walls);
  rooms = normalizeRoomDimensions(walls, rooms);

  return { ...raw, walls, windows, doors, fixtures, rooms };
}
