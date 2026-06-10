import path from "path";
import { analyzeMultipleImages, generateJSON } from "../../shared/llm.js";
import type { FootageAnalysis, KeyframeAnalysis, Scene } from "../../shared/types.js";

export interface ContentInsights {
  mainSubject: string;
  activities: string[];
  locations: string[];
  mood: string;
  visualStyle: string;
  potentialHooks: string[];
  audienceAppeal: string[];
}

export async function analyzeContentForStory(
  analysis: FootageAnalysis,
  userContext: string
): Promise<ContentInsights> {
  // Select representative keyframes for batch analysis
  const keyframes = selectRepresentativeKeyframes(analysis.keyframes, 8);
  const keyframePaths = keyframes.map((kf) => kf.imagePath);

  // Build context from existing analysis
  const sceneDescriptions = analysis.scenes
    .map((s, i) => `Scene ${i + 1} (${s.type}): ${s.description}`)
    .join("\n");

  const transcriptText = analysis.transcript
    .map((t) => t.text)
    .join(" ")
    .slice(0, 500);

  const prompt = `Analyze this video content for creating an engaging social media story.

USER CONTEXT: ${userContext}

SCENE DESCRIPTIONS:
${sceneDescriptions}

TRANSCRIPT EXCERPT:
${transcriptText || "No speech detected"}

Based on the images and context above, provide a JSON analysis:
{
  "mainSubject": "Primary focus of the video",
  "activities": ["list", "of", "activities", "shown"],
  "locations": ["types", "of", "locations"],
  "mood": "Overall mood/vibe (energetic, peaceful, adventurous, etc.)",
  "visualStyle": "Visual characteristics (POV, cinematic, raw, etc.)",
  "potentialHooks": ["3-5 potential hook ideas for the first 3 seconds"],
  "audienceAppeal": ["target audience segments this would appeal to"]
}`;

  try {
    if (keyframePaths.length > 0) {
      const response = await analyzeMultipleImages(keyframePaths, prompt, {
        maxTokens: 1000,
        detail: "low",
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ContentInsights;
      }
    }

    // Fallback to text-only analysis if no keyframes
    return await generateJSON<ContentInsights>(prompt, {
      maxTokens: 1000,
    });
  } catch (error) {
    console.error("Content analysis failed:", error);
    return {
      mainSubject: extractMainSubject(analysis, userContext),
      activities: extractActivities(analysis),
      locations: extractLocations(analysis),
      mood: determineMood(analysis),
      visualStyle: "raw footage",
      potentialHooks: generateDefaultHooks(userContext),
      audienceAppeal: ["lifestyle enthusiasts", "adventure seekers"],
    };
  }
}

function selectRepresentativeKeyframes(
  keyframes: KeyframeAnalysis[],
  count: number
): KeyframeAnalysis[] {
  if (keyframes.length <= count) return keyframes;

  // Select evenly distributed keyframes
  const step = Math.floor(keyframes.length / count);
  const selected: KeyframeAnalysis[] = [];

  for (let i = 0; i < count; i++) {
    selected.push(keyframes[i * step]);
  }

  return selected;
}

function extractMainSubject(analysis: FootageAnalysis, context: string): string {
  // Try to extract from context first
  const contextLower = context.toLowerCase();
  if (contextLower.includes("cycling") || contextLower.includes("bike")) {
    return "cycling adventure";
  }
  if (contextLower.includes("climbing") || contextLower.includes("boulder")) {
    return "climbing session";
  }
  if (contextLower.includes("travel")) {
    return "travel exploration";
  }

  // Extract from scene types
  const actionScenes = analysis.scenes.filter((s) => s.type === "action");
  if (actionScenes.length > analysis.scenes.length / 2) {
    return "action-packed activity";
  }

  const outdoorScenes = analysis.scenes.filter((s) => s.type === "outdoor");
  if (outdoorScenes.length > analysis.scenes.length / 2) {
    return "outdoor exploration";
  }

  return "lifestyle content";
}

function extractActivities(analysis: FootageAnalysis): string[] {
  const activities: Set<string> = new Set();

  for (const keyframe of analysis.keyframes) {
    if (keyframe.activity) {
      activities.add(keyframe.activity);
    }
  }

  // Extract from scene descriptions
  for (const scene of analysis.scenes) {
    const desc = scene.description.toLowerCase();
    if (desc.includes("cycling") || desc.includes("riding")) activities.add("cycling");
    if (desc.includes("climbing")) activities.add("climbing");
    if (desc.includes("walking")) activities.add("walking");
    if (desc.includes("eating") || desc.includes("drinking")) activities.add("eating");
  }

  return Array.from(activities);
}

function extractLocations(analysis: FootageAnalysis): string[] {
  const locations: Set<string> = new Set();

  for (const keyframe of analysis.keyframes) {
    if (keyframe.location) {
      locations.add(keyframe.location);
    }
  }

  // Infer from scene types
  for (const scene of analysis.scenes) {
    if (scene.type === "outdoor") locations.add("outdoor");
    if (scene.type === "indoor") locations.add("indoor");
  }

  return Array.from(locations);
}

function determineMood(analysis: FootageAnalysis): string {
  const avgMotion =
    analysis.scenes.reduce((sum, s) => sum + s.motionIntensity, 0) /
    analysis.scenes.length;

  if (avgMotion > 0.6) return "energetic";
  if (avgMotion > 0.3) return "dynamic";
  return "relaxed";
}

function generateDefaultHooks(context: string): string[] {
  return [
    `Check out ${context}`,
    "You won't believe what happened next",
    "POV: You're about to see something amazing",
    "This is why I love doing this",
    "Best decision I made today",
  ];
}

export function matchScenesToNarrative(
  scenes: Scene[],
  storyBeats: string[]
): Map<number, string> {
  const matches = new Map<number, string>();

  // Simple matching based on scene characteristics and beat keywords
  for (const beat of storyBeats) {
    const beatLower = beat.toLowerCase();
    let bestMatch = -1;
    let bestScore = 0;

    for (let i = 0; i < scenes.length; i++) {
      if (matches.has(i)) continue; // Scene already matched

      const scene = scenes[i];
      let score = 0;

      // Match action beats to action scenes
      if (
        (beatLower.includes("action") ||
          beatLower.includes("exciting") ||
          beatLower.includes("intense")) &&
        scene.type === "action"
      ) {
        score += 10;
      }

      // Match opening/hook to high-motion scenes
      if (
        (beatLower.includes("hook") || beatLower.includes("opening")) &&
        scene.motionIntensity > 0.5
      ) {
        score += 8;
      }

      // Match rest/break to rest scenes
      if (
        (beatLower.includes("rest") ||
          beatLower.includes("calm") ||
          beatLower.includes("break")) &&
        scene.type === "rest"
      ) {
        score += 10;
      }

      // Match scenic/beauty to outdoor scenes with low motion
      if (
        (beatLower.includes("scenic") || beatLower.includes("beautiful")) &&
        scene.type === "outdoor" &&
        scene.motionIntensity < 0.3
      ) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = i;
      }
    }

    if (bestMatch >= 0 && bestScore > 0) {
      matches.set(bestMatch, beat);
    }
  }

  return matches;
}
