import { google } from "googleapis";
import type { AnalyticsSnapshot } from "../../../shared/types.js";

function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  return google.youtube({ version: "v3", auth: oauth2Client });
}

function getYouTubeAnalyticsClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  return google.youtubeAnalytics({ version: "v2", auth: oauth2Client });
}

export async function fetchVideoAnalytics(videoId: string): Promise<AnalyticsSnapshot> {
  const youtube = getYouTubeClient();

  console.log(`[YouTubeAnalytics] Fetching analytics for video: ${videoId}`);

  const response = await youtube.videos.list({
    part: ["statistics", "contentDetails"],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video || !video.statistics) {
    throw new Error("Video not found");
  }

  const stats = video.statistics;

  // Calculate engagement rate
  const views = parseInt(stats.viewCount || "0", 10);
  const likes = parseInt(stats.likeCount || "0", 10);
  const comments = parseInt(stats.commentCount || "0", 10);

  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

  return {
    postId: videoId,
    timestamp: new Date(),
    views,
    likes,
    comments,
    shares: 0, // YouTube doesn't expose share count via API
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

export async function fetchDetailedAnalytics(
  videoId: string,
  startDate: string,
  endDate: string
): Promise<{
  views: number;
  watchTime: number;
  averageViewDuration: number;
  subscribersGained: number;
  impressions: number;
  clickThroughRate: number;
}> {
  const analytics = getYouTubeAnalyticsClient();

  const response = await analytics.reports.query({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,impressions,impressionClickThroughRate",
    filters: `video==${videoId}`,
  });

  const row = response.data.rows?.[0] || [0, 0, 0, 0, 0, 0];

  return {
    views: row[0] as number,
    watchTime: row[1] as number,
    averageViewDuration: row[2] as number,
    subscribersGained: row[3] as number,
    impressions: row[4] as number,
    clickThroughRate: (row[5] as number) * 100,
  };
}

export async function fetchChannelAnalytics(): Promise<{
  subscribers: number;
  totalViews: number;
  totalVideos: number;
}> {
  const youtube = getYouTubeClient();

  const response = await youtube.channels.list({
    part: ["statistics"],
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel || !channel.statistics) {
    throw new Error("Channel not found");
  }

  return {
    subscribers: parseInt(channel.statistics.subscriberCount || "0", 10),
    totalViews: parseInt(channel.statistics.viewCount || "0", 10),
    totalVideos: parseInt(channel.statistics.videoCount || "0", 10),
  };
}

export interface YouTubePerformanceAnalysis {
  performanceLevel: "low" | "average" | "good" | "excellent" | "viral";
  comparedToChannelAverage: number;
  clickThroughAnalysis: string;
  retentionAnalysis: string;
  recommendations: string[];
}

export function analyzePerformance(
  currentStats: AnalyticsSnapshot,
  detailedStats?: Awaited<ReturnType<typeof fetchDetailedAnalytics>>
): YouTubePerformanceAnalysis {
  const recommendations: string[] = [];

  // Determine performance level based on engagement
  let performanceLevel: YouTubePerformanceAnalysis["performanceLevel"];
  const engagementRate = currentStats.engagementRate || 0;

  if (engagementRate > 10) {
    performanceLevel = "viral";
  } else if (engagementRate > 5) {
    performanceLevel = "excellent";
  } else if (engagementRate > 2) {
    performanceLevel = "good";
  } else if (engagementRate > 0.5) {
    performanceLevel = "average";
  } else {
    performanceLevel = "low";
  }

  // Click-through analysis
  let clickThroughAnalysis = "No CTR data available";
  if (detailedStats?.clickThroughRate) {
    if (detailedStats.clickThroughRate > 10) {
      clickThroughAnalysis = "Excellent CTR - thumbnail and title are working well";
    } else if (detailedStats.clickThroughRate > 5) {
      clickThroughAnalysis = "Good CTR - slightly above average";
    } else if (detailedStats.clickThroughRate > 2) {
      clickThroughAnalysis = "Average CTR - consider improving thumbnail";
      recommendations.push("Test different thumbnail styles");
    } else {
      clickThroughAnalysis = "Low CTR - thumbnail or title needs work";
      recommendations.push("Redesign thumbnail with more contrast and emotion");
      recommendations.push("Make title more curiosity-inducing");
    }
  }

  // Retention analysis
  let retentionAnalysis = "No retention data available";
  if (detailedStats?.averageViewDuration) {
    const avgDuration = detailedStats.averageViewDuration;
    if (avgDuration > 300) {
      retentionAnalysis = "Excellent retention - viewers are highly engaged";
    } else if (avgDuration > 180) {
      retentionAnalysis = "Good retention - content keeps attention";
    } else if (avgDuration > 60) {
      retentionAnalysis = "Average retention - some drop-off occurring";
      recommendations.push("Improve hook in first 30 seconds");
    } else {
      retentionAnalysis = "Low retention - viewers leaving quickly";
      recommendations.push("Start with the most exciting content");
      recommendations.push("Add pattern interrupts every 30-60 seconds");
    }
  }

  // General recommendations based on performance
  if (performanceLevel === "low" || performanceLevel === "average") {
    recommendations.push("Post at peak times (12-4 PM on Thursday/Friday)");
    recommendations.push("Add end screens and cards to boost watch time");
    recommendations.push("Engage with comments in first hour after posting");
  }

  if (detailedStats?.subscribersGained && detailedStats.subscribersGained > 0) {
    recommendations.push("Video is converting viewers - consider creating similar content");
  }

  return {
    performanceLevel,
    comparedToChannelAverage: 0, // Would need historical data
    clickThroughAnalysis,
    retentionAnalysis,
    recommendations,
  };
}

export function generateAnalyticsReport(
  snapshots: AnalyticsSnapshot[],
  detailedStats?: Awaited<ReturnType<typeof fetchDetailedAnalytics>>
): string {
  if (snapshots.length === 0) {
    return "No analytics data available.";
  }

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  const viewGrowth = latest.views - first.views;
  const likeGrowth = latest.likes - first.likes;

  const lines: string[] = [];

  lines.push("# YouTube Analytics Report");
  lines.push(`Period: ${first.timestamp.toLocaleDateString()} - ${latest.timestamp.toLocaleDateString()}`);
  lines.push("");

  lines.push("## Current Stats");
  lines.push(`- Views: ${formatNumber(latest.views)} (+${formatNumber(viewGrowth)})`);
  lines.push(`- Likes: ${formatNumber(latest.likes)} (+${formatNumber(likeGrowth)})`);
  lines.push(`- Comments: ${formatNumber(latest.comments)}`);
  lines.push(`- Engagement Rate: ${latest.engagementRate?.toFixed(2)}%`);
  lines.push("");

  if (detailedStats) {
    lines.push("## Detailed Metrics");
    lines.push(`- Watch Time: ${Math.round(detailedStats.watchTime)} minutes`);
    lines.push(`- Avg View Duration: ${Math.round(detailedStats.averageViewDuration)}s`);
    lines.push(`- Impressions: ${formatNumber(detailedStats.impressions)}`);
    lines.push(`- Click-Through Rate: ${detailedStats.clickThroughRate.toFixed(2)}%`);
    lines.push(`- Subscribers Gained: +${detailedStats.subscribersGained}`);
    lines.push("");
  }

  const analysis = analyzePerformance(latest, detailedStats);
  lines.push(`## Performance: ${analysis.performanceLevel.toUpperCase()}`);
  lines.push(`- ${analysis.clickThroughAnalysis}`);
  lines.push(`- ${analysis.retentionAnalysis}`);
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

export async function getTopPerformingVideos(limit = 5): Promise<string[]> {
  const youtube = getYouTubeClient();

  // Get channel's uploads playlist
  const channelResponse = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });

  const uploadsPlaylistId =
    channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    return [];
  }

  // Get videos from uploads playlist
  const videosResponse = await youtube.playlistItems.list({
    part: ["snippet"],
    playlistId: uploadsPlaylistId,
    maxResults: 20,
  });

  const videoIds = videosResponse.data.items
    ?.map((item) => item.snippet?.resourceId?.videoId)
    .filter(Boolean) as string[];

  // Get stats for all videos
  const statsResponse = await youtube.videos.list({
    part: ["statistics"],
    id: videoIds,
  });

  // Sort by view count and return top performers
  const sortedVideos =
    statsResponse.data.items
      ?.sort((a, b) => {
        const aViews = parseInt(a.statistics?.viewCount || "0", 10);
        const bViews = parseInt(b.statistics?.viewCount || "0", 10);
        return bViews - aViews;
      })
      .slice(0, limit)
      .map((v) => v.id)
      .filter(Boolean) as string[];

  return sortedVideos || [];
}
