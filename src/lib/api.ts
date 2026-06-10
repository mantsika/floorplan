import { UserSession, getUserSession } from "./userId";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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

export async function resolveImageForApi(image: string): Promise<string> {
  if (image.startsWith("data:")) return image;

  const url = image.startsWith("/") ? apiUrl(image) : image;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load image for AI extraction");

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to encode image"));
    reader.readAsDataURL(blob);
  });
}
