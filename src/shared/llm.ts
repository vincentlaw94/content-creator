import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface TextGenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export async function generateText(
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<string> {
  const anthropic = getAnthropicClient();
  const {
    model = "claude-sonnet-4-6",
    temperature = 0.7,
    maxTokens = 2000,
    systemPrompt,
  } = options;

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export interface VisionAnalysisOptions {
  model?: string;
  maxTokens?: number;
}

export async function analyzeImage(
  imagePath: string,
  prompt: string,
  options: VisionAnalysisOptions = {}
): Promise<string> {
  const anthropic = getAnthropicClient();
  const { model = "claude-sonnet-4-6", maxTokens = 1000 } = options;

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = getMimeType(imagePath) as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64Image,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export async function analyzeMultipleImages(
  imagePaths: string[],
  prompt: string,
  options: VisionAnalysisOptions = {}
): Promise<string> {
  const anthropic = getAnthropicClient();
  const { model = "claude-sonnet-4-6", maxTokens = 2000 } = options;

  const imageContent: Anthropic.MessageParam["content"] = imagePaths.map((imagePath) => {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = getMimeType(imagePath) as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mimeType,
        data: base64Image,
      },
    };
  });

  imageContent.push({ type: "text", text: prompt });

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: imageContent }],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "";
}

export interface JSONGenerationOptions extends TextGenerationOptions {
  schema?: Record<string, unknown>;
}

export async function generateJSON<T>(
  prompt: string,
  options: JSONGenerationOptions = {}
): Promise<T> {
  const anthropic = getAnthropicClient();
  const {
    model = "claude-sonnet-4-6",
    temperature = 0.5,
    maxTokens = 2000,
    systemPrompt,
  } = options;

  const jsonSystemPrompt = systemPrompt
    ? `${systemPrompt}\n\nYou must respond with valid JSON only, no additional text or markdown fences.`
    : "You must respond with valid JSON only, no additional text or markdown fences.";

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: jsonSystemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  const content = block.type === "text" ? block.text : "{}";

  // Strip markdown fences if present
  const cleaned = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function transcribeAudio(
  audioPath: string,
  _language?: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  // Anthropic does not offer audio transcription — return empty transcript.
  // Set WHISPER_MODEL_PATH to use local whisper-cpp instead.
  const whisperPath = process.env.WHISPER_MODEL_PATH;
  if (whisperPath && fs.existsSync(whisperPath)) {
    return transcribeWithLocalWhisper(audioPath, whisperPath);
  }
  console.log("[LLM] Audio transcription skipped (no Whisper configured)");
  return { text: "", segments: [] };
}

async function transcribeWithLocalWhisper(
  audioPath: string,
  whisperPath: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const whisper = spawn("whisper-cpp", ["-m", whisperPath, "-f", audioPath, "-oj", "--print-progress", "false"]);
    let stdout = "";
    let stderr = "";
    whisper.stdout.on("data", (d) => { stdout += d.toString(); });
    whisper.stderr.on("data", (d) => { stderr += d.toString(); });
    whisper.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper failed: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve({ text: result.text || "", segments: result.segments || [] });
      } catch {
        reject(new Error("Failed to parse Whisper output"));
      }
    });
  });
}

export async function generateEmbedding(_text: string): Promise<number[]> {
  // Anthropic does not expose an embeddings endpoint — return empty vector.
  return [];
}

export async function moderateContent(_text: string): Promise<{
  flagged: boolean;
  categories: Record<string, boolean>;
}> {
  return { flagged: false, categories: {} };
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
}
