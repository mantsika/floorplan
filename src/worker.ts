import {
  extractFloorplanFromImage,
  validateApiKey,
} from "./floorplanExtraction";

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  GEMINI_API_KEY: string;
  PAGES_ORIGIN?: string;
}

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

function r2Key(userId: string, fileName: string): string {
  return `${userId}/${fileName}`;
}

function parseUserId(raw: string | null | undefined): string | null {
  const userId = raw?.trim();
  if (!userId || !USER_ID_PATTERN.test(userId)) return null;
  return userId;
}

async function handleHealth(env: Env): Promise<Response> {
  let d1Ok = false;
  try {
    await env.DB.prepare("SELECT 1").first();
    d1Ok = true;
  } catch {
    d1Ok = false;
  }

  const key = env.GEMINI_API_KEY?.trim();
  return json({
    status: "ok",
    time: new Date().toISOString(),
    d1Connected: d1Ok,
    geminiKeyConfigured: Boolean(key && key !== "MY_GEMINI_API_KEY"),
    geminiKeyFormatValid: Boolean(key?.startsWith("AIza")),
  });
}

async function handleUpload(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const body = (await request.json()) as {
    userId?: string;
    fileName?: string;
    mimeType?: string;
    data?: string;
  };

  const userId = parseUserId(body.userId);
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
  const objectKey = r2Key(userId, `${Date.now()}-${safeName}`);
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const uploadId = crypto.randomUUID();

  await env.BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { userId, originalName: safeName },
  });

  await env.DB.prepare(
    `INSERT INTO uploads (id, user_id, r2_key, file_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(uploadId, userId, objectKey, safeName, mimeType, bytes.byteLength)
    .run();

  return json(
    {
      id: uploadId,
      key: objectKey,
      userId,
      url: `/api/files/${objectKey}`,
      fileName: safeName,
    },
    201,
    cors
  );
}

async function handleListFiles(url: URL, env: Env, cors: HeadersInit): Promise<Response> {
  const userId = parseUserId(url.searchParams.get("userId"));
  if (!userId) return json({ error: "Invalid userId" }, 400, cors);

  const { results } = await env.DB.prepare(
    `SELECT id, r2_key AS key, file_name, mime_type, size_bytes, created_at
     FROM uploads WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
  )
    .bind(userId)
    .all();

  const files = (results as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    key: row.key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    uploaded: row.created_at,
    url: `/api/files/${row.key}`,
  }));

  return json({ userId, files }, 200, cors);
}

async function handleGetFile(pathname: string, env: Env, cors: HeadersInit): Promise<Response> {
  const key = pathname.replace(/^\/api\/files\//, "");
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
    const body = (await request.json()) as { image?: string; additionalContext?: string };
    if (!body.image) {
      return json({ error: "Missing image in request body" }, 400, cors);
    }

    const apiKey = validateApiKey(env.GEMINI_API_KEY);
    const parsed = await extractFloorplanFromImage(apiKey, body.image, body.additionalContext);
    return json(parsed, 200, cors);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Conversion failed";
    const isAuthError =
      message.includes("API key not valid") ||
      message.includes("API_KEY_INVALID") ||
      message.includes("GEMINI_API_KEY");
    return json(
      {
        error: isAuthError
          ? "Invalid Gemini API key. Set GEMINI_API_KEY via wrangler secret put GEMINI_API_KEY"
          : message,
      },
      isAuthError ? 401 : 500,
      cors
    );
  }
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

    if (url.pathname === "/api/convert-floorplan" && request.method === "POST") {
      return handleConvert(request, env, cors);
    }

    return json({ error: "Not found" }, 404, cors);
  },
};
