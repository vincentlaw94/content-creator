import puppeteer from "puppeteer";
import type { VideoFormat } from "../../shared/types.js";
import { generateJSON } from "../../shared/llm.js";

export async function analyzeVideoFormats(niche: string[]): Promise<VideoFormat[]> {
  console.log("[MarketResearch] Analyzing trending video formats...");

  // Combine scraped and curated formats
  const scrapedFormats = await scrapeFormatTrends(niche);
  const curatedFormats = getCuratedFormats(niche);

  // Merge and deduplicate
  const allFormats = [...scrapedFormats, ...curatedFormats];
  return deduplicateFormats(allFormats);
}

async function scrapeFormatTrends(niche: string[]): Promise<VideoFormat[]> {
  const formats: VideoFormat[] = [];

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Analyze top videos in each niche to identify format patterns
    for (const tag of niche) {
      try {
        const url = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        await page.waitForSelector('[data-e2e="challenge-item"]', { timeout: 10000 }).catch(() => {});

        // Get video metadata for format analysis
        const videoData = await page.evaluate(() => {
          const videos: Array<{ duration: string; description: string }> = [];

          const items = document.querySelectorAll('[data-e2e="challenge-item"]');
          items.forEach((item, index) => {
            if (index >= 10) return;

            const durationEl = item.querySelector('[data-e2e="video-duration"]');
            const descEl = item.querySelector('[data-e2e="video-desc"]');

            videos.push({
              duration: durationEl?.textContent || "0:30",
              description: descEl?.textContent || "",
            });
          });

          return videos;
        });

        // Analyze descriptions to identify format patterns
        const formatPatterns = analyzeFormatPatterns(videoData);
        formats.push(...formatPatterns);
      } catch (error) {
        console.error(`[MarketResearch] Failed to analyze formats for ${tag}:`, error);
      }
    }

    await browser.close();
  } catch (error) {
    console.error("[MarketResearch] Browser error:", error);
  }

  return formats;
}

function analyzeFormatPatterns(
  videos: Array<{ duration: string; description: string }>
): VideoFormat[] {
  const formats: VideoFormat[] = [];
  const formatCounts: Record<string, { count: number; durations: number[] }> = {};

  for (const video of videos) {
    const duration = parseDuration(video.duration);
    const desc = video.description.toLowerCase();

    // Identify format from description patterns
    let formatName = "standard";

    if (desc.includes("pov") || desc.includes("point of view")) {
      formatName = "POV";
    } else if (desc.includes("day in") || desc.includes("daily")) {
      formatName = "Day in the Life";
    } else if (desc.includes("tutorial") || desc.includes("how to")) {
      formatName = "Tutorial";
    } else if (desc.includes("before") && desc.includes("after")) {
      formatName = "Before/After";
    } else if (desc.includes("get ready") || desc.includes("grwm")) {
      formatName = "GRWM";
    } else if (desc.includes("vlog")) {
      formatName = "Vlog";
    } else if (desc.includes("reaction")) {
      formatName = "Reaction";
    } else if (desc.includes("storytime")) {
      formatName = "Storytime";
    }

    if (!formatCounts[formatName]) {
      formatCounts[formatName] = { count: 0, durations: [] };
    }
    formatCounts[formatName].count++;
    formatCounts[formatName].durations.push(duration);
  }

  // Convert to VideoFormat
  for (const [name, data] of Object.entries(formatCounts)) {
    if (data.count >= 2) {
      const avgDuration =
        data.durations.reduce((a, b) => a + b, 0) / data.durations.length;

      formats.push({
        name,
        description: getFormatDescription(name),
        avgDuration: Math.round(avgDuration),
        examples: [],
      });
    }
  }

  return formats;
}

function parseDuration(durationStr: string): number {
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 30; // Default
}

function getFormatDescription(formatName: string): string {
  const descriptions: Record<string, string> = {
    POV: "First-person perspective video that puts viewers in your shoes",
    "Day in the Life": "Montage of activities throughout a day showing your lifestyle",
    Tutorial: "Step-by-step guide teaching viewers how to do something",
    "Before/After": "Transformation showing the change from start to finish",
    GRWM: "Get Ready With Me - preparation routine for an activity",
    Vlog: "Personal documentary-style content of your experiences",
    Reaction: "Your response to something interesting or surprising",
    Storytime: "Narrative telling of an interesting experience",
    standard: "General content format without specific structure",
  };

  return descriptions[formatName] || "Trending video format";
}

function getCuratedFormats(niche: string[]): VideoFormat[] {
  const formats: VideoFormat[] = [];

  // Universal trending formats
  formats.push(
    {
      name: "POV Adventure",
      description: "Immersive first-person view of your activity",
      avgDuration: 30,
      examples: [],
    },
    {
      name: "Hook & Reveal",
      description: "Start with intriguing moment, then show full context",
      avgDuration: 45,
      examples: [],
    },
    {
      name: "Quick Tips",
      description: "3-5 rapid tips or facts with quick cuts",
      avgDuration: 20,
      examples: [],
    },
    {
      name: "Aesthetic Montage",
      description: "Visually pleasing clips with trending music",
      avgDuration: 15,
      examples: [],
    }
  );

  // Niche-specific formats
  for (const n of niche) {
    const lowerNiche = n.toLowerCase();

    if (lowerNiche === "cycling") {
      formats.push(
        {
          name: "Ride Along",
          description: "Join me on my ride - POV cycling content",
          avgDuration: 45,
          examples: [],
        },
        {
          name: "Route Review",
          description: "Showcase and review a cycling route",
          avgDuration: 60,
          examples: [],
        }
      );
    }

    if (lowerNiche === "bouldering") {
      formats.push(
        {
          name: "Send Session",
          description: "Attempting and completing a boulder problem",
          avgDuration: 30,
          examples: [],
        },
        {
          name: "Beta Breakdown",
          description: "Explaining the technique for a climb",
          avgDuration: 45,
          examples: [],
        }
      );
    }

    if (lowerNiche === "travel") {
      formats.push(
        {
          name: "Hidden Gem",
          description: "Revealing lesser-known spots and experiences",
          avgDuration: 45,
          examples: [],
        },
        {
          name: "Food Tour",
          description: "Exploring local cuisine and restaurants",
          avgDuration: 60,
          examples: [],
        }
      );
    }
  }

  return formats;
}

function deduplicateFormats(formats: VideoFormat[]): VideoFormat[] {
  const formatMap = new Map<string, VideoFormat>();

  for (const format of formats) {
    const key = format.name.toLowerCase();
    const existing = formatMap.get(key);

    if (!existing) {
      formatMap.set(key, format);
    } else {
      // Keep the one with more examples or longer description
      if (
        (format.examples?.length || 0) > (existing.examples?.length || 0) ||
        format.description.length > existing.description.length
      ) {
        formatMap.set(key, format);
      }
    }
  }

  return Array.from(formatMap.values());
}

export async function suggestFormatForContent(
  contentDescription: string,
  availableFormats: VideoFormat[]
): Promise<VideoFormat> {
  const prompt = `Given this content description and available video formats, select the best format.

CONTENT: ${contentDescription}

AVAILABLE FORMATS:
${availableFormats.map((f) => `- ${f.name}: ${f.description} (avg ${f.avgDuration}s)`).join("\n")}

Respond with JSON:
{
  "selectedFormat": "format name",
  "reason": "why this format works best"
}`;

  try {
    const response = await generateJSON<{ selectedFormat: string; reason: string }>(prompt);
    const selected = availableFormats.find(
      (f) => f.name.toLowerCase() === response.selectedFormat.toLowerCase()
    );
    return selected || availableFormats[0];
  } catch {
    return availableFormats[0];
  }
}
