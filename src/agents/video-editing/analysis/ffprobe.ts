import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import type { FootageMetadata, Scene } from "../../../shared/types.js";

export interface FFProbeMetadata {
  format: {
    duration: number;
    size: number;
    bit_rate: number;
  };
  streams: Array<{
    codec_type: "video" | "audio";
    codec_name: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    channels?: number;
    sample_rate?: string;
  }>;
}

export async function probeVideo(filePath: string): Promise<FootageMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      const audioStream = metadata.streams.find((s) => s.codec_type === "audio");

      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }

      // Parse frame rate (e.g., "30000/1001" -> 29.97)
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
        fps = den ? num / den : num;
      }

      resolve({
        path: filePath,
        duration: metadata.format.duration || 0,
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        fps: Math.round(fps * 100) / 100,
        codec: videoStream.codec_name || "unknown",
        hasAudio: !!audioStream,
        fileSize: metadata.format.size || fs.statSync(filePath).size,
      });
    });
  });
}

export async function extractKeyframes(
  videoPath: string,
  outputDir: string,
  interval = 1
): Promise<string[]> {
  const basename = path.basename(videoPath, path.extname(videoPath));
  const outputPattern = path.join(outputDir, `${basename}_keyframe_%04d.jpg`);

  await fs.promises.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${interval}`,
        "-q:v 2",
      ])
      .output(outputPattern)
      .on("end", async () => {
        // Get list of generated keyframes
        const files = await fs.promises.readdir(outputDir);
        const keyframes = files
          .filter((f) => f.startsWith(`${basename}_keyframe_`) && f.endsWith(".jpg"))
          .sort()
          .map((f) => path.join(outputDir, f));
        resolve(keyframes);
      })
      .on("error", reject)
      .run();
  });
}

export async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

export async function extractClip(
  videoPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .output(outputPath)
      .outputOptions(["-c copy"])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

export interface SceneChange {
  timestamp: number;
  score: number;
}

export async function detectSceneChanges(
  videoPath: string,
  threshold = 0.3
): Promise<SceneChange[]> {
  return new Promise((resolve, reject) => {
    const scenes: SceneChange[] = [];

    ffmpeg(videoPath)
      .outputOptions([
        `-vf select='gt(scene,${threshold})',showinfo`,
        "-f null",
      ])
      .output("-")
      .on("stderr", (stderrLine: string) => {
        // Parse showinfo output for scene changes
        const match = stderrLine.match(/pts_time:(\d+\.?\d*)/);
        const scoreMatch = stderrLine.match(/scene:(\d+\.?\d*)/);
        if (match && scoreMatch) {
          scenes.push({
            timestamp: parseFloat(match[1]),
            score: parseFloat(scoreMatch[1]),
          });
        }
      })
      .on("end", () => resolve(scenes))
      .on("error", reject)
      .run();
  });
}

export async function getAudioLevels(
  videoPath: string
): Promise<Array<{ timestamp: number; level: number }>> {
  return new Promise((resolve, reject) => {
    const levels: Array<{ timestamp: number; level: number }> = [];

    ffmpeg(videoPath)
      .outputOptions([
        "-af astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
        "-f null",
      ])
      .output("-")
      .on("stderr", (stderrLine: string) => {
        const timeMatch = stderrLine.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
        const levelMatch = stderrLine.match(/RMS_level=(-?\d+\.?\d*)/);

        if (timeMatch && levelMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const timestamp = hours * 3600 + minutes * 60 + seconds;
          const level = parseFloat(levelMatch[1]);

          levels.push({ timestamp, level });
        }
      })
      .on("end", () => resolve(levels))
      .on("error", reject)
      .run();
  });
}

export async function analyzeMotion(
  videoPath: string,
  sampleInterval = 1
): Promise<Array<{ timestamp: number; intensity: number }>> {
  // Use frame difference to estimate motion intensity
  return new Promise((resolve, reject) => {
    const motionData: Array<{ timestamp: number; intensity: number }> = [];

    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${sampleInterval},mestimate=epzs,metadata=print:key=lavfi.me.scd`,
        "-f null",
      ])
      .output("-")
      .on("stderr", (stderrLine: string) => {
        const timeMatch = stderrLine.match(/pts_time:(\d+\.?\d*)/);
        const motionMatch = stderrLine.match(/scd=(\d+\.?\d*)/);

        if (timeMatch) {
          const timestamp = parseFloat(timeMatch[1]);
          const intensity = motionMatch ? parseFloat(motionMatch[1]) : 0;
          motionData.push({ timestamp, intensity });
        }
      })
      .on("end", () => resolve(motionData))
      .on("error", reject)
      .run();
  });
}

export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timestamp: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "1280x720",
      })
      .on("end", () => resolve(outputPath))
      .on("error", reject);
  });
}

export async function concatenateClips(
  clipPaths: string[],
  outputPath: string,
  transitions?: Array<{ type: string; duration: number }>
): Promise<string> {
  if (clipPaths.length === 0) {
    throw new Error("No clips to concatenate");
  }

  // Create a temporary file list for concat
  const listPath = outputPath + ".txt";
  const listContent = clipPaths.map((p) => `file '${p}'`).join("\n");
  await fs.promises.writeFile(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .output(outputPath)
      .outputOptions(["-c copy"])
      .on("end", async () => {
        await fs.promises.unlink(listPath);
        resolve(outputPath);
      })
      .on("error", async (err) => {
        await fs.promises.unlink(listPath).catch(() => {});
        reject(err);
      })
      .run();
  });
}

export async function addAudioTrack(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  audioVolume = 1,
  mixOriginal = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg().input(videoPath).input(audioPath);

    if (mixOriginal) {
      command.complexFilter([
        `[0:a]volume=0.3[orig]`,
        `[1:a]volume=${audioVolume}[music]`,
        `[orig][music]amix=inputs=2:duration=first[a]`,
      ]);
      command.outputOptions(["-map 0:v", "-map [a]"]);
    } else {
      command.outputOptions([
        "-map 0:v",
        "-map 1:a",
        `-filter:a volume=${audioVolume}`,
      ]);
    }

    command
      .output(outputPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-shortest"])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

export async function applyColorGrading(
  videoPath: string,
  outputPath: string,
  lutPath?: string,
  adjustments?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
  }
): Promise<string> {
  const filters: string[] = [];

  if (lutPath) {
    filters.push(`lut3d='${lutPath}'`);
  }

  if (adjustments) {
    const { brightness = 0, contrast = 1, saturation = 1 } = adjustments;
    filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
  }

  if (filters.length === 0) {
    // No processing needed, just copy
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(outputPath)
        .outputOptions(["-c copy"])
        .on("end", () => resolve(outputPath))
        .on("error", reject)
        .run();
    });
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters(filters)
      .output(outputPath)
      .outputOptions(["-c:a copy"])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

export async function resizeForPlatform(
  videoPath: string,
  outputPath: string,
  platform: "youtube" | "tiktok" | "instagram"
): Promise<string> {
  const dimensions: Record<string, { width: number; height: number }> = {
    youtube: { width: 1920, height: 1080 },
    tiktok: { width: 1080, height: 1920 },
    instagram: { width: 1080, height: 1920 },
  };

  const { width, height } = dimensions[platform];

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
      ])
      .output(outputPath)
      .outputOptions(["-c:a copy"])
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}
