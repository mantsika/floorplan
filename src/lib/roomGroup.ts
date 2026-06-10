import { Door, Fixture, Room, Wall, WindowLayout } from "../types";

export type CompassLabel = "N" | "S" | "E" | "W";

/** Infer which plan edge the main window sits on (after any group rotation) */
export function inferGroupWindowFacing(
  groupId: string,
  walls: Wall[],
  windows: WindowLayout[]
): CompassLabel | null {
  const groupWindows = windows.filter((w) => w.bgImageId === groupId);
  if (groupWindows.length === 0) return null;

  const groupWalls = walls.filter((w) => w.bgImageId === groupId);
  if (groupWalls.length === 0) return null;

  const xs = groupWalls.flatMap((w) => [w.x1, w.x2]);
  const ys = groupWalls.flatMap((w) => [w.y1, w.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const roomW = maxX - minX;
  const roomH = maxY - minY;

  const main = groupWindows.reduce((a, b) => (b.width > a.width ? b : a));
  const distTop = Math.abs(main.y - minY);
  const distBottom = Math.abs(main.y - maxY);
  const distLeft = Math.abs(main.x - minX);
  const distRight = Math.abs(main.x - maxX);
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);

  if (minDist === distTop) return "N";
  if (minDist === distBottom) return "S";
  if (minDist === distRight) return "E";
  return "W";
}

export interface RoomGroupBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

export function getRoomGroupBounds(
  groupId: string,
  walls: Wall[],
  doors: Door[],
  windows: WindowLayout[],
  rooms: Room[],
  fixtures: Fixture[]
): RoomGroupBounds | null {
  const xs: number[] = [];
  const ys: number[] = [];

  const add = (x: number, y: number, padX = 0, padY = 0) => {
    xs.push(x - padX, x + padX);
    ys.push(y - padY, y + padY);
  };

  walls
    .filter((w) => w.bgImageId === groupId)
    .forEach((w) => {
      add(w.x1, w.y1);
      add(w.x2, w.y2);
    });

  doors
    .filter((d) => d.bgImageId === groupId)
    .forEach((d) => add(d.x, d.y, d.width / 2, 15));

  windows
    .filter((w) => w.bgImageId === groupId)
    .forEach((w) => add(w.x, w.y, w.width / 2, 12));

  rooms
    .filter((r) => r.bgImageId === groupId)
    .forEach((r) => add(r.x, r.y, 40, 20));

  fixtures
    .filter((f) => f.bgImageId === groupId)
    .forEach((f) => add(f.x, f.y, f.width / 2, f.height / 2));

  if (xs.length === 0) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: Math.round((minX + maxX) / 2),
    cy: Math.round((minY + maxY) / 2),
  };
}

export function isPointInRoomGroup(
  x: number,
  y: number,
  bounds: RoomGroupBounds,
  padding = 20
): boolean {
  return (
    x >= bounds.minX - padding &&
    x <= bounds.maxX + padding &&
    y >= bounds.minY - padding &&
    y <= bounds.maxY + padding
  );
}

/** Canvas point → fixture-local coords (origin at fixture center, unrotated axes) */
export function getFixtureLocalCoords(
  fixture: Fixture,
  canvasX: number,
  canvasY: number
): { lx: number; ly: number } {
  const rad = -((fixture.rotation || 0) * Math.PI) / 180;
  const dx = canvasX - fixture.x;
  const dy = canvasY - fixture.y;
  return {
    lx: dx * Math.cos(rad) - dy * Math.sin(rad),
    ly: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

export function isPointInFixture(
  fixture: Fixture,
  canvasX: number,
  canvasY: number,
  padding = 6
): boolean {
  const halfW = fixture.width / 2 + padding;
  const halfH = fixture.height / 2 + padding;
  const { lx, ly } = getFixtureLocalCoords(fixture, canvasX, canvasY);
  return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
}
