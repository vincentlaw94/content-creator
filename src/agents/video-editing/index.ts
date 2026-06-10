import { v4 as uuid } from "uuid";
import path from "path";
import fs from "fs";
import type {
  Project,
  Scene,
  Highlight,
  StoryPlan,
  VideoProject,
  FootageAnalysis,
  FootageMetadata,
} from "../../shared/types.js";
import { probeVideo, extractAudio } from "./analysis/ffprobe.js";
import { detectScenes, cleanupKeyframes } from "./analysis/scene-detector.js";
import { scoreHighlights, selectHighlightsForDuration, reorderForNarrative } from "./scoring/highlight-scorer.js";
import { composeTimeline, calculateTotalDuration, trimTimelineToTarget } from "./timeline/composer.js";
import { renderProject, RenderResult } from "./export/renderer.js";
import { transcribeAudio } from "../../shared/llm.js";
import { saveFootageAnalysis, getFootageAnalysis, updateProject } from "../../shared/db.js";

export interface VideoEditingAgentOptions {
  tempDir?: string;
  outputDir?: string;
}

export class VideoEditingAgent {
  private tempDir: string;
  private outputDir: string;

  constructor(options: VideoEditingAgentOptions = {}) {
    this.tempDir = options.tempDir || path.join(process.cwd(), "public", "temp");
    this.outputDir = options.outputDir || path.join(process.cwd(), "public", "output");
  }

  async analyzeFootage(
    project: Project,
    footagePath: string
  ): Promise<FootageAnalysis> {
    console.log(`[VideoEditingAgent] Analyzing footage: ${footagePath}`);

    // Check for cached analysis
    const cached = await getFootageAnalysis(project.id);
    if (cached) {
      console.log("[VideoEditingAgent] Using cached footage analysis");
      return cached;
    }

    // Ensure temp directory exists
    await fs.promises.mkdir(this.tempDir, { recursive: true });

    // Step 1: Probe video metadata
    console.log("[VideoEditingAgent] Probing video metadata...");
    const metadata = await probeVideo(footagePath);

    // Step 2: Extract audio for transcription
    let transcript: FootageAnalysis["transcript"] = [];
    if (metadata.hasAudio) {
      console.log("[VideoEditingAgent] Extracting and transcribing audio...");
      try {
        const audioPath = path.join(this.tempDir, `${project.id}_audio.wav`);
        await extractAudio(footagePath, audioPath);
        const transcription = await transcribeAudio(audioPath);
        transcript = transcription.segments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }));
        await fs.promises.unlink(audioPath).catch(() => {});
      } catch (error) {
        console.error("[VideoEditingAgent] Audio transcription failed:", error);
      }
    }

    // Step 3: Detect scenes and analyze keyframes
    console.log("[VideoEditingAgent] Detecting scenes...");
    const keyframeDir = path.join(this.tempDir, project.id);
    const { scenes, keyframes } = await detectScenes(
      footagePath,
      keyframeDir,
      metadata.duration
    );

    // Step 4: Generate summary
    const summary = this.generateSummary(scenes, transcript, metadata);

    // Step 5: Suggest topics based on content
    const suggestedTopics = this.suggestTopics(scenes, transcript);

    const analysis: FootageAnalysis = {
      id: uuid(),
      projectId: project.id,
      metadata,
      scenes,
      keyframes,
      transcript,
      summary,
      suggestedTopics,
      createdAt: new Date(),
    };

    // Save analysis to database
    await saveFootageAnalysis(analysis);

    // Cleanup keyframes
    await cleanupKeyframes(keyframeDir);

    console.log(`[VideoEditingAgent] Analysis complete. Found ${scenes.length} scenes.`);
    return analysis;
  }

  async editVideo(
    project: Project,
    analysis: FootageAnalysis,
    storyPlan: StoryPlan
  ): Promise<VideoProject> {
    console.log(`[VideoEditingAgent] Creating edit for project: ${project.id}`);

    // Score highlights based on scene characteristics and story plan
    const highlights = scoreHighlights(analysis.scenes, {
      storyPlan,
      minClipDuration: 1,
      maxClipDuration: 15,
    });

    console.log(`[VideoEditingAgent] Scored ${highlights.length} potential highlights`);

    // Select highlights to fit target duration
    const targetDuration = storyPlan.estimatedDuration;
    const selectedHighlights = selectHighlightsForDuration(
      highlights,
      analysis.scenes,
      targetDuration
    );

    console.log(`[VideoEditingAgent] Selected ${selectedHighlights.length} clips for ${targetDuration}s video`);

    // Reorder for narrative flow
    const orderedHighlights = reorderForNarrative(
      selectedHighlights,
      analysis.scenes,
      true
    );

    // Compose timeline
    const videoProject = composeTimeline(
      analysis.metadata.path,
      analysis.scenes,
      orderedHighlights,
      {
        platform: "tiktok", // Default to TikTok, will render others too
        storyPlan,
        sound: storyPlan.suggestedSound,
        transitionStyle: "dynamic",
      }
    );

    // Add YouTube format
    if (!videoProject.outputFormats.includes("youtube")) {
      videoProject.outputFormats.push("youtube");
    }

    // Ensure timeline fits target duration
    const currentDuration = calculateTotalDuration(videoProject.timeline);
    if (currentDuration > targetDuration * 1.2) {
      videoProject.timeline = trimTimelineToTarget(
        videoProject.timeline,
        targetDuration
      );
    }

    console.log(`[VideoEditingAgent] Video project composed with ${videoProject.timeline.length} clips`);
    return videoProject;
  }

  async renderVideo(
    project: Project,
    videoProject: VideoProject
  ): Promise<RenderResult> {
    console.log(`[VideoEditingAgent] Rendering video project: ${videoProject.id}`);

    const projectOutputDir = path.join(this.outputDir, project.id);
    await fs.promises.mkdir(projectOutputDir, { recursive: true });

    // Update project status
    await updateProject(project.id, { status: "editing" });

    const result = await renderProject(videoProject, {
      outputDir: projectOutputDir,
      quality: "production",
    });

    // Update project with rendered video paths
    await updateProject(project.id, {
      status: "review",
      editedVideos: {
        youtube: result.youtube,
        tiktok: result.tiktok,
        instagram: result.instagram,
      },
      thumbnails: result.thumbnails,
    });

    console.log("[VideoEditingAgent] Render complete");
    return result;
  }

  async processProject(project: Project, storyPlan: StoryPlan): Promise<RenderResult> {
    // Full pipeline: analyze -> edit -> render
    const footagePath = project.footage[0]; // For now, use first footage file

    // Analyze footage
    const analysis = await this.analyzeFootage(project, footagePath);

    // Create edit
    const videoProject = await this.editVideo(project, analysis, storyPlan);

    // Render
    const result = await this.renderVideo(project, videoProject);

    return result;
  }

  private generateSummary(
    scenes: Scene[],
    transcript: FootageAnalysis["transcript"],
    metadata: FootageMetadata
  ): string {
    const sceneTypes = scenes.map((s) => s.type);
    const actionCount = sceneTypes.filter((t) => t === "action").length;
    const outdoorCount = sceneTypes.filter((t) => t === "outdoor").length;

    const parts: string[] = [];

    parts.push(`${Math.round(metadata.duration)}s video at ${metadata.fps}fps`);

    if (actionCount > 0) {
      parts.push(`${actionCount} action sequences`);
    }

    if (outdoorCount > 0) {
      parts.push(`${outdoorCount} outdoor scenes`);
    }

    if (transcript.length > 0) {
      const wordCount = transcript.reduce(
        (sum, seg) => sum + seg.text.split(/\s+/).length,
        0
      );
      parts.push(`${wordCount} words of speech`);
    }

    // Get scene descriptions
    const descriptions = scenes
      .slice(0, 3)
      .map((s) => s.description)
      .join("; ");
    if (descriptions) {
      parts.push(`Content: ${descriptions}`);
    }

    return parts.join(". ");
  }

  private suggestTopics(
    scenes: Scene[],
    transcript: FootageAnalysis["transcript"]
  ): string[] {
    const topics: Set<string> = new Set();

    // Extract from scene descriptions and types
    for (const scene of scenes) {
      if (scene.type === "action") topics.add("action");
      if (scene.type === "outdoor") topics.add("outdoor");
      if (scene.description.toLowerCase().includes("cycl")) topics.add("cycling");
      if (scene.description.toLowerCase().includes("climb")) topics.add("climbing");
      if (scene.description.toLowerCase().includes("boulder")) topics.add("bouldering");
      if (scene.description.toLowerCase().includes("travel")) topics.add("travel");
      if (scene.description.toLowerCase().includes("food") ||
          scene.description.toLowerCase().includes("cafe")) topics.add("food");
    }

    // Extract from transcript
    const fullText = transcript.map((s) => s.text).join(" ").toLowerCase();
    const keywords = ["cycling", "biking", "climbing", "bouldering", "travel", "adventure", "explore"];
    for (const keyword of keywords) {
      if (fullText.includes(keyword)) {
        topics.add(keyword);
      }
    }

    return Array.from(topics);
  }
}

export function createVideoEditingAgent(options?: VideoEditingAgentOptions): VideoEditingAgent {
  return new VideoEditingAgent(options);
}
