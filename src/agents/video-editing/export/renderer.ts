import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import {
  concatenateClips,
  extractClip,
  addAudioTrack,
  applyColorGrading,
  resizeForPlatform,
} from "../analysis/ffprobe.js";
import type { VideoProject, TimelineClip } from "../../../shared/types.js";

export interface RenderOptions {
  outputDir: string;
  quality?: "draft" | "production";
  useRemotionComposition?: boolean;
}

export interface RenderResult {
  youtube?: string;
  tiktok?: string;
  instagram?: string;
  thumbnails: string[];
}

export async function renderProject(
  project: VideoProject,
  options: RenderOptions
): Promise<RenderResult> {
  const { outputDir, quality = "production", useRemotionComposition = false } = options;

  await fs.promises.mkdir(outputDir, { recursive: true });

  const result: RenderResult = { thumbnails: [] };
  const tempDir = path.join(outputDir, "temp");
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    // Step 1: Extract and process individual clips
    const processedClips = await processClips(project.timeline, tempDir, quality);

    // Step 2: Concatenate clips
    const concatenatedPath = path.join(tempDir, "concatenated.mp4");
    await concatenateClips(processedClips, concatenatedPath);

    // Step 3: Apply color grading if specified
    let gradedPath = concatenatedPath;
    if (project.colorGrading) {
      gradedPath = path.join(tempDir, "graded.mp4");
      await applyColorGrading(concatenatedPath, gradedPath, project.colorGrading);
    }

    // Step 4: Add music if specified
    let withMusicPath = gradedPath;
    if (project.music) {
      withMusicPath = path.join(tempDir, "with_music.mp4");
      await addAudioTrack(gradedPath, project.music.file, withMusicPath, project.music.volume);
    }

    // Step 5: Export to each requested format
    for (const format of project.outputFormats) {
      const outputPath = path.join(outputDir, `${project.id}_${format}.mp4`);
      await resizeForPlatform(withMusicPath, outputPath, format);
      result[format] = outputPath;
    }

    // Step 6: Generate thumbnails from key moments
    result.thumbnails = await generateThumbnails(project, outputDir);

  } finally {
    // Cleanup temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }

  return result;
}

async function processClips(
  timeline: TimelineClip[],
  tempDir: string,
  quality: "draft" | "production"
): Promise<string[]> {
  const processedPaths: string[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const clip = timeline[i];
    const clipPath = path.join(tempDir, `clip_${i.toString().padStart(3, "0")}.mp4`);

    // Extract the clip from source
    await extractClip(clip.sourceFile, clipPath, clip.startTime, clip.endTime);

    // Apply effects if any
    if (clip.effects.length > 0) {
      const effectsPath = path.join(tempDir, `clip_${i.toString().padStart(3, "0")}_fx.mp4`);
      await applyEffects(clipPath, effectsPath, clip.effects);
      await fs.promises.unlink(clipPath);
      await fs.promises.rename(effectsPath, clipPath);
    }

    processedPaths.push(clipPath);
  }

  return processedPaths;
}

async function applyEffects(
  inputPath: string,
  outputPath: string,
  effects: string[]
): Promise<void> {
  const ffmpeg = (await import("fluent-ffmpeg")).default;

  const filters: string[] = [];

  for (const effect of effects) {
    const [type, value] = effect.split(":");

    switch (type) {
      case "speed":
        const speed = parseFloat(value);
        filters.push(`setpts=${1 / speed}*PTS`);
        break;
      case "zoom":
        const zoom = parseFloat(value);
        filters.push(`scale=iw*${zoom}:ih*${zoom},crop=iw/${zoom}:ih/${zoom}`);
        break;
      case "saturation":
        const sat = parseFloat(value);
        filters.push(`eq=saturation=${sat}`);
        break;
      case "brightness":
        const bright = parseFloat(value);
        filters.push(`eq=brightness=${bright}`);
        break;
      case "contrast":
        const contrast = parseFloat(value);
        filters.push(`eq=contrast=${contrast}`);
        break;
    }
  }

  if (filters.length === 0) {
    // No filters, just copy
    await fs.promises.copyFile(inputPath, outputPath);
    return;
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(filters)
      .output(outputPath)
      .outputOptions(["-c:a copy"])
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

async function generateThumbnails(
  project: VideoProject,
  outputDir: string
): Promise<string[]> {
  const { generateThumbnail } = await import("../analysis/ffprobe.js");
  const thumbnails: string[] = [];

  if (project.timeline.length === 0) return thumbnails;

  // Generate thumbnail from first clip (hook)
  const firstClip = project.timeline[0];
  const hookThumbnail = path.join(outputDir, `${project.id}_thumb_hook.jpg`);
  const hookTime = firstClip.startTime + (firstClip.endTime - firstClip.startTime) / 2;
  await generateThumbnail(firstClip.sourceFile, hookThumbnail, hookTime);
  thumbnails.push(hookThumbnail);

  // Generate thumbnail from middle (representative)
  const midIndex = Math.floor(project.timeline.length / 2);
  const midClip = project.timeline[midIndex];
  const midThumbnail = path.join(outputDir, `${project.id}_thumb_mid.jpg`);
  const midTime = midClip.startTime + (midClip.endTime - midClip.startTime) / 2;
  await generateThumbnail(midClip.sourceFile, midThumbnail, midTime);
  thumbnails.push(midThumbnail);

  return thumbnails;
}

// Remotion-based rendering for more complex compositions
export async function renderWithRemotion(
  project: VideoProject,
  compositionId: string,
  outputPath: string
): Promise<string> {
  const remotionRoot = path.join(process.cwd(), "src", "remotion");
  const entryPoint = path.join(remotionRoot, "index.ts");

  // Bundle the Remotion project
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  // Select the composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps: {
      project,
    },
  });

  // Render the video
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: {
      project,
    },
  });

  return outputPath;
}

export function estimateRenderTime(project: VideoProject): number {
  // Rough estimate: 2x realtime for draft, 5x for production
  const totalDuration = project.timeline.reduce(
    (sum, clip) => sum + (clip.endTime - clip.startTime),
    0
  );

  const complexityMultiplier = 1 + project.timeline.length * 0.1;
  const formatMultiplier = project.outputFormats.length;

  return totalDuration * 5 * complexityMultiplier * formatMultiplier;
}
