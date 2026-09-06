import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { spawn } from "child_process";
import multer from "multer";
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
import { quickAnalyzeFootage } from "../agents/video-editing/analysis/quick-analyze.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function scanVideoFiles(dir: string): Array<{ name: string; path: string; size: number }> {
  const videoExts = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
  const files: Array<{ name: string; path: string; size: number }> = [];
  if (!fs.existsSync(dir)) return files;

  function scan(currentDir: string, relPath: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      const rel = path.join(relPath, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath, rel);
      } else if (videoExts.has(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = fs.statSync(fullPath);
          files.push({ name: rel, path: fullPath, size: stat.size });
        } catch { /* skip unreadable */ }
      }
    }
  }

  scan(dir, "");
  return files;
}

const videoExts = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);

function makeMulterUpload(footageDir: string) {
  fs.mkdirSync(footageDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, footageDir),
    filename: (_req, file, cb) => {
      const ext  = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      let name   = file.originalname;
      if (fs.existsSync(path.join(footageDir, name))) {
        name = `${base}_${Date.now()}${ext}`;
      }
      cb(null, name);
    },
  });
  return multer({
    storage,
    fileFilter: (_req, file, cb) => cb(null, videoExts.has(path.extname(file.originalname).toLowerCase())),
  });
}

export function startDashboard(port = 3000): void {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "ui")));

  // ==================== API Routes ====================

  // Projects
  app.get("/api/projects", async (_req: Request, res: Response) => {
    const projects = await getAllProjects();
    res.json(projects);
  });

  app.get("/api/projects/stats", async (_req: Request, res: Response) => {
    const stats = await getProjectStats();
    res.json(stats);
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    const project = await getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Get related data
    const posts = await getPostResults(project.id);
    const storyPlan = project.storyPlanId ? await getStoryPlan(project.storyPlanId) : null;
    const trendReport = project.trendReportId ? await getTrendReport(project.trendReportId) : null;

    res.json({
      ...project,
      posts,
      storyPlan,
      trendReport,
    });
  });

  app.get("/api/projects/review", async (_req: Request, res: Response) => {
    const projects = await getProjectsReadyForReview();
    res.json(projects);
  });

  app.post("/api/projects/:id/approve", async (req: Request, res: Response) => {
    try {
      await approveProject(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/projects/:id/reject", async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      await rejectProject(req.params.id, reason || "Rejected via dashboard");
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
      const posts = await getPostResults(req.params.projectId);
      const analytics: Record<string, unknown> = {};

      for (const post of posts) {
        analytics[post.platform] = {
          post,
          history: await getAnalyticsHistory(post.id, 30),
        };
      }

      res.json(analytics);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Comments & Engagement
  app.get("/api/comments", async (req: Request, res: Response) => {
    const platform = req.query.platform as string | undefined;
    const comments = await getUnrepliedComments(platform);
    res.json(comments);
  });

  app.get("/api/actions/pending", async (_req: Request, res: Response) => {
    const actions = await getPendingActions();
    res.json(actions);
  });

  app.post("/api/actions/:id/approve", async (req: Request, res: Response) => {
    try {
      await updateActionStatus(req.params.id, "approved");
      // Execute the action
      // This would actually post the reply
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/actions/:id/reject", async (req: Request, res: Response) => {
    try {
      await updateActionStatus(req.params.id, "rejected");
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
  app.get("/api/video/:projectId/:type", async (req: Request, res: Response) => {
    const project = await getProjectById(req.params.projectId);
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
  app.get("/api/thumbnail/:projectId/:index", async (req: Request, res: Response) => {
    const project = await getProjectById(req.params.projectId);
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

  // ==================== Footage Editor Routes ====================

  const projectRoot = path.join(__dirname, "../..");
  const footageDir  = path.join(projectRoot, "public/footage");
  const upload      = makeMulterUpload(footageDir);

  // Validate a file path (used by paste-path UI)
  app.get("/api/footage/validate", (req: Request, res: Response) => {
    const filePath = req.query.path as string;
    if (!filePath) { res.json({ valid: false, error: "path required" }); return; }
    const resolved = path.resolve(filePath);
    if (!videoExts.has(path.extname(resolved).toLowerCase())) {
      res.json({ valid: false, error: "Not a supported video format" }); return;
    }
    if (!fs.existsSync(resolved)) {
      res.json({ valid: false, error: "File not found" }); return;
    }
    const stat = fs.statSync(resolved);
    res.json({ valid: true, path: resolved, name: path.basename(resolved), size: stat.size });
  });

  // Upload footage files (drag-and-drop / file picker)
  app.post("/api/footage/upload", upload.single("file"), (req: Request, res: Response) => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }
    res.json({ name: file.originalname, path: file.path, size: file.size });
  });

  // List all video files in footage/ and output/ directories
  app.get("/api/footage", (_req: Request, res: Response) => {
    res.json({
      footage: scanVideoFiles(footageDir),
      output: scanVideoFiles(path.join(projectRoot, "public/output")),
    });
  });

  // Serve a video file by absolute path.
  // Allows any local file so footage outside the project directory can be previewed.
  app.get("/api/footage/serve", (req: Request, res: Response) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: "path query param required" });
      return;
    }
    const resolved = path.resolve(filePath);
    const videoExts = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
    if (!videoExts.has(path.extname(resolved).toLowerCase())) {
      res.status(400).json({ error: "Not a supported video file" });
      return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.sendFile(resolved);
  });

  // Analyze selected footage (metadata + scene detection + vision keyframe sampling)
  app.post("/api/footage/analyze", async (req: Request, res: Response) => {
    const { paths } = req.body as { paths?: string[] };
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: "paths array is required" });
      return;
    }

    const tempDir = path.join(projectRoot, "public/temp/footage-analyze");
    await fs.promises.mkdir(tempDir, { recursive: true });

    const results = await Promise.all(
      paths.map(async (p) => {
        const resolved = path.resolve(p);
        if (!fs.existsSync(resolved)) {
          return { path: p, error: "File not found" };
        }
        try {
          return await quickAnalyzeFootage(resolved, tempDir);
        } catch (error) {
          return { path: resolved, error: (error as Error).message };
        }
      })
    );

    res.json({ results });
  });

  // Execute edit prompt via Claude Code CLI — streams output as SSE
  app.post("/api/execute-edit", (req: Request, res: Response) => {
    const { prompt } = req.body as { prompt: string };
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ type: "start", message: "Spawning Claude Code...\n" });

    const claude = spawn("claude", ["-p", prompt, "--allowedTools", "Bash"], {
      cwd: projectRoot,
      env: { ...process.env },
    });

    claude.stdout.on("data", (chunk: Buffer) => {
      send({ type: "output", text: chunk.toString() });
    });
    claude.stderr.on("data", (chunk: Buffer) => {
      send({ type: "output", text: chunk.toString() });
    });
    claude.on("close", (code: number | null) => {
      send({ type: "done", code, message: `\nProcess exited with code ${code}\n` });
      res.end();
    });
    claude.on("error", (err: Error) => {
      send({ type: "error", message: `Failed to start claude: ${err.message}\n` });
      res.end();
    });

    req.on("close", () => claude.kill());
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
