import path from "path";
import fs from "fs";
import { probeVideo, detectSceneChanges, extractKeyframes } from "./ffprobe.js";
import { analyzeImage } from "../../../shared/llm.js";
import type { FootageMetadata } from "../../../shared/types.js";

export interface QuickKeyframeAnalysis {
  timestamp: number;
  description: string;
  activity?: string;
  location?: string;
  mood?: string;
  headTurn: boolean;
  nearIntersection: boolean;
}

export interface QuickFootageAnalysis {
  path: string;
  name: string;
  metadata: FootageMetadata;
  sceneCount: number;
  keyframes: QuickKeyframeAnalysis[];
  summary: string;
  flags: string[];
}

const MAX_KEYFRAMES = 8;
const MIN_INTERVAL_SEC = 3;

const KEYFRAME_PROMPT = `Analyze this video frame for editing purposes. Respond with JSON only:
{
  "description": "Brief description of what's happening",
  "activity": "Main activity (cycling, climbing, walking, resting, etc.)",
  "location": "Type of location (outdoor trail, urban street, intersection, cafe, etc.)",
  "mood": "Overall mood/vibe (energetic, calm, exciting, scenic, etc.)",
  "headTurn": true or false — whether the camera/rider's point of view appears to be mid-turn of the head (looking sideways or behind rather than forward),
  "nearIntersection": true or false — whether the frame shows a street intersection or crosswalk the rider/camera appears to be crossing
}`;

function parseKeyframeResponse(raw: string, timestamp: number): QuickKeyframeAnalysis {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        timestamp,
        description: parsed.description || "No description",
        activity: parsed.activity || undefined,
        location: parsed.location || undefined,
        mood: parsed.mood || undefined,
        headTurn: !!parsed.headTurn,
        nearIntersection: !!parsed.nearIntersection,
      };
    }
  } catch {
    // fall through to raw text below
  }
  return {
    timestamp,
    description: raw.slice(0, 200) || "Analysis failed",
    headTurn: false,
    nearIntersection: false,
  };
}

function buildSummary(
  metadata: FootageMetadata,
  sceneCount: number,
  keyframes: QuickKeyframeAnalysis[]
): string {
  const parts: string[] = [];
  parts.push(`${Math.round(metadata.duration)}s at ${metadata.width}x${metadata.height}, ${metadata.fps}fps${metadata.hasAudio ? ", with audio" : ", no audio"}`);
  parts.push(`${sceneCount} scene cut${sceneCount === 1 ? "" : "s"} detected`);

  const descriptions = [...new Set(keyframes.map((k) => k.description))].slice(0, 3);
  if (descriptions.length) parts.push(`Content: ${descriptions.join("; ")}`);

  const activities = [...new Set(keyframes.map((k) => k.activity).filter(Boolean))];
  if (activities.length) parts.push(`Activity: ${activities.join(", ")}`);

  return parts.join(". ");
}

function buildFlags(keyframes: QuickKeyframeAnalysis[]): string[] {
  const flags: string[] = [];
  for (const kf of keyframes) {
    if (kf.headTurn) {
      flags.push(`Possible head-turn shot near ${kf.timestamp.toFixed(0)}s — likely shaky/blurred`);
    }
    if (kf.nearIntersection) {
      flags.push(`Near an intersection/crossing at ${kf.timestamp.toFixed(0)}s — avoid cutting mid-crossing`);
    }
  }
  return flags;
}

export async function quickAnalyzeFootage(
  filePath: string,
  tempDir: string
): Promise<QuickFootageAnalysis> {
  const metadata = await probeVideo(filePath);
  const sceneChanges = await detectSceneChanges(filePath, 0.3).catch(() => []);

  const keyframeCount = Math.max(3, Math.min(MAX_KEYFRAMES, Math.round(metadata.duration / 15) || 3));
  const interval = Math.max(MIN_INTERVAL_SEC, metadata.duration / keyframeCount);

  const keyframeDir = path.join(
    tempDir,
    `${path.basename(filePath, path.extname(filePath))}_${Date.now()}`
  );

  let keyframes: QuickKeyframeAnalysis[] = [];
  try {
    const keyframePaths = await extractKeyframes(filePath, keyframeDir, interval);
    keyframes = await Promise.all(
      keyframePaths.slice(0, MAX_KEYFRAMES).map(async (kfPath, i) => {
        const timestamp = i * interval;
        try {
          const raw = await analyzeImage(kfPath, KEYFRAME_PROMPT, { maxTokens: 250 });
          return parseKeyframeResponse(raw, timestamp);
        } catch {
          return { timestamp, description: "Analysis failed", headTurn: false, nearIntersection: false };
        }
      })
    );
  } finally {
    await fs.promises.rm(keyframeDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    path: filePath,
    name: path.basename(filePath),
    metadata,
    sceneCount: sceneChanges.length,
    keyframes,
    summary: buildSummary(metadata, sceneChanges.length, keyframes),
    flags: buildFlags(keyframes),
  };
}
