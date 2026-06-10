import type {
  Scene,
  Highlight,
  TimelineClip,
  VideoProject,
  StoryPlan,
  TrendingSound,
} from "../../../shared/types.js";
import { v4 as uuid } from "uuid";

export interface CompositionOptions {
  targetDuration?: number;
  platform: "youtube" | "tiktok" | "instagram";
  storyPlan?: StoryPlan;
  sound?: TrendingSound;
  colorGrading?: string;
  transitionStyle?: "cut" | "crossfade" | "dynamic";
}

export interface BeatMarker {
  timestamp: number;
  strength: number; // 0-1, how strong the beat is
}

export function composeTimeline(
  sourceFile: string,
  scenes: Scene[],
  highlights: Highlight[],
  options: CompositionOptions
): VideoProject {
  const {
    platform,
    sound,
    colorGrading,
    transitionStyle = "dynamic",
  } = options;

  const timeline: TimelineClip[] = [];

  // Build clips from highlights
  for (let i = 0; i < highlights.length; i++) {
    const highlight = highlights[i];
    const scene = scenes[highlight.sceneIndex];

    // Calculate clip boundaries
    const clipDuration = Math.min(
      highlight.suggestedDuration,
      scene.endTime - scene.startTime
    );

    // Center the clip within the scene if it's shorter
    let startTime = scene.startTime;
    if (clipDuration < scene.endTime - scene.startTime) {
      startTime = scene.startTime + (scene.endTime - scene.startTime - clipDuration) / 2;
    }

    const endTime = startTime + clipDuration;

    // Determine effects based on scene type
    const effects = getEffectsForScene(scene, platform);

    // Determine transition
    const transition = getTransition(
      i,
      highlights.length,
      transitionStyle,
      scene
    );

    timeline.push({
      sourceFile,
      startTime,
      endTime,
      effects,
      transition,
    });
  }

  // Apply beat sync adjustments if music is provided
  // (This would be done with actual beat detection in production)

  const project: VideoProject = {
    id: uuid(),
    timeline,
    outputFormats: [platform],
    colorGrading,
  };

  if (sound?.previewUrl) {
    project.music = {
      file: sound.previewUrl,
      startTime: 0,
      volume: 0.8,
    };
  }

  return project;
}

function getEffectsForScene(
  scene: Scene,
  platform: "youtube" | "tiktok" | "instagram"
): string[] {
  const effects: string[] = [];

  // Platform-specific adjustments
  if (platform === "tiktok" || platform === "instagram") {
    // Vertical video might need slight zoom for better framing
    effects.push("zoom:1.1");
  }

  // Scene type effects
  switch (scene.type) {
    case "action":
      if (scene.motionIntensity > 0.7) {
        effects.push("speed:1.1"); // Slight speed up for intensity
      }
      break;
    case "outdoor":
      effects.push("saturation:1.1"); // Boost colors for outdoor scenes
      break;
    case "rest":
      effects.push("speed:1.5"); // Speed up rest moments
      break;
  }

  return effects;
}

function getTransition(
  index: number,
  totalClips: number,
  style: "cut" | "crossfade" | "dynamic",
  scene: Scene
): string | undefined {
  // No transition needed for the last clip
  if (index >= totalClips - 1) return undefined;

  switch (style) {
    case "cut":
      return undefined; // Hard cuts

    case "crossfade":
      return "crossfade:0.3";

    case "dynamic":
      // Choose transition based on scene characteristics
      if (scene.type === "action" && scene.motionIntensity > 0.5) {
        return undefined; // Hard cuts for action
      }
      if (scene.type === "rest") {
        return "crossfade:0.5"; // Smooth transition from rest
      }
      if (scene.type === "outdoor") {
        return "crossfade:0.3";
      }
      return "crossfade:0.2"; // Default subtle crossfade
  }
}

export function adjustTimelineToBeats(
  timeline: TimelineClip[],
  beats: BeatMarker[],
  tolerance = 0.2
): TimelineClip[] {
  if (beats.length === 0) return timeline;

  const adjusted: TimelineClip[] = [];
  let currentTime = 0;

  for (const clip of timeline) {
    const clipDuration = clip.endTime - clip.startTime;

    // Find the nearest beat to the current time
    const nearestBeat = beats.reduce((nearest, beat) =>
      Math.abs(beat.timestamp - currentTime) < Math.abs(nearest.timestamp - currentTime)
        ? beat
        : nearest
    );

    // If a beat is close enough, snap to it
    const beatOffset = nearestBeat.timestamp - currentTime;
    if (Math.abs(beatOffset) <= tolerance && nearestBeat.strength > 0.5) {
      // Adjust clip to start on the beat
      // This means slightly extending or trimming the previous clip
      if (adjusted.length > 0) {
        const prevClip = adjusted[adjusted.length - 1];
        const prevDuration = prevClip.endTime - prevClip.startTime;
        // Adjust previous clip end time if possible
        if (prevDuration + beatOffset > 0.5) {
          // Note: In real implementation, we'd need to modify the actual trim points
        }
      }
    }

    adjusted.push({
      ...clip,
      // Keep original source times, adjustments happen in rendering
    });

    currentTime += clipDuration;
  }

  return adjusted;
}

export function calculateTotalDuration(timeline: TimelineClip[]): number {
  return timeline.reduce((total, clip) => {
    // Account for speed effects
    const speedMatch = clip.effects.find((e) => e.startsWith("speed:"));
    const speed = speedMatch ? parseFloat(speedMatch.split(":")[1]) : 1;

    const rawDuration = clip.endTime - clip.startTime;
    return total + rawDuration / speed;
  }, 0);
}

export function trimTimelineToTarget(
  timeline: TimelineClip[],
  targetDuration: number
): TimelineClip[] {
  const currentDuration = calculateTotalDuration(timeline);

  if (currentDuration <= targetDuration) {
    return timeline;
  }

  // Calculate how much to trim
  const trimRatio = targetDuration / currentDuration;

  // Proportionally trim each clip
  return timeline.map((clip) => {
    const rawDuration = clip.endTime - clip.startTime;
    const newDuration = rawDuration * trimRatio;

    // Center the trim
    const trimAmount = rawDuration - newDuration;
    const newStartTime = clip.startTime + trimAmount / 2;
    const newEndTime = clip.endTime - trimAmount / 2;

    return {
      ...clip,
      startTime: newStartTime,
      endTime: newEndTime,
    };
  });
}

export function generateCompositionScript(project: VideoProject): string {
  // Generate a script that can be used with FFmpeg or Remotion
  const lines: string[] = [];

  lines.push("# Video Composition Script");
  lines.push(`# Project ID: ${project.id}`);
  lines.push(`# Output Formats: ${project.outputFormats.join(", ")}`);
  lines.push("");

  lines.push("## Timeline");
  for (let i = 0; i < project.timeline.length; i++) {
    const clip = project.timeline[i];
    lines.push(`Clip ${i + 1}:`);
    lines.push(`  Source: ${clip.sourceFile}`);
    lines.push(`  Time: ${clip.startTime.toFixed(2)}s - ${clip.endTime.toFixed(2)}s`);
    lines.push(`  Effects: ${clip.effects.join(", ") || "none"}`);
    if (clip.transition) {
      lines.push(`  Transition: ${clip.transition}`);
    }
    lines.push("");
  }

  if (project.music) {
    lines.push("## Music");
    lines.push(`  File: ${project.music.file}`);
    lines.push(`  Start: ${project.music.startTime}s`);
    lines.push(`  Volume: ${project.music.volume}`);
    lines.push("");
  }

  if (project.colorGrading) {
    lines.push(`## Color Grading: ${project.colorGrading}`);
  }

  return lines.join("\n");
}
