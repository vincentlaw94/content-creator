#!/usr/bin/env node
/**
 * Sen̓áḵw v2 — precision edit from full frame-by-frame visual analysis.
 * Every timestamp was hand-selected based on actual visual content.
 *
 * Run: npx tsx src/scripts/senakw-v2.ts
 */

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

const DL = "/Users/vincentlaw/Downloads";
const F4 = `${DL}/4 - show the new vancouver burrard appartment rentals Sen̓áḵw.MOV`;
const F5 = `${DL}/5 - burrard bridge and also showing Sen̓áḵw building .MOV`;

const OUT_DIR = "/Users/vincentlaw/content-creator/public/output/senakw-controversy-2026-06-30";
const TEMP_DIR = "/private/tmp/senakw-v2-clips";

// Dynamic 9:16 crop works across all Meta Glasses resolutions (1376–1552 wide)
const CROP_FILTER =
  "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0,scale=1080:1920,setsar=1";
const GRADE_FILTER = "eq=saturation=1.15:contrast=1.05:brightness=0.02";
const VIDEO_FILTER = `${CROP_FILTER},${GRADE_FILTER}`;

interface Clip {
  src: string;
  start: number;
  duration: number;
  label: string;
}

const CLIPS: Clip[] = [
  // ── ACT 1: ENTERING — first sight, approaching, entering the bike path ───
  // First sight of the Sen̓áḵw tower while riding on the road approaching
  { src: F4, start: 15,  duration: 5, label: "f4-01-first-sight" },
  // On the protected lane: two cyclists ahead, Sen̓áḵw construction zone begins
  { src: F4, start: 50,  duration: 5, label: "f4-02-on-the-lane" },

  // ── ACT 2: ALONGSIDE — riding next to the building ───────────────────────
  // Tower comes up directly alongside on the new bike lane
  { src: F4, start: 55,  duration: 5, label: "f4-04-tower-alongside" },
  // Ground-floor close-up: copper/red organic balconies filling the frame
  { src: F4, start: 70,  duration: 5, label: "f4-05-close-balconies" },
  // "tłełtłélnup" — the Squamish Nation Indigenous name on the building facade
  { src: F4, start: 75,  duration: 5, label: "f4-06-indigenous-name" },
  // Construction hoarding with Sen̓áḵw branding signage
  { src: F4, start: 95,  duration: 5, label: "f4-07-hoarding-branding" },
  // Sen̓áḵw logo on hoarding, luxury tower looming overhead — controversy hook
  { src: F4, start: 100, duration: 5, label: "f4-08-senakw-logo-hook" },

  // ── ACT 3: CIRCLING — around to the plaza side ───────────────────────────
  // Plaza level: wave-pattern paving, benches, mountains in the distance
  { src: F4, start: 160, duration: 4, label: "f4-10-plaza-wave-paving" },
  // Wide plaza with cyclist visible in background near the construction cones
  { src: F4, start: 165, duration: 4, label: "f4-12-cyclist-in-plaza" },
  // Visual contrast: dead bare tree framed against the luxury tower
  { src: F4, start: 175, duration: 4, label: "f4-13-dead-tree-contrast" },
  // "BORN FROM THE LAND" text on construction hoarding alongside the building
  { src: F4, start: 185, duration: 4, label: "f4-14-born-from-the-land" },
  // Plaza entrance: "tłełtłélnup" building name text on the facade as we depart
  { src: F4, start: 205, duration: 4, label: "f4-15-plaza-entrance-name" },

  // ── ACT 4: EXITING — back onto the bike path, heading away ───────────────
  // New green bike exit lane: tower receding behind
  { src: F4, start: 215, duration: 4, label: "f4-16-exit-green-lane" },
  // Protected lane with jersey barriers, moving away from the development
  { src: F4, start: 225, duration: 4, label: "f4-17-exit-barriers" },
  // Smooth dedicated path, fully clear of the site
  { src: F4, start: 250, duration: 5, label: "f4-18-exit-clear" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}] ${msg}`);
}

function extractClip(clip: Clip, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(clip.src)
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
  log(`Sen̓áḵw v2 — Precision Edit`);
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

  const outputPath = path.join(OUT_DIR, "tiktok_v2.mp4");
  log(`\nConcatenating → ${outputPath}`);
  await concatenateClips(clipPaths, outputPath);

  await Promise.all(clipPaths.map((p) => fs.promises.unlink(p).catch(() => {})));
  await fs.promises.rmdir(TEMP_DIR).catch(() => {});

  const stats = await fs.promises.stat(outputPath);
  log(`Done! ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`\nTikTok caption suggestion:`);
  console.log(`Vancouver just built $1M+ condos on sacred Squamish Nation land`);
  console.log(`called "Sen̓áḵw" — and they put the Indigenous name ON the building 👀`);
  console.log(`#vancouver #senakw #squamish #yyc #realestate #controversy`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
