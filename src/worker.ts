import {
  extractFloorplanFromImage,
  extractMissedItemsFromImage,
  extractFloorplanViaGemini,
  extractMissedItemsViaGemini,
  resolveExtractionCredentials,
} from "./floorplanExtraction";
import { DEFAULT_EXTRACTION_MODEL, EXTRACTION_MODELS } from "./openRouterModels";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  DEFAULT_EXTRACTION_MODEL?: string;
  PAGES_ORIGIN?: string;
}

type UserType = "temp" | "permanent" | "test";

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function corsHeaders(env: Env, request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.PAGES_ORIGIN ?? "*";
  const allowOrigin =
    allowed === "*" || origin === allowed ? (allowed === "*" ? "*" : origin) : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}

function parseUserId(raw: string | null | undefined): string | null {
  const userId = raw?.trim();
  if (!userId || !USER_ID_PATTERN.test(userId)) return null;
  return userId;
}

function parseUserType(raw: string | null | undefined): UserType | null {
  if (raw === "temp" || raw === "permanent" || raw === "test") return raw;
  return null;
}

function r2Prefix(userId: string, userType: UserType): string {
  if (userType === "test") return "test";
  if (userType === "temp") return `temp/${userId}`;
  return userId;
}

function r2Key(prefix: string, fileName: string): string {
  return `${prefix}/${fileName}`;
}

async function handleHealth(env: Env): Promise<Response> {
  let d1Ok = false;
  try {
    await env.DB.prepare("SELECT 1").first();
    d1Ok = true;
  } catch {
    d1Ok = false;
  }

  const openRouter = env.OPENROUTER_API_KEY?.trim();
  const gemini = env.GEMINI_API_KEY?.trim();
  const openRouterOk = Boolean(openRouter && openRouter !== "MY_OPENROUTER_API_KEY");
  const geminiOk = Boolean(gemini && gemini !== "MY_GEMINI_API_KEY");
  let activeProvider: "openrouter" | "gemini" | "none" = "none";
  try {
    activeProvider = resolveExtractionCredentials(env).provider;
  } catch {
    activeProvider = "none";
  }

  return json({
    status: "ok",
    time: new Date().toISOString(),
    d1Connected: d1Ok,
    openRouterKeyConfigured: openRouterOk,
    geminiKeyConfigured: geminiOk,
    extractionReady: activeProvider !== "none",
    defaultModel: env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
    provider: activeProvider,
  });
}

async function handleUpload(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as {
    userId?: string;
    userType?: string;
    fileName?: string;
    mimeType?: string;
    data?: string;
  };

  const userId = parseUserId(body.userId);
  const userType = parseUserType(body.userType) ?? "temp";
  if (!userId) return json({ error: "Invalid userId" }, 400, cors);
  if (!body.data) return json({ error: "Missing image data" }, 400, cors);

  const { base64Data, mimeType } = (() => {
    const raw = body.data!;
    if (raw.includes(";base64,")) {
      const [meta, data] = raw.split(";base64,");
      return { base64Data: data, mimeType: meta.replace("data:", "") || body.mimeType || "image/jpeg" };
    }
    return { base64Data: raw, mimeType: body.mimeType || "image/jpeg" };
  })();

  const safeName = sanitizeFileName(body.fileName || "floorplan.jpg");
  const prefix = r2Prefix(userId, userType);
  const objectKey = r2Key(prefix, `${Date.now()}-${safeName}`);
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const uploadId = crypto.randomUUID();

  await env.BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { userId, userType, originalName: safeName },
  });

  await env.DB.prepare(
    `INSERT INTO uploads (id, user_id, r2_key, file_name, mime_type, size_bytes, folder_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uploadId, userId, objectKey, safeName, mimeType, bytes.byteLength, userType)
    .run();

  return json(
    {
      id: uploadId,
      key: objectKey,
      userId,
      userType,
      r2Prefix: prefix,
      url: `/api/files/${objectKey}`,
      fileName: safeName,
    },
    201,
    cors
  );
}

async function handleListFiles(url: URL, env: Env, cors: HeadersInit): Promise<Response> {
  const userId = parseUserId(url.searchParams.get("userId"));
  const userType = parseUserType(url.searchParams.get("userType")) ?? "permanent";
  if (!userId) return json({ error: "Invalid userId" }, 400, cors);

  const { results } = await env.DB.prepare(
    `SELECT id, r2_key AS key, file_name, mime_type, size_bytes, folder_type, created_at
     FROM uploads WHERE user_id = ? AND folder_type = ? ORDER BY created_at DESC LIMIT 100`
  )
    .bind(userId, userType)
    .all();

  const prefix = r2Prefix(userId, userType);
  const files = (results as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    key: row.key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    folderType: row.folder_type,
    uploaded: row.created_at,
    url: `/api/files/${row.key}`,
  }));

  return json({ userId, userType, r2Prefix: prefix, files }, 200, cors);
}

async function handleGetFile(pathname: string, env: Env, cors: HeadersInit): Promise<Response> {
  const key = decodeURIComponent(pathname.replace(/^\/api\/files\//, ""));
  if (!key || key.includes("..")) {
    return new Response("Invalid path", { status: 400, headers: cors });
  }

  const object = await env.BUCKET.get(key);
  if (!object) {
    return new Response("Not found", { status: 404, headers: cors });
  }

  const headers = new Headers(cors);
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(object.body, { headers });
}

async function handleClaimAccount(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as {
    tempUserId?: string;
    permanentUserId?: string;
    displayName?: string;
  };

  const tempUserId = parseUserId(body.tempUserId);
  const permanentUserId = parseUserId(body.permanentUserId);

  if (!tempUserId || !permanentUserId) {
    return json({ error: "Invalid tempUserId or permanentUserId" }, 400, cors);
  }
  if (permanentUserId === "test" || permanentUserId.startsWith("temp")) {
    return json({ error: "permanentUserId cannot be 'test' or start with 'temp'" }, 400, cors);
  }

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(permanentUserId).first();
  if (existing) {
    return json({ error: "Username already taken" }, 409, cors);
  }

  const tempPrefix = r2Prefix(tempUserId, "temp");
  const listed = await env.BUCKET.list({ prefix: `${tempPrefix}/` });
  let movedFiles = 0;

  for (const obj of listed.objects) {
    const filePart = obj.key.slice(tempPrefix.length + 1);
    const newKey = r2Key(permanentUserId, filePart);

    const source = await env.BUCKET.get(obj.key);
    if (!source) continue;

    await env.BUCKET.put(newKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: { ...source.customMetadata, userId: permanentUserId, userType: "permanent", claimedFrom: tempUserId },
    });
    await env.BUCKET.delete(obj.key);

    await env.DB.prepare(
      `UPDATE uploads SET user_id = ?, r2_key = ?, folder_type = 'permanent' WHERE r2_key = ?`
    )
      .bind(permanentUserId, newKey, obj.key)
      .run();

    movedFiles++;
  }

  const floorplanUpdate = await env.DB.prepare(
    `UPDATE floorplans SET user_id = ? WHERE user_id = ?`
  )
    .bind(permanentUserId, tempUserId)
    .run();

  await env.DB.prepare(
    `INSERT INTO users (id, type, display_name, claimed_from_temp_id) VALUES (?, 'permanent', ?, ?)`
  )
    .bind(permanentUserId, body.displayName?.slice(0, 100) || null, tempUserId)
    .run();

  return json(
    {
      permanentUserId,
      movedFiles,
      movedFloorplans: floorplanUpdate.meta.changes ?? 0,
      r2Prefix: permanentUserId,
    },
    200,
    cors
  );
}

async function handleListFloorplans(url: URL, env: Env, cors: HeadersInit): Promise<Response> {
  const userId = parseUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "Invalid userId" }, 400, cors);

  const { results } = await env.DB.prepare(
    `SELECT id, title, created_at, updated_at FROM floorplans
     WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
  )
    .bind(userId)
    .all();

  return json({ userId, floorplans: results }, 200, cors);
}

async function handleGetFloorplan(id: string, env: Env, cors: HeadersInit): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, user_id, title, data_json, created_at, updated_at FROM floorplans WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!row) return json({ error: "Not found" }, 404, cors);

  const record = row as Record<string, unknown>;
  return json(
    {
      id: record.id,
      userId: record.user_id,
      title: record.title,
      data: JSON.parse(record.data_json as string),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    },
    200,
    cors
  );
}

async function handleSaveFloorplan(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as {
    userId?: string;
    title?: string;
    data?: unknown;
    id?: string;
  };

  const userId = parseUserId(body.userId);
  if (!userId) return json({ error: "Invalid userId" }, 400, cors);
  if (!body.data) return json({ error: "Missing floorplan data" }, 400, cors);

  const id = body.id || crypto.randomUUID();
  const title = (body.title || "Untitled").slice(0, 200);
  const dataJson = JSON.stringify(body.data);

  await env.DB.prepare(
    `INSERT INTO floorplans (id, user_id, title, data_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       data_json = excluded.data_json,
       updated_at = datetime('now')`
  )
    .bind(id, userId, title, dataJson)
    .run();

  return json({ id, userId, title }, 200, cors);
}

async function handleConvert(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  try {
    const body = (await request.json()) as {
      image?: string;
      additionalContext?: string;
      roomLabel?: string;
      model?: string;
      windowFacing?: "north" | "south" | "east" | "west" | "auto";
      highlightRegions?: Array<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        label?: string;
      }>;
    };
    if (!body.image) {
      return json({ error: "Missing image in request body" }, 400, cors);
    }

    const { provider, apiKey } = resolveExtractionCredentials(env);
    const defaultModel = env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
    const extractOpts = {
      additionalContext: body.additionalContext,
      roomLabel: body.roomLabel,
      model: body.model,
      defaultModel,
    };
    const parsed =
      body.highlightRegions && body.highlightRegions.length > 0
        ? provider === "gemini"
          ? await extractMissedItemsViaGemini(apiKey, body.image, {
              ...extractOpts,
              highlightRegions: body.highlightRegions,
            })
          : await extractMissedItemsFromImage(apiKey, body.image, {
              ...extractOpts,
              highlightRegions: body.highlightRegions,
            })
        : provider === "gemini"
          ? await extractFloorplanViaGemini(apiKey, body.image, {
              ...extractOpts,
              windowFacing: body.windowFacing,
            })
          : await extractFloorplanFromImage(apiKey, body.image, {
              ...extractOpts,
              windowFacing: body.windowFacing,
            });
    return json(parsed, 200, cors);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Conversion failed";
    const isAuthError =
      message.includes("401") ||
      message.includes("403") ||
      message.includes("User not found") ||
      message.includes("OPENROUTER_API_KEY") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("No AI API key") ||
      message.includes("Invalid API key") ||
      message.includes("API key not valid");
    return json(
      {
        error: isAuthError
          ? "AI API key missing or invalid. Set OPENROUTER_API_KEY or GEMINI_API_KEY on the Worker (wrangler secret put)."
          : message,
      },
      isAuthError ? 401 : 500,
      cors
    );
  }
}

function handleListModels(env: Env, cors: HeadersInit): Response {
  return json(
    {
      provider: "openrouter",
      defaultModel: env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
      models: EXTRACTION_MODELS,
    },
    200,
    cors
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      const r = await handleHealth(env);
      const headers = new Headers(r.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      return new Response(r.body, { status: r.status, headers });
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env, cors);
    }

    if (url.pathname === "/api/users/claim" && request.method === "POST") {
      return handleClaimAccount(request, env, cors);
    }

    if (url.pathname === "/api/files/list" && request.method === "GET") {
      return handleListFiles(url, env, cors);
    }

    if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
      return handleGetFile(url.pathname, env, cors);
    }

    if (url.pathname === "/api/floorplans" && request.method === "GET") {
      return handleListFloorplans(url, env, cors);
    }

    if (url.pathname === "/api/floorplans" && request.method === "POST") {
      return handleSaveFloorplan(request, env, cors);
    }

    const floorplanMatch = url.pathname.match(/^\/api\/floorplans\/([^/]+)$/);
    if (floorplanMatch && request.method === "GET") {
      return handleGetFloorplan(floorplanMatch[1], env, cors);
    }

    if (url.pathname === "/api/models" && request.method === "GET") {
      return handleListModels(env, cors);
    }

    if (url.pathname === "/api/convert-floorplan" && request.method === "POST") {
      return handleConvert(request, env, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  },
};
