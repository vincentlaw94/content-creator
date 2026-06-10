import { analyzeImage } from "../../../shared/llm.js";
import type { Scene, KeyframeAnalysis } from "../../../shared/types.js";
import {
  extractKeyframes,
  detectSceneChanges,
  analyzeMotion,
  getAudioLevels,
} from "./ffprobe.js";
import path from "path";
import fs from "fs";

export interface SceneDetectionResult {
  scenes: Scene[];
  keyframes: KeyframeAnalysis[];
}

export async function detectScenes(
  videoPath: string,
  tempDir: string,
  duration: number
): Promise<SceneDetectionResult> {
  // Extract keyframes for visual analysis
  const keyframePaths = await extractKeyframes(videoPath, tempDir, 2);

  // Get scene changes from FFmpeg
  const sceneChanges = await detectSceneChanges(videoPath, 0.3);

  // Get motion intensity data
  const motionData = await analyzeMotion(videoPath, 1);

  // Get audio levels
  const audioLevels = await getAudioLevels(videoPath);

  // Build scene boundaries from scene changes
  const sceneBoundaries: number[] = [0];
  for (const change of sceneChanges) {
    if (change.timestamp > sceneBoundaries[sceneBoundaries.length - 1] + 2) {
      sceneBoundaries.push(change.timestamp);
    }
  }
  sceneBoundaries.push(duration);

  // Analyze keyframes with vision model
  const keyframeAnalyses: KeyframeAnalysis[] = [];

  for (let i = 0; i < keyframePaths.length; i++) {
    const keyframePath = keyframePaths[i];
    const timestamp = i * 2; // 2-second intervals

    try {
      const analysis = await analyzeKeyframe(keyframePath, timestamp);
      keyframeAnalyses.push(analysis);
    } catch (error) {
      console.error(`Failed to analyze keyframe at ${timestamp}s:`, error);
      keyframeAnalyses.push({
        timestamp,
        imagePath: keyframePath,
        description: "Analysis failed",
        objects: [],
        activity: undefined,
        location: undefined,
        mood: undefined,
      });
    }
  }

  // Build scenes from boundaries and analysis
  const scenes: Scene[] = [];

  for (let i = 0; i < sceneBoundaries.length - 1; i++) {
    const startTime = sceneBoundaries[i];
    const endTime = sceneBoundaries[i + 1];

    // Find keyframes within this scene
    const sceneKeyframes = keyframeAnalyses.filter(
      (kf) => kf.timestamp >= startTime && kf.timestamp < endTime
    );

    // Calculate average motion intensity for this scene
    const sceneMotion = motionData.filter(
      (m) => m.timestamp >= startTime && m.timestamp < endTime
    );
    const avgMotion =
      sceneMotion.length > 0
        ? sceneMotion.reduce((sum, m) => sum + m.intensity, 0) / sceneMotion.length
        : 0;

    // Calculate average audio level for this scene
    const sceneAudio = audioLevels.filter(
      (a) => a.timestamp >= startTime && a.timestamp < endTime
    );
    const avgAudio =
      sceneAudio.length > 0
        ? sceneAudio.reduce((sum, a) => sum + a.level, 0) / sceneAudio.length
        : -60;

    // Determine scene type from keyframe analysis
    const sceneType = determineSceneType(sceneKeyframes, avgMotion);

    // Build scene description from keyframes
    const description = buildSceneDescription(sceneKeyframes);

    scenes.push({
      startTime,
      endTime,
      type: sceneType,
      description,
      motionIntensity: Math.min(1, avgMotion),
      audioLevel: avgAudio,
      keyframeUrl: sceneKeyframes[0]?.imagePath,
    });
  }

  return { scenes, keyframes: keyframeAnalyses };
}

async function analyzeKeyframe(
  imagePath: string,
  timestamp: number
): Promise<KeyframeAnalysis> {
  const prompt = `Analyze this video frame for content creation. Provide a JSON response with:
{
  "description": "Brief description of what's happening",
  "objects": ["list", "of", "visible", "objects"],
  "activity": "Main activity being performed (cycling, climbing, walking, resting, etc.)",
  "location": "Type of location (outdoor trail, indoor gym, urban street, cafe, etc.)",
  "mood": "Overall mood/vibe (energetic, calm, exciting, scenic, etc.)"
}`;

  const response = await analyzeImage(imagePath, prompt, {
    maxTokens: 300,
    detail: "low",
  });

  try {
    // Try to parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        timestamp,
        imagePath,
        description: parsed.description || "No description",
        objects: parsed.objects || [],
        activity: parsed.activity,
        location: parsed.location,
        mood: parsed.mood,
      };
    }
  } catch {
    // If JSON parsing fails, use the raw response as description
  }

  return {
    timestamp,
    imagePath,
    description: response.slice(0, 200),
    objects: [],
  };
}

function determineSceneType(
  keyframes: KeyframeAnalysis[],
  motionIntensity: number
): Scene["type"] {
  // Aggregate activities and locations from keyframes
  const activities = keyframes
    .map((kf) => kf.activity?.toLowerCase())
    .filter(Boolean) as string[];
  const locations = keyframes
    .map((kf) => kf.location?.toLowerCase())
    .filter(Boolean) as string[];

  // Check for action scenes (high motion + action activities)
  const actionActivities = ["cycling", "climbing", "running", "jumping", "biking"];
  const hasAction = activities.some((a) =>
    actionActivities.some((action) => a.includes(action))
  );
  if (hasAction && motionIntensity > 0.3) {
    return "action";
  }

  // Check for indoor vs outdoor
  const isOutdoor = locations.some(
    (l) =>
      l.includes("outdoor") ||
      l.includes("trail") ||
      l.includes("mountain") ||
      l.includes("street") ||
      l.includes("park")
  );
  const isIndoor = locations.some(
    (l) =>
      l.includes("indoor") ||
      l.includes("gym") ||
      l.includes("cafe") ||
      l.includes("room")
  );

  // Check for rest scenes
  const restActivities = ["resting", "sitting", "eating", "drinking", "talking"];
  const isResting = activities.some((a) =>
    restActivities.some((rest) => a.includes(rest))
  );
  if (isResting || motionIntensity < 0.1) {
    return "rest";
  }

  // High motion without specific activity = transition
  if (motionIntensity > 0.5 && !hasAction) {
    return "transition";
  }

  // Default based on location
  if (isOutdoor) return "outdoor";
  if (isIndoor) return "indoor";

  return "unknown";
}

function buildSceneDescription(keyframes: KeyframeAnalysis[]): string {
  if (keyframes.length === 0) return "No visual data available";

  // Get unique descriptions
  const descriptions = [...new Set(keyframes.map((kf) => kf.description))];

  // Get unique objects
  const allObjects = keyframes.flatMap((kf) => kf.objects);
  const uniqueObjects = [...new Set(allObjects)].slice(0, 5);

  // Build description
  const parts: string[] = [];

  if (descriptions.length > 0) {
    parts.push(descriptions[0]);
  }

  if (uniqueObjects.length > 0) {
    parts.push(`Objects: ${uniqueObjects.join(", ")}`);
  }

  const activities = keyframes
    .map((kf) => kf.activity)
    .filter(Boolean) as string[];
  if (activities.length > 0) {
    const uniqueActivities = [...new Set(activities)];
    parts.push(`Activity: ${uniqueActivities.join(", ")}`);
  }

  return parts.join(". ");
}

export async function cleanupKeyframes(tempDir: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(tempDir);
    await Promise.all(
      files
        .filter((f) => f.includes("_keyframe_") && f.endsWith(".jpg"))
        .map((f) => fs.promises.unlink(path.join(tempDir, f)))
    );
  } catch {
    // Ignore cleanup errors
  }
}
