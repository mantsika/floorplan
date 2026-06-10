import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import {
  extractFloorplanFromImage,
  validateOpenRouterApiKey,
} from "./src/floorplanExtraction";
import { DEFAULT_EXTRACTION_MODEL, EXTRACTION_MODELS } from "./src/openRouterModels";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (req, res) => {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      openRouterKeyConfigured: Boolean(key && key !== "MY_OPENROUTER_API_KEY"),
      defaultModel: process.env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
      provider: "openrouter",
    });
  });

  app.get("/api/models", (req, res) => {
    res.json({
      provider: "openrouter",
      defaultModel: process.env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
      models: EXTRACTION_MODELS,
    });
  });

  app.post("/api/convert-floorplan", async (req, res) => {
    try {
      const { image, additionalContext, model } = req.body;
      if (!image) {
        res.status(400).json({ error: "Missing image in request body" });
        return;
      }

      const apiKey = validateOpenRouterApiKey(process.env.OPENROUTER_API_KEY);
      const parsed = await extractFloorplanFromImage(apiKey, image, {
        additionalContext,
        model,
        defaultModel: process.env.DEFAULT_EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
      });
      res.json(parsed);
    } catch (error: any) {
      console.error("Floorplan Conversion Error:", error);
      const message = error.message || "An error occurred during floorplan conversion.";
      const isAuthError =
        message.includes("OPENROUTER_API_KEY") ||
        message.includes("401") ||
        message.includes("Invalid API key");
      res.status(isAuthError ? 401 : 500).json({
        error: isAuthError
          ? "Invalid OpenRouter API key. Set OPENROUTER_API_KEY in .env.local from https://openrouter.ai/keys"
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
