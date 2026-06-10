import { BgImageCard } from "../types";

/** Map AI / image-local 0–1000 coords to canvas space using block transform */
export function mapImageLocalToCanvas(
  bg: BgImageCard,
  px: number,
  py: number
): { x: number; y: number } {
  const u = px / 1000;
  const v = py / 1000;
  const xOffset = u * bg.width;
  const yOffset = v * bg.height;
  const xLocal = xOffset - bg.width / 2;
  const yLocal = yOffset - bg.height / 2;
  const xScaled = xLocal * bg.scale;
  const yScaled = yLocal * bg.scale;

  if (bg.rotation) {
    const rad = (bg.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const xRotated = xScaled * cos - yScaled * sin;
    const yRotated = xScaled * sin + yScaled * cos;
    return {
      x: Math.round(bg.x + xRotated),
      y: Math.round(bg.y + yRotated),
    };
  }

  return {
    x: Math.round(bg.x + xScaled),
    y: Math.round(bg.y + yScaled),
  };
}

/** Inverse of mapImageLocalToCanvas — canvas point to 0–1000 image space */
export function mapCanvasToImageLocal(
  bg: BgImageCard,
  canvasX: number,
  canvasY: number
): { x: number; y: number } {
  let dx = canvasX - bg.x;
  let dy = canvasY - bg.y;

  if (bg.rotation) {
    const rad = (-bg.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const xUnrot = dx * cos - dy * sin;
    const yUnrot = dx * sin + dy * cos;
    dx = xUnrot;
    dy = yUnrot;
  }

  const xLocal = dx / bg.scale;
  const yLocal = dy / bg.scale;
  const u = (xLocal + bg.width / 2) / bg.width;
  const v = (yLocal + bg.height / 2) / bg.height;

  return {
    x: Math.round(Math.max(0, Math.min(1000, u * 1000))),
    y: Math.round(Math.max(0, Math.min(1000, v * 1000))),
  };
}

export function mapImageLocalToCanvasSize(
  bg: BgImageCard,
  size: number,
  alongWidth: boolean
): number {
  const dim = alongWidth ? bg.width : bg.height;
  return Math.max(12, Math.round((size / 1000) * dim * bg.scale));
}
