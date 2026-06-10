import type { Comment, EngagementAction, PostResult } from "../../shared/types.js";
import { generateText } from "../../shared/llm.js";
import {
  processComments as processTikTokComments,
  postReply as postTikTokReply,
} from "./tiktok/comments.js";
import {
  processComments as processYouTubeComments,
  postReply as postYouTubeReply,
} from "./youtube/comments.js";
import {
  saveComment,
  saveEngagementAction,
  getUnrepliedComments,
  getPendingActions,
  updateActionStatus,
  markCommentReplied,
} from "../../shared/db.js";

export interface EngagementConfig {
  autoReply: boolean;
  autoReplyPositiveOnly: boolean;
  maxRepliesPerHour: number;
  commentCheckInterval: number; // minutes
}

const defaultConfig: EngagementConfig = {
  autoReply: true,
  autoReplyPositiveOnly: true,
  maxRepliesPerHour: 20,
  commentCheckInterval: 30,
};

export class EngagementManager {
  private config: EngagementConfig;
  private repliesSentThisHour: number = 0;
  private hourStartTime: number = Date.now();

  constructor(config: Partial<EngagementConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async processPostComments(post: PostResult): Promise<EngagementAction[]> {
    console.log(`[EngagementManager] Processing comments for ${post.platform} post: ${post.videoId}`);

    let actions: EngagementAction[];

    if (post.platform === "tiktok") {
      actions = await processTikTokComments(
        post.videoId,
        post.id,
        this.config.autoReply && !this.config.autoReplyPositiveOnly
      );
    } else if (post.platform === "youtube") {
      actions = await processYouTubeComments(
        post.videoId,
        this.config.autoReply && !this.config.autoReplyPositiveOnly
      );
    } else {
      console.log(`[EngagementManager] Unsupported platform: ${post.platform}`);
      return [];
    }

    // Save actions to database
    for (const action of actions) {
      saveEngagementAction(action);
    }

    return actions;
  }

  async executePendingActions(): Promise<number> {
    console.log("[EngagementManager] Executing pending actions...");

    this.resetHourlyLimitIfNeeded();

    const pendingActions = getPendingActions();
    let executed = 0;

    for (const action of pendingActions) {
      if (this.repliesSentThisHour >= this.config.maxRepliesPerHour) {
        console.log("[EngagementManager] Hourly reply limit reached");
        break;
      }

      if (action.type === "reply" && action.content) {
        const success = await this.executeReply(action);
        if (success) {
          updateActionStatus(action.id, "executed");
          markCommentReplied(action.commentId);
          this.repliesSentThisHour++;
          executed++;
        }
      } else if (action.type === "flag") {
        // Flagged comments need manual review
        console.log(`[EngagementManager] Flagged comment ${action.commentId} for review`);
        updateActionStatus(action.id, "pending"); // Keep pending for manual review
      }
    }

    console.log(`[EngagementManager] Executed ${executed} actions`);
    return executed;
  }

  private async executeReply(action: EngagementAction): Promise<boolean> {
    // Get comment details to determine platform
    // In a real implementation, we'd store the platform with the action
    // For now, we'll try both platforms

    try {
      // Try TikTok first
      const tiktokSuccess = await postTikTokReply(
        "", // Would need video ID from comment
        action.commentId,
        action.content!
      );
      if (tiktokSuccess) return true;
    } catch {
      // TikTok failed, try YouTube
    }

    try {
      const youtubeSuccess = await postYouTubeReply(
        "",
        action.commentId,
        action.content!
      );
      if (youtubeSuccess) return true;
    } catch {
      // YouTube also failed
    }

    return false;
  }

  private resetHourlyLimitIfNeeded() {
    const now = Date.now();
    if (now - this.hourStartTime > 60 * 60 * 1000) {
      this.repliesSentThisHour = 0;
      this.hourStartTime = now;
    }
  }

  async generateEngagementReport(): Promise<string> {
    const unreplied = getUnrepliedComments();
    const pending = getPendingActions();

    const lines: string[] = [];

    lines.push("# Engagement Report");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");

    lines.push("## Comment Queue");
    lines.push(`- Unreplied comments: ${unreplied.length}`);
    lines.push(`- Pending actions: ${pending.length}`);
    lines.push(`- Replies sent this hour: ${this.repliesSentThisHour}/${this.config.maxRepliesPerHour}`);
    lines.push("");

    // Sentiment breakdown
    const sentimentCounts = {
      positive: unreplied.filter((c) => c.sentiment === "positive").length,
      neutral: unreplied.filter((c) => c.sentiment === "neutral").length,
      negative: unreplied.filter((c) => c.sentiment === "negative").length,
      spam: unreplied.filter((c) => c.sentiment === "spam").length,
    };

    lines.push("## Sentiment Breakdown");
    lines.push(`- Positive: ${sentimentCounts.positive}`);
    lines.push(`- Neutral: ${sentimentCounts.neutral}`);
    lines.push(`- Negative: ${sentimentCounts.negative}`);
    lines.push(`- Spam: ${sentimentCounts.spam}`);
    lines.push("");

    // Recent comments preview
    if (unreplied.length > 0) {
      lines.push("## Recent Comments (Unreplied)");
      for (const comment of unreplied.slice(0, 5)) {
        lines.push(`- @${comment.author}: "${comment.content.slice(0, 50)}..." [${comment.sentiment}]`);
      }
    }

    return lines.join("\n");
  }
}

export async function generateBatchReplies(comments: Comment[]): Promise<Map<string, string>> {
  const replies = new Map<string, string>();

  // Group comments by sentiment for batch processing
  const grouped = {
    positive: comments.filter((c) => c.sentiment === "positive"),
    neutral: comments.filter((c) => c.sentiment === "neutral"),
    negative: comments.filter((c) => c.sentiment === "negative"),
  };

  // Generate replies for each group
  for (const [sentiment, group] of Object.entries(grouped)) {
    if (group.length === 0) continue;

    const prompt = `Generate unique, friendly replies for these ${sentiment} comments.
Keep each reply under 100 characters and appropriate for social media.

Comments:
${group.map((c, i) => `${i + 1}. @${c.author}: "${c.content}"`).join("\n")}

Provide replies in JSON format:
{
  "replies": ["reply1", "reply2", ...]
}`;

    try {
      const response = await generateText(prompt, {
        maxTokens: 500,
        temperature: 0.8,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        group.forEach((comment, i) => {
          if (parsed.replies[i]) {
            replies.set(comment.id, parsed.replies[i]);
          }
        });
      }
    } catch (error) {
      console.error(`[EngagementManager] Batch reply generation failed:`, error);
    }
  }

  return replies;
}

export function prioritizeComments(comments: Comment[]): Comment[] {
  // Sort comments by priority
  return [...comments].sort((a, b) => {
    // Questions first
    const aQuestion = a.content.includes("?") ? 1 : 0;
    const bQuestion = b.content.includes("?") ? 1 : 0;
    if (aQuestion !== bQuestion) return bQuestion - aQuestion;

    // Then positive comments
    const sentimentOrder = { positive: 3, neutral: 2, negative: 1, spam: 0 };
    const aSentiment = sentimentOrder[a.sentiment || "neutral"];
    const bSentiment = sentimentOrder[b.sentiment || "neutral"];
    if (aSentiment !== bSentiment) return bSentiment - aSentiment;

    // Then by recency
    return b.timestamp.getTime() - a.timestamp.getTime();
  });
}

export function createEngagementManager(config?: Partial<EngagementConfig>): EngagementManager {
  return new EngagementManager(config);
}
