export interface OpenRouterModel {
  id: string;
  label: string;
  provider: string;
  description: string;
}

export const DEFAULT_EXTRACTION_MODEL = "google/gemini-2.5-flash";

export const EXTRACTION_MODELS: OpenRouterModel[] = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    description: "Fast, strong vision — recommended default",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    description: "Higher accuracy, slower",
  },
  {
    id: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    provider: "Google",
    description: "Reliable vision model",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    description: "Strong multimodal reasoning",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "OpenAI",
    description: "Faster, lower cost",
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    description: "Precise spatial reasoning",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "Proven vision performance",
  },
  {
    id: "qwen/qwen-vl-plus",
    label: "Qwen VL Plus",
    provider: "Qwen",
    description: "Cost-effective vision",
  },
];

export function resolveModelId(requested?: string, fallback = DEFAULT_EXTRACTION_MODEL): string {
  const model = requested?.trim() || fallback;
  const known = EXTRACTION_MODELS.some((m) => m.id === model);
  if (!known && requested?.trim()) {
    return model;
  }
  return known ? model : fallback;
}
