import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  Project,
  TrendReport,
  StoryPlan,
  FootageAnalysis,
  PostResult,
  Comment,
  EngagementAction,
  AnalyticsSnapshot,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "content-creator.db");

let db: SqlJsDatabase | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function initSQL(): Promise<typeof SQL> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (!db) {
    const SqlJs = await initSQL();

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SqlJs.Database(buffer);
    } else {
      db = new SqlJs.Database();
    }

    initializeTables(db);
    saveDb(); // Save initial structure
  }
  return db;
}

function saveDb(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function initializeTables(database: SqlJsDatabase) {
  // Projects table
  database.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      footage TEXT NOT NULL,
      context TEXT NOT NULL,
      niche TEXT NOT NULL,
      trend_report_id TEXT,
      story_plan_id TEXT,
      edited_videos TEXT,
      thumbnails TEXT,
      post_results TEXT,
      error TEXT
    )
  `);

  // Trend reports table
  database.run(`
    CREATE TABLE IF NOT EXISTS trend_reports (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      niche TEXT NOT NULL,
      topics TEXT NOT NULL,
      formats TEXT NOT NULL,
      sounds TEXT NOT NULL,
      competitors TEXT NOT NULL
    )
  `);

  // Story plans table
  database.run(`
    CREATE TABLE IF NOT EXISTS story_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      hook TEXT NOT NULL,
      narrative TEXT NOT NULL,
      format TEXT NOT NULL,
      suggested_sound TEXT,
      captions TEXT NOT NULL,
      hashtags TEXT NOT NULL,
      estimated_duration REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // Footage analysis table
  database.run(`
    CREATE TABLE IF NOT EXISTS footage_analyses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      metadata TEXT NOT NULL,
      scenes TEXT NOT NULL,
      keyframes TEXT NOT NULL,
      transcript TEXT NOT NULL,
      summary TEXT NOT NULL,
      suggested_topics TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // Post results table
  database.run(`
    CREATE TABLE IF NOT EXISTS post_results (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      video_id TEXT NOT NULL,
      url TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      initial_metrics TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // Comments table
  database.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      sentiment TEXT,
      replied INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES post_results(id)
    )
  `);

  // Engagement actions table
  database.run(`
    CREATE TABLE IF NOT EXISTS engagement_actions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      comment_id TEXT NOT NULL,
      content TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      executed_at TEXT,
      FOREIGN KEY (comment_id) REFERENCES comments(id)
    )
  `);

  // Analytics snapshots table
  database.run(`
    CREATE TABLE IF NOT EXISTS analytics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      views INTEGER NOT NULL,
      likes INTEGER NOT NULL,
      comments INTEGER NOT NULL,
      shares INTEGER NOT NULL,
      watch_time REAL,
      engagement_rate REAL,
      FOREIGN KEY (post_id) REFERENCES post_results(id)
    )
  `);

  // Create indexes
  database.run(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_trend_reports_niche ON trend_reports(niche)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_comments_replied ON comments(replied)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON analytics_snapshots(post_id)`);
}

// Helper to run a query and get results as objects
function queryAll(database: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = database.prepare(sql);
  stmt.bind(params);

  const results: Record<string, unknown>[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as Record<string, unknown>);
  }
  stmt.free();
  return results;
}

function queryOne(database: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const results = queryAll(database, sql, params);
  return results.length > 0 ? results[0] : null;
}

// ==================== Project Operations ====================

export async function createProject(project: Project): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO projects (id, created_at, updated_at, status, footage, context, niche, trend_report_id, story_plan_id, edited_videos, thumbnails, post_results, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.createdAt.toISOString(),
      project.updatedAt.toISOString(),
      project.status,
      JSON.stringify(project.footage),
      project.context,
      JSON.stringify(project.niche),
      project.trendReportId || null,
      project.storyPlanId || null,
      project.editedVideos ? JSON.stringify(project.editedVideos) : null,
      project.thumbnails ? JSON.stringify(project.thumbnails) : null,
      project.postResults ? JSON.stringify(project.postResults) : null,
      project.error || null,
    ]
  );
  saveDb();
}

export async function getProject(id: string): Promise<Project | null> {
  const database = await getDb();
  const row = queryOne(database, "SELECT * FROM projects WHERE id = ?", [id]);
  if (!row) return null;
  return rowToProject(row);
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const database = await getDb();
  const existing = await getProject(id);
  if (!existing) throw new Error(`Project ${id} not found`);

  const merged = { ...existing, ...updates, updatedAt: new Date() };
  database.run(
    `UPDATE projects SET
      updated_at = ?, status = ?, footage = ?, context = ?, niche = ?,
      trend_report_id = ?, story_plan_id = ?, edited_videos = ?,
      thumbnails = ?, post_results = ?, error = ?
    WHERE id = ?`,
    [
      merged.updatedAt.toISOString(),
      merged.status,
      JSON.stringify(merged.footage),
      merged.context,
      JSON.stringify(merged.niche),
      merged.trendReportId || null,
      merged.storyPlanId || null,
      merged.editedVideos ? JSON.stringify(merged.editedVideos) : null,
      merged.thumbnails ? JSON.stringify(merged.thumbnails) : null,
      merged.postResults ? JSON.stringify(merged.postResults) : null,
      merged.error || null,
      id,
    ]
  );
  saveDb();
}

export async function listProjects(status?: string): Promise<Project[]> {
  const database = await getDb();
  const sql = status
    ? "SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC"
    : "SELECT * FROM projects ORDER BY created_at DESC";
  const rows = status ? queryAll(database, sql, [status]) : queryAll(database, sql);
  return rows.map(rowToProject);
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    status: row.status as Project["status"],
    footage: JSON.parse(row.footage as string),
    context: row.context as string,
    niche: JSON.parse(row.niche as string),
    trendReportId: row.trend_report_id as string | undefined,
    storyPlanId: row.story_plan_id as string | undefined,
    editedVideos: row.edited_videos ? JSON.parse(row.edited_videos as string) : undefined,
    thumbnails: row.thumbnails ? JSON.parse(row.thumbnails as string) : undefined,
    postResults: row.post_results ? JSON.parse(row.post_results as string) : undefined,
    error: row.error as string | undefined,
  };
}

// ==================== Trend Report Operations ====================

export async function saveTrendReport(report: TrendReport): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO trend_reports (id, generated_at, niche, topics, formats, sounds, competitors)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      report.id,
      report.generatedAt.toISOString(),
      JSON.stringify(report.niche),
      JSON.stringify(report.topics),
      JSON.stringify(report.formats),
      JSON.stringify(report.sounds),
      JSON.stringify(report.competitors),
    ]
  );
  saveDb();
}

export async function getTrendReport(id: string): Promise<TrendReport | null> {
  const database = await getDb();
  const row = queryOne(database, "SELECT * FROM trend_reports WHERE id = ?", [id]);
  if (!row) return null;
  return rowToTrendReport(row);
}

export async function getLatestTrendReport(niche: string[]): Promise<TrendReport | null> {
  const database = await getDb();
  const nicheJson = JSON.stringify(niche.sort());
  const row = queryOne(
    database,
    `SELECT * FROM trend_reports WHERE niche = ? ORDER BY generated_at DESC LIMIT 1`,
    [nicheJson]
  );
  if (!row) return null;
  return rowToTrendReport(row);
}

function rowToTrendReport(row: Record<string, unknown>): TrendReport {
  return {
    id: row.id as string,
    generatedAt: new Date(row.generated_at as string),
    niche: JSON.parse(row.niche as string),
    topics: JSON.parse(row.topics as string),
    formats: JSON.parse(row.formats as string),
    sounds: JSON.parse(row.sounds as string),
    competitors: JSON.parse(row.competitors as string),
  };
}

// ==================== Story Plan Operations ====================

export async function saveStoryPlan(plan: StoryPlan): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO story_plans (id, project_id, title, hook, narrative, format, suggested_sound, captions, hashtags, estimated_duration, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      plan.id,
      plan.projectId,
      plan.title,
      plan.hook,
      JSON.stringify(plan.narrative),
      JSON.stringify(plan.format),
      plan.suggestedSound ? JSON.stringify(plan.suggestedSound) : null,
      JSON.stringify(plan.captions),
      JSON.stringify(plan.hashtags),
      plan.estimatedDuration,
      plan.createdAt.toISOString(),
    ]
  );
  saveDb();
}

export async function getStoryPlan(id: string): Promise<StoryPlan | null> {
  const database = await getDb();
  const row = queryOne(database, "SELECT * FROM story_plans WHERE id = ?", [id]);
  if (!row) return null;
  return rowToStoryPlan(row);
}

function rowToStoryPlan(row: Record<string, unknown>): StoryPlan {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    title: row.title as string,
    hook: row.hook as string,
    narrative: JSON.parse(row.narrative as string),
    format: JSON.parse(row.format as string),
    suggestedSound: row.suggested_sound ? JSON.parse(row.suggested_sound as string) : undefined,
    captions: JSON.parse(row.captions as string),
    hashtags: JSON.parse(row.hashtags as string),
    estimatedDuration: row.estimated_duration as number,
    createdAt: new Date(row.created_at as string),
  };
}

// ==================== Footage Analysis Operations ====================

export async function saveFootageAnalysis(analysis: FootageAnalysis): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO footage_analyses (id, project_id, metadata, scenes, keyframes, transcript, summary, suggested_topics, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      analysis.id,
      analysis.projectId,
      JSON.stringify(analysis.metadata),
      JSON.stringify(analysis.scenes),
      JSON.stringify(analysis.keyframes),
      JSON.stringify(analysis.transcript),
      analysis.summary,
      JSON.stringify(analysis.suggestedTopics),
      analysis.createdAt.toISOString(),
    ]
  );
  saveDb();
}

export async function getFootageAnalysis(projectId: string): Promise<FootageAnalysis | null> {
  const database = await getDb();
  const row = queryOne(database, "SELECT * FROM footage_analyses WHERE project_id = ?", [projectId]);
  if (!row) return null;
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    metadata: JSON.parse(row.metadata as string),
    scenes: JSON.parse(row.scenes as string),
    keyframes: JSON.parse(row.keyframes as string),
    transcript: JSON.parse(row.transcript as string),
    summary: row.summary as string,
    suggestedTopics: JSON.parse(row.suggested_topics as string),
    createdAt: new Date(row.created_at as string),
  };
}

// ==================== Post Result Operations ====================

export async function savePostResult(result: PostResult): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO post_results (id, project_id, platform, video_id, url, posted_at, initial_metrics)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      result.id,
      result.projectId,
      result.platform,
      result.videoId,
      result.url,
      result.postedAt.toISOString(),
      result.initialMetrics ? JSON.stringify(result.initialMetrics) : null,
    ]
  );
  saveDb();
}

export async function getPostResults(projectId: string): Promise<PostResult[]> {
  const database = await getDb();
  const rows = queryAll(database, "SELECT * FROM post_results WHERE project_id = ?", [projectId]);
  return rows.map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    platform: row.platform as PostResult["platform"],
    videoId: row.video_id as string,
    url: row.url as string,
    postedAt: new Date(row.posted_at as string),
    initialMetrics: row.initial_metrics ? JSON.parse(row.initial_metrics as string) : undefined,
  }));
}

// ==================== Comment Operations ====================

export async function saveComment(comment: Comment): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO comments (id, post_id, platform, author, content, timestamp, sentiment, replied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      comment.id,
      comment.postId,
      comment.platform,
      comment.author,
      comment.content,
      comment.timestamp.toISOString(),
      comment.sentiment || null,
      comment.replied ? 1 : 0,
    ]
  );
  saveDb();
}

export async function getUnrepliedComments(platform?: string): Promise<Comment[]> {
  const database = await getDb();
  const sql = platform
    ? "SELECT * FROM comments WHERE replied = 0 AND platform = ? ORDER BY timestamp DESC"
    : "SELECT * FROM comments WHERE replied = 0 ORDER BY timestamp DESC";
  const rows = platform ? queryAll(database, sql, [platform]) : queryAll(database, sql);
  return rows.map(rowToComment);
}

export async function markCommentReplied(commentId: string): Promise<void> {
  const database = await getDb();
  database.run("UPDATE comments SET replied = 1 WHERE id = ?", [commentId]);
  saveDb();
}

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    postId: row.post_id as string,
    platform: row.platform as Comment["platform"],
    author: row.author as string,
    content: row.content as string,
    timestamp: new Date(row.timestamp as string),
    sentiment: row.sentiment as Comment["sentiment"],
    replied: Boolean(row.replied),
  };
}

// ==================== Engagement Action Operations ====================

export async function saveEngagementAction(action: EngagementAction): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT OR REPLACE INTO engagement_actions (id, type, comment_id, content, status, created_at, executed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      action.id,
      action.type,
      action.commentId,
      action.content || null,
      action.status,
      action.createdAt.toISOString(),
      action.executedAt?.toISOString() || null,
    ]
  );
  saveDb();
}

export async function getPendingActions(): Promise<EngagementAction[]> {
  const database = await getDb();
  const rows = queryAll(
    database,
    "SELECT * FROM engagement_actions WHERE status = 'pending' ORDER BY created_at ASC"
  );
  return rows.map(rowToEngagementAction);
}

export async function updateActionStatus(id: string, status: EngagementAction["status"]): Promise<void> {
  const database = await getDb();
  database.run(
    `UPDATE engagement_actions SET status = ?, executed_at = ? WHERE id = ?`,
    [status, status === "executed" ? new Date().toISOString() : null, id]
  );
  saveDb();
}

function rowToEngagementAction(row: Record<string, unknown>): EngagementAction {
  return {
    id: row.id as string,
    type: row.type as EngagementAction["type"],
    commentId: row.comment_id as string,
    content: row.content as string | undefined,
    status: row.status as EngagementAction["status"],
    createdAt: new Date(row.created_at as string),
    executedAt: row.executed_at ? new Date(row.executed_at as string) : undefined,
  };
}

// ==================== Analytics Operations ====================

export async function saveAnalyticsSnapshot(snapshot: AnalyticsSnapshot): Promise<void> {
  const database = await getDb();
  database.run(
    `INSERT INTO analytics_snapshots (post_id, timestamp, views, likes, comments, shares, watch_time, engagement_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.postId,
      snapshot.timestamp.toISOString(),
      snapshot.views,
      snapshot.likes,
      snapshot.comments,
      snapshot.shares,
      snapshot.watchTime || null,
      snapshot.engagementRate || null,
    ]
  );
  saveDb();
}

export async function getAnalyticsHistory(postId: string, days = 7): Promise<AnalyticsSnapshot[]> {
  const database = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = queryAll(
    database,
    `SELECT * FROM analytics_snapshots WHERE post_id = ? AND timestamp >= ? ORDER BY timestamp ASC`,
    [postId, since]
  );
  return rows.map((row) => ({
    postId: row.post_id as string,
    timestamp: new Date(row.timestamp as string),
    views: row.views as number,
    likes: row.likes as number,
    comments: row.comments as number,
    shares: row.shares as number,
    watchTime: row.watch_time as number | undefined,
    engagementRate: row.engagement_rate as number | undefined,
  }));
}

export async function closeDb(): Promise<void> {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
