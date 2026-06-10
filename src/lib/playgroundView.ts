export interface PlaygroundViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_PLAYGROUND_VIEW: PlaygroundViewBox = {
  x: 0,
  y: 0,
  w: 1000,
  h: 1000,
};

export function viewBoxZoomPercent(viewBox: PlaygroundViewBox): number {
  return Math.round((DEFAULT_PLAYGROUND_VIEW.w / viewBox.w) * 100);
}

/** Never allow viewBox smaller than one full sheet — prevents over-magnified zoom */
export function normalizePlaygroundView(viewBox: PlaygroundViewBox): PlaygroundViewBox {
  const w = Math.max(DEFAULT_PLAYGROUND_VIEW.w, viewBox.w);
  const h = Math.max(DEFAULT_PLAYGROUND_VIEW.h, viewBox.h);
  return { x: viewBox.x, y: viewBox.y, w, h };
}

export function clampViewBoxSize(size: number): number {
  return Math.max(DEFAULT_PLAYGROUND_VIEW.w, Math.min(4000, size));
}

export function zoomViewBoxAtPoint(
  viewBox: PlaygroundViewBox,
  focusX: number,
  focusY: number,
  zoomIn: boolean
): PlaygroundViewBox {
  const factor = zoomIn ? 0.85 : 1.18;
  const newW = clampViewBoxSize(viewBox.w * factor);
  const newH = clampViewBoxSize(viewBox.h * factor);
  const fracX = (focusX - viewBox.x) / viewBox.w;
  const fracY = (focusY - viewBox.y) / viewBox.h;
  return {
    x: focusX - fracX * newW,
    y: focusY - fracY * newH,
    w: newW,
    h: newH,
  };
}

export function panViewBox(
  viewBox: PlaygroundViewBox,
  dx: number,
  dy: number
): PlaygroundViewBox {
  return {
    ...viewBox,
    x: viewBox.x - dx,
    y: viewBox.y - dy,
  };
}

export function computeContentBounds(
  points: Array<{ x: number; y: number }>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Pan to center content at 100% sheet zoom — never magnifies past 1:1 */
export function centerViewOnBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): PlaygroundViewBox {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const half = DEFAULT_PLAYGROUND_VIEW.w / 2;
  return {
    x: cx - half,
    y: cy - half,
    w: DEFAULT_PLAYGROUND_VIEW.w,
    h: DEFAULT_PLAYGROUND_VIEW.h,
  };
}

/**
 * Fit content on sheet: centers on content, zooms OUT only when property exceeds one sheet.
 * Never zooms in past 100% — preserves true 1:100 scale for typical single-floor plans.
 */
export function fitViewBoxToBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  padding = 80
): PlaygroundViewBox {
  const contentW = Math.max(bounds.maxX - bounds.minX, 40) + padding * 2;
  const contentH = Math.max(bounds.maxY - bounds.minY, 40) + padding * 2;
  const size = Math.max(DEFAULT_PLAYGROUND_VIEW.w, contentW, contentH);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    x: cx - size / 2,
    y: cy - size / 2,
    w: size,
    h: size,
  };
}
