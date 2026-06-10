import { DEFAULT_EXTRACTION_MODEL, resolveModelId } from "./openRouterModels";
import { postProcessExtraction } from "./extractionPostProcess";

export const FLOORPLAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    walls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          x1: { type: "integer" },
          y1: { type: "integer" },
          x2: { type: "integer" },
          y2: { type: "integer" },
          type: { type: "string" },
        },
        required: ["id", "x1", "y1", "x2", "y2", "type"],
      },
    },
    doors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          orientation: { type: "string" },
          swing: { type: "string" },
          doorType: { type: "string" },
        },
        required: ["id", "x", "y", "width", "orientation", "swing"],
      },
    },
    windows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          orientation: { type: "string" },
          windowType: { type: "string" },
        },
        required: ["id", "x", "y", "width", "orientation"],
      },
    },
    rooms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          estimatedAreaM2: { type: "number" },
          estimatedWidthM: { type: "number" },
          estimatedDepthM: { type: "number" },
        },
        required: ["id", "name", "x", "y", "estimatedAreaM2", "estimatedWidthM", "estimatedDepthM"],
      },
    },
    fixtures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          x: { type: "integer" },
          y: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          rotation: { type: "integer" },
          label: { type: "string" },
        },
        required: ["id", "type", "x", "y", "width", "height"],
      },
    },
  },
  required: ["walls", "doors", "windows", "rooms"],
} as const;

const SYSTEM_INSTRUCTION = `You are an architectural floor plan reconstruction engine for FloorPlan.ai.

Users upload interior room photographs. Output a 2D TOP-DOWN floor plan as structured vector JSON.

COORDINATE SYSTEM: 0–1000 grid, (0,0) top-left. Integer coordinates only.

GEOMETRY — highest priority:
- Draw a RECTANGULAR room boundary using exactly 4 wall segments forming a closed rectangle.
- Each room has UNIQUE real dimensions — kitchens are smaller/narrower than living rooms. NEVER use identical proportions for every room.
- estimatedWidthM and estimatedDepthM (meters) are REQUIRED in rooms[] — infer from photo perspective and typical sizes (kitchen 2.5–4.5m × 3–5m, living room 4–7m × 4–6m).
- The 0–1000 wall rectangle ASPECT RATIO must match estimatedWidthM : estimatedDepthM (e.g. 3.2m × 4.8m → grid width 533, height 800).
- estimatedAreaM2 must equal widthM × depthM (approximately).
- Wall segments must meet at corners with clean right angles.

CAMERA → PLAN MAPPING (critical for interior photos):
- Photos are always taken looking INTO the room (photographer behind camera, room ahead).
- DEFAULT: the FAR WALL (windows, glass, balcony) opposite the camera → TOP of plan (north, y ≈ 100).
- USER OVERRIDE: if hints say window faces south/east/west, place glass on that plan edge instead (south = bottom/high y, east = right/high x, west = left/low x).
- Floor-to-ceiling glass must appear on the correct wall segment for the stated facing direction.

WINDOWS — required on glass walls:
- One LARGE window on the designated exterior wall. Default top wall: width 500–700, centered (x ≈ 500), y = 100, orientation "h".
- orientation MUST be "h" or "v" only.

DOORS — required beside glass:
- Sliding door with handle to the LEFT of the fixed glass on the same wall (lower x than window center).
- Example: window x=550 width=500 → door x=180 width=100, y=100, orientation "h", doorType "sliding", swing "w".
- orientation: "h" or "v" only. swing: "n"|"s"|"e"|"w" only.

EXTERIOR:
- Visible balcony/terrace beyond glass: fixture type "balcony" outside the room on that facade.

ROOMS:
- Name the room (Living Room, Kitchen, etc.).
- REQUIRED: estimatedWidthM, estimatedDepthM, estimatedAreaM2 — each room gets different values based on the actual space.

FIXTURES — ARCHITECTURAL / BUILT-IN ONLY (never movable furniture):
- INCLUDE: cabinet, wall_cabinet, counter, island, fireplace, light_fitting, built-in appliances (sink, stove, fridge, dishwasher, washing_machine), toilet, bathtub, shower, staircase, column, balcony, patio
- EXCLUDE: sofas, beds, tables, chairs, armchairs, rugs, TV units, floor lamps, decorative movable items — do NOT return these
- KITCHENS: extract ALL visible built-in runs — base cabinets along walls (type "cabinet"), wall_cabinet, counter, island, and fixed appliances
- BATHROOMS: toilet, sink, shower/bathtub, vanity cabinet (type "cabinet")
- LIVING ROOMS: only built-ins — fireplace, light_fitting, fixed cabinetry; empty fixtures[] is correct when no built-ins are visible
- POSITION: map each built-in to its real wall/floor location on the 0–1000 plan
- ORIENTATION (rotation, degrees): 0 = long axis horizontal; 90/180/270 for wall-aligned built-ins

Respond with valid JSON only matching this schema:
${JSON.stringify(FLOORPLAN_RESPONSE_SCHEMA)}`;

const FIXTURE_EXTRACTION_PROMPT = `5. fixtures — ARCHITECTURAL / BUILT-IN ONLY:
   - INCLUDE: cabinet, wall_cabinet, counter, island, fireplace, light_fitting, sink, stove, fridge, dishwasher, washing_machine, toilet, bathtub, shower, staircase, column, balcony, patio
   - EXCLUDE all movable furniture (sofas, beds, tables, chairs, rugs, TV units, lamps)
   - Empty fixtures[] is OK for rooms with no built-ins`;

export function parseImagePayload(image: string): { base64Data: string; mimeType: string; dataUrl: string } {
  let base64Data = image;
  let mimeType = "image/jpeg";
  if (image.includes(";base64,")) {
    const parts = image.split(";base64,");
    mimeType = parts[0].replace("data:", "");
    base64Data = parts[1];
  }
  return { base64Data, mimeType, dataUrl: `data:${mimeType};base64,${base64Data}` };
}

export function validateOpenRouterApiKey(apiKey: string | undefined): string {
  const key = apiKey?.trim();
  if (!key || key === "MY_OPENROUTER_API_KEY") {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/keys"
    );
  }
  return key;
}

export type ExtractionProvider = "openrouter" | "gemini";

export interface ExtractionCredentials {
  provider: ExtractionProvider;
  apiKey: string;
}

export function resolveExtractionCredentials(env: {
  OPENROUTER_API_KEY?: string;
  GEMINI_API_KEY?: string;
}): ExtractionCredentials {
  const openRouter = env.OPENROUTER_API_KEY?.trim();
  if (openRouter && openRouter !== "MY_OPENROUTER_API_KEY") {
    return { provider: "openrouter", apiKey: validateOpenRouterApiKey(openRouter) };
  }

  const gemini = env.GEMINI_API_KEY?.trim();
  if (gemini && gemini !== "MY_GEMINI_API_KEY") {
    return { provider: "gemini", apiKey: gemini };
  }

  throw new Error(
    "No AI API key configured. Set OPENROUTER_API_KEY (https://openrouter.ai/keys) or GEMINI_API_KEY on the Worker."
  );
}

export function resolveGeminiModelId(openRouterModelId: string): string {
  if (openRouterModelId.startsWith("google/")) {
    return openRouterModelId.slice("google/".length);
  }
  return "gemini-2.5-flash";
}

const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isAiOverloadError(message: string): boolean {
  return /503|429|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|overloaded|rate limit/i.test(message);
}

export function formatAiErrorMessage(message: string): string {
  let text = message;
  try {
    const outer = JSON.parse(message) as { error?: { message?: string } };
    if (outer.error?.message) text = outer.error.message;
  } catch {
    // use raw message
  }
  if (isAiOverloadError(text)) {
    return "AI model is temporarily busy. Wait a moment and try again, or pick another model in Settings.";
  }
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

function isRetryableGeminiError(message: string): boolean {
  return isAiOverloadError(message);
}

function geminiModelCandidates(requestedModel: string): string[] {
  const models = [requestedModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== requestedModel)];
  return [...new Set(models)];
}

async function callGeminiJson(
  apiKey: string,
  model: string,
  promptText: string,
  image: { base64Data: string; mimeType: string },
  maxOutputTokens: number
): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: image.mimeType, data: image.base64Data } },
            { text: promptText },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.15,
        maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Gemini API error ${response.status}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };

  if (result.error?.message) {
    throw new Error(result.error.message);
  }

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`No response from Gemini model ${model}`);
  }

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`Gemini returned invalid JSON from model ${model}`);
  }
}

async function callGeminiJsonWithFallback(
  apiKey: string,
  requestedModel: string,
  promptText: string,
  image: { base64Data: string; mimeType: string },
  maxOutputTokens: number
): Promise<Record<string, unknown>> {
  const models = geminiModelCandidates(requestedModel);
  let lastError = "Gemini extraction failed";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callGeminiJson(apiKey, model, promptText, image, maxOutputTokens);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : lastError;
        if (isRetryableGeminiError(lastError)) {
          if (attempt === 0) {
            await sleep(1200);
            continue;
          }
          break;
        }
        throw error instanceof Error ? error : new Error(lastError);
      }
    }
  }

  throw new Error(formatAiErrorMessage(lastError));
}

export interface HighlightRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

export type WindowFacing = "north" | "south" | "east" | "west" | "auto";

export interface ExtractionOptions {
  additionalContext?: string;
  roomLabel?: string;
  model?: string;
  defaultModel?: string;
  highlightRegions?: HighlightRegion[];
  windowFacing?: WindowFacing;
}

const FACING_PLAN_HINT: Record<Exclude<WindowFacing, "auto">, string> = {
  north: "TOP of plan (low y ≈ 100) — window on top wall segment",
  south: "BOTTOM of plan (high y ≈ 900) — window on bottom wall segment",
  east: "RIGHT side (high x ≈ 900) — window on right wall segment",
  west: "LEFT side (low x ≈ 100) — window on left wall segment",
};

export function buildWindowFacingHint(facing: WindowFacing = "north"): string {
  if (facing === "auto") {
    return "Window placement: default — main glass/window on the wall opposite the camera (top of plan / north) unless the photo clearly shows otherwise.";
  }
  return `Window placement (property orientation): the main window/glass wall faces ${facing.toUpperCase()} on the real property. Place the window on the ${FACING_PLAN_HINT[facing]}. All photos are taken looking INTO the room away from the photographer.`;
}

const MISSED_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    doors: FLOORPLAN_RESPONSE_SCHEMA.properties.doors,
    windows: FLOORPLAN_RESPONSE_SCHEMA.properties.windows,
    fixtures: FLOORPLAN_RESPONSE_SCHEMA.properties.fixtures,
  },
  required: ["doors", "windows"],
} as const;

export async function extractFloorplanFromImage(
  apiKey: string,
  image: string,
  options: ExtractionOptions = {}
): Promise<Record<string, unknown>> {
  const { dataUrl } = parseImagePayload(image);
  const model = resolveModelId(options.model, options.defaultModel ?? DEFAULT_EXTRACTION_MODEL);
  const roomLabel = options.roomLabel?.trim() || "Room";
  const userHints = options.additionalContext?.trim() || "None";
  const facingHint = buildWindowFacingHint(options.windowFacing ?? "north");

  const promptText = `Reconstruct a top-down floor plan from this interior room photo.

Room hint: ${roomLabel}
User hints: ${userHints}
${facingHint}

Requirements:
1. walls — exactly 4 segments; grid aspect ratio MUST match estimatedWidthM:estimatedDepthM (NOT identical for every room)
2. windows — ALL glass visible. orientation: "h" or "v" only
3. doors — any operable panel. orientation: "h" or "v". swing: "n"/"s"/"e"/"w"
4. rooms — name + estimatedWidthM + estimatedDepthM + estimatedAreaM2 (all required, unique per room)
${FIXTURE_EXTRACTION_PROMPT}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://floorplan-a6a.pages.dev",
      "X-Title": "FloorPlan.ai",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: promptText },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `OpenRouter API error ${response.status}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (result.error?.message) {
    throw new Error(result.error.message);
  }

  const text = result.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`No response from model ${model}`);
  }

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return postProcessExtraction(parsed);
}

/** Focused pass: user highlighted regions where the first extraction missed items */
export async function extractMissedItemsFromImage(
  apiKey: string,
  image: string,
  options: ExtractionOptions & { highlightRegions: HighlightRegion[] }
): Promise<Record<string, unknown>> {
  const { dataUrl } = parseImagePayload(image);
  const model = resolveModelId(options.model, options.defaultModel ?? DEFAULT_EXTRACTION_MODEL);
  const roomLabel = options.roomLabel?.trim() || "Room";
  const userHints = options.additionalContext?.trim() || "None";

  const regionsText = options.highlightRegions
    .map(
      (r, i) =>
        `Region ${i + 1}${r.label ? ` (${r.label})` : ""}: x ${r.x1}–${r.x2}, y ${r.y1}–${r.y2} on 0–1000 grid`
    )
    .join("\n");

  const promptText = `This room photo already has a partial floor plan. The user highlighted regions where elements were MISSED.

Room: ${roomLabel}
User hints: ${userHints}

Highlighted regions (0–1000 coords, top-left origin):
${regionsText}

Return ONLY doors, windows, and architectural fixtures inside these highlighted regions.
- Do NOT return walls, rooms, or movable furniture (sofas, beds, tables, chairs).
- Built-in fixtures only: cabinets, counters, appliances, fireplace, light_fitting, etc.
- Use the same 0–1000 coordinate system as the full extraction.
- orientation: "h" or "v" only. swing: "n"|"s"|"e"|"w" for doors.
- If a region marks a side door beside glass, return a sliding door with correct width and position.
- Return empty arrays when nothing is found in a category.

Respond with valid JSON only:
${JSON.stringify(MISSED_ITEMS_SCHEMA)}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://floorplan-a6a.pages.dev",
      "X-Title": "FloorPlan.ai",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: promptText },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `OpenRouter API error ${response.status}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (result.error?.message) {
    throw new Error(result.error.message);
  }

  const text = result.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`No response from model ${model}`);
  }

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  return postProcessExtraction({
    walls: [],
    rooms: [],
    doors: parsed.doors ?? [],
    windows: parsed.windows ?? [],
    fixtures: parsed.fixtures ?? [],
  });
}

/** Direct Gemini API — used when OPENROUTER_API_KEY is not configured on the Worker */
export async function extractFloorplanViaGemini(
  apiKey: string,
  image: string,
  options: ExtractionOptions = {}
): Promise<Record<string, unknown>> {
  const imagePayload = parseImagePayload(image);
  const model = resolveGeminiModelId(
    resolveModelId(options.model, options.defaultModel ?? DEFAULT_EXTRACTION_MODEL)
  );
  const roomLabel = options.roomLabel?.trim() || "Room";
  const userHints = options.additionalContext?.trim() || "None";
  const facingHint = buildWindowFacingHint(options.windowFacing ?? "north");

  const promptText = `Reconstruct a top-down floor plan from this interior room photo.

Room hint: ${roomLabel}
User hints: ${userHints}
${facingHint}

Requirements:
1. walls — exactly 4 segments; grid aspect ratio MUST match estimatedWidthM:estimatedDepthM (NOT identical for every room)
2. windows — ALL glass visible. orientation: "h" or "v" only
3. doors — any operable panel. orientation: "h" or "v". swing: "n"/"s"/"e"/"w"
4. rooms — name + estimatedWidthM + estimatedDepthM + estimatedAreaM2 (all required, unique per room)
${FIXTURE_EXTRACTION_PROMPT}`;

  const parsed = await callGeminiJsonWithFallback(apiKey, model, promptText, imagePayload, 8192);
  return postProcessExtraction(parsed);
}

export async function extractMissedItemsViaGemini(
  apiKey: string,
  image: string,
  options: ExtractionOptions & { highlightRegions: HighlightRegion[] }
): Promise<Record<string, unknown>> {
  const imagePayload = parseImagePayload(image);
  const model = resolveGeminiModelId(
    resolveModelId(options.model, options.defaultModel ?? DEFAULT_EXTRACTION_MODEL)
  );
  const roomLabel = options.roomLabel?.trim() || "Room";
  const userHints = options.additionalContext?.trim() || "None";

  const regionsText = options.highlightRegions
    .map(
      (r, i) =>
        `Region ${i + 1}${r.label ? ` (${r.label})` : ""}: x ${r.x1}–${r.x2}, y ${r.y1}–${r.y2} on 0–1000 grid`
    )
    .join("\n");

  const promptText = `This room photo already has a partial floor plan. The user highlighted regions where elements were MISSED.

Room: ${roomLabel}
User hints: ${userHints}

Highlighted regions (0–1000 coords, top-left origin):
${regionsText}

Return ONLY doors, windows, and architectural fixtures inside these highlighted regions.
- Do NOT return walls, rooms, or movable furniture (sofas, beds, tables, chairs).
- Built-in fixtures only: cabinets, counters, appliances, fireplace, light_fitting, etc.
- Use the same 0–1000 coordinate system as the full extraction.
- orientation: "h" or "v" only. swing: "n"|"s"|"e"|"w" for doors.
- If a region marks a side door beside glass, return a sliding door with correct width and position.
- Return empty arrays when nothing is found in a category.

Respond with valid JSON only:
${JSON.stringify(MISSED_ITEMS_SCHEMA)}`;

  const parsed = await callGeminiJsonWithFallback(apiKey, model, promptText, imagePayload, 4096);
  return postProcessExtraction({
    walls: [],
    rooms: [],
    doors: parsed.doors ?? [],
    windows: parsed.windows ?? [],
    fixtures: parsed.fixtures ?? [],
  });
}
