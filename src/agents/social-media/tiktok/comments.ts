import type { Comment, EngagementAction } from "../../../shared/types.js";
import { generateText, moderateContent } from "../../../shared/llm.js";
import { v4 as uuid } from "uuid";

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

interface TikTokComment {
  id: string;
  text: string;
  create_time: number;
  user: {
    unique_id: string;
    nickname: string;
  };
  likes: number;
  reply_count: number;
}

export async function fetchComments(videoId: string): Promise<Comment[]> {
  const config = getConfig();

  console.log(`[TikTokComments] Fetching comments for video: ${videoId}`);

  const response = await fetch(
    `https://open.tiktokapis.com/v2/video/comment/list/?video_id=${videoId}&max_count=50`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch TikTok comments: ${response.statusText}`);
  }

  const data = await response.json() as {
    data: {
      comments: TikTokComment[];
    };
  };

  const comments: Comment[] = [];

  for (const c of data.data.comments) {
    // Analyze sentiment
    const sentiment = await analyzeSentiment(c.text);

    comments.push({
      id: c.id,
      postId: videoId,
      platform: "tiktok",
      author: c.user.unique_id,
      content: c.text,
      timestamp: new Date(c.create_time * 1000),
      sentiment,
      replied: false, // Will be updated from our database
    });
  }

  console.log(`[TikTokComments] Fetched ${comments.length} comments`);
  return comments;
}

async function analyzeSentiment(text: string): Promise<Comment["sentiment"]> {
  // Check for spam first
  const spamIndicators = [
    /follow me/i,
    /check my profile/i,
    /dm me/i,
    /free followers/i,
    /click link/i,
    /make money/i,
    /\$\d+/,
  ];

  if (spamIndicators.some((pattern) => pattern.test(text))) {
    return "spam";
  }

  // Use moderation API for negative content
  const moderation = await moderateContent(text);
  if (moderation.flagged) {
    return "negative";
  }

  // Simple sentiment analysis based on keywords
  const positiveWords = [
    "love", "amazing", "awesome", "great", "beautiful", "perfect",
    "incredible", "fire", "🔥", "❤️", "😍", "👏", "💯", "sick",
  ];

  const negativeWords = [
    "hate", "bad", "terrible", "awful", "worst", "boring",
    "cringe", "😒", "👎", "trash",
  ];

  const textLower = text.toLowerCase();

  const positiveCount = positiveWords.filter((w) => textLower.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => textLower.includes(w)).length;

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

export async function generateReply(comment: Comment): Promise<string> {
  const prompt = `Generate a friendly, engaging reply to this TikTok comment.

Comment by @${comment.author}: "${comment.content}"
Sentiment: ${comment.sentiment}

Guidelines:
- Keep it short (under 100 characters)
- Be authentic and conversational
- If positive: thank them enthusiastically
- If neutral: engage with their point
- If negative (non-spam): be understanding, don't argue
- Include 1-2 relevant emojis
- Don't be overly promotional

Reply:`;

  const reply = await generateText(prompt, {
    maxTokens: 100,
    temperature: 0.8,
  });

  return reply.trim().slice(0, 150);
}

export async function postReply(
  videoId: string,
  commentId: string,
  replyText: string
): Promise<boolean> {
  const config = getConfig();

  console.log(`[TikTokComments] Posting reply to comment: ${commentId}`);

  const response = await fetch(
    "https://open.tiktokapis.com/v2/video/comment/reply/",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_id: videoId,
        comment_id: commentId,
        text: replyText,
      }),
    }
  );

  if (!response.ok) {
    console.error(`[TikTokComments] Failed to post reply: ${response.statusText}`);
    return false;
  }

  return true;
}

export async function processComments(
  videoId: string,
  postId: string,
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

    // Generate reply for non-spam comments
    const reply = await generateReply(comment);

    const action: EngagementAction = {
      id: uuid(),
      type: "reply",
      commentId: comment.id,
      content: reply,
      status: autoReply ? "pending" : "pending",
      createdAt: new Date(),
    };

    if (autoReply && comment.sentiment !== "negative") {
      // Auto-reply to positive and neutral comments
      const success = await postReply(videoId, comment.id, reply);
      action.status = success ? "executed" : "pending";
      if (success) {
        action.executedAt = new Date();
      }
    }

    actions.push(action);
  }

  console.log(`[TikTokComments] Processed ${comments.length} comments, generated ${actions.length} actions`);
  return actions;
}

export async function likeComment(commentId: string): Promise<boolean> {
  const config = getConfig();

  const response = await fetch(
    "https://open.tiktokapis.com/v2/video/comment/like/",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment_id: commentId,
      }),
    }
  );

  return response.ok;
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const config = getConfig();

  const response = await fetch(
    "https://open.tiktokapis.com/v2/video/comment/delete/",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment_id: commentId,
      }),
    }
  );

  return response.ok;
}

export function filterCommentsForReply(comments: Comment[]): Comment[] {
  // Filter to comments worth replying to
  return comments.filter((c) => {
    // Skip spam
    if (c.sentiment === "spam") return false;

    // Skip already replied
    if (c.replied) return false;

    // Skip very short comments (likely not meaningful)
    if (c.content.length < 5) return false;

    // Skip emoji-only comments
    if (/^[\s\p{Emoji}]+$/u.test(c.content)) return false;

    return true;
  });
}
