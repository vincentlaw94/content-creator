import puppeteer from "puppeteer";
import type { TrendingSound } from "../../shared/types.js";

export async function scrapeTrendingSounds(niche: string[]): Promise<TrendingSound[]> {
  console.log("[MarketResearch] Discovering trending sounds...");

  const sounds: TrendingSound[] = [];

  // Scrape TikTok trending sounds
  const tiktokSounds = await scrapeTikTokSounds(niche);
  sounds.push(...tiktokSounds);

  // Add curated sounds based on niche
  const curatedSounds = getCuratedSounds(niche);
  sounds.push(...curatedSounds);

  // Deduplicate and sort by usage
  return deduplicateSounds(sounds).sort((a, b) => b.usageCount - a.usageCount);
}

async function scrapeTikTokSounds(niche: string[]): Promise<TrendingSound[]> {
  const sounds: TrendingSound[] = [];

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Try to scrape trending sounds page
    try {
      await page.goto("https://www.tiktok.com/music", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for music cards to load
      await page.waitForSelector('[data-e2e="music-card"]', { timeout: 10000 }).catch(() => {});

      const scrapedSounds = await page.evaluate(() => {
        const results: Array<{
          name: string;
          artist: string;
          usageCount: string;
        }> = [];

        const musicCards = document.querySelectorAll('[data-e2e="music-card"]');
        musicCards.forEach((card) => {
          const nameEl = card.querySelector('[data-e2e="music-title"]');
          const artistEl = card.querySelector('[data-e2e="music-author"]');
          const usageEl = card.querySelector('[data-e2e="music-video-count"]');

          if (nameEl) {
            results.push({
              name: nameEl.textContent?.trim() || "Unknown",
              artist: artistEl?.textContent?.trim() || "Unknown Artist",
              usageCount: usageEl?.textContent || "0",
            });
          }
        });

        return results;
      });

      for (const sound of scrapedSounds) {
        sounds.push({
          name: sound.name,
          artist: sound.artist,
          usageCount: parseUsageCount(sound.usageCount),
          mood: inferMood(sound.name),
        });
      }
    } catch (error) {
      console.error("[MarketResearch] Failed to scrape TikTok sounds:", error);
    }

    await browser.close();
  } catch (error) {
    console.error("[MarketResearch] Browser error:", error);
  }

  return sounds;
}

function parseUsageCount(countStr: string): number {
  const str = countStr.toLowerCase().replace(/,/g, "");

  if (str.includes("m")) {
    return Math.round(parseFloat(str) * 1_000_000);
  }
  if (str.includes("k")) {
    return Math.round(parseFloat(str) * 1_000);
  }

  const num = parseInt(str.replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
}

function inferMood(soundName: string): string {
  const name = soundName.toLowerCase();

  const moodKeywords: Record<string, string[]> = {
    energetic: ["hype", "energy", "party", "dance", "pump", "fire", "lit"],
    chill: ["chill", "lofi", "relax", "calm", "peaceful", "ambient", "slow"],
    epic: ["epic", "cinematic", "dramatic", "powerful", "motivational", "inspiring"],
    happy: ["happy", "joy", "fun", "positive", "upbeat", "feel good"],
    sad: ["sad", "emotional", "melancholy", "heartbreak"],
    trending: ["viral", "trending", "original sound"],
  };

  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    if (keywords.some((k) => name.includes(k))) {
      return mood;
    }
  }

  return "trending";
}

function getCuratedSounds(niche: string[]): TrendingSound[] {
  // Curated sounds that work well for specific niches
  const nicheSounds: Record<string, TrendingSound[]> = {
    cycling: [
      {
        name: "Bike Life",
        artist: "Various",
        usageCount: 500000,
        mood: "energetic",
      },
      {
        name: "Road Trip Vibes",
        artist: "Chill Beats",
        usageCount: 300000,
        mood: "chill",
      },
    ],
    bouldering: [
      {
        name: "Climb Time",
        artist: "Rock Mix",
        usageCount: 200000,
        mood: "energetic",
      },
      {
        name: "Focus Mode",
        artist: "Concentration",
        usageCount: 400000,
        mood: "epic",
      },
    ],
    travel: [
      {
        name: "Wanderlust",
        artist: "Travel Beats",
        usageCount: 800000,
        mood: "inspiring",
      },
      {
        name: "Adventure Awaits",
        artist: "Journey",
        usageCount: 600000,
        mood: "epic",
      },
    ],
  };

  const sounds: TrendingSound[] = [];

  for (const n of niche) {
    const nSounds = nicheSounds[n.toLowerCase()];
    if (nSounds) {
      sounds.push(...nSounds);
    }
  }

  // Add universally trending sounds
  sounds.push(
    {
      name: "original sound - trending",
      usageCount: 1000000,
      mood: "trending",
    },
    {
      name: "Aesthetic Vibes",
      artist: "Lo-Fi Producer",
      usageCount: 700000,
      mood: "chill",
    },
    {
      name: "POV soundtrack",
      usageCount: 500000,
      mood: "cinematic",
    }
  );

  return sounds;
}

function deduplicateSounds(sounds: TrendingSound[]): TrendingSound[] {
  const soundMap = new Map<string, TrendingSound>();

  for (const sound of sounds) {
    const key = sound.name.toLowerCase();
    const existing = soundMap.get(key);

    if (!existing || sound.usageCount > existing.usageCount) {
      soundMap.set(key, sound);
    }
  }

  return Array.from(soundMap.values());
}

export async function downloadSound(sound: TrendingSound, outputPath: string): Promise<string | null> {
  // In production, this would download the actual audio file
  // For now, we just return the path where it would be saved
  console.log(`[MarketResearch] Would download sound "${sound.name}" to ${outputPath}`);

  // Placeholder - actual implementation would:
  // 1. Use TikTok API or scraping to get audio URL
  // 2. Download the audio file
  // 3. Convert to appropriate format

  return null;
}

export function matchSoundToMood(
  sounds: TrendingSound[],
  targetMood: string
): TrendingSound | undefined {
  // Direct mood match
  const directMatch = sounds.find(
    (s) => s.mood.toLowerCase() === targetMood.toLowerCase()
  );
  if (directMatch) return directMatch;

  // Fuzzy mood matching
  const moodSimilarities: Record<string, string[]> = {
    energetic: ["hype", "party", "upbeat", "dynamic"],
    chill: ["relaxed", "calm", "peaceful", "ambient"],
    epic: ["cinematic", "dramatic", "inspiring", "motivational"],
    happy: ["positive", "joyful", "fun", "upbeat"],
  };

  const similarMoods = moodSimilarities[targetMood.toLowerCase()] || [];
  for (const similarMood of similarMoods) {
    const match = sounds.find((s) =>
      s.mood.toLowerCase().includes(similarMood)
    );
    if (match) return match;
  }

  // Return most popular as fallback
  return sounds.sort((a, b) => b.usageCount - a.usageCount)[0];
}
