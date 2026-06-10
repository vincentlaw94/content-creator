import type { AnalyticsSnapshot } from "../../../shared/types.js";

interface TikTokConfig {
  accessToken: string;
}

function getConfig(): TikTokConfig {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN || "";
  if (!accessToken) {
    throw new Error("TIKTOK_ACCESS_TOKEN not configured");
  }
  return { accessToken };
}

interface TikTokVideoStats {
  video_id: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  play_count: number;
  average_watch_time: number;
}

export async function fetchVideoAnalytics(videoId: string): Promise<AnalyticsSnapshot> {
  const config = getConfig();

  console.log(`[TikTokAnalytics] Fetching analytics for video: ${videoId}`);

  const response = await fetch(
    `https://open.tiktokapis.com/v2/video/query/?video_ids=${videoId}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch TikTok analytics: ${response.statusText}`);
  }

  const data = await response.json() as {
    data: {
      videos: TikTokVideoStats[];
    };
  };

  const video = data.data.videos[0];

  if (!video) {
    throw new Error("Video not found");
  }

  // Calculate engagement rate
  const engagementRate =
    video.view_count > 0
      ? ((video.like_count + video.comment_count + video.share_count) / video.view_count) * 100
      : 0;

  return {
    postId: videoId,
    timestamp: new Date(),
    views: video.view_count || video.play_count,
    likes: video.like_count,
    comments: video.comment_count,
    shares: video.share_count,
    watchTime: video.average_watch_time,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

export async function fetchAccountAnalytics(): Promise<{
  followers: number;
  following: number;
  totalLikes: number;
  videoCount: number;
}> {
  const config = getConfig();

  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/",
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch TikTok account info: ${response.statusText}`);
  }

  const data = await response.json() as {
    data: {
      user: {
        follower_count: number;
        following_count: number;
        likes_count: number;
        video_count: number;
      };
    };
  };

  return {
    followers: data.data.user.follower_count,
    following: data.data.user.following_count,
    totalLikes: data.data.user.likes_count,
    videoCount: data.data.user.video_count,
  };
}

export interface PerformanceAnalysis {
  isViral: boolean;
  performanceLevel: "low" | "average" | "good" | "excellent" | "viral";
  comparedToAverage: number; // Percentage above/below average
  recommendations: string[];
}

export function analyzePerformance(
  currentStats: AnalyticsSnapshot,
  historicalAverage?: AnalyticsSnapshot
): PerformanceAnalysis {
  const recommendations: string[] = [];

  // Determine performance level based on engagement rate
  let performanceLevel: PerformanceAnalysis["performanceLevel"];
  const engagementRate = currentStats.engagementRate || 0;

  if (engagementRate > 15) {
    performanceLevel = "viral";
  } else if (engagementRate > 8) {
    performanceLevel = "excellent";
  } else if (engagementRate > 4) {
    performanceLevel = "good";
  } else if (engagementRate > 2) {
    performanceLevel = "average";
  } else {
    performanceLevel = "low";
  }

  const isViral = performanceLevel === "viral" || currentStats.views > 100000;

  // Calculate comparison to historical average
  let comparedToAverage = 0;
  if (historicalAverage && historicalAverage.views > 0) {
    comparedToAverage = Math.round(
      ((currentStats.views - historicalAverage.views) / historicalAverage.views) * 100
    );
  }

  // Generate recommendations
  if (performanceLevel === "low" || performanceLevel === "average") {
    if (currentStats.watchTime && currentStats.watchTime < 5) {
      recommendations.push("Hook isn't grabbing attention - try a stronger opening");
    }
    if (engagementRate < 2) {
      recommendations.push("Add a clear call-to-action to boost engagement");
    }
    recommendations.push("Post during peak hours (7-10 AM or 7-11 PM)");
    recommendations.push("Engage with comments quickly to boost algorithm reach");
  }

  if (performanceLevel === "good") {
    recommendations.push("Reply to all comments to maintain momentum");
    recommendations.push("Consider creating a follow-up video on the same topic");
  }

  if (isViral) {
    recommendations.push("Create a series or follow-up to capitalize on virality");
    recommendations.push("Pin your best comment to guide discussion");
    recommendations.push("Cross-post to other platforms while momentum is high");
  }

  return {
    isViral,
    performanceLevel,
    comparedToAverage,
    recommendations,
  };
}

export function generateAnalyticsReport(snapshots: AnalyticsSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No analytics data available.";
  }

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  // Calculate growth
  const viewGrowth = latest.views - first.views;
  const likeGrowth = latest.likes - first.likes;

  const lines: string[] = [];

  lines.push("# TikTok Analytics Report");
  lines.push(`Period: ${first.timestamp.toLocaleDateString()} - ${latest.timestamp.toLocaleDateString()}`);
  lines.push("");

  lines.push("## Current Stats");
  lines.push(`- Views: ${formatNumber(latest.views)} (+${formatNumber(viewGrowth)})`);
  lines.push(`- Likes: ${formatNumber(latest.likes)} (+${formatNumber(likeGrowth)})`);
  lines.push(`- Comments: ${formatNumber(latest.comments)}`);
  lines.push(`- Shares: ${formatNumber(latest.shares)}`);
  lines.push(`- Engagement Rate: ${latest.engagementRate?.toFixed(2)}%`);
  lines.push("");

  if (latest.watchTime) {
    lines.push(`- Average Watch Time: ${latest.watchTime.toFixed(1)}s`);
  }

  // Performance analysis
  const analysis = analyzePerformance(latest);
  lines.push("");
  lines.push(`## Performance: ${analysis.performanceLevel.toUpperCase()}`);
  lines.push(analysis.isViral ? "🔥 This video is going viral!" : "");
  lines.push("");

  lines.push("## Recommendations");
  for (const rec of analysis.recommendations) {
    lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export async function getBestPerformingVideos(limit = 5): Promise<string[]> {
  const config = getConfig();

  const response = await fetch(
    `https://open.tiktokapis.com/v2/video/list/?max_count=${limit}&sort_type=views`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    console.error("Failed to fetch best performing videos");
    return [];
  }

  const data = await response.json() as {
    data: {
      videos: Array<{ id: string }>;
    };
  };

  return data.data.videos.map((v) => v.id);
}
