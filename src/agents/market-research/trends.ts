import puppeteer, { Browser, Page } from "puppeteer";
import type { TrendingTopic } from "../../shared/types.js";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export interface TikTokTrendResult {
  hashtag: string;
  viewCount: number;
  videoCount: number;
  description?: string;
}

export async function scrapeTikTokTrends(niche: string[]): Promise<TrendingTopic[]> {
  console.log("[MarketResearch] Scraping TikTok trends...");

  const browser = await getBrowser();
  const page = await browser.newPage();

  const topics: TrendingTopic[] = [];

  try {
    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Search for niche-specific trending content
    for (const tag of niche) {
      try {
        const url = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        // Wait for content to load
        await page.waitForSelector('[data-e2e="challenge-item"]', { timeout: 10000 }).catch(() => {});

        // Extract trending data
        const trendData = await page.evaluate(() => {
          const items: Array<{ title: string; views: string }> = [];

          // Get challenge/hashtag info
          const challengeHeader = document.querySelector('[data-e2e="challenge-header"]');
          if (challengeHeader) {
            const viewsEl = challengeHeader.querySelector('[data-e2e="challenge-vvcount"]');
            const views = viewsEl?.textContent || "0";
            items.push({
              title: document.title.replace(" | TikTok", ""),
              views,
            });
          }

          // Get related hashtags
          const relatedTags = document.querySelectorAll('[data-e2e="related-tag"]');
          relatedTags.forEach((el) => {
            const text = el.textContent || "";
            if (text.startsWith("#")) {
              items.push({ title: text, views: "0" });
            }
          });

          return items;
        });

        // Convert to TrendingTopic format
        for (const item of trendData) {
          const viewCount = parseViewCount(item.views);
          topics.push({
            topic: item.title.replace("#", ""),
            score: calculateTrendScore(viewCount),
            platforms: ["tiktok"],
            examples: [url],
          });
        }
      } catch (error) {
        console.error(`[MarketResearch] Failed to scrape TikTok tag ${tag}:`, error);
      }
    }
  } finally {
    await page.close();
  }

  // Deduplicate and sort by score
  const uniqueTopics = deduplicateTopics(topics);
  return uniqueTopics.sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function scrapeYouTubeTrends(niche: string[]): Promise<TrendingTopic[]> {
  console.log("[MarketResearch] Scraping YouTube trends...");

  const browser = await getBrowser();
  const page = await browser.newPage();

  const topics: TrendingTopic[] = [];

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (const tag of niche) {
      try {
        // Search YouTube for trending content in niche
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(tag)}&sp=CAMSAhAB`; // Sort by view count
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

        await page.waitForSelector("ytd-video-renderer", { timeout: 10000 }).catch(() => {});

        const searchResults = await page.evaluate(() => {
          const videos: Array<{ title: string; views: string; url: string }> = [];

          const videoElements = document.querySelectorAll("ytd-video-renderer");
          videoElements.forEach((el, index) => {
            if (index >= 10) return;

            const titleEl = el.querySelector("#video-title");
            const viewsEl = el.querySelector("#metadata-line span");
            const linkEl = el.querySelector("a#thumbnail");

            if (titleEl && viewsEl && linkEl) {
              videos.push({
                title: titleEl.textContent?.trim() || "",
                views: viewsEl.textContent || "0",
                url: (linkEl as HTMLAnchorElement).href || "",
              });
            }
          });

          return videos;
        });

        // Extract topics from video titles
        for (const video of searchResults) {
          const viewCount = parseViewCount(video.views);
          const extractedTopics = extractTopicsFromTitle(video.title);

          for (const topic of extractedTopics) {
            topics.push({
              topic,
              score: calculateTrendScore(viewCount),
              platforms: ["youtube"],
              examples: [video.url],
            });
          }
        }
      } catch (error) {
        console.error(`[MarketResearch] Failed to scrape YouTube for ${tag}:`, error);
      }
    }
  } finally {
    await page.close();
  }

  const uniqueTopics = deduplicateTopics(topics);
  return uniqueTopics.sort((a, b) => b.score - a.score).slice(0, 20);
}

function parseViewCount(viewString: string): number {
  const str = viewString.toLowerCase().replace(/,/g, "");

  if (str.includes("b")) {
    return parseFloat(str) * 1_000_000_000;
  }
  if (str.includes("m")) {
    return parseFloat(str) * 1_000_000;
  }
  if (str.includes("k")) {
    return parseFloat(str) * 1_000;
  }

  const num = parseInt(str.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function calculateTrendScore(viewCount: number): number {
  // Logarithmic scale: 1M views = ~60 score, 10M = ~70, 100M = ~80
  if (viewCount <= 0) return 10;

  const log = Math.log10(viewCount);
  const score = Math.min(100, Math.max(10, log * 10));
  return Math.round(score);
}

function extractTopicsFromTitle(title: string): string[] {
  const topics: string[] = [];

  // Extract hashtags
  const hashtagMatches = title.match(/#\w+/g);
  if (hashtagMatches) {
    topics.push(...hashtagMatches.map((h) => h.slice(1)));
  }

  // Extract key phrases (simplified NLP)
  const keywords = title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !["this", "that", "with", "from", "have", "what", "when", "where", "which"].includes(w));

  // Take top keywords as topics
  topics.push(...keywords.slice(0, 3));

  return [...new Set(topics)];
}

function deduplicateTopics(topics: TrendingTopic[]): TrendingTopic[] {
  const topicMap = new Map<string, TrendingTopic>();

  for (const topic of topics) {
    const key = topic.topic.toLowerCase();
    const existing = topicMap.get(key);

    if (!existing) {
      topicMap.set(key, topic);
    } else {
      // Merge platforms and examples, keep highest score
      topicMap.set(key, {
        topic: topic.topic,
        score: Math.max(existing.score, topic.score),
        platforms: [...new Set([...existing.platforms, ...topic.platforms])],
        examples: [...new Set([...existing.examples, ...topic.examples])].slice(0, 5),
      });
    }
  }

  return Array.from(topicMap.values());
}

// Fallback data for when scraping fails or for testing
export function getDefaultTrends(niche: string[]): TrendingTopic[] {
  const defaultTopics: Record<string, TrendingTopic[]> = {
    cycling: [
      { topic: "bike commute", score: 75, platforms: ["tiktok", "youtube"], examples: [] },
      { topic: "gravel cycling", score: 70, platforms: ["youtube"], examples: [] },
      { topic: "urban cycling", score: 65, platforms: ["tiktok"], examples: [] },
      { topic: "cycling tips", score: 60, platforms: ["tiktok", "youtube"], examples: [] },
    ],
    bouldering: [
      { topic: "climbing gym", score: 72, platforms: ["tiktok", "youtube"], examples: [] },
      { topic: "boulder problem", score: 68, platforms: ["tiktok"], examples: [] },
      { topic: "climbing fails", score: 65, platforms: ["tiktok"], examples: [] },
      { topic: "send it", score: 60, platforms: ["tiktok"], examples: [] },
    ],
    travel: [
      { topic: "hidden gems", score: 80, platforms: ["tiktok", "youtube"], examples: [] },
      { topic: "local food", score: 75, platforms: ["tiktok"], examples: [] },
      { topic: "solo travel", score: 70, platforms: ["youtube"], examples: [] },
      { topic: "travel tips", score: 65, platforms: ["tiktok", "youtube"], examples: [] },
    ],
  };

  const topics: TrendingTopic[] = [];
  for (const n of niche) {
    const nicheTopics = defaultTopics[n.toLowerCase()];
    if (nicheTopics) {
      topics.push(...nicheTopics);
    }
  }

  // Add generic trending topics
  topics.push(
    { topic: "pov", score: 85, platforms: ["tiktok"], examples: [] },
    { topic: "day in my life", score: 80, platforms: ["tiktok", "youtube"], examples: [] },
    { topic: "aesthetic", score: 75, platforms: ["tiktok"], examples: [] }
  );

  return deduplicateTopics(topics).sort((a, b) => b.score - a.score);
}
