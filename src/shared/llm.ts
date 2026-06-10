import OpenAI from "openai";
import fs from "fs";
import path from "path";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    client = new OpenAI({ apiKey });
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
  const openai = getOpenAIClient();
  const {
    model = "gpt-4-turbo-preview",
    temperature = 0.7,
    maxTokens = 2000,
    systemPrompt,
  } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

export interface VisionAnalysisOptions {
  model?: string;
  maxTokens?: number;
  detail?: "low" | "high" | "auto";
}

export async function analyzeImage(
  imagePath: string,
  prompt: string,
  options: VisionAnalysisOptions = {}
): Promise<string> {
  const openai = getOpenAIClient();
  const { model = "gpt-4o", maxTokens = 1000, detail = "auto" } = options;

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = getMimeType(imagePath);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

export async function analyzeMultipleImages(
  imagePaths: string[],
  prompt: string,
  options: VisionAnalysisOptions = {}
): Promise<string> {
  const openai = getOpenAIClient();
  const { model = "gpt-4o", maxTokens = 2000, detail = "low" } = options;

  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = imagePaths.map(
    (imagePath) => {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");
      const mimeType = getMimeType(imagePath);
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${mimeType};base64,${base64Image}`,
          detail,
        },
      };
    }
  );

  imageContent.push({ type: "text", text: prompt });

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: imageContent }],
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content || "";
}

export interface JSONGenerationOptions extends TextGenerationOptions {
  schema?: Record<string, unknown>;
}

export async function generateJSON<T>(
  prompt: string,
  options: JSONGenerationOptions = {}
): Promise<T> {
  const openai = getOpenAIClient();
  const {
    model = "gpt-4-turbo-preview",
    temperature = 0.5,
    maxTokens = 2000,
    systemPrompt,
  } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  const jsonSystemPrompt = systemPrompt
    ? `${systemPrompt}\n\nYou must respond with valid JSON only, no additional text.`
    : "You must respond with valid JSON only, no additional text.";

  messages.push({ role: "system", content: jsonSystemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as T;
}

export async function transcribeAudio(
  audioPath: string,
  language?: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  // Check if local Whisper is configured
  const whisperPath = process.env.WHISPER_MODEL_PATH;

  if (whisperPath && fs.existsSync(whisperPath)) {
    return transcribeWithLocalWhisper(audioPath, whisperPath, language);
  }

  // Fall back to OpenAI Whisper API
  return transcribeWithOpenAI(audioPath, language);
}

async function transcribeWithOpenAI(
  audioPath: string,
  language?: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const openai = getOpenAIClient();

  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    language,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const result = response as unknown as {
    text: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: result.text,
    segments: result.segments || [],
  };
}

async function transcribeWithLocalWhisper(
  audioPath: string,
  whisperPath: string,
  language?: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  // This is a placeholder for local Whisper integration
  // In production, you would use whisper.cpp or Python Whisper
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const args = [
      "-m", whisperPath,
      "-f", audioPath,
      "-oj", // Output JSON
      "--print-progress", "false",
    ];

    if (language) {
      args.push("-l", language);
    }

    const whisper = spawn("whisper-cpp", args);
    let stdout = "";
    let stderr = "";

    whisper.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    whisper.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    whisper.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve({
          text: result.text || "",
          segments: result.segments || [],
        });
      } catch {
        reject(new Error("Failed to parse Whisper output"));
      }
    });
  });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0]?.embedding || [];
}

export async function moderateContent(text: string): Promise<{
  flagged: boolean;
  categories: Record<string, boolean>;
}> {
  const openai = getOpenAIClient();

  const response = await openai.moderations.create({
    input: text,
  });

  const result = response.results[0];
  return {
    flagged: result?.flagged || false,
    categories: result?.categories as unknown as Record<string, boolean> || {},
  };
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

// Utility for retrying API calls
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
