#!/usr/bin/env node
/**
 * Direct FFmpeg execution script for the 2026-06-30 Vancouver seawall ride.
 * No API key required — uses FFmpeg scene detection + heuristic clip selection.
 *
 * Run: npx tsx src/scripts/execute-seawall.ts [video-number 1-5 or "all"]
 */

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Config ─────────────────────────────────────────────────────────────────

const DL = "/Users/vincentlaw/Downloads";
const OUT = "/Users/vincentlaw/content-creator/public/output";
const TEMP = "/private/tmp/seawall-clips";

// Files have varying dimensions (1376-1552 × 1824-2064). Use dynamic 9:16 crop:
// trunc(ih*9/16/2)*2 = nearest even number to ih*9/16 (H.264 requires even dims)
const CROP_FILTER = "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,scale=1080:1920,setsar=1";
// Subtle grade: slight saturation + contrast lift for outdoor footage
const GRADE_FILTER = "eq=saturation=1.15:contrast=1.05:brightness=0.02";
const VIDEO_FILTER = `${CROP_FILTER},${GRADE_FILTER}`;

interface Clip {
  sourceFile: string;
  start: number;
  duration: number;
}

interface VideoConfig {
  index: number;
  slug: string;
  title: string;
  sources: string[];
  targetDuration: number;
  sourceWeights: number[];  // fraction of clips from each source (must sum to 1.0)
  clipDuration: number;     // seconds per clip
  skipStart: number;        // seconds to skip at start of each source
  skipEnd: number;          // seconds to skip at end of each source
}

const VIDEOS: VideoConfig[] = [
  {
    index: 1,
    slug: "seawall-to-granville-island-2026-06-30",
    title: "POV Seawall to Granville Island",
    sources: [
      `${DL}/1 - seawall to granville 1.MOV`,
      `${DL}/2 - granvile to vanier.MOV`,
    ],
    targetDuration: 50,
    sourceWeights: [0.65, 0.35],
    clipDuration: 4,
    skipStart: 8,
    skipEnd: 8,
  },
  {
    index: 2,
    slug: "vanier-park-elsje-point-2026-06-30",
    title: "Seawall → Vanier Park & Elsje Point",
    sources: [
      `${DL}/2 - granvile to vanier.MOV`,
      `${DL}/3- vanier .MOV`,
    ],
    targetDuration: 50,
    sourceWeights: [0.4, 0.6],
    clipDuration: 5,
    skipStart: 8,
    skipEnd: 8,
  },
  {
    index: 3,
    slug: "senakw-controversy-2026-06-30",
    title: "Sen̓áḵw — Vancouver's Controversial Building",
    sources: [
      `${DL}/4 - show the new vancouver burrard appartment rentals Sen̓áḵw.MOV`,
      `${DL}/5 - burrard bridge and also showing Sen̓áḵw building .MOV`,
    ],
    targetDuration: 55,
    sourceWeights: [0.5, 0.5],
    clipDuration: 5,
    skipStart: 8,
    skipEnd: 8,
  },
  {
    index: 4,
    slug: "burrard-bridge-chandelier-2026-06-30",
    title: "Burrard Bridge + Granville Chandelier",
    sources: [
      `${DL}/5 - burrard bridge and also showing Sen̓áḵw building .MOV`,
      `${DL}/6 - underneath the granvile bridge and chandelier.MOV`,
    ],
    targetDuration: 50,
    sourceWeights: [0.35, 0.65],
    clipDuration: 4.5,
    skipStart: 8,
    skipEnd: 8,
  },
  {
    index: 5,
    slug: "seawall-back-home-2026-06-30",
    title: "Seawall Back Home",
    sources: [
      `${DL}/6 - underneath the granvile bridge and chandelier.MOV`,
      `${DL}/7 - seawall going back home.MOV`,
    ],
    targetDuration: 45,
    sourceWeights: [0.3, 0.7],
    clipDuration: 4,
    skipStart: 8,
    skipEnd: 8,
  },
];

// ─── Video duration probe ────────────────────────────────────────────────────

function probeVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) reject(err);
      else resolve(meta.format.duration ?? 0);
    });
  });
}

// ─── Clip selection ──────────────────────────────────────────────────────────

/**
 * Select N evenly-distributed clips from a source file.
 * Skips the first `skipStart` and last `skipEnd` seconds.
 * Adds slight random jitter so consecutive runs vary.
 */
function selectClipsFromSource(
  sourceFile: string,
  count: number,
  clipDuration: number,
  videoDuration: number,
  skipStart: number,
  skipEnd: number
): Clip[] {
  const available = videoDuration - skipStart - skipEnd;
  if (available <= clipDuration) return [];

  const segmentSize = available / count;
  const clips: Clip[] = [];

  for (let i = 0; i < count; i++) {
    const segStart = skipStart + i * segmentSize;
    // Pick a random point in the first 75% of the segment so clips feel natural
    const jitter = Math.random() * segmentSize * 0.75;
    const start = segStart + jitter;

    // Ensure we don't run past the end
    const safeStart = Math.min(start, videoDuration - skipEnd - clipDuration);
    clips.push({ sourceFile, start: safeStart, duration: clipDuration });
  }

  return clips;
}

// ─── Clip extraction ─────────────────────────────────────────────────────────

function extractClip(
  sourceFile: string,
  start: number,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(sourceFile)
      .inputOptions([`-ss ${start.toFixed(3)}`])
      .duration(duration)
      .videoFilters(VIDEO_FILTER)
      .outputOptions([
        "-c:v libx264",
        "-crf 22",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-af volume=0.35",  // Reduce wind noise from Meta Glasses
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(new Error(`Extract clip failed (${path.basename(sourceFile)} @ ${start.toFixed(1)}s): ${err.message}`)))
      .run();
  });
}

// ─── Concatenation ───────────────────────────────────────────────────────────

async function concatenateClips(clipPaths: string[], outputPath: string): Promise<void> {
  const listPath = `${outputPath}.concat.txt`;
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.promises.writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy", "-movflags +faststart"])
      .output(outputPath)
      .on("end", async () => {
        await fs.promises.unlink(listPath).catch(() => {});
        resolve();
      })
      .on("error", async (err) => {
        await fs.promises.unlink(listPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

// ─── Progress logger ─────────────────────────────────────────────────────────

function log(prefix: string, msg: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}] ${prefix} ${msg}`);
}

// ─── Main video producer ──────────────────────────────────────────────────────

async function produceVideo(config: VideoConfig): Promise<string> {
  const { slug, title, sources, targetDuration, sourceWeights, clipDuration, skipStart, skipEnd } = config;
  const prefix = `[V${config.index}]`;

  log(prefix, `Starting: ${title}`);

  const outputDir = path.join(OUT, slug);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const videoTempDir = path.join(TEMP, slug);
  await fs.promises.mkdir(videoTempDir, { recursive: true });

  // Calculate how many clips to pull from each source
  const totalClips = Math.round(targetDuration / clipDuration);
  const clipsPerSource = sourceWeights.map((w) => Math.round(totalClips * w));
  // Fix rounding: ensure total is exactly right
  const diff = totalClips - clipsPerSource.reduce((a, b) => a + b, 0);
  clipsPerSource[0] += diff;

  log(prefix, `Need ${totalClips} clips (${clipsPerSource.join("+")} from ${sources.length} sources)`);

  // Probe durations for all sources
  const durations = await Promise.all(sources.map((s) => probeVideoDuration(s)));
  log(prefix, `Source durations: ${durations.map((d) => d.toFixed(1) + "s").join(", ")}`);

  // Select clips from each source
  const allClips: Clip[] = [];
  for (let i = 0; i < sources.length; i++) {
    const clips = selectClipsFromSource(
      sources[i],
      clipsPerSource[i],
      clipDuration,
      durations[i],
      skipStart,
      skipEnd
    );
    allClips.push(...clips);
    log(prefix, `  Source ${i + 1}: selected ${clips.length} clips`);
  }

  // Sort chronologically: all source-1 clips then source-2 clips (already ordered by source)
  // This preserves narrative flow: ride begins with file N, transitions to file N+1

  // Extract each clip
  log(prefix, `Extracting ${allClips.length} clips...`);
  const clipPaths: string[] = [];

  for (let i = 0; i < allClips.length; i++) {
    const clip = allClips[i];
    const clipPath = path.join(videoTempDir, `clip_${String(i).padStart(3, "0")}.mp4`);
    log(prefix, `  [${i + 1}/${allClips.length}] ${path.basename(clip.sourceFile)} @ ${clip.start.toFixed(1)}s, ${clip.duration}s`);
    await extractClip(clip.sourceFile, clip.start, clip.duration, clipPath);
    clipPaths.push(clipPath);
  }

  // Concatenate
  const outputPath = path.join(outputDir, `tiktok.mp4`);
  log(prefix, `Concatenating ${clipPaths.length} clips → ${outputPath}`);
  await concatenateClips(clipPaths, outputPath);

  // Cleanup temp clips
  await Promise.all(clipPaths.map((p) => fs.promises.unlink(p).catch(() => {})));
  await fs.promises.rmdir(videoTempDir).catch(() => {});

  const stats = await fs.promises.stat(outputPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  log(prefix, `Done! ${outputPath} (${sizeMB} MB)`);

  return outputPath;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2] || "all";

  let targets: VideoConfig[];
  if (arg === "all") {
    targets = VIDEOS;
  } else {
    const idx = parseInt(arg, 10);
    if (isNaN(idx) || idx < 1 || idx > 5) {
      console.error(`Usage: npx tsx src/scripts/execute-seawall.ts [1-5 | all]`);
      process.exit(1);
    }
    targets = VIDEOS.filter((v) => v.index === idx);
  }

  await fs.promises.mkdir(TEMP, { recursive: true });

  console.log(`\n=== Vancouver Seawall TikTok Production ===`);
  console.log(`Producing ${targets.length} video(s)...\n`);

  const results: Array<{ title: string; output: string; error?: string }> = [];

  for (const config of targets) {
    try {
      const output = await produceVideo(config);
      results.push({ title: config.title, output });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n[ERROR] Video ${config.index} failed: ${msg}\n`);
      results.push({ title: config.title, output: "", error: msg });
    }
  }

  console.log("\n=== Results ===");
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.title}`);
      console.log(`   Error: ${r.error}`);
    } else {
      console.log(`✓ ${r.title}`);
      console.log(`  → ${r.output}`);
    }
  }

  // Cleanup top-level temp dir if empty
  await fs.promises.rmdir(TEMP).catch(() => {});
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
