import { DEFAULT_EXTRACTION_MODEL, resolveModelId } from "./openRouterModels";

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
        },
        required: ["id", "name", "x", "y"],
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

const SYSTEM_INSTRUCTION = `You are a precision architectural floorplan digitization engine.
Trace every visible element from the floorplan image into structured vector coordinates with maximum geometric fidelity.

COORDINATE SYSTEM: 0–1000 grid, (0,0) top-left. Integer coordinates only.
WALL TYPES: exterior, interior, partition, double
DOOR TYPES: hinged, sliding, folding, pocket, double
WINDOW TYPES: fixed, sliding, casement, bay

ANTI-HALLUCINATION: Extract ONLY elements explicitly drawn. Do not invent rooms or walls.

Respond with valid JSON only matching this schema:
${JSON.stringify(FLOORPLAN_RESPONSE_SCHEMA)}`;

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

export interface ExtractionOptions {
  additionalContext?: string;
  model?: string;
  defaultModel?: string;
}

export async function extractFloorplanFromImage(
  apiKey: string,
  image: string,
  options: ExtractionOptions = {}
): Promise<Record<string, unknown>> {
  const { base64Data, mimeType, dataUrl } = parseImagePayload(image);
  const model = resolveModelId(options.model, options.defaultModel ?? DEFAULT_EXTRACTION_MODEL);

  const promptText = `Digitize this floorplan image with precision architectural tracing.

Extract ALL visible elements:
1. walls — every wall segment with (x1,y1,x2,y2) and type (exterior|interior|partition|double)
2. doors — center anchor (x,y), width, orientation (h|v), swing (n|s|e|w), doorType
3. windows — center (x,y), width, orientation (h|v), windowType
4. rooms — name, label center (x,y), estimatedAreaM2 if inferable
5. fixtures — type, center (x,y), width, height, rotation, optional label

User context: ${options.additionalContext || "None"}

Return integer coordinates 0–1000. Ensure wall junctions connect cleanly.`;

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
  return JSON.parse(cleaned) as Record<string, unknown>;
}
