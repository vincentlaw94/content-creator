import puppeteer from "puppeteer";
import type { Competitor } from "../../shared/types.js";

export async function trackCompetitors(
  niche: string[],
  existingCompetitors?: string[]
): Promise<Competitor[]> {
  console.log("[MarketResearch] Tracking competitors...");

  const competitors: Competitor[] = [];

  // Discover new competitors if none provided
  if (!existingCompetitors || existingCompetitors.length === 0) {
    const discovered = await discoverCompetitors(niche);
    competitors.push(...discovered);
  } else {
    // Track provided competitors
    for (const handle of existingCompetitors) {
      const competitor = await analyzeCompetitor(handle);
      if (competitor) {
        competitors.push(competitor);
      }
    }
  }

  return competitors.sort((a, b) => b.followers - a.followers);
}

async function discoverCompetitors(niche: string[]): Promise<Competitor[]> {
  const competitors: Competitor[] = [];

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (const tag of niche) {
      try {
        // Search for top creators in the niche
        const url = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        await page.waitForSelector('[data-e2e="challenge-item"]', { timeout: 10000 }).catch(() => {});

        const creators = await page.evaluate(() => {
          const results: Array<{
            handle: string;
            videoUrl: string;
          }> = [];

          const items = document.querySelectorAll('[data-e2e="challenge-item"]');
          items.forEach((item, index) => {
            if (index >= 5) return;

            const authorEl = item.querySelector('[data-e2e="video-author-uniqueid"]');
            const linkEl = item.querySelector("a");

            if (authorEl) {
              results.push({
                handle: authorEl.textContent?.trim() || "",
                videoUrl: linkEl?.href || "",
              });
            }
          });

          return results;
        });

        // Get more details for each creator
        for (const creator of creators) {
          if (!creator.handle) continue;

          const competitor = await analyzeCompetitor(creator.handle, page);
          if (competitor) {
            competitors.push(competitor);
          }
        }
      } catch (error) {
        console.error(`[MarketResearch] Failed to discover competitors for ${tag}:`, error);
      }
    }

    await browser.close();
  } catch (error) {
    console.error("[MarketResearch] Browser error:", error);
  }

  // Deduplicate
  const seen = new Set<string>();
  return competitors.filter((c) => {
    if (seen.has(c.handle.toLowerCase())) return false;
    seen.add(c.handle.toLowerCase());
    return true;
  });
}

async function analyzeCompetitor(
  handle: string,
  existingPage?: puppeteer.Page
): Promise<Competitor | null> {
  let page = existingPage;
  let browser: puppeteer.Browser | null = null;

  try {
    if (!page) {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
    }

    const cleanHandle = handle.replace("@", "");
    const url = `https://www.tiktok.com/@${cleanHandle}`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    await page.waitForSelector('[data-e2e="user-post-item"]', { timeout: 10000 }).catch(() => {});

    const profileData = await page.evaluate(() => {
      const followersEl = document.querySelector('[data-e2e="followers-count"]');
      const likesEl = document.querySelector('[data-e2e="likes-count"]');

      // Get recent video stats
      const videoItems = document.querySelectorAll('[data-e2e="user-post-item"]');
      const recentViews: number[] = [];

      videoItems.forEach((item, index) => {
        if (index >= 5) return;
        const viewsEl = item.querySelector('[data-e2e="video-views"]');
        const viewsText = viewsEl?.textContent || "0";

        let views = 0;
        if (viewsText.includes("M")) {
          views = parseFloat(viewsText) * 1_000_000;
        } else if (viewsText.includes("K")) {
          views = parseFloat(viewsText) * 1_000;
        } else {
          views = parseInt(viewsText.replace(/\D/g, ""), 10) || 0;
        }
        recentViews.push(views);
      });

      return {
        followers: followersEl?.textContent || "0",
        likes: likesEl?.textContent || "0",
        recentViews,
      };
    });

    const followers = parseCount(profileData.followers);
    const avgViews =
      profileData.recentViews.length > 0
        ? profileData.recentViews.reduce((a, b) => a + b, 0) / profileData.recentViews.length
        : 0;

    const performance = analyzePerformance(followers, avgViews);

    return {
      handle: `@${cleanHandle}`,
      platform: "tiktok",
      followers,
      recentPerformance: performance,
      topVideos: [],
    };
  } catch (error) {
    console.error(`[MarketResearch] Failed to analyze competitor ${handle}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function parseCount(countStr: string): number {
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

function analyzePerformance(followers: number, avgViews: number): string {
  if (followers === 0) return "Unknown";

  const viewToFollowerRatio = avgViews / followers;

  if (viewToFollowerRatio > 0.5) {
    return "Excellent - videos reach 50%+ of followers";
  }
  if (viewToFollowerRatio > 0.2) {
    return "Strong - videos reach 20-50% of followers";
  }
  if (viewToFollowerRatio > 0.1) {
    return "Average - videos reach 10-20% of followers";
  }
  if (viewToFollowerRatio > 0.05) {
    return "Below average - videos reach 5-10% of followers";
  }
  return "Low engagement - videos reach <5% of followers";
}

export function getCompetitorInsights(competitors: Competitor[]): {
  avgFollowers: number;
  topPerformers: Competitor[];
  recommendations: string[];
} {
  if (competitors.length === 0) {
    return {
      avgFollowers: 0,
      topPerformers: [],
      recommendations: ["No competitors tracked - add some to get insights"],
    };
  }

  const avgFollowers = Math.round(
    competitors.reduce((sum, c) => sum + c.followers, 0) / competitors.length
  );

  const topPerformers = competitors
    .filter((c) => c.recentPerformance.includes("Excellent") || c.recentPerformance.includes("Strong"))
    .slice(0, 3);

  const recommendations: string[] = [];

  if (avgFollowers > 100000) {
    recommendations.push("Niche has established creators - focus on unique angle");
  } else if (avgFollowers < 10000) {
    recommendations.push("Niche has room for growth - consistent posting can help you stand out");
  }

  if (topPerformers.length > 0) {
    recommendations.push(
      `Study top performers: ${topPerformers.map((c) => c.handle).join(", ")}`
    );
  }

  return {
    avgFollowers,
    topPerformers,
    recommendations,
  };
}

// Curated competitor data for when scraping fails
export function getDefaultCompetitors(niche: string[]): Competitor[] {
  const nicheCompetitors: Record<string, Competitor[]> = {
    cycling: [
      {
        handle: "@cyclinglife",
        platform: "tiktok",
        followers: 150000,
        recentPerformance: "Strong - videos reach 20-50% of followers",
      },
      {
        handle: "@urbancyclist",
        platform: "tiktok",
        followers: 80000,
        recentPerformance: "Average - videos reach 10-20% of followers",
      },
    ],
    bouldering: [
      {
        handle: "@climbhard",
        platform: "tiktok",
        followers: 200000,
        recentPerformance: "Excellent - videos reach 50%+ of followers",
      },
      {
        handle: "@boulderingbeta",
        platform: "tiktok",
        followers: 120000,
        recentPerformance: "Strong - videos reach 20-50% of followers",
      },
    ],
    travel: [
      {
        handle: "@wanderexplore",
        platform: "tiktok",
        followers: 500000,
        recentPerformance: "Strong - videos reach 20-50% of followers",
      },
      {
        handle: "@hiddengems",
        platform: "tiktok",
        followers: 300000,
        recentPerformance: "Excellent - videos reach 50%+ of followers",
      },
    ],
  };

  const competitors: Competitor[] = [];

  for (const n of niche) {
    const nc = nicheCompetitors[n.toLowerCase()];
    if (nc) {
      competitors.push(...nc);
    }
  }

  return competitors;
}
