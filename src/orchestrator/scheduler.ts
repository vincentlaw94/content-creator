import cron from "node-cron";
import { createPipeline } from "./pipeline.js";
import { createMarketResearchAgent } from "../agents/market-research/index.js";
import { createSocialMediaAgent } from "../agents/social-media/index.js";
import { getProjectsReadyToPost, getRecentProjects } from "./state.js";

export interface SchedulerConfig {
  researchCron?: string;      // Cron expression for market research
  engagementCron?: string;    // Cron expression for comment processing
  analyticsCron?: string;     // Cron expression for analytics collection
  autoPostCron?: string;      // Cron expression for posting approved content
  enabled?: boolean;
}

const defaultConfig: SchedulerConfig = {
  researchCron: "0 6 * * *",      // 6 AM daily
  engagementCron: "0 */4 * * *",  // Every 4 hours
  analyticsCron: "0 */6 * * *",   // Every 6 hours
  autoPostCron: "0 10,19 * * *",  // 10 AM and 7 PM daily
  enabled: true,
};

export class Scheduler {
  private config: SchedulerConfig;
  private jobs: cron.ScheduledTask[] = [];
  private isRunning = false;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  start(niche: string[] = ["cycling", "bouldering", "travel"]): void {
    if (this.isRunning) {
      console.log("[Scheduler] Already running");
      return;
    }

    if (!this.config.enabled) {
      console.log("[Scheduler] Scheduler is disabled");
      return;
    }

    console.log("[Scheduler] Starting scheduled tasks...");

    // Market Research Job
    if (this.config.researchCron) {
      const researchJob = cron.schedule(this.config.researchCron, async () => {
        console.log("[Scheduler] Running scheduled market research...");
        try {
          const agent = createMarketResearchAgent();
          const report = await agent.generateTrendReport(niche, { useCache: false });
          console.log(`[Scheduler] Research complete. Found ${report.topics.length} topics.`);
        } catch (error) {
          console.error("[Scheduler] Research job failed:", error);
        }
      });
      this.jobs.push(researchJob);
      console.log(`[Scheduler] Market research scheduled: ${this.config.researchCron}`);
    }

    // Engagement Job
    if (this.config.engagementCron) {
      const engagementJob = cron.schedule(this.config.engagementCron, async () => {
        console.log("[Scheduler] Running scheduled engagement processing...");
        try {
          const pipeline = createPipeline();
          const result = await pipeline.processEngagement();
          console.log(
            `[Scheduler] Engagement complete. Comments: ${result.commentsProcessed}, Actions: ${result.actionsExecuted}`
          );
        } catch (error) {
          console.error("[Scheduler] Engagement job failed:", error);
        }
      });
      this.jobs.push(engagementJob);
      console.log(`[Scheduler] Engagement processing scheduled: ${this.config.engagementCron}`);
    }

    // Analytics Job
    if (this.config.analyticsCron) {
      const analyticsJob = cron.schedule(this.config.analyticsCron, async () => {
        console.log("[Scheduler] Running scheduled analytics collection...");
        try {
          const recentProjects = getRecentProjects(10);
          const postedProjects = recentProjects.filter((p) => p.status === "posted");

          for (const project of postedProjects) {
            const pipeline = createPipeline();
            await pipeline.getAnalytics(project.id);
          }

          console.log(`[Scheduler] Analytics collected for ${postedProjects.length} projects`);
        } catch (error) {
          console.error("[Scheduler] Analytics job failed:", error);
        }
      });
      this.jobs.push(analyticsJob);
      console.log(`[Scheduler] Analytics collection scheduled: ${this.config.analyticsCron}`);
    }

    // Auto-post Job
    if (this.config.autoPostCron) {
      const autoPostJob = cron.schedule(this.config.autoPostCron, async () => {
        console.log("[Scheduler] Running scheduled auto-posting...");
        try {
          const readyProjects = getProjectsReadyToPost();

          if (readyProjects.length === 0) {
            console.log("[Scheduler] No projects ready to post");
            return;
          }

          const pipeline = createPipeline();
          const project = readyProjects[0]; // Post one at a time
          await pipeline.continueFromReview(project.id);

          console.log(`[Scheduler] Posted project: ${project.id}`);
        } catch (error) {
          console.error("[Scheduler] Auto-post job failed:", error);
        }
      });
      this.jobs.push(autoPostJob);
      console.log(`[Scheduler] Auto-posting scheduled: ${this.config.autoPostCron}`);
    }

    this.isRunning = true;
    console.log("[Scheduler] All scheduled tasks started");
  }

  stop(): void {
    console.log("[Scheduler] Stopping scheduled tasks...");

    for (const job of this.jobs) {
      job.stop();
    }

    this.jobs = [];
    this.isRunning = false;

    console.log("[Scheduler] All scheduled tasks stopped");
  }

  getStatus(): {
    isRunning: boolean;
    jobCount: number;
    config: SchedulerConfig;
  } {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      config: this.config,
    };
  }

  runNow(jobType: "research" | "engagement" | "analytics" | "autoPost"): void {
    console.log(`[Scheduler] Manually triggering ${jobType} job...`);

    switch (jobType) {
      case "research":
        this.runResearchNow();
        break;
      case "engagement":
        this.runEngagementNow();
        break;
      case "analytics":
        this.runAnalyticsNow();
        break;
      case "autoPost":
        this.runAutoPostNow();
        break;
    }
  }

  private async runResearchNow(): Promise<void> {
    const agent = createMarketResearchAgent();
    await agent.generateTrendReport(["cycling", "bouldering", "travel"], { useCache: false });
  }

  private async runEngagementNow(): Promise<void> {
    const pipeline = createPipeline();
    await pipeline.processEngagement();
  }

  private async runAnalyticsNow(): Promise<void> {
    const recentProjects = getRecentProjects(10);
    const pipeline = createPipeline();

    for (const project of recentProjects.filter((p) => p.status === "posted")) {
      await pipeline.getAnalytics(project.id);
    }
  }

  private async runAutoPostNow(): Promise<void> {
    const readyProjects = getProjectsReadyToPost();
    if (readyProjects.length > 0) {
      const pipeline = createPipeline();
      await pipeline.continueFromReview(readyProjects[0].id);
    }
  }
}

let schedulerInstance: Scheduler | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): Scheduler {
  if (!schedulerInstance) {
    schedulerInstance = new Scheduler(config);
  }
  return schedulerInstance;
}

export function startScheduler(
  niche?: string[],
  config?: Partial<SchedulerConfig>
): Scheduler {
  const scheduler = getScheduler(config);
  scheduler.start(niche);
  return scheduler;
}

export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
