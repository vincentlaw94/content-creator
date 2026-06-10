import fs from "fs";
import path from "path";
import type { PostResult, StoryPlan } from "../../../shared/types.js";
import { v4 as uuid } from "uuid";

// TikTok API Configuration
interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  accessToken: string;
}

function getConfig(): TikTokConfig {
  const config = {
    clientKey: process.env.TIKTOK_CLIENT_KEY || "",
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || "",
  };

  if (!config.clientKey || !config.accessToken) {
    throw new Error("TikTok API credentials not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_ACCESS_TOKEN.");
  }

  return config;
}

interface TikTokUploadOptions {
  videoPath: string;
  caption: string;
  hashtags: string[];
  soundId?: string;
  privacyLevel?: "public" | "friends" | "private";
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
}

interface TikTokVideoInfo {
  videoId: string;
  shareUrl: string;
  createTime: number;
}

export async function uploadToTikTok(
  projectId: string,
  videoPath: string,
  storyPlan: StoryPlan,
  options: Partial<TikTokUploadOptions> = {}
): Promise<PostResult> {
  console.log(`[TikTokUpload] Uploading video for project: ${projectId}`);

  const config = getConfig();

  // Build caption with hashtags
  const hashtagString = storyPlan.hashtags.slice(0, 10).join(" ");
  const fullCaption = `${storyPlan.captions.tiktok}\n\n${hashtagString}`.slice(0, 2200);

  const uploadOptions: TikTokUploadOptions = {
    videoPath,
    caption: fullCaption,
    hashtags: storyPlan.hashtags,
    soundId: storyPlan.suggestedSound?.tiktokId,
    privacyLevel: options.privacyLevel || "public",
    allowComments: options.allowComments ?? true,
    allowDuet: options.allowDuet ?? true,
    allowStitch: options.allowStitch ?? true,
  };

  // Upload video using TikTok Content Posting API
  const videoInfo = await uploadVideoToTikTok(config, uploadOptions);

  const result: PostResult = {
    id: uuid(),
    projectId,
    platform: "tiktok",
    videoId: videoInfo.videoId,
    url: videoInfo.shareUrl,
    postedAt: new Date(videoInfo.createTime * 1000),
  };

  console.log(`[TikTokUpload] Video uploaded: ${result.url}`);
  return result;
}

async function uploadVideoToTikTok(
  config: TikTokConfig,
  options: TikTokUploadOptions
): Promise<TikTokVideoInfo> {
  // TikTok Content Posting API flow:
  // 1. Initialize upload
  // 2. Upload video chunks
  // 3. Post video with metadata

  const videoStats = fs.statSync(options.videoPath);
  const videoSize = videoStats.size;

  // Step 1: Initialize upload
  console.log("[TikTokUpload] Initializing upload...");
  const initResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      post_info: {
        title: options.caption.slice(0, 150),
        privacy_level: options.privacyLevel?.toUpperCase() || "PUBLIC_TO_EVERYONE",
        disable_comment: !options.allowComments,
        disable_duet: !options.allowDuet,
        disable_stitch: !options.allowStitch,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: Math.min(videoSize, 10 * 1024 * 1024), // 10MB chunks
        total_chunk_count: Math.ceil(videoSize / (10 * 1024 * 1024)),
      },
    }),
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`TikTok upload init failed: ${error}`);
  }

  const initData = await initResponse.json() as {
    data: {
      publish_id: string;
      upload_url: string;
    };
  };

  const { publish_id, upload_url } = initData.data;

  // Step 2: Upload video file
  console.log("[TikTokUpload] Uploading video file...");
  const videoBuffer = fs.readFileSync(options.videoPath);

  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
    },
    body: videoBuffer,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`TikTok video upload failed: ${error}`);
  }

  // Step 3: Check publish status
  console.log("[TikTokUpload] Checking publish status...");
  let videoInfo: TikTokVideoInfo | null = null;
  let attempts = 0;
  const maxAttempts = 30;

  while (!videoInfo && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(
      `https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${publish_id}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`,
        },
      }
    );

    if (statusResponse.ok) {
      const statusData = await statusResponse.json() as {
        data: {
          status: string;
          video_id?: string;
          share_url?: string;
          create_time?: number;
          fail_reason?: string;
        };
      };

      if (statusData.data.status === "PUBLISH_COMPLETE") {
        videoInfo = {
          videoId: statusData.data.video_id!,
          shareUrl: statusData.data.share_url!,
          createTime: statusData.data.create_time || Math.floor(Date.now() / 1000),
        };
      } else if (statusData.data.status === "FAILED") {
        throw new Error(`TikTok publish failed: ${statusData.data.fail_reason}`);
      }
    }

    attempts++;
  }

  if (!videoInfo) {
    throw new Error("TikTok publish timed out");
  }

  return videoInfo;
}

export async function scheduleUpload(
  projectId: string,
  videoPath: string,
  storyPlan: StoryPlan,
  scheduledTime: Date
): Promise<{ scheduled: boolean; scheduledFor: Date }> {
  // TikTok doesn't support scheduled posts via API
  // We'll handle scheduling in our own scheduler
  console.log(`[TikTokUpload] Scheduling upload for ${scheduledTime.toISOString()}`);

  return {
    scheduled: true,
    scheduledFor: scheduledTime,
  };
}

export function getOptimalPostTime(timezone: string = "UTC"): Date {
  // Best times for TikTok posting (general guidelines)
  // Peak times: 6-10 AM, 7-11 PM local time
  // Best days: Tuesday, Thursday, Friday

  const now = new Date();
  const hour = now.getHours();

  // If current time is in a good window, post now
  if ((hour >= 6 && hour <= 10) || (hour >= 19 && hour <= 23)) {
    return now;
  }

  // Otherwise, schedule for next good window
  const nextTime = new Date(now);

  if (hour < 6) {
    nextTime.setHours(7, 0, 0, 0);
  } else if (hour > 10 && hour < 19) {
    nextTime.setHours(19, 30, 0, 0);
  } else {
    // After 11 PM, schedule for next morning
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(7, 0, 0, 0);
  }

  return nextTime;
}

export async function deleteVideo(videoId: string): Promise<boolean> {
  const config = getConfig();

  try {
    const response = await fetch("https://open.tiktokapis.com/v2/video/delete/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ video_id: videoId }),
    });

    return response.ok;
  } catch (error) {
    console.error("[TikTokUpload] Failed to delete video:", error);
    return false;
  }
}
