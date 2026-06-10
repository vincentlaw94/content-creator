import { z } from "zod";

// ==================== Market Research Types ====================

export const TrendingTopicSchema = z.object({
  topic: z.string(),
  score: z.number().min(0).max(100),
  platforms: z.array(z.string()),
  examples: z.array(z.string()),
});

export const VideoFormatSchema = z.object({
  name: z.string(),
  description: z.string(),
  avgDuration: z.number(),
  examples: z.array(z.string()),
});

export const TrendingSoundSchema = z.object({
  name: z.string(),
  artist: z.string().optional(),
  tiktokId: z.string().optional(),
  youtubeId: z.string().optional(),
  usageCount: z.number(),
  mood: z.string(),
  previewUrl: z.string().optional(),
});

export const CompetitorSchema = z.object({
  handle: z.string(),
  platform: z.string(),
  followers: z.number(),
  recentPerformance: z.string(),
  topVideos: z.array(z.string()).optional(),
});

export const TrendReportSchema = z.object({
  id: z.string(),
  generatedAt: z.coerce.date(),
  niche: z.array(z.string()),
  topics: z.array(TrendingTopicSchema),
  formats: z.array(VideoFormatSchema),
  sounds: z.array(TrendingSoundSchema),
  competitors: z.array(CompetitorSchema),
});

export type TrendingTopic = z.infer<typeof TrendingTopicSchema>;
export type VideoFormat = z.infer<typeof VideoFormatSchema>;
export type TrendingSound = z.infer<typeof TrendingSoundSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type TrendReport = z.infer<typeof TrendReportSchema>;

// ==================== Story Generation Types ====================

export const NarrativeMomentSchema = z.object({
  timestamp: z.number(),
  endTimestamp: z.number().optional(),
  description: z.string(),
  importance: z.enum(["critical", "supporting", "optional"]),
  suggestedEffect: z.string().optional(),
});

export const CaptionsSchema = z.object({
  tiktok: z.string(),
  youtube: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export const StoryPlanSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  hook: z.string(),
  narrative: z.array(NarrativeMomentSchema),
  format: VideoFormatSchema,
  suggestedSound: TrendingSoundSchema.optional(),
  captions: CaptionsSchema,
  hashtags: z.array(z.string()),
  estimatedDuration: z.number(),
  createdAt: z.coerce.date(),
});

export type NarrativeMoment = z.infer<typeof NarrativeMomentSchema>;
export type Captions = z.infer<typeof CaptionsSchema>;
export type StoryPlan = z.infer<typeof StoryPlanSchema>;

// ==================== Video Editing Types ====================

export const SceneSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  type: z.enum(["outdoor", "indoor", "action", "rest", "transition", "unknown"]),
  description: z.string(),
  motionIntensity: z.number().min(0).max(1),
  audioLevel: z.number(),
  keyframeUrl: z.string().optional(),
});

export const HighlightSchema = z.object({
  sceneIndex: z.number(),
  score: z.number().min(0).max(100),
  reason: z.string(),
  suggestedDuration: z.number(),
});

export const TimelineClipSchema = z.object({
  sourceFile: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  effects: z.array(z.string()),
  transition: z.string().optional(),
});

export const VideoProjectSchema = z.object({
  id: z.string(),
  timeline: z.array(TimelineClipSchema),
  music: z.object({
    file: z.string(),
    startTime: z.number(),
    volume: z.number(),
  }).optional(),
  outputFormats: z.array(z.enum(["youtube", "tiktok", "instagram"])),
  colorGrading: z.string().optional(),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type TimelineClip = z.infer<typeof TimelineClipSchema>;
export type VideoProject = z.infer<typeof VideoProjectSchema>;

// ==================== Social Media Types ====================

export const PlatformSchema = z.enum(["tiktok", "youtube", "instagram"]);

export const PostResultSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  platform: PlatformSchema,
  videoId: z.string(),
  url: z.string(),
  postedAt: z.coerce.date(),
  initialMetrics: z.object({
    views: z.number(),
    likes: z.number(),
    comments: z.number(),
    shares: z.number(),
  }).optional(),
});

export const CommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  platform: PlatformSchema,
  author: z.string(),
  content: z.string(),
  timestamp: z.coerce.date(),
  sentiment: z.enum(["positive", "neutral", "negative", "spam"]).optional(),
  replied: z.boolean(),
});

export const EngagementActionSchema = z.object({
  id: z.string(),
  type: z.enum(["reply", "like", "flag", "delete"]),
  commentId: z.string(),
  content: z.string().optional(),
  status: z.enum(["pending", "approved", "executed", "rejected"]),
  createdAt: z.coerce.date(),
  executedAt: z.coerce.date().optional(),
});

export const AnalyticsSnapshotSchema = z.object({
  postId: z.string(),
  timestamp: z.coerce.date(),
  views: z.number(),
  likes: z.number(),
  comments: z.number(),
  shares: z.number(),
  watchTime: z.number().optional(),
  engagementRate: z.number().optional(),
});

export type Platform = z.infer<typeof PlatformSchema>;
export type PostResult = z.infer<typeof PostResultSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type EngagementAction = z.infer<typeof EngagementActionSchema>;
export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

// ==================== Project/Pipeline Types ====================

export const ProjectStatusSchema = z.enum([
  "created",
  "researching",
  "story_planning",
  "editing",
  "review",
  "ready",
  "posting",
  "posted",
  "failed",
]);

export const ProjectSchema = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  status: ProjectStatusSchema,
  footage: z.array(z.string()),
  context: z.string(),
  niche: z.array(z.string()),
  trendReportId: z.string().optional(),
  storyPlanId: z.string().optional(),
  editedVideos: z.object({
    youtube: z.string().optional(),
    tiktok: z.string().optional(),
    instagram: z.string().optional(),
  }).optional(),
  thumbnails: z.array(z.string()).optional(),
  postResults: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Project = z.infer<typeof ProjectSchema>;

// ==================== Agent Message Types ====================

export const AgentMessageSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  from: z.enum(["orchestrator", "market-research", "story-generation", "video-editing", "social-media"]),
  to: z.enum(["orchestrator", "market-research", "story-generation", "video-editing", "social-media"]),
  type: z.enum(["request", "response", "error", "status"]),
  payload: z.unknown(),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// ==================== Configuration Types ====================

export interface AppConfig {
  openai: {
    apiKey: string;
    model: string;
    visionModel: string;
  };
  youtube: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  tiktok: {
    clientKey: string;
    clientSecret: string;
    accessToken: string;
  };
  whisper: {
    modelPath?: string;
    useLocal: boolean;
  };
  paths: {
    footage: string;
    music: string;
    output: string;
    data: string;
  };
  dashboard: {
    port: number;
    secret: string;
  };
}

// ==================== Footage Analysis Types ====================

export const FootageMetadataSchema = z.object({
  path: z.string(),
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  codec: z.string(),
  hasAudio: z.boolean(),
  fileSize: z.number(),
});

export const KeyframeAnalysisSchema = z.object({
  timestamp: z.number(),
  imagePath: z.string(),
  description: z.string(),
  objects: z.array(z.string()),
  activity: z.string().optional(),
  location: z.string().optional(),
  mood: z.string().optional(),
});

export const TranscriptSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  confidence: z.number().optional(),
});

export const FootageAnalysisSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  metadata: FootageMetadataSchema,
  scenes: z.array(SceneSchema),
  keyframes: z.array(KeyframeAnalysisSchema),
  transcript: z.array(TranscriptSegmentSchema),
  summary: z.string(),
  suggestedTopics: z.array(z.string()),
  createdAt: z.coerce.date(),
});

export type FootageMetadata = z.infer<typeof FootageMetadataSchema>;
export type KeyframeAnalysis = z.infer<typeof KeyframeAnalysisSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type FootageAnalysis = z.infer<typeof FootageAnalysisSchema>;
