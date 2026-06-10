import type { Scene, Highlight, StoryPlan, NarrativeMoment } from "../../../shared/types.js";

export interface ScoringOptions {
  storyPlan?: StoryPlan;
  preferredDuration?: number;
  minClipDuration?: number;
  maxClipDuration?: number;
}

export function scoreHighlights(
  scenes: Scene[],
  options: ScoringOptions = {}
): Highlight[] {
  const {
    storyPlan,
    minClipDuration = 1,
    maxClipDuration = 15,
  } = options;

  const highlights: Highlight[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = scene.endTime - scene.startTime;

    // Skip scenes that are too short or too long
    if (duration < minClipDuration) continue;

    // Calculate base score from scene characteristics
    let score = calculateBaseScore(scene);

    // Boost score if scene matches story plan
    if (storyPlan) {
      score += calculateStoryBoost(scene, storyPlan.narrative);
    }

    // Apply scene type modifiers
    score += getSceneTypeModifier(scene.type);

    // Consider context from surrounding scenes
    score += getContextModifier(scenes, i);

    // Normalize score to 0-100
    score = Math.min(100, Math.max(0, score));

    const suggestedDuration = calculateSuggestedDuration(
      duration,
      scene,
      minClipDuration,
      maxClipDuration
    );

    highlights.push({
      sceneIndex: i,
      score: Math.round(score),
      reason: generateReason(scene, score),
      suggestedDuration,
    });
  }

  // Sort by score descending
  highlights.sort((a, b) => b.score - a.score);

  return highlights;
}

function calculateBaseScore(scene: Scene): number {
  let score = 50; // Base score

  // Motion intensity contributes to engagement
  score += scene.motionIntensity * 20;

  // Audio level (normalized from dB to 0-1 range)
  // -60dB = silent, -20dB = moderate, 0dB = loud
  const normalizedAudio = Math.min(1, Math.max(0, (scene.audioLevel + 60) / 60));
  score += normalizedAudio * 10;

  // Longer scenes that maintain interest are valuable
  const duration = scene.endTime - scene.startTime;
  if (duration >= 3 && duration <= 10) {
    score += 10;
  } else if (duration > 10) {
    score += 5;
  }

  return score;
}

function calculateStoryBoost(scene: Scene, narrative: NarrativeMoment[]): number {
  let boost = 0;

  for (const moment of narrative) {
    // Check if scene overlaps with narrative moment
    const momentEnd = moment.endTimestamp || moment.timestamp + 5;
    const overlaps =
      scene.startTime <= momentEnd && scene.endTime >= moment.timestamp;

    if (overlaps) {
      switch (moment.importance) {
        case "critical":
          boost += 30;
          break;
        case "supporting":
          boost += 15;
          break;
        case "optional":
          boost += 5;
          break;
      }
    }
  }

  return boost;
}

function getSceneTypeModifier(type: Scene["type"]): number {
  const modifiers: Record<Scene["type"], number> = {
    action: 15,
    outdoor: 5,
    indoor: 0,
    rest: -5,
    transition: -10,
    unknown: 0,
  };
  return modifiers[type];
}

function getContextModifier(scenes: Scene[], index: number): number {
  let modifier = 0;

  // First scene gets a boost (potential hook)
  if (index === 0) {
    modifier += 10;
  }

  // Scene following a rest/transition is more impactful
  if (index > 0) {
    const prevScene = scenes[index - 1];
    if (prevScene.type === "rest" || prevScene.type === "transition") {
      modifier += 5;
    }
  }

  // Scene before a climax (high motion) scene provides buildup
  if (index < scenes.length - 1) {
    const nextScene = scenes[index + 1];
    if (nextScene.motionIntensity > 0.7) {
      modifier += 5;
    }
  }

  return modifier;
}

function calculateSuggestedDuration(
  actualDuration: number,
  scene: Scene,
  minDuration: number,
  maxDuration: number
): number {
  // For action scenes, keep them punchy
  if (scene.type === "action") {
    return Math.min(actualDuration, Math.max(minDuration, 5));
  }

  // For rest scenes, keep them brief
  if (scene.type === "rest") {
    return Math.min(actualDuration, Math.max(minDuration, 3));
  }

  // For outdoor/scenic scenes, allow longer duration
  if (scene.type === "outdoor" && scene.motionIntensity < 0.3) {
    return Math.min(actualDuration, maxDuration);
  }

  // Default: use a moderate duration
  return Math.min(actualDuration, Math.max(minDuration, 6));
}

function generateReason(scene: Scene, score: number): string {
  const reasons: string[] = [];

  if (scene.type === "action" && scene.motionIntensity > 0.5) {
    reasons.push("High-energy action moment");
  }

  if (scene.motionIntensity > 0.7) {
    reasons.push("Dynamic movement");
  }

  if (scene.type === "outdoor") {
    reasons.push("Scenic outdoor footage");
  }

  if (score >= 80) {
    reasons.push("Prime highlight material");
  } else if (score >= 60) {
    reasons.push("Good supporting content");
  }

  if (scene.audioLevel > -30) {
    reasons.push("Clear audio");
  }

  if (reasons.length === 0) {
    reasons.push("Standard footage");
  }

  return reasons.join("; ");
}

export function selectHighlightsForDuration(
  highlights: Highlight[],
  scenes: Scene[],
  targetDuration: number
): Highlight[] {
  const selected: Highlight[] = [];
  let totalDuration = 0;

  // Always try to include the highest scoring highlights
  for (const highlight of highlights) {
    if (totalDuration >= targetDuration) break;

    const scene = scenes[highlight.sceneIndex];
    const clipDuration = Math.min(
      highlight.suggestedDuration,
      scene.endTime - scene.startTime
    );

    // Don't exceed target by more than 20%
    if (totalDuration + clipDuration > targetDuration * 1.2) {
      continue;
    }

    selected.push(highlight);
    totalDuration += clipDuration;
  }

  // Sort selected highlights by scene order for coherent narrative
  selected.sort((a, b) => a.sceneIndex - b.sceneIndex);

  return selected;
}

export function reorderForNarrative(
  highlights: Highlight[],
  scenes: Scene[],
  hookFirst = true
): Highlight[] {
  if (highlights.length === 0) return [];

  const reordered = [...highlights];

  if (hookFirst) {
    // Find the best hook (action or high-score scene)
    const hookCandidates = reordered.filter((h) => {
      const scene = scenes[h.sceneIndex];
      return scene.type === "action" || h.score >= 70;
    });

    if (hookCandidates.length > 0) {
      // Move the highest scoring hook candidate to the front
      hookCandidates.sort((a, b) => b.score - a.score);
      const hookIndex = reordered.indexOf(hookCandidates[0]);
      if (hookIndex > 0) {
        const [hook] = reordered.splice(hookIndex, 1);
        reordered.unshift(hook);
      }
    }
  }

  return reordered;
}
