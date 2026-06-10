import { v4 as uuid } from "uuid";
import type { TrendReport } from "../../shared/types.js";
import { scrapeTikTokTrends, scrapeYouTubeTrends, getDefaultTrends, closeBrowser } from "./trends.js";
import { scrapeTrendingSounds } from "./sounds.js";
import { analyzeVideoFormats } from "./formats.js";
import { trackCompetitors, getCompetitorInsights, getDefaultCompetitors } from "./competitors.js";
import { saveTrendReport, getLatestTrendReport } from "../../shared/db.js";

export interface MarketResearchOptions {
  useCache?: boolean;
  cacheMaxAge?: number; // in hours
  useFallbackData?: boolean;
  competitors?: string[];
}

export class MarketResearchAgent {
  private defaultCacheMaxAge = 24; // hours

  async generateTrendReport(
    niche: string[],
    options: MarketResearchOptions = {}
  ): Promise<TrendReport> {
    const {
      useCache = true,
      cacheMaxAge = this.defaultCacheMaxAge,
      useFallbackData = true,
      competitors,
    } = options;

    console.log(`[MarketResearchAgent] Generating trend report for: ${niche.join(", ")}`);

    // Check cache first
    if (useCache) {
      const cached = await getLatestTrendReport(niche);
      if (cached) {
        const age = (Date.now() - cached.generatedAt.getTime()) / (1000 * 60 * 60);
        if (age < cacheMaxAge) {
          console.log(`[MarketResearchAgent] Using cached report (${Math.round(age)}h old)`);
          return cached;
        }
      }
    }

    // Generate fresh report
    let topics = [];
    let formats = [];
    let sounds = [];
    let competitorData = [];

    try {
      // Scrape trends in parallel
      console.log("[MarketResearchAgent] Scraping trends from platforms...");
      const [tiktokTopics, youtubeTopics] = await Promise.all([
        scrapeTikTokTrends(niche).catch((e) => {
          console.error("[MarketResearchAgent] TikTok scrape failed:", e);
          return [];
        }),
        scrapeYouTubeTrends(niche).catch((e) => {
          console.error("[MarketResearchAgent] YouTube scrape failed:", e);
          return [];
        }),
      ]);

      topics = [...tiktokTopics, ...youtubeTopics];

      // If scraping failed, use fallback data
      if (topics.length === 0 && useFallbackData) {
        console.log("[MarketResearchAgent] Using fallback trend data");
        topics = getDefaultTrends(niche);
      }

      // Deduplicate topics
      topics = deduplicateTopics(topics);

      // Scrape sounds and formats
      console.log("[MarketResearchAgent] Analyzing sounds and formats...");
      [sounds, formats] = await Promise.all([
        scrapeTrendingSounds(niche).catch((e) => {
          console.error("[MarketResearchAgent] Sound scrape failed:", e);
          return [];
        }),
        analyzeVideoFormats(niche).catch((e) => {
          console.error("[MarketResearchAgent] Format analysis failed:", e);
          return [];
        }),
      ]);

      // Track competitors
      console.log("[MarketResearchAgent] Tracking competitors...");
      competitorData = await trackCompetitors(niche, competitors).catch((e) => {
        console.error("[MarketResearchAgent] Competitor tracking failed:", e);
        return useFallbackData ? getDefaultCompetitors(niche) : [];
      });

    } finally {
      // Close browser if it was opened
      await closeBrowser();
    }

    const report: TrendReport = {
      id: uuid(),
      generatedAt: new Date(),
      niche: niche.sort(),
      topics: topics.slice(0, 20),
      formats: formats.slice(0, 10),
      sounds: sounds.slice(0, 15),
      competitors: competitorData.slice(0, 10),
    };

    // Save to database
    await saveTrendReport(report);

    console.log(`[MarketResearchAgent] Report generated:`);
    console.log(`  - ${report.topics.length} trending topics`);
    console.log(`  - ${report.formats.length} video formats`);
    console.log(`  - ${report.sounds.length} trending sounds`);
    console.log(`  - ${report.competitors.length} competitors tracked`);

    return report;
  }

  async getQuickInsights(niche: string[]): Promise<{
    topTopics: string[];
    recommendedFormat: string;
    competitorInsights: ReturnType<typeof getCompetitorInsights>;
  }> {
    const report = await this.generateTrendReport(niche, { useCache: true });

    return {
      topTopics: report.topics.slice(0, 5).map((t) => t.topic),
      recommendedFormat: report.formats[0]?.name || "POV Adventure",
      competitorInsights: getCompetitorInsights(report.competitors),
    };
  }

  async refreshTrends(niche: string[]): Promise<TrendReport> {
    return this.generateTrendReport(niche, { useCache: false });
  }

  formatReportSummary(report: TrendReport): string {
    const lines: string[] = [];

    lines.push(`# Trend Report: ${report.niche.join(", ")}`);
    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    lines.push("");

    lines.push("## Top Trending Topics");
    for (const topic of report.topics.slice(0, 5)) {
      lines.push(`- ${topic.topic} (score: ${topic.score}) [${topic.platforms.join(", ")}]`);
    }
    lines.push("");

    lines.push("## Recommended Formats");
    for (const format of report.formats.slice(0, 3)) {
      lines.push(`- **${format.name}**: ${format.description} (~${format.avgDuration}s)`);
    }
    lines.push("");

    lines.push("## Trending Sounds");
    for (const sound of report.sounds.slice(0, 5)) {
      lines.push(`- "${sound.name}" by ${sound.artist || "Unknown"} (${formatCount(sound.usageCount)} uses) [${sound.mood}]`);
    }
    lines.push("");

    if (report.competitors.length > 0) {
      lines.push("## Competitor Analysis");
      for (const competitor of report.competitors.slice(0, 3)) {
        lines.push(`- ${competitor.handle}: ${formatCount(competitor.followers)} followers - ${competitor.recentPerformance}`);
      }
    }

    return lines.join("\n");
  }
}

function deduplicateTopics(topics: TrendReport["topics"]): TrendReport["topics"] {
  const topicMap = new Map<string, (typeof topics)[0]>();

  for (const topic of topics) {
    const key = topic.topic.toLowerCase();
    const existing = topicMap.get(key);

    if (!existing) {
      topicMap.set(key, topic);
    } else {
      // Merge platforms and keep highest score
      topicMap.set(key, {
        topic: topic.topic,
        score: Math.max(existing.score, topic.score),
        platforms: [...new Set([...existing.platforms, ...topic.platforms])],
        examples: [...new Set([...existing.examples, ...topic.examples])].slice(0, 5),
      });
    }
  }

  return Array.from(topicMap.values()).sort((a, b) => b.score - a.score);
}

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export function createMarketResearchAgent(): MarketResearchAgent {
  return new MarketResearchAgent();
}
