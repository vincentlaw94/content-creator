import { v4 as uuid } from "uuid";
import type {
  Project,
  TrendReport,
  StoryPlan,
  FootageAnalysis,
} from "../../shared/types.js";
import { analyzeContentForStory, ContentInsights } from "./analyzer.js";
import { generateNarrative, refineNarrative } from "./narrative.js";
import { matchFootageToTrends, generateTrendAlignmentSuggestions, MatchResult } from "./matcher.js";
import { saveStoryPlan, getStoryPlan, updateProject } from "../../shared/db.js";

export interface StoryGenerationOptions {
  targetDuration?: number;
  platform?: "tiktok" | "youtube" | "instagram";
  useVisionAnalysis?: boolean;
}

export class StoryGenerationAgent {
  async generateStory(
    project: Project,
    analysis: FootageAnalysis,
    trendReport?: TrendReport,
    options: StoryGenerationOptions = {}
  ): Promise<StoryPlan> {
    const {
      targetDuration = 30,
      platform = "tiktok",
      useVisionAnalysis = true,
    } = options;

    console.log(`[StoryGenerationAgent] Generating story for project: ${project.id}`);

    // Update project status
    updateProject(project.id, { status: "story_planning" });

    // Step 1: Analyze content for story potential
    console.log("[StoryGenerationAgent] Analyzing content insights...");
    const insights = await analyzeContentForStory(analysis, project.context);
    console.log(`[StoryGenerationAgent] Main subject: ${insights.mainSubject}`);
    console.log(`[StoryGenerationAgent] Activities: ${insights.activities.join(", ")}`);
    console.log(`[StoryGenerationAgent] Mood: ${insights.mood}`);

    // Step 2: Match footage to trends (if trend report available)
    let matchResult: MatchResult | undefined;
    if (trendReport) {
      console.log("[StoryGenerationAgent] Matching content to trends...");
      matchResult = matchFootageToTrends(analysis, insights, trendReport);
      console.log(`[StoryGenerationAgent] Trend match score: ${matchResult.matchScore}`);
      for (const rec of matchResult.recommendations) {
        console.log(`[StoryGenerationAgent] Recommendation: ${rec}`);
      }
    }

    // Step 3: Generate narrative
    console.log("[StoryGenerationAgent] Generating narrative...");
    const storyPlan = await generateNarrative(analysis, insights, project.context, {
      trendReport,
      targetDuration,
      platform,
      niche: project.niche,
    });

    // Save story plan to database
    saveStoryPlan(storyPlan);

    // Update project with story plan reference
    updateProject(project.id, { storyPlanId: storyPlan.id });

    console.log(`[StoryGenerationAgent] Story plan created: "${storyPlan.title}"`);
    console.log(`[StoryGenerationAgent] Hook: ${storyPlan.hook}`);
    console.log(`[StoryGenerationAgent] Format: ${storyPlan.format.name}`);
    console.log(`[StoryGenerationAgent] Narrative moments: ${storyPlan.narrative.length}`);

    return storyPlan;
  }

  async refineStory(storyPlanId: string, feedback: string): Promise<StoryPlan> {
    console.log(`[StoryGenerationAgent] Refining story plan: ${storyPlanId}`);

    const existingPlan = getStoryPlan(storyPlanId);
    if (!existingPlan) {
      throw new Error(`Story plan not found: ${storyPlanId}`);
    }

    const refinedPlan = await refineNarrative(existingPlan, feedback);

    // Save refined plan (with new ID to preserve history)
    const newPlan: StoryPlan = {
      ...refinedPlan,
      id: uuid(),
    };
    saveStoryPlan(newPlan);

    console.log(`[StoryGenerationAgent] Story refined: "${newPlan.title}"`);
    return newPlan;
  }

  async suggestAlternatives(
    analysis: FootageAnalysis,
    trendReport: TrendReport,
    currentPlan: StoryPlan
  ): Promise<{
    alternativeFormats: string[];
    alternativeHooks: string[];
    trendSuggestions: string[];
  }> {
    console.log("[StoryGenerationAgent] Generating alternatives...");

    // Analyze content
    const insights = await analyzeContentForStory(
      analysis,
      `Current title: ${currentPlan.title}. Hook: ${currentPlan.hook}`
    );

    // Get trend alignment suggestions
    const trendSuggestions = generateTrendAlignmentSuggestions(insights, trendReport);

    // Generate alternative formats
    const alternativeFormats = trendReport.formats
      .filter((f) => f.name !== currentPlan.format.name)
      .slice(0, 3)
      .map((f) => `${f.name}: ${f.description} (avg ${f.avgDuration}s)`);

    // Get potential hooks
    const alternativeHooks = insights.potentialHooks
      .filter((h) => h !== currentPlan.hook)
      .slice(0, 5);

    return {
      alternativeFormats,
      alternativeHooks,
      trendSuggestions,
    };
  }

  async analyzeStoryEffectiveness(storyPlan: StoryPlan): Promise<{
    hookStrength: number;
    narrativeFlow: number;
    trendAlignment: number;
    suggestions: string[];
  }> {
    // Analyze hook
    let hookStrength = 50;
    if (storyPlan.hook.length < 50) hookStrength += 10; // Concise is good
    if (storyPlan.hook.includes("?")) hookStrength += 5; // Questions engage
    if (/\b(you|your)\b/i.test(storyPlan.hook)) hookStrength += 10; // Direct address

    // Analyze narrative flow
    let narrativeFlow = 50;
    const criticalMoments = storyPlan.narrative.filter((m) => m.importance === "critical").length;
    if (criticalMoments >= 2 && criticalMoments <= 4) narrativeFlow += 20;
    if (storyPlan.narrative.length >= 5 && storyPlan.narrative.length <= 10) narrativeFlow += 15;

    // Check for good pacing (variety of importance levels)
    const hasVariety =
      storyPlan.narrative.some((m) => m.importance === "critical") &&
      storyPlan.narrative.some((m) => m.importance === "supporting") &&
      storyPlan.narrative.some((m) => m.importance === "optional");
    if (hasVariety) narrativeFlow += 15;

    // Trend alignment (based on format and hashtags)
    let trendAlignment = 40;
    if (storyPlan.suggestedSound) trendAlignment += 20;
    if (storyPlan.hashtags.some((h) => h.includes("fyp") || h.includes("viral"))) {
      trendAlignment += 10;
    }
    if (storyPlan.format.examples && storyPlan.format.examples.length > 0) {
      trendAlignment += 15;
    }

    const suggestions: string[] = [];

    if (hookStrength < 70) {
      suggestions.push("Consider making the hook more attention-grabbing or using direct address");
    }
    if (narrativeFlow < 70) {
      suggestions.push("Vary the pacing with a mix of critical and supporting moments");
    }
    if (trendAlignment < 70) {
      suggestions.push("Add trending sound or align more closely with current formats");
    }
    if (storyPlan.estimatedDuration > 60) {
      suggestions.push("Consider a shorter version for TikTok (under 60s performs better)");
    }

    return {
      hookStrength: Math.min(100, hookStrength),
      narrativeFlow: Math.min(100, narrativeFlow),
      trendAlignment: Math.min(100, trendAlignment),
      suggestions,
    };
  }
}

export function createStoryGenerationAgent(): StoryGenerationAgent {
  return new StoryGenerationAgent();
}
