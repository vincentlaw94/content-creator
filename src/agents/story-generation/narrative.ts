import { generateJSON, generateText } from "../../shared/llm.js";
import type {
  TrendReport,
  VideoFormat,
  StoryPlan,
  NarrativeMoment,
  TrendingSound,
  FootageAnalysis,
} from "../../shared/types.js";
import { ContentInsights } from "./analyzer.js";
import { v4 as uuid } from "uuid";

export interface NarrativeOptions {
  trendReport?: TrendReport;
  targetDuration?: number;
  platform?: "tiktok" | "youtube" | "instagram";
  niche?: string[];
}

export async function generateNarrative(
  analysis: FootageAnalysis,
  insights: ContentInsights,
  userContext: string,
  options: NarrativeOptions = {}
): Promise<StoryPlan> {
  const {
    trendReport,
    targetDuration = 30,
    platform = "tiktok",
    niche = ["lifestyle"],
  } = options;

  // Select best format based on content and trends
  const format = selectFormat(insights, trendReport);

  // Select trending sound if available
  const sound = selectSound(insights, trendReport);

  // Generate narrative structure
  const narrativePrompt = buildNarrativePrompt(
    analysis,
    insights,
    userContext,
    format,
    targetDuration,
    platform
  );

  const narrativeResponse = await generateJSON<{
    title: string;
    hook: string;
    moments: Array<{
      timestamp: number;
      endTimestamp?: number;
      description: string;
      importance: "critical" | "supporting" | "optional";
      suggestedEffect?: string;
    }>;
  }>(narrativePrompt, {
    systemPrompt: `You are a viral content strategist specializing in ${niche.join(", ")} content.
Create engaging narratives that hook viewers in the first 3 seconds and maintain attention throughout.
Your narratives should follow platform-specific best practices for maximum engagement.`,
    maxTokens: 1500,
  });

  // Generate captions
  const captions = await generateCaptions(
    narrativeResponse.title,
    narrativeResponse.hook,
    insights,
    platform,
    niche
  );

  // Generate hashtags
  const hashtags = generateHashtags(insights, trendReport, niche);

  const storyPlan: StoryPlan = {
    id: uuid(),
    projectId: analysis.projectId,
    title: narrativeResponse.title,
    hook: narrativeResponse.hook,
    narrative: narrativeResponse.moments.map((m) => ({
      timestamp: m.timestamp,
      endTimestamp: m.endTimestamp,
      description: m.description,
      importance: m.importance,
      suggestedEffect: m.suggestedEffect,
    })),
    format,
    suggestedSound: sound,
    captions,
    hashtags,
    estimatedDuration: targetDuration,
    createdAt: new Date(),
  };

  return storyPlan;
}

function buildNarrativePrompt(
  analysis: FootageAnalysis,
  insights: ContentInsights,
  userContext: string,
  format: VideoFormat,
  targetDuration: number,
  platform: string
): string {
  const sceneTimestamps = analysis.scenes
    .map((s, i) => `[${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s] ${s.type}: ${s.description}`)
    .join("\n");

  return `Create a viral ${platform} video narrative for this content.

USER CONTEXT: ${userContext}

CONTENT INSIGHTS:
- Main Subject: ${insights.mainSubject}
- Activities: ${insights.activities.join(", ")}
- Locations: ${insights.locations.join(", ")}
- Mood: ${insights.mood}
- Visual Style: ${insights.visualStyle}
- Potential Hooks: ${insights.potentialHooks.join("; ")}

AVAILABLE SCENES:
${sceneTimestamps}

VIDEO FORMAT: ${format.name}
FORMAT DESCRIPTION: ${format.description}
TARGET DURATION: ${targetDuration} seconds

TRANSCRIPT HIGHLIGHTS:
${analysis.transcript.slice(0, 5).map((t) => `[${t.start.toFixed(1)}s] ${t.text}`).join("\n") || "No speech"}

Generate a JSON response with:
{
  "title": "Catchy, attention-grabbing title (max 60 chars)",
  "hook": "The first 3 seconds hook - what will grab attention immediately",
  "moments": [
    {
      "timestamp": 0,
      "endTimestamp": 3,
      "description": "Hook moment description",
      "importance": "critical",
      "suggestedEffect": "zoom-in"
    },
    // More moments covering the full video
  ]
}

Requirements:
1. First moment MUST be a strong hook (0-3s)
2. Include 5-8 moments total
3. Timestamps must match available scenes
4. End with a call-to-action or memorable close
5. Vary between critical, supporting, and optional moments
6. Consider the ${insights.mood} mood throughout`;
}

function selectFormat(
  insights: ContentInsights,
  trendReport?: TrendReport
): VideoFormat {
  // If we have trend data, try to match content to trending formats
  if (trendReport?.formats.length) {
    const contentKeywords = [
      insights.mainSubject,
      ...insights.activities,
      ...insights.locations,
    ].join(" ").toLowerCase();

    for (const format of trendReport.formats) {
      const formatKeywords = `${format.name} ${format.description}`.toLowerCase();
      // Simple keyword overlap matching
      if (
        formatKeywords.includes("pov") && contentKeywords.includes("adventure") ||
        formatKeywords.includes("day in") && insights.activities.length > 2 ||
        formatKeywords.includes("transformation") && contentKeywords.includes("before")
      ) {
        return format;
      }
    }

    // Return highest trending format that could work
    return trendReport.formats[0];
  }

  // Default formats based on content type
  if (insights.visualStyle.includes("POV") || insights.mood === "energetic") {
    return {
      name: "POV Adventure",
      description: "First-person perspective of an exciting activity",
      avgDuration: 30,
      examples: [],
    };
  }

  if (insights.activities.length > 2) {
    return {
      name: "Day in the Life",
      description: "Quick montage of various activities throughout a day",
      avgDuration: 45,
      examples: [],
    };
  }

  return {
    name: "Highlight Reel",
    description: "Fast-paced compilation of best moments",
    avgDuration: 30,
    examples: [],
  };
}

function selectSound(
  insights: ContentInsights,
  trendReport?: TrendReport
): TrendingSound | undefined {
  if (!trendReport?.sounds.length) return undefined;

  // Match mood to sound mood
  const moodMappings: Record<string, string[]> = {
    energetic: ["hype", "energetic", "upbeat", "party"],
    peaceful: ["chill", "ambient", "peaceful", "relaxed"],
    adventurous: ["epic", "adventure", "inspiring", "motivational"],
    dynamic: ["trending", "viral", "popular"],
  };

  const targetMoods = moodMappings[insights.mood] || ["trending"];

  for (const sound of trendReport.sounds) {
    if (targetMoods.some((m) => sound.mood.toLowerCase().includes(m))) {
      return sound;
    }
  }

  // Return most used sound as fallback
  const sorted = [...trendReport.sounds].sort((a, b) => b.usageCount - a.usageCount);
  return sorted[0];
}

async function generateCaptions(
  title: string,
  hook: string,
  insights: ContentInsights,
  platform: string,
  niche: string[]
): Promise<StoryPlan["captions"]> {
  const prompt = `Generate social media captions for this video:

Title: ${title}
Hook: ${hook}
Content: ${insights.mainSubject} - ${insights.activities.join(", ")}
Mood: ${insights.mood}
Target Audience: ${insights.audienceAppeal.join(", ")}
Niche: ${niche.join(", ")}

Generate JSON with platform-specific captions:
{
  "tiktok": "Short, punchy TikTok caption with emojis (max 150 chars)",
  "youtube": {
    "title": "YouTube title (max 60 chars, include keywords)",
    "description": "YouTube description (2-3 sentences, include context and call-to-action)"
  }
}`;

  try {
    const response = await generateJSON<{
      tiktok: string;
      youtube: { title: string; description: string };
    }>(prompt, { maxTokens: 500 });

    return response;
  } catch {
    return {
      tiktok: `${title} ${niche.map((n) => `#${n}`).join(" ")}`,
      youtube: {
        title,
        description: `${hook}\n\nFollow for more ${niche.join(" and ")} content!`,
      },
    };
  }
}

function generateHashtags(
  insights: ContentInsights,
  trendReport?: TrendReport,
  niche: string[] = []
): string[] {
  const hashtags: Set<string> = new Set();

  // Add niche hashtags
  for (const n of niche) {
    hashtags.add(`#${n.toLowerCase().replace(/\s+/g, "")}`);
  }

  // Add activity hashtags
  for (const activity of insights.activities) {
    hashtags.add(`#${activity.toLowerCase().replace(/\s+/g, "")}`);
  }

  // Add mood hashtags
  hashtags.add(`#${insights.mood.toLowerCase()}`);

  // Add trending hashtags from trend report
  if (trendReport?.topics) {
    for (const topic of trendReport.topics.slice(0, 3)) {
      hashtags.add(`#${topic.topic.toLowerCase().replace(/\s+/g, "")}`);
    }
  }

  // Add generic viral hashtags
  const viralHashtags = ["#fyp", "#foryou", "#viral", "#trending"];
  viralHashtags.forEach((h) => hashtags.add(h));

  return Array.from(hashtags).slice(0, 15);
}

export async function refineNarrative(
  storyPlan: StoryPlan,
  feedback: string
): Promise<StoryPlan> {
  const prompt = `Refine this video story plan based on feedback.

CURRENT PLAN:
Title: ${storyPlan.title}
Hook: ${storyPlan.hook}
Format: ${storyPlan.format.name}
Duration: ${storyPlan.estimatedDuration}s

CURRENT NARRATIVE:
${storyPlan.narrative.map((m) => `[${m.timestamp}s] ${m.importance}: ${m.description}`).join("\n")}

FEEDBACK:
${feedback}

Generate an improved JSON response with the same structure as the original plan.`;

  const refined = await generateJSON<{
    title: string;
    hook: string;
    moments: NarrativeMoment[];
  }>(prompt, { maxTokens: 1500 });

  return {
    ...storyPlan,
    title: refined.title,
    hook: refined.hook,
    narrative: refined.moments,
  };
}
