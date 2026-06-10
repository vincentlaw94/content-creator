import type { Project, TrendReport, StoryPlan, PostResult } from "../shared/types.js";
import { createMarketResearchAgent } from "../agents/market-research/index.js";
import { createStoryGenerationAgent } from "../agents/story-generation/index.js";
import { createVideoEditingAgent } from "../agents/video-editing/index.js";
import { createSocialMediaAgent } from "../agents/social-media/index.js";
import { updateProject, getTrendReport, getStoryPlan } from "../shared/db.js";
import {
  createNewProject,
  getProjectById,
  updateProjectStatus,
  approveProject,
} from "./state.js";

export interface PipelineOptions {
  skipResearch?: boolean;
  autoApprove?: boolean;
  platforms?: ("tiktok" | "youtube")[];
  targetDuration?: number;
}

export class ContentPipeline {
  private marketResearch = createMarketResearchAgent();
  private storyGeneration = createStoryGenerationAgent();
  private videoEditing = createVideoEditingAgent();
  private socialMedia = createSocialMediaAgent();

  async runFullPipeline(
    footage: string[],
    context: string,
    niche: string[],
    options: PipelineOptions = {}
  ): Promise<Project> {
    console.log("[Pipeline] Starting full content creation pipeline");

    // Step 1: Create project
    const project = await createNewProject({ footage, context, niche });

    try {
      // Step 2: Market Research
      let trendReport: TrendReport | undefined;
      if (!options.skipResearch) {
        console.log("[Pipeline] Running market research...");
        await updateProjectStatus(project.id, "researching");
        trendReport = await this.marketResearch.generateTrendReport(niche);
        await updateProject(project.id, { trendReportId: trendReport.id });
      }

      // Step 3: Analyze footage
      console.log("[Pipeline] Analyzing footage...");
      const analysis = await this.videoEditing.analyzeFootage(project, footage[0]);

      // Step 4: Generate story
      console.log("[Pipeline] Generating story...");
      const storyPlan = await this.storyGeneration.generateStory(
        project,
        analysis,
        trendReport,
        {
          targetDuration: options.targetDuration || 30,
          platform: options.platforms?.[0] || "tiktok",
        }
      );

      // Step 5: Edit video
      console.log("[Pipeline] Editing video...");
      const renderResult = await this.videoEditing.processProject(project, storyPlan);

      // Step 6: Update project with results
      await updateProject(project.id, {
        status: "review",
        editedVideos: renderResult,
      });

      // Step 7: Auto-approve if enabled
      if (options.autoApprove) {
        console.log("[Pipeline] Auto-approving project...");
        await approveProject(project.id);

        // Step 8: Upload to platforms
        console.log("[Pipeline] Uploading to platforms...");
        const updatedProject = await getProjectById(project.id);
        await this.socialMedia.uploadVideo(
          updatedProject!,
          storyPlan,
          renderResult as { youtube?: string; tiktok?: string }
        );
      }

      console.log(`[Pipeline] Pipeline complete. Project: ${project.id}`);
      return (await getProjectById(project.id))!;

    } catch (error) {
      console.error("[Pipeline] Pipeline failed:", error);
      await updateProjectStatus(
        project.id,
        "failed",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  async runQuickEdit(
    footage: string[],
    context: string,
    niche: string[],
    options: PipelineOptions = {}
  ): Promise<Project> {
    // Skip research, use cached or defaults
    return this.runFullPipeline(footage, context, niche, {
      ...options,
      skipResearch: true,
    });
  }

  async continueFromReview(projectId: string): Promise<Project> {
    console.log(`[Pipeline] Continuing project from review: ${projectId}`);

    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.status !== "ready") {
      throw new Error(`Project must be approved first. Current status: ${project.status}`);
    }

    const storyPlan = project.storyPlanId ? await getStoryPlan(project.storyPlanId) : null;
    if (!storyPlan) {
      throw new Error("Story plan not found");
    }

    if (!project.editedVideos) {
      throw new Error("No edited videos found");
    }

    // Upload to platforms
    await this.socialMedia.uploadVideo(
      project,
      storyPlan,
      project.editedVideos as { youtube?: string; tiktok?: string }
    );

    return (await getProjectById(projectId))!;
  }

  async reprocessProject(projectId: string, options: PipelineOptions = {}): Promise<Project> {
    console.log(`[Pipeline] Reprocessing project: ${projectId}`);

    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Reset status
    await updateProjectStatus(project.id, "created");

    // Run pipeline again with existing footage
    return this.runFullPipeline(
      project.footage,
      project.context,
      project.niche,
      options
    );
  }

  async generateResearch(niche: string[]): Promise<TrendReport> {
    return this.marketResearch.generateTrendReport(niche, { useCache: false });
  }

  async processEngagement(projectId?: string): Promise<{
    commentsProcessed: number;
    actionsExecuted: number;
  }> {
    console.log("[Pipeline] Processing engagement...");

    if (projectId) {
      const actions = await this.socialMedia.processComments(projectId);
      const executed = await this.socialMedia.executeEngagement();
      return {
        commentsProcessed: actions.length,
        actionsExecuted: executed,
      };
    }

    const result = await this.socialMedia.runDailyEngagement();
    return {
      commentsProcessed: result.commentsProcessed,
      actionsExecuted: result.actionsExecuted,
    };
  }

  async getAnalytics(projectId: string): Promise<void> {
    await this.socialMedia.checkAnalytics(projectId);
  }
}

export function createPipeline(): ContentPipeline {
  return new ContentPipeline();
}
