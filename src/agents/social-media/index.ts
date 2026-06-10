import type { Project, PostResult, StoryPlan, EngagementAction } from "../../shared/types.js";
import { uploadToTikTok, getOptimalPostTime as getTikTokOptimalTime } from "./tiktok/upload.js";
import { uploadToYouTube, getOptimalPostTime as getYouTubeOptimalTime } from "./youtube/upload.js";
import { fetchVideoAnalytics as fetchTikTokAnalytics } from "./tiktok/analytics.js";
import { fetchVideoAnalytics as fetchYouTubeAnalytics } from "./youtube/analytics.js";
import { EngagementManager, createEngagementManager } from "./engagement.js";
import { savePostResult, getPostResults, saveAnalyticsSnapshot, updateProject } from "../../shared/db.js";

export interface SocialMediaAgentOptions {
  autoReply?: boolean;
  autoReplyPositiveOnly?: boolean;
  platforms?: ("tiktok" | "youtube")[];
}

export class SocialMediaAgent {
  private engagementManager: EngagementManager;
  private platforms: ("tiktok" | "youtube")[];

  constructor(options: SocialMediaAgentOptions = {}) {
    this.engagementManager = createEngagementManager({
      autoReply: options.autoReply ?? true,
      autoReplyPositiveOnly: options.autoReplyPositiveOnly ?? true,
    });
    this.platforms = options.platforms || ["tiktok", "youtube"];
  }

  async uploadVideo(
    project: Project,
    storyPlan: StoryPlan,
    editedVideos: { youtube?: string; tiktok?: string }
  ): Promise<PostResult[]> {
    console.log(`[SocialMediaAgent] Uploading videos for project: ${project.id}`);

    await updateProject(project.id, { status: "posting" });

    const results: PostResult[] = [];

    // Upload to TikTok
    if (this.platforms.includes("tiktok") && editedVideos.tiktok) {
      try {
        console.log("[SocialMediaAgent] Uploading to TikTok...");
        const tiktokResult = await uploadToTikTok(
          project.id,
          editedVideos.tiktok,
          storyPlan
        );
        await savePostResult(tiktokResult);
        results.push(tiktokResult);
        console.log(`[SocialMediaAgent] TikTok upload complete: ${tiktokResult.url}`);
      } catch (error) {
        console.error("[SocialMediaAgent] TikTok upload failed:", error);
      }
    }

    // Upload to YouTube
    if (this.platforms.includes("youtube") && editedVideos.youtube) {
      try {
        console.log("[SocialMediaAgent] Uploading to YouTube...");
        const youtubeResult = await uploadToYouTube(
          project.id,
          editedVideos.youtube,
          storyPlan
        );
        await savePostResult(youtubeResult);
        results.push(youtubeResult);
        console.log(`[SocialMediaAgent] YouTube upload complete: ${youtubeResult.url}`);
      } catch (error) {
        console.error("[SocialMediaAgent] YouTube upload failed:", error);
      }
    }

    // Update project status
    if (results.length > 0) {
      await updateProject(project.id, {
        status: "posted",
        postResults: results.map((r) => r.id),
      });
    } else {
      await updateProject(project.id, {
        status: "failed",
        error: "All uploads failed",
      });
    }

    return results;
  }

  async checkAnalytics(projectId: string): Promise<void> {
    console.log(`[SocialMediaAgent] Checking analytics for project: ${projectId}`);

    const posts = await getPostResults(projectId);

    for (const post of posts) {
      try {
        let snapshot;

        if (post.platform === "tiktok") {
          snapshot = await fetchTikTokAnalytics(post.videoId);
        } else if (post.platform === "youtube") {
          snapshot = await fetchYouTubeAnalytics(post.videoId);
        }

        if (snapshot) {
          await saveAnalyticsSnapshot(snapshot);
          console.log(
            `[SocialMediaAgent] ${post.platform} analytics: ${snapshot.views} views, ${snapshot.likes} likes`
          );
        }
      } catch (error) {
        console.error(`[SocialMediaAgent] Failed to fetch analytics for ${post.platform}:`, error);
      }
    }
  }

  async processComments(projectId: string): Promise<EngagementAction[]> {
    console.log(`[SocialMediaAgent] Processing comments for project: ${projectId}`);

    const posts = await getPostResults(projectId);
    const allActions: EngagementAction[] = [];

    for (const post of posts) {
      const actions = await this.engagementManager.processPostComments(post);
      allActions.push(...actions);
    }

    return allActions;
  }

  async executeEngagement(): Promise<number> {
    return this.engagementManager.executePendingActions();
  }

  async getEngagementReport(): Promise<string> {
    return this.engagementManager.generateEngagementReport();
  }

  getOptimalPostTimes(): { tiktok: Date; youtube: Date } {
    return {
      tiktok: getTikTokOptimalTime(),
      youtube: getYouTubeOptimalTime(),
    };
  }

  async runDailyEngagement(): Promise<{
    commentsProcessed: number;
    actionsExecuted: number;
    analyticsUpdated: number;
  }> {
    console.log("[SocialMediaAgent] Running daily engagement routine...");

    let commentsProcessed = 0;
    let analyticsUpdated = 0;

    // This would typically iterate over recent projects
    // For now, just execute pending actions
    const actionsExecuted = await this.executeEngagement();

    return {
      commentsProcessed,
      actionsExecuted,
      analyticsUpdated,
    };
  }
}

export function createSocialMediaAgent(options?: SocialMediaAgentOptions): SocialMediaAgent {
  return new SocialMediaAgent(options);
}

// Re-export sub-modules
export { uploadToTikTok } from "./tiktok/upload.js";
export { uploadToYouTube } from "./youtube/upload.js";
export { fetchVideoAnalytics as fetchTikTokAnalytics } from "./tiktok/analytics.js";
export { fetchVideoAnalytics as fetchYouTubeAnalytics } from "./youtube/analytics.js";
export { createEngagementManager } from "./engagement.js";
