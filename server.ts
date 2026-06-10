import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  function getApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error(
        "GEMINI_API_KEY is not set. Create a key at https://aistudio.google.com/apikey and add it to .env.local"
      );
    }
    if (!apiKey.startsWith("AIza")) {
      throw new Error(
        "GEMINI_API_KEY format is invalid. Use a Gemini API key from https://aistudio.google.com/apikey (starts with AIzaSy). AI Studio runtime tokens (AQ.*) do not work for local development."
      );
    }
    return apiKey;
  }

  let ai: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!ai) {
      ai = new GoogleGenAI({
        apiKey: getApiKey(),
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return ai;
  }

  app.get("/api/health", (req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      geminiKeyConfigured: Boolean(key && key !== "MY_GEMINI_API_KEY"),
      geminiKeyFormatValid: Boolean(key?.startsWith("AIza")),
    });
  });

  app.post("/api/convert-floorplan", async (req, res) => {
    try {
      const { image, additionalContext } = req.body;
      if (!image) {
        res.status(400).json({ error: "Missing image in request body" });
        return;
      }

      let base64Data = image;
      let mimeType = "image/jpeg";

      if (image.includes(";base64,")) {
        const parts = image.split(";base64,");
        mimeType = parts[0].replace("data:", "");
        base64Data = parts[1];
      }

      const client = getGeminiClient();

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const systemInstruction = `You are a precision architectural floorplan digitization engine.
Your task is to trace every visible architectural element from the uploaded floorplan image into structured vector coordinates with maximum geometric fidelity.

COORDINATE SYSTEM:
- Use a 0–1000 grid for both X and Y, mapping to the image bounding box.
- (0,0) is top-left; (1000,1000) is bottom-right.
- All coordinates must be integers.
- Snap nearly-aligned walls (within ~3 units) to exact horizontal/vertical alignment.
- Wall segment endpoints that meet at corners MUST share identical coordinates.

WALL TYPES (classify each segment precisely):
- "exterior": outer perimeter / structural shell walls (typically thickest lines)
- "interior": load-bearing or standard room-dividing walls
- "partition": thin non-structural dividers, cubicle walls, half-walls
- "double": parallel double-line walls (cavity walls, fire-rated assemblies)

DOOR TYPES (doorType field):
- "hinged": standard swing door with quarter-circle arc
- "sliding": parallel track lines, patio/sliding glass doors
- "folding": accordion/bifold panels
- "pocket": door sliding into wall cavity (dashed line into wall pocket)
- "double": paired swing doors (two arcs meeting at center)

WINDOW TYPES (windowType field):
- "fixed": standard glazed opening
- "sliding": two-panel sliding sash
- "casement": hinged outward with small swing arc
- "bay": angled projection bay window

FIXTURES: Trace fixed elements visible in plan view:
- staircase (stair runs with direction), toilet, bathtub, shower, sink, stove, column, bed, sofa, table
- Provide bounding box center (x,y), width, height, rotation (0/90/180/270), and type string.

ANTI-HALLUCINATION: Extract ONLY elements explicitly drawn in the image. Do NOT invent rooms, walls, doors, or fixtures not visible. If only one room is shown, extract only that room.

GEOMETRIC FIDELITY: Trace wall segments at their actual positions. Break walls at door/window openings. Preserve relative proportions and angles.`;

      const promptText = `Digitize this floorplan image with precision architectural tracing.

Extract ALL visible elements:
1. walls — every wall segment with (x1,y1,x2,y2) and type (exterior|interior|partition|double)
2. doors — center anchor (x,y), width, orientation (h|v), swing (n|s|e|w), doorType (hinged|sliding|folding|pocket|double)
3. windows — center (x,y), width, orientation (h|v), windowType (fixed|sliding|casement|bay)
4. rooms — name, label center (x,y), estimatedAreaM2 if inferable
5. fixtures — fixed plan-view elements: type, center (x,y), width, height, rotation (degrees), optional label

User context: ${additionalContext || "None"}

Return integer coordinates 0–1000. Ensure wall junctions connect cleanly.`;

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [imagePart, { text: promptText }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              walls: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    x1: { type: Type.INTEGER },
                    y1: { type: Type.INTEGER },
                    x2: { type: Type.INTEGER },
                    y2: { type: Type.INTEGER },
                    type: {
                      type: Type.STRING,
                      description: "exterior, interior, partition, or double",
                    },
                  },
                  required: ["id", "x1", "y1", "x2", "y2", "type"],
                },
              },
              doors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    x: { type: Type.INTEGER },
                    y: { type: Type.INTEGER },
                    width: { type: Type.INTEGER },
                    orientation: { type: Type.STRING },
                    swing: { type: Type.STRING },
                    doorType: {
                      type: Type.STRING,
                      description: "hinged, sliding, folding, pocket, or double",
                    },
                  },
                  required: ["id", "x", "y", "width", "orientation", "swing"],
                },
              },
              windows: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    x: { type: Type.INTEGER },
                    y: { type: Type.INTEGER },
                    width: { type: Type.INTEGER },
                    orientation: { type: Type.STRING },
                    windowType: {
                      type: Type.STRING,
                      description: "fixed, sliding, casement, or bay",
                    },
                  },
                  required: ["id", "x", "y", "width", "orientation"],
                },
              },
              rooms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    x: { type: Type.INTEGER },
                    y: { type: Type.INTEGER },
                    estimatedAreaM2: { type: Type.NUMBER },
                  },
                  required: ["id", "name", "x", "y"],
                },
              },
              fixtures: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: {
                      type: Type.STRING,
                      description: "staircase, toilet, bathtub, shower, sink, stove, column, bed, sofa, table",
                    },
                    x: { type: Type.INTEGER },
                    y: { type: Type.INTEGER },
                    width: { type: Type.INTEGER },
                    height: { type: Type.INTEGER },
                    rotation: { type: Type.INTEGER },
                    label: { type: Type.STRING },
                  },
                  required: ["id", "type", "x", "y", "width", "height"],
                },
              },
            },
            required: ["walls", "doors", "windows", "rooms"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response string from Gemini model");
      }

      const parsedJSON = JSON.parse(text);
      res.json(parsedJSON);
    } catch (error: any) {
      console.error("Floorplan Conversion Error:", error);
      const message = error.message || "An error occurred during floorplan conversion.";
      const isAuthError =
        message.includes("API key not valid") ||
        message.includes("API_KEY_INVALID") ||
        message.includes("GEMINI_API_KEY");
      res.status(isAuthError ? 401 : 500).json({
        error: isAuthError
          ? "Invalid Gemini API key. Get a key at https://aistudio.google.com/apikey (must start with AIzaSy) and set GEMINI_API_KEY in .env.local, then restart the server."
          : message,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
