import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAllProjects,
  getProjectById,
  getProjectsReadyForReview,
  getProjectStats,
  approveProject,
  rejectProject,
} from "../orchestrator/state.js";
import { createPipeline } from "../orchestrator/pipeline.js";
import { createMarketResearchAgent } from "../agents/market-research/index.js";
import {
  getPostResults,
  getAnalyticsHistory,
  getUnrepliedComments,
  getPendingActions,
  updateActionStatus,
  getTrendReport,
  getStoryPlan,
} from "../shared/db.js";
import { getScheduler } from "../orchestrator/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard(port = 3000): void {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "ui")));

  // ==================== API Routes ====================

  // Projects
  app.get("/api/projects", (_req: Request, res: Response) => {
    const projects = getAllProjects();
    res.json(projects);
  });

  app.get("/api/projects/stats", (_req: Request, res: Response) => {
    const stats = getProjectStats();
    res.json(stats);
  });

  app.get("/api/projects/:id", (req: Request, res: Response) => {
    const project = getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Get related data
    const posts = getPostResults(project.id);
    const storyPlan = project.storyPlanId ? getStoryPlan(project.storyPlanId) : null;
    const trendReport = project.trendReportId ? getTrendReport(project.trendReportId) : null;

    res.json({
      ...project,
      posts,
      storyPlan,
      trendReport,
    });
  });

  app.get("/api/projects/review", (_req: Request, res: Response) => {
    const projects = getProjectsReadyForReview();
    res.json(projects);
  });

  app.post("/api/projects/:id/approve", (req: Request, res: Response) => {
    try {
      approveProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/projects/:id/reject", (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      rejectProject(req.params.id, reason || "Rejected via dashboard");
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/projects/:id/post", async (req: Request, res: Response) => {
    try {
      const pipeline = createPipeline();
      const project = await pipeline.continueFromReview(req.params.id);
      res.json(project);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Analytics
  app.get("/api/analytics/:projectId", async (req: Request, res: Response) => {
    try {
      const posts = getPostResults(req.params.projectId);
      const analytics: Record<string, unknown> = {};

      for (const post of posts) {
        analytics[post.platform] = {
          post,
          history: getAnalyticsHistory(post.id, 30),
        };
      }

      res.json(analytics);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Comments & Engagement
  app.get("/api/comments", (req: Request, res: Response) => {
    const platform = req.query.platform as string | undefined;
    const comments = getUnrepliedComments(platform);
    res.json(comments);
  });

  app.get("/api/actions/pending", (_req: Request, res: Response) => {
    const actions = getPendingActions();
    res.json(actions);
  });

  app.post("/api/actions/:id/approve", async (req: Request, res: Response) => {
    try {
      updateActionStatus(req.params.id, "approved");
      // Execute the action
      // This would actually post the reply
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/actions/:id/reject", (req: Request, res: Response) => {
    try {
      updateActionStatus(req.params.id, "rejected");
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Research
  app.get("/api/research/latest", (req: Request, res: Response) => {
    const niches = ((req.query.niche as string) || "cycling,bouldering,travel").split(",");
    const agent = createMarketResearchAgent();

    agent.generateTrendReport(niches, { useCache: true })
      .then((report) => res.json(report))
      .catch((error) => res.status(400).json({ error: (error as Error).message }));
  });

  app.post("/api/research/refresh", (req: Request, res: Response) => {
    const { niches = ["cycling", "bouldering", "travel"] } = req.body;
    const agent = createMarketResearchAgent();

    agent.generateTrendReport(niches, { useCache: false })
      .then((report) => res.json(report))
      .catch((error) => res.status(400).json({ error: (error as Error).message }));
  });

  // Scheduler
  app.get("/api/scheduler/status", (_req: Request, res: Response) => {
    const scheduler = getScheduler();
    res.json(scheduler.getStatus());
  });

  // Serve video files
  app.get("/api/video/:projectId/:type", (req: Request, res: Response) => {
    const project = getProjectById(req.params.projectId);
    if (!project || !project.editedVideos) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    const videoPath = project.editedVideos[req.params.type as keyof typeof project.editedVideos];
    if (!videoPath) {
      res.status(404).json({ error: "Video type not found" });
      return;
    }

    res.sendFile(videoPath);
  });

  // Serve thumbnail files
  app.get("/api/thumbnail/:projectId/:index", (req: Request, res: Response) => {
    const project = getProjectById(req.params.projectId);
    if (!project || !project.thumbnails) {
      res.status(404).json({ error: "Thumbnail not found" });
      return;
    }

    const index = parseInt(req.params.index, 10);
    const thumbnailPath = project.thumbnails[index];
    if (!thumbnailPath) {
      res.status(404).json({ error: "Thumbnail index not found" });
      return;
    }

    res.sendFile(thumbnailPath);
  });

  // Serve the dashboard UI
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "ui", "index.html"));
  });

  app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.DASHBOARD_PORT || "3000", 10);
  startDashboard(port);
}
