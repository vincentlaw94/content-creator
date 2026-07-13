#!/usr/bin/env node
/**
 * Sen̓áḵw Rental Showcase — editorial cut focused on:
 *   1. Riding INTO the plaza via the bike path (50s)
 *   2. Building HEIGHT — tower looming overhead alongside the lane
 *   3. CIRCLING the building + glass-facade reflection (105–155s gap from v2)
 *   4. EXITING the plaza via bike path with people visible
 *
 * Run: npx tsx src/scripts/senakw-showcase.ts
 */

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const F4 = "/Users/vincentlaw/Downloads/4 - show the new vancouver burrard appartment rentals Sen̓áḵw.MOV";

const OUT_DIR = "/Users/vincentlaw/content-creator/public/output/senakw-rentals-showcase-2026-07-02";
const TEMP_DIR = "/private/tmp/senakw-showcase-clips";

const CROP_FILTER =
  "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,scale=1080:1920,setsar=1";
const GRADE_FILTER = "eq=saturation=1.2:contrast=1.08:brightness=0.03";
const VIDEO_FILTER = `${CROP_FILTER},${GRADE_FILTER}`;

interface Clip {
  start: number;
  duration: number;
  label: string;
}

const CLIPS: Clip[] = [
  // ── ACT 1: ENTRY — cyclist passed before the turn, then into the plaza ───
  // Cyclist being passed at 48s, right before turning into the Sen̓áḵw plaza
  { start: 48,  duration: 2, label: "01-pre-turn-cyclist" },
  // Entering the Sen̓áḵw bike path at the 50s mark; tower begins to fill the frame
  { start: 50,  duration: 5, label: "02-entry-bike-path" },
  // Smooth ride down the protected bike lane heading into the development
  { start: 62,  duration: 5, label: "03-smooth-bike-lane" },

  // ── ACT 2: HEIGHT — tower overhead, full scale visible ───────────────────
  // Riding directly alongside the base: balconies stack upward above the lens
  { start: 68,  duration: 5, label: "04-height-balconies-up" },
  // Tower at full frame — shows the sheer vertical scale from ground level
  { start: 80,  duration: 5, label: "05-height-full-scale" },

  // ── ACT 3: CIRCLING + GLASS REFLECTION — the section v2 skipped entirely ─
  // Approaching the glass curtain-wall facade; first hint of rider reflection
  { start: 108, duration: 5, label: "06-glass-approach" },
  // Riding parallel to the glass: rider reflection visible in building face
  { start: 118, duration: 5, label: "07-glass-reflection-1" },
  // Deeper into the glass wing; reflection strongest here as you pass directly beside
  { start: 130, duration: 5, label: "08-glass-reflection-2" },
  // Circling around the far side; building wraps around in the background
  { start: 145, duration: 5, label: "09-circling-far-side" },

  // ── ACT 4: PLAZA — inside the courtyard ──────────────────────────────────
  // Plaza level: wave-pattern paving, mountains in the background
  { start: 160, duration: 4, label: "10-plaza-paving" },

  // ── ACT 5: EXIT — leaving the plaza, looking at pedestrian ───────────────
  // Exiting the plaza on the bike lane, looking at a pedestrian (3:25)
  { start: 205, duration: 5, label: "11-exit-bike-lane-pedestrian" },
  // Turning to the exit; people on the bike path ahead — end of video
  { start: 215, duration: 5, label: "12-exit-people-plaza" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}] ${msg}`);
}

function extractClip(clip: Clip, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(F4)
      .inputOptions([`-ss ${clip.start.toFixed(3)}`])
      .duration(clip.duration)
      .videoFilters(VIDEO_FILTER)
      .outputOptions([
        "-c:v libx264",
        "-crf 22",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 128k",
        "-af volume=0.35",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) =>
        reject(new Error(`[${clip.label}] @ ${clip.start}s: ${err.message}`))
      )
      .run();
  });
}

async function concatenateClips(clipPaths: string[], outputPath: string): Promise<void> {
  const listPath = `${outputPath}.concat.txt`;
  await fs.promises.writeFile(listPath, clipPaths.map((p) => `file '${p}'`).join("\n"));

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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await fs.promises.mkdir(TEMP_DIR, { recursive: true });

  const totalDuration = CLIPS.reduce((s, c) => s + c.duration, 0);
  log(`Sen̓áḵw Rental Showcase`);
  log(`${CLIPS.length} clips · ${totalDuration}s total`);
  console.log("");

  const clipPaths: string[] = [];

  for (let i = 0; i < CLIPS.length; i++) {
    const clip = CLIPS[i];
    const clipPath = path.join(TEMP_DIR, `${String(i).padStart(2, "0")}-${clip.label}.mp4`);
    log(`[${i + 1}/${CLIPS.length}] ${clip.label} @ ${clip.start}s (${clip.duration}s)`);
    await extractClip(clip, clipPath);
    clipPaths.push(clipPath);
  }

  const outputPath = path.join(OUT_DIR, "tiktok_showcase.mp4");
  log(`\nConcatenating → ${outputPath}`);
  await concatenateClips(clipPaths, outputPath);

  await Promise.all(clipPaths.map((p) => fs.promises.unlink(p).catch(() => {})));
  await fs.promises.rmdir(TEMP_DIR).catch(() => {});

  const stats = await fs.promises.stat(outputPath);
  log(`Done! ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`\nTikTok caption suggestion:`);
  console.log(`POV riding into Vancouver's newest luxury rental building Sen̓áḵw`);
  console.log(`The glass reflection is insane 👀 #vancouver #senakw #cycling #realestate #burrard`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
