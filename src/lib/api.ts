import { getUserId } from "./userId";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export interface UploadResult {
  key: string;
  userId: string;
  url: string;
  fileName: string;
}

export async function uploadImageToR2(
  file: File,
  dataUrl: string,
  userId?: string
): Promise<UploadResult> {
  const uid = userId ?? getUserId();

  const response = await fetch(apiUrl("/api/upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: uid,
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      data: dataUrl,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Upload failed");
  }

  const result = (await response.json()) as UploadResult;
  return {
    ...result,
    url: apiUrl(result.url),
  };
}

export function isCloudApiEnabled(): boolean {
  return Boolean(API_BASE);
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
