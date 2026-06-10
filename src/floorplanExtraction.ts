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
Your task is to trace every visible architectural element from the uploaded floorplan image into structured vector coordinates with maximum geometric fidelity.

COORDINATE SYSTEM:
- Use a 0–1000 grid for both X and Y, mapping to the image bounding box.
- (0,0) is top-left; (1000,1000) is bottom-right.
- All coordinates must be integers.
- Snap nearly-aligned walls (within ~3 units) to exact horizontal/vertical alignment.
- Wall segment endpoints that meet at corners MUST share identical coordinates.

WALL TYPES: exterior, interior, partition, double
DOOR TYPES: hinged, sliding, folding, pocket, double
WINDOW TYPES: fixed, sliding, casement, bay

ANTI-HALLUCINATION: Extract ONLY elements explicitly drawn in the image.`;

export function parseImagePayload(image: string): { base64Data: string; mimeType: string } {
  let base64Data = image;
  let mimeType = "image/jpeg";
  if (image.includes(";base64,")) {
    const parts = image.split(";base64,");
    mimeType = parts[0].replace("data:", "");
    base64Data = parts[1];
  }
  return { base64Data, mimeType };
}

export function validateApiKey(apiKey: string | undefined): string {
  const key = apiKey?.trim();
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not set. Create a key at https://aistudio.google.com/apikey"
    );
  }
  if (!key.startsWith("AIza")) {
    throw new Error(
      "GEMINI_API_KEY format is invalid. Use a key from https://aistudio.google.com/apikey (starts with AIzaSy)."
    );
  }
  return key;
}

export async function extractFloorplanFromImage(
  apiKey: string,
  image: string,
  additionalContext?: string
): Promise<Record<string, unknown>> {
  const { base64Data, mimeType } = parseImagePayload(image);

  const promptText = `Digitize this floorplan image with precision architectural tracing.

Extract ALL visible elements:
1. walls — every wall segment with (x1,y1,x2,y2) and type (exterior|interior|partition|double)
2. doors — center anchor (x,y), width, orientation (h|v), swing (n|s|e|w), doorType (hinged|sliding|folding|pocket|double)
3. windows — center (x,y), width, orientation (h|v), windowType (fixed|sliding|casement|bay)
4. rooms — name, label center (x,y), estimatedAreaM2 if inferable
5. fixtures — fixed plan-view elements: type, center (x,y), width, height, rotation (degrees), optional label

User context: ${additionalContext || "None"}

Return integer coordinates 0–1000. Ensure wall junctions connect cleanly.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Data } },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: FLOORPLAN_RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Gemini API error ${response.status}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini model");
  }

  return JSON.parse(text) as Record<string, unknown>;
}
