#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import fs from "fs";
import { createPipeline } from "./orchestrator/pipeline.js";
import { startScheduler, stopScheduler, getScheduler } from "./orchestrator/scheduler.js";
import {
  getAllProjects,
  getProjectById,
  getProjectsReadyForReview,
  approveProject,
  rejectProject,
  getProjectStats,
} from "./orchestrator/state.js";
import { createMarketResearchAgent } from "./agents/market-research/index.js";
import { getAnalyticsHistory, getPostResults } from "./shared/db.js";

const program = new Command();

program
  .name("content-creator")
  .description("Automated content creation system for lifestyle vlogs")
  .version("1.0.0");

// ==================== Run Command ====================
program
  .command("run")
  .description("Run the full content creation pipeline")
  .requiredOption("-f, --footage <paths...>", "Path(s) to raw footage files")
  .requiredOption("-c, --context <text>", "Context description of the footage")
  .option("-n, --niche <niches...>", "Content niches", ["lifestyle"])
  .option("-d, --duration <seconds>", "Target video duration", "30")
  .option("-p, --platforms <platforms...>", "Target platforms", ["tiktok", "youtube"])
  .option("--skip-research", "Skip market research phase")
  .option("--auto-approve", "Automatically approve and post")
  .action(async (options) => {
    try {
      // Validate footage files exist
      for (const footagePath of options.footage) {
        const absolutePath = path.resolve(footagePath);
        if (!fs.existsSync(absolutePath)) {
          console.error(`Footage file not found: ${absolutePath}`);
          process.exit(1);
        }
      }

      const pipeline = createPipeline();
      const project = await pipeline.runFullPipeline(
        options.footage.map((f: string) => path.resolve(f)),
        options.context,
        options.niche,
        {
          skipResearch: options.skipResearch,
          autoApprove: options.autoApprove,
          platforms: options.platforms,
          targetDuration: parseInt(options.duration, 10),
        }
      );

      console.log("\nPipeline complete!");
      console.log(`Project ID: ${project.id}`);
      console.log(`Status: ${project.status}`);

      if (project.editedVideos) {
        console.log("\nEdited videos:");
        if (project.editedVideos.tiktok) console.log(`  TikTok: ${project.editedVideos.tiktok}`);
        if (project.editedVideos.youtube) console.log(`  YouTube: ${project.editedVideos.youtube}`);
      }

      if (project.status === "review") {
        console.log("\nReady for review. Use 'content-creator review' to approve or reject.");
      }
    } catch (error) {
      console.error("Pipeline failed:", error);
      process.exit(1);
    }
  });

// ==================== Research Command ====================
program
  .command("research")
  .description("Run market research for specified niches")
  .option("-n, --niche <niches...>", "Content niches to research", ["cycling", "bouldering", "travel"])
  .option("--no-cache", "Skip cache and fetch fresh data")
  .action(async (options) => {
    try {
      const agent = createMarketResearchAgent();
      const report = await agent.generateTrendReport(options.niche, {
        useCache: options.cache,
      });

      console.log(agent.formatReportSummary(report));
    } catch (error) {
      console.error("Research failed:", error);
      process.exit(1);
    }
  });

// ==================== Review Command ====================
program
  .command("review")
  .description("Review pending projects")
  .option("--approve <id>", "Approve a project by ID")
  .option("--reject <id>", "Reject a project by ID")
  .option("-r, --reason <text>", "Rejection reason")
  .action(async (options) => {
    try {
      if (options.approve) {
        approveProject(options.approve);
        console.log(`Project ${options.approve} approved for posting.`);
        return;
      }

      if (options.reject) {
        const reason = options.reason || "No reason provided";
        rejectProject(options.reject, reason);
        console.log(`Project ${options.reject} rejected: ${reason}`);
        return;
      }

      // List projects pending review
      const projects = getProjectsReadyForReview();

      if (projects.length === 0) {
        console.log("No projects pending review.");
        return;
      }

      console.log("Projects pending review:\n");
      for (const project of projects) {
        console.log(`ID: ${project.id}`);
        console.log(`  Context: ${project.context}`);
        console.log(`  Created: ${project.createdAt.toLocaleString()}`);
        console.log(`  Niche: ${project.niche.join(", ")}`);
        if (project.editedVideos) {
          console.log("  Videos:");
          if (project.editedVideos.tiktok) console.log(`    TikTok: ${project.editedVideos.tiktok}`);
          if (project.editedVideos.youtube) console.log(`    YouTube: ${project.editedVideos.youtube}`);
        }
        console.log("");
      }

      console.log(`Use 'content-creator review --approve <id>' to approve a project.`);
      console.log(`Use 'content-creator review --reject <id> -r "reason"' to reject.`);
    } catch (error) {
      console.error("Review command failed:", error);
      process.exit(1);
    }
  });

// ==================== Post Command ====================
program
  .command("post")
  .description("Post approved content to social platforms")
  .requiredOption("--project <id>", "Project ID to post")
  .action(async (options) => {
    try {
      const pipeline = createPipeline();
      const project = await pipeline.continueFromReview(options.project);

      console.log(`Project ${project.id} posted successfully!`);

      if (project.postResults && project.postResults.length > 0) {
        console.log("\nPost results:");
        const results = getPostResults(project.id);
        for (const result of results) {
          console.log(`  ${result.platform}: ${result.url}`);
        }
      }
    } catch (error) {
      console.error("Post failed:", error);
      process.exit(1);
    }
  });

// ==================== Engage Command ====================
program
  .command("engage")
  .description("Manage engagement and comments")
  .option("--check-comments", "Check for new comments")
  .option("--reply-pending", "Execute pending replies")
  .option("--report", "Generate engagement report")
  .option("--project <id>", "Specific project to process")
  .action(async (options) => {
    try {
      const pipeline = createPipeline();

      if (options.checkComments || options.replyPending) {
        const result = await pipeline.processEngagement(options.project);
        console.log(`Comments processed: ${result.commentsProcessed}`);
        console.log(`Actions executed: ${result.actionsExecuted}`);
      }

      if (options.report) {
        const agent = await import("./agents/social-media/index.js");
        const socialAgent = agent.createSocialMediaAgent();
        const report = await socialAgent.getEngagementReport();
        console.log(report);
      }

      if (!options.checkComments && !options.replyPending && !options.report) {
        console.log("Usage:");
        console.log("  content-creator engage --check-comments");
        console.log("  content-creator engage --reply-pending");
        console.log("  content-creator engage --report");
      }
    } catch (error) {
      console.error("Engagement failed:", error);
      process.exit(1);
    }
  });

// ==================== Analytics Command ====================
program
  .command("analytics")
  .description("View analytics for posted content")
  .option("--project <id>", "Specific project to analyze")
  .option("-d, --days <number>", "Number of days to analyze", "7")
  .action(async (options) => {
    try {
      if (options.project) {
        const pipeline = createPipeline();
        await pipeline.getAnalytics(options.project);

        const posts = getPostResults(options.project);
        for (const post of posts) {
          const history = getAnalyticsHistory(post.id, parseInt(options.days, 10));
          if (history.length > 0) {
            const latest = history[history.length - 1];
            console.log(`\n${post.platform.toUpperCase()} - ${post.url}`);
            console.log(`  Views: ${latest.views}`);
            console.log(`  Likes: ${latest.likes}`);
            console.log(`  Comments: ${latest.comments}`);
            console.log(`  Engagement Rate: ${latest.engagementRate?.toFixed(2)}%`);
          }
        }
      } else {
        // Show summary for all recent projects
        const stats = getProjectStats();
        console.log("Content Creator Statistics\n");
        console.log(`Total Projects: ${stats.total}`);
        console.log(`Posted (last 7 days): ${stats.recentlyCompleted}`);
        console.log(`Failed: ${stats.failed}`);
        console.log("\nBy Status:");
        for (const [status, count] of Object.entries(stats.byStatus)) {
          if (count > 0) {
            console.log(`  ${status}: ${count}`);
          }
        }
      }
    } catch (error) {
      console.error("Analytics failed:", error);
      process.exit(1);
    }
  });

// ==================== Projects Command ====================
program
  .command("projects")
  .description("List all projects")
  .option("-s, --status <status>", "Filter by status")
  .option("-l, --limit <number>", "Limit results", "20")
  .action(async (options) => {
    try {
      let projects = getAllProjects();

      if (options.status) {
        projects = projects.filter((p) => p.status === options.status);
      }

      projects = projects.slice(0, parseInt(options.limit, 10));

      if (projects.length === 0) {
        console.log("No projects found.");
        return;
      }

      console.log("Projects:\n");
      for (const project of projects) {
        console.log(`[${project.status.toUpperCase()}] ${project.id}`);
        console.log(`  Context: ${project.context.slice(0, 50)}...`);
        console.log(`  Niche: ${project.niche.join(", ")}`);
        console.log(`  Created: ${project.createdAt.toLocaleString()}`);
        console.log("");
      }
    } catch (error) {
      console.error("Projects command failed:", error);
      process.exit(1);
    }
  });

// ==================== Scheduler Command ====================
program
  .command("scheduler")
  .description("Manage automated scheduling")
  .option("--start", "Start the scheduler")
  .option("--stop", "Stop the scheduler")
  .option("--status", "Show scheduler status")
  .option("-n, --niche <niches...>", "Niches for scheduled research", ["cycling", "bouldering", "travel"])
  .action(async (options) => {
    try {
      if (options.start) {
        const scheduler = startScheduler(options.niche);
        console.log("Scheduler started.");
        console.log("Press Ctrl+C to stop.");

        // Keep process running
        process.on("SIGINT", () => {
          stopScheduler();
          process.exit(0);
        });

        // Keep alive
        await new Promise(() => {});
      }

      if (options.stop) {
        stopScheduler();
        console.log("Scheduler stopped.");
      }

      if (options.status) {
        const scheduler = getScheduler();
        const status = scheduler.getStatus();
        console.log("Scheduler Status:");
        console.log(`  Running: ${status.isRunning}`);
        console.log(`  Active Jobs: ${status.jobCount}`);
        console.log("\nSchedule:");
        console.log(`  Research: ${status.config.researchCron}`);
        console.log(`  Engagement: ${status.config.engagementCron}`);
        console.log(`  Analytics: ${status.config.analyticsCron}`);
        console.log(`  Auto-Post: ${status.config.autoPostCron}`);
      }

      if (!options.start && !options.stop && !options.status) {
        console.log("Usage:");
        console.log("  content-creator scheduler --start");
        console.log("  content-creator scheduler --stop");
        console.log("  content-creator scheduler --status");
      }
    } catch (error) {
      console.error("Scheduler command failed:", error);
      process.exit(1);
    }
  });

// ==================== Dashboard Command ====================
program
  .command("dashboard")
  .description("Start the web dashboard")
  .option("-p, --port <number>", "Port to run dashboard on", "3000")
  .action(async (options) => {
    console.log(`Starting dashboard on port ${options.port}...`);
    console.log("Dashboard implementation coming soon.");
    console.log(`Open http://localhost:${options.port} in your browser.`);

    // Import and start the dashboard server
    // const { startDashboard } = await import("./review/server.js");
    // await startDashboard(parseInt(options.port, 10));
  });

program.parse();
