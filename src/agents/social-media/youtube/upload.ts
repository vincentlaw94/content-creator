import { google } from "googleapis";
import fs from "fs";
import type { PostResult, StoryPlan } from "../../../shared/types.js";
import { v4 as uuid } from "uuid";

interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

function getConfig(): YouTubeConfig {
  const config = {
    clientId: process.env.YOUTUBE_CLIENT_ID || "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || "",
  };

  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error(
      "YouTube API credentials not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN."
    );
  }

  return config;
}

function getYouTubeClient() {
  const config = getConfig();

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  return google.youtube({ version: "v3", auth: oauth2Client });
}

export interface YouTubeUploadOptions {
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus?: "public" | "unlisted" | "private";
  scheduledPublishTime?: Date;
  thumbnailPath?: string;
}

export async function uploadToYouTube(
  projectId: string,
  videoPath: string,
  storyPlan: StoryPlan,
  options: Partial<YouTubeUploadOptions> = {}
): Promise<PostResult> {
  console.log(`[YouTubeUpload] Uploading video for project: ${projectId}`);

  const youtube = getYouTubeClient();

  const uploadOptions: YouTubeUploadOptions = {
    title: storyPlan.captions.youtube.title.slice(0, 100),
    description: buildDescription(storyPlan),
    tags: storyPlan.hashtags.map((h) => h.replace("#", "")).slice(0, 30),
    categoryId: options.categoryId || "22", // People & Blogs
    privacyStatus: options.privacyStatus || "public",
    scheduledPublishTime: options.scheduledPublishTime,
    thumbnailPath: options.thumbnailPath,
  };

  // Upload video
  console.log("[YouTubeUpload] Starting video upload...");
  const videoResponse = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: uploadOptions.title,
        description: uploadOptions.description,
        tags: uploadOptions.tags,
        categoryId: uploadOptions.categoryId,
      },
      status: {
        privacyStatus: uploadOptions.privacyStatus,
        selfDeclaredMadeForKids: false,
        publishAt: uploadOptions.scheduledPublishTime?.toISOString(),
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = videoResponse.data.id;
  if (!videoId) {
    throw new Error("YouTube upload failed - no video ID returned");
  }

  console.log(`[YouTubeUpload] Video uploaded: ${videoId}`);

  // Upload thumbnail if provided
  if (uploadOptions.thumbnailPath && fs.existsSync(uploadOptions.thumbnailPath)) {
    console.log("[YouTubeUpload] Uploading thumbnail...");
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: fs.createReadStream(uploadOptions.thumbnailPath),
        },
      });
    } catch (error) {
      console.error("[YouTubeUpload] Thumbnail upload failed:", error);
    }
  }

  const result: PostResult = {
    id: uuid(),
    projectId,
    platform: "youtube",
    videoId,
    url: `https://youtube.com/watch?v=${videoId}`,
    postedAt: new Date(),
  };

  return result;
}

function buildDescription(storyPlan: StoryPlan): string {
  const lines: string[] = [];

  lines.push(storyPlan.captions.youtube.description);
  lines.push("");

  // Add timestamps if narrative has them
  if (storyPlan.narrative.length > 0) {
    lines.push("Timestamps:");
    for (const moment of storyPlan.narrative.filter((m) => m.importance === "critical")) {
      const minutes = Math.floor(moment.timestamp / 60);
      const seconds = Math.floor(moment.timestamp % 60);
      const timestamp = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      lines.push(`${timestamp} - ${moment.description}`);
    }
    lines.push("");
  }

  // Add hashtags as keywords
  lines.push(storyPlan.hashtags.slice(0, 10).join(" "));
  lines.push("");

  // Standard footer
  lines.push("---");
  lines.push("Like and subscribe for more content!");

  return lines.join("\n").slice(0, 5000);
}

export async function updateVideoMetadata(
  videoId: string,
  updates: Partial<{
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
  }>
): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    // First get current video data
    const video = await youtube.videos.list({
      part: ["snippet"],
      id: [videoId],
    });

    const currentSnippet = video.data.items?.[0]?.snippet;
    if (!currentSnippet) {
      throw new Error("Video not found");
    }

    // Update with new values
    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: videoId,
        snippet: {
          title: updates.title || currentSnippet.title || "",
          description: updates.description || currentSnippet.description || "",
          tags: updates.tags || (currentSnippet.tags as string[]) || [],
          categoryId: updates.categoryId || currentSnippet.categoryId || "22",
        },
      },
    });

    return true;
  } catch (error) {
    console.error("[YouTubeUpload] Failed to update video:", error);
    return false;
  }
}

export async function deleteVideo(videoId: string): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    await youtube.videos.delete({ id: videoId });
    return true;
  } catch (error) {
    console.error("[YouTubeUpload] Failed to delete video:", error);
    return false;
  }
}

export async function getVideoStatus(videoId: string): Promise<{
  status: string;
  processingProgress?: number;
}> {
  const youtube = getYouTubeClient();

  const response = await youtube.videos.list({
    part: ["status", "processingDetails"],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) {
    throw new Error("Video not found");
  }

  return {
    status: video.status?.uploadStatus || "unknown",
    processingProgress: video.processingDetails?.processingProgress?.partsProcessed
      ? (video.processingDetails.processingProgress.partsProcessed /
          (video.processingDetails.processingProgress.partsTotal || 1)) *
        100
      : undefined,
  };
}

export function getOptimalPostTime(): Date {
  // YouTube best posting times (general guidelines)
  // Best days: Thursday, Friday
  // Best times: 12-4 PM

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // If it's a good time, post now
  if (hour >= 12 && hour <= 16 && (day === 4 || day === 5)) {
    return now;
  }

  // Schedule for next good window
  const nextTime = new Date(now);

  if (hour < 12) {
    nextTime.setHours(14, 0, 0, 0);
  } else if (hour > 16) {
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(14, 0, 0, 0);
  }

  // If not Thursday/Friday, move to Thursday
  while (nextTime.getDay() !== 4 && nextTime.getDay() !== 5) {
    nextTime.setDate(nextTime.getDate() + 1);
  }

  return nextTime;
}

export async function createPlaylist(
  title: string,
  description: string,
  privacyStatus: "public" | "unlisted" | "private" = "public"
): Promise<string> {
  const youtube = getYouTubeClient();

  const response = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
      },
      status: {
        privacyStatus,
      },
    },
  });

  return response.data.id || "";
}

export async function addToPlaylist(playlistId: string, videoId: string): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      },
    });
    return true;
  } catch (error) {
    console.error("[YouTubeUpload] Failed to add to playlist:", error);
    return false;
  }
}
