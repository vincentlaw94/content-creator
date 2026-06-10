import type { TrendReport, TrendingTopic, VideoFormat, TrendingSound, FootageAnalysis } from "../../shared/types.js";
import { ContentInsights } from "./analyzer.js";

export interface MatchResult {
  topic?: TrendingTopic;
  format?: VideoFormat;
  sound?: TrendingSound;
  matchScore: number;
  recommendations: string[];
}

export function matchFootageToTrends(
  analysis: FootageAnalysis,
  insights: ContentInsights,
  trendReport: TrendReport
): MatchResult {
  const recommendations: string[] = [];
  let totalScore = 0;

  // Match to trending topics
  const topicMatch = findBestTopicMatch(insights, trendReport.topics);
  if (topicMatch) {
    totalScore += topicMatch.score * 0.4;
    recommendations.push(`Align with trending topic: "${topicMatch.topic.topic}" (score: ${topicMatch.topic.score})`);
  }

  // Match to video formats
  const formatMatch = findBestFormatMatch(analysis, insights, trendReport.formats);
  if (formatMatch) {
    totalScore += formatMatch.score * 0.3;
    recommendations.push(`Use format: "${formatMatch.format.name}" - ${formatMatch.format.description}`);
  }

  // Match to trending sounds
  const soundMatch = findBestSoundMatch(insights, trendReport.sounds);
  if (soundMatch) {
    totalScore += soundMatch.score * 0.3;
    recommendations.push(`Use trending sound: "${soundMatch.sound.name}" by ${soundMatch.sound.artist || "Unknown"}`);
  }

  // Add general recommendations
  if (insights.mood === "energetic" && trendReport.formats.some(f => f.name.toLowerCase().includes("fast"))) {
    recommendations.push("Content mood matches fast-paced trending formats");
  }

  if (analysis.scenes.filter(s => s.type === "action").length > 3) {
    recommendations.push("Multiple action sequences available - consider highlight compilation");
  }

  return {
    topic: topicMatch?.topic,
    format: formatMatch?.format,
    sound: soundMatch?.sound,
    matchScore: Math.min(100, Math.round(totalScore)),
    recommendations,
  };
}

interface TopicMatchResult {
  topic: TrendingTopic;
  score: number;
}

function findBestTopicMatch(
  insights: ContentInsights,
  topics: TrendingTopic[]
): TopicMatchResult | null {
  if (topics.length === 0) return null;

  const contentKeywords = [
    insights.mainSubject,
    ...insights.activities,
    ...insights.locations,
    insights.mood,
  ].map(k => k.toLowerCase());

  let bestMatch: TopicMatchResult | null = null;

  for (const topic of topics) {
    const topicKeywords = topic.topic.toLowerCase().split(/\s+/);

    // Calculate keyword overlap
    let overlap = 0;
    for (const keyword of topicKeywords) {
      if (contentKeywords.some(ck => ck.includes(keyword) || keyword.includes(ck))) {
        overlap++;
      }
    }

    // Score based on overlap and topic trending score
    const matchScore = (overlap / topicKeywords.length) * topic.score;

    if (!bestMatch || matchScore > bestMatch.score) {
      bestMatch = { topic, score: matchScore };
    }
  }

  return bestMatch && bestMatch.score > 10 ? bestMatch : null;
}

interface FormatMatchResult {
  format: VideoFormat;
  score: number;
}

function findBestFormatMatch(
  analysis: FootageAnalysis,
  insights: ContentInsights,
  formats: VideoFormat[]
): FormatMatchResult | null {
  if (formats.length === 0) return null;

  const videoDuration = analysis.metadata.duration;
  const hasMultipleActivities = insights.activities.length > 2;
  const isActionHeavy = analysis.scenes.filter(s => s.type === "action").length > analysis.scenes.length * 0.4;
  const hasOutdoor = analysis.scenes.some(s => s.type === "outdoor");

  let bestMatch: FormatMatchResult | null = null;

  for (const format of formats) {
    let score = 0;
    const formatLower = format.name.toLowerCase() + " " + format.description.toLowerCase();

    // Duration compatibility
    if (Math.abs(format.avgDuration - videoDuration) < 15) {
      score += 20;
    }

    // Format type matching
    if (formatLower.includes("pov") && insights.visualStyle.includes("POV")) {
      score += 30;
    }

    if (formatLower.includes("day in") && hasMultipleActivities) {
      score += 25;
    }

    if ((formatLower.includes("action") || formatLower.includes("highlight")) && isActionHeavy) {
      score += 30;
    }

    if (formatLower.includes("outdoor") && hasOutdoor) {
      score += 20;
    }

    if (formatLower.includes("vlog") && analysis.transcript.length > 5) {
      score += 25;
    }

    // Mood matching
    if (formatLower.includes(insights.mood.toLowerCase())) {
      score += 15;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { format, score };
    }
  }

  return bestMatch && bestMatch.score > 20 ? bestMatch : null;
}

interface SoundMatchResult {
  sound: TrendingSound;
  score: number;
}

function findBestSoundMatch(
  insights: ContentInsights,
  sounds: TrendingSound[]
): SoundMatchResult | null {
  if (sounds.length === 0) return null;

  // Map content mood to sound mood preferences
  const moodToSoundMood: Record<string, string[]> = {
    energetic: ["hype", "upbeat", "energetic", "party", "dance"],
    peaceful: ["chill", "ambient", "calm", "relaxing", "lofi"],
    adventurous: ["epic", "cinematic", "motivational", "inspiring"],
    dynamic: ["trending", "viral", "popular"],
    relaxed: ["chill", "ambient", "acoustic"],
  };

  const preferredMoods = moodToSoundMood[insights.mood] || ["trending"];

  let bestMatch: SoundMatchResult | null = null;

  for (const sound of sounds) {
    let score = 0;
    const soundMoodLower = sound.mood.toLowerCase();

    // Mood matching
    if (preferredMoods.some(m => soundMoodLower.includes(m))) {
      score += 40;
    }

    // Usage popularity (normalized)
    const maxUsage = Math.max(...sounds.map(s => s.usageCount));
    score += (sound.usageCount / maxUsage) * 30;

    // Availability bonus
    if (sound.previewUrl) {
      score += 10;
    }
    if (sound.tiktokId) {
      score += 10;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { sound, score };
    }
  }

  return bestMatch && bestMatch.score > 30 ? bestMatch : null;
}

export function generateTrendAlignmentSuggestions(
  insights: ContentInsights,
  trendReport: TrendReport
): string[] {
  const suggestions: string[] = [];

  // Check for missed opportunities
  const topTrends = trendReport.topics.slice(0, 5);
  for (const trend of topTrends) {
    const trendKeywords = trend.topic.toLowerCase().split(/\s+/);
    const contentText = [insights.mainSubject, ...insights.activities].join(" ").toLowerCase();

    const hasPartialMatch = trendKeywords.some(k => contentText.includes(k));
    const hasFullMatch = trendKeywords.every(k => contentText.includes(k));

    if (hasPartialMatch && !hasFullMatch) {
      suggestions.push(
        `Consider emphasizing "${trend.topic}" angle - you have related content but could align more closely`
      );
    }
  }

  // Format suggestions
  const unusedFormats = trendReport.formats.filter(f => {
    const formatLower = f.description.toLowerCase();
    return !formatLower.includes(insights.visualStyle.toLowerCase());
  });

  if (unusedFormats.length > 0 && unusedFormats[0].avgDuration) {
    suggestions.push(
      `Try the "${unusedFormats[0].name}" format - currently trending with ${unusedFormats[0].avgDuration}s average duration`
    );
  }

  // Sound suggestions
  const topSounds = trendReport.sounds.slice(0, 3);
  if (topSounds.length > 0) {
    suggestions.push(
      `Top trending sounds: ${topSounds.map(s => `"${s.name}"`).join(", ")}`
    );
  }

  return suggestions;
}
