import { google } from "googleapis";
import type { Comment, EngagementAction } from "../../../shared/types.js";
import { generateText, moderateContent } from "../../../shared/llm.js";
import { v4 as uuid } from "uuid";

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

export async function fetchComments(videoId: string): Promise<Comment[]> {
  const youtube = getYouTubeClient();

  console.log(`[YouTubeComments] Fetching comments for video: ${videoId}`);

  const response = await youtube.commentThreads.list({
    part: ["snippet"],
    videoId,
    maxResults: 50,
    order: "time",
  });

  const comments: Comment[] = [];

  for (const item of response.data.items || []) {
    const snippet = item.snippet?.topLevelComment?.snippet;
    if (!snippet) continue;

    const sentiment = await analyzeSentiment(snippet.textDisplay || "");

    comments.push({
      id: item.id || "",
      postId: videoId,
      platform: "youtube",
      author: snippet.authorDisplayName || "Unknown",
      content: snippet.textDisplay || "",
      timestamp: new Date(snippet.publishedAt || Date.now()),
      sentiment,
      replied: false,
    });
  }

  console.log(`[YouTubeComments] Fetched ${comments.length} comments`);
  return comments;
}

async function analyzeSentiment(text: string): Promise<Comment["sentiment"]> {
  // Check for spam
  const spamIndicators = [
    /sub4sub/i,
    /check my channel/i,
    /free subscribers/i,
    /click here/i,
    /bit\.ly/i,
    /\$\d+.*free/i,
  ];

  if (spamIndicators.some((pattern) => pattern.test(text))) {
    return "spam";
  }

  // Check for harmful content
  const moderation = await moderateContent(text);
  if (moderation.flagged) {
    return "negative";
  }

  // Keyword-based sentiment
  const positiveWords = [
    "love", "amazing", "awesome", "great", "helpful", "thank",
    "best", "perfect", "incredible", "subscribed", "❤️", "👍",
  ];

  const negativeWords = [
    "hate", "bad", "terrible", "boring", "waste", "dislike",
    "unsubscribe", "clickbait", "👎",
  ];

  const textLower = text.toLowerCase();

  const positiveCount = positiveWords.filter((w) => textLower.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => textLower.includes(w)).length;

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

export async function generateReply(comment: Comment): Promise<string> {
  const prompt = `Generate a thoughtful reply to this YouTube comment.

Comment by ${comment.author}: "${comment.content}"
Sentiment: ${comment.sentiment}

Guidelines:
- Be professional yet friendly
- Thank them for watching if positive
- Address their point if they asked a question
- If negative: be understanding, don't argue
- Keep it conversational (1-3 sentences)
- Don't be overly promotional

Reply:`;

  const reply = await generateText(prompt, {
    maxTokens: 150,
    temperature: 0.7,
  });

  return reply.trim().slice(0, 500);
}

export async function postReply(
  videoId: string,
  commentId: string,
  replyText: string
): Promise<boolean> {
  const youtube = getYouTubeClient();

  console.log(`[YouTubeComments] Posting reply to comment: ${commentId}`);

  try {
    await youtube.comments.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          parentId: commentId,
          textOriginal: replyText,
        },
      },
    });
    return true;
  } catch (error) {
    console.error("[YouTubeComments] Failed to post reply:", error);
    return false;
  }
}

export async function processComments(
  videoId: string,
  autoReply: boolean = false
): Promise<EngagementAction[]> {
  const comments = await fetchComments(videoId);
  const actions: EngagementAction[] = [];

  for (const comment of comments) {
    // Skip spam
    if (comment.sentiment === "spam") {
      actions.push({
        id: uuid(),
        type: "flag",
        commentId: comment.id,
        content: "Flagged as spam",
        status: "pending",
        createdAt: new Date(),
      });
      continue;
    }

    // Generate reply
    const reply = await generateReply(comment);

    const action: EngagementAction = {
      id: uuid(),
      type: "reply",
      commentId: comment.id,
      content: reply,
      status: "pending",
      createdAt: new Date(),
    };

    if (autoReply && comment.sentiment === "positive") {
      // Auto-reply to positive comments
      const success = await postReply(videoId, comment.id, reply);
      action.status = success ? "executed" : "pending";
      if (success) {
        action.executedAt = new Date();
      }
    }

    actions.push(action);
  }

  console.log(`[YouTubeComments] Processed ${comments.length} comments, generated ${actions.length} actions`);
  return actions;
}

export async function pinComment(commentId: string): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    // YouTube API doesn't directly support pinning via API
    // This would need to be done through the YouTube Studio
    console.log(`[YouTubeComments] Note: Pinning comment ${commentId} requires YouTube Studio`);
    return false;
  } catch (error) {
    console.error("[YouTubeComments] Failed to pin comment:", error);
    return false;
  }
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    await youtube.comments.delete({ id: commentId });
    return true;
  } catch (error) {
    console.error("[YouTubeComments] Failed to delete comment:", error);
    return false;
  }
}

export async function hideUser(channelId: string): Promise<boolean> {
  const youtube = getYouTubeClient();

  try {
    // Block user from commenting on your videos
    await youtube.comments.setModerationStatus({
      id: channelId,
      moderationStatus: "rejected",
      banAuthor: true,
    });
    return true;
  } catch (error) {
    console.error("[YouTubeComments] Failed to hide user:", error);
    return false;
  }
}

export function filterCommentsForReply(comments: Comment[]): Comment[] {
  return comments.filter((c) => {
    if (c.sentiment === "spam") return false;
    if (c.replied) return false;
    if (c.content.length < 10) return false;

    // Questions are high priority for replies
    const isQuestion = c.content.includes("?");
    if (isQuestion) return true;

    // Positive substantive comments
    if (c.sentiment === "positive" && c.content.length > 20) return true;

    return false;
  });
}
