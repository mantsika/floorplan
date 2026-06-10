import { Door, Fixture, Room, Wall, WindowLayout } from "../types";

/** One playground sheet = 1000×1000 drawing units at architectural scale 1:100 */
export const DRAWING_SCALE_LABEL = "1:100";
export const SHEET_DRAWING_UNITS = 1000;
/** ~25 m of real-world width fits across one sheet at 1:100 (typical single-floor plan) */
export const SHEET_WIDTH_METERS = 25;
export const PLAYGROUND_PX_PER_M = SHEET_DRAWING_UNITS / SHEET_WIDTH_METERS;

export interface WallBbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function getWallsBbox(walls: Wall[]): WallBbox | null {
  if (walls.length === 0) return null;
  const xs = walls.flatMap((w) => [w.x1, w.x2]);
  const ys = walls.flatMap((w) => [w.y1, w.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: Math.round((minX + maxX) / 2),
    cy: Math.round((minY + maxY) / 2),
  };
}

export function deriveRoomDimensionsM(
  areaM2: number,
  bboxAspectWidthOverHeight: number
): { widthM: number; depthM: number } {
  const safeArea = Math.max(areaM2, 4);
  const aspect = Math.max(bboxAspectWidthOverHeight, 0.4);
  const depthM = Math.sqrt(safeArea / aspect);
  const widthM = safeArea / depthM;
  return {
    widthM: Math.round(widthM * 10) / 10,
    depthM: Math.round(depthM * 10) / 10,
  };
}

export function resolveRoomDimensionsM(
  widthM: number | undefined,
  depthM: number | undefined,
  areaM2: number | undefined,
  bbox: WallBbox
): { widthM: number; depthM: number } {
  if (widthM && widthM > 0 && depthM && depthM > 0) {
    return { widthM, depthM };
  }
  if (widthM && widthM > 0 && areaM2 && areaM2 > 0) {
    return { widthM, depthM: Math.round((areaM2 / widthM) * 10) / 10 };
  }
  if (depthM && depthM > 0 && areaM2 && areaM2 > 0) {
    return { widthM: Math.round((areaM2 / depthM) * 10) / 10, depthM };
  }
  const aspect = bbox.width / Math.max(bbox.height, 1);
  return deriveRoomDimensionsM(areaM2 && areaM2 > 0 ? areaM2 : 16, aspect);
}

const scalePoint = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  factor: number
) => ({
  x: Math.round(cx + (x - cx) * factor),
  y: Math.round(cy + (y - cy) * factor),
});

export interface ScaledRoomGroup {
  walls: Wall[];
  doors: Door[];
  windows: WindowLayout[];
  rooms: Room[];
  fixtures: Fixture[];
  bgScaleMultiplier: number;
  bgAnchor: { x: number; y: number };
  widthM: number;
  depthM: number;
  metersPerPixel: number;
}

/** Scale an extracted room so its playground size matches real-world width × depth in meters */
export function scaleRoomGroupToRealWorld(
  walls: Wall[],
  doors: Door[],
  windows: WindowLayout[],
  rooms: Room[],
  fixtures: Fixture[],
  widthM: number,
  depthM: number,
  bgAnchor: { x: number; y: number },
  bgScale: number
): ScaledRoomGroup {
  const bbox = getWallsBbox(walls);
  if (!bbox || bbox.width < 1 || bbox.height < 1) {
    return {
      walls,
      doors,
      windows,
      rooms,
      fixtures,
      bgScaleMultiplier: 1,
      bgAnchor,
      widthM,
      depthM,
      metersPerPixel: 1 / PLAYGROUND_PX_PER_M,
    };
  }

  const targetW = widthM * PLAYGROUND_PX_PER_M;
  const targetH = depthM * PLAYGROUND_PX_PER_M;
  const factor = Math.min(targetW / bbox.width, targetH / bbox.height);
  const { cx, cy } = bbox;

  const scaledWalls = walls.map((w) => {
    const p1 = scalePoint(w.x1, w.y1, cx, cy, factor);
    const p2 = scalePoint(w.x2, w.y2, cx, cy, factor);
    return { ...w, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  });

  const scaledDoors = doors.map((d) => {
    const p = scalePoint(d.x, d.y, cx, cy, factor);
    return { ...d, x: p.x, y: p.y, width: Math.max(8, Math.round(d.width * factor)) };
  });

  const scaledWindows = windows.map((w) => {
    const p = scalePoint(w.x, w.y, cx, cy, factor);
    return { ...w, x: p.x, y: p.y, width: Math.max(8, Math.round(w.width * factor)) };
  });

  const scaledRooms = rooms.map((r) => {
    const p = scalePoint(r.x, r.y, cx, cy, factor);
    return {
      ...r,
      x: p.x,
      y: p.y,
      estimatedWidthM: widthM,
      estimatedDepthM: depthM,
    };
  });

  const scaledFixtures = fixtures.map((f) => {
    const p = scalePoint(f.x, f.y, cx, cy, factor);
    return {
      ...f,
      x: p.x,
      y: p.y,
      width: Math.max(8, Math.round(f.width * factor)),
      height: Math.max(8, Math.round(f.height * factor)),
    };
  });

  const newAnchor = scalePoint(bgAnchor.x, bgAnchor.y, cx, cy, factor);

  return {
    walls: scaledWalls,
    doors: scaledDoors,
    windows: scaledWindows,
    rooms: scaledRooms,
    fixtures: scaledFixtures,
    bgScaleMultiplier: factor,
    bgAnchor: newAnchor,
    widthM,
    depthM,
    metersPerPixel: 1 / PLAYGROUND_PX_PER_M,
  };
}
