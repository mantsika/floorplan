import { UserSession, getUserSession } from "./userId";

/** Production Worker — used when VITE_API_URL was not baked in at build time */
const PRODUCTION_WORKER_API = "https://floorplan-api.mantsika.workers.dev";

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith(".pages.dev") || host === "floorplan-a6a.pages.dev") {
      return PRODUCTION_WORKER_API;
    }
  }

  return "";
}

const API_BASE = resolveApiBase();

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function isCloudApiEnabled(): boolean {
  return Boolean(API_BASE);
}

export function requireApi(): void {
  if (!API_BASE) {
    throw new Error("Cloud API not configured. Set VITE_API_URL to your Workers URL.");
  }
}

export interface UploadResult {
  id: string;
  key: string;
  userId: string;
  userType: string;
  r2Prefix: string;
  url: string;
  fileName: string;
}

export async function uploadImageToR2(
  file: File,
  dataUrl: string,
  session?: UserSession
): Promise<UploadResult> {
  requireApi();
  const s = session ?? getUserSession();

  const response = await fetch(apiUrl("/api/upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: s.userId,
      userType: s.type,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      data: dataUrl,
    }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Upload failed");
  }

  const result = (await response.json()) as UploadResult;
  return { ...result, url: apiUrl(result.url) };
}

export interface ClaimResult {
  permanentUserId: string;
  movedFiles: number;
  movedFloorplans: number;
}

export async function claimTempAccount(
  tempUserId: string,
  permanentUserId: string,
  displayName?: string
): Promise<ClaimResult> {
  requireApi();

  const response = await fetch(apiUrl("/api/users/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempUserId, permanentUserId, displayName }),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Failed to claim account");
  }

  return response.json() as Promise<ClaimResult>;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

export async function compressImageForApi(dataUrl: string, maxSide = 1536): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  const img = await loadImageElement(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale >= 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export async function resolveImageForApi(image: string): Promise<string> {
  let dataUrl = image;

  if (!image.startsWith("data:")) {
    const url = image.startsWith("/") ? apiUrl(image) : image;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to load image for AI extraction");

    const blob = await response.blob();
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to encode image"));
      reader.readAsDataURL(blob);
    });
  }

  return compressImageForApi(dataUrl);
}
