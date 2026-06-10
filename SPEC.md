# Content Creator Multi-Agent System

## Overview
An automated content creation system for lifestyle vlogs (cycling, bouldering, travel) with multiple specialized agents working together to research trends, generate stories, edit videos, and manage social media accounts.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CONTENT CREATOR SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐                                                    │
│  │  MARKET RESEARCH│                                                    │
│  │     AGENT       │──────────────────────┐                             │
│  │                 │                      │                             │
│  │ • Trend topics  │                      ▼                             │
│  │ • Video formats │              ┌─────────────────┐                   │
│  │ • Trending audio│              │ STORY GENERATION│                   │
│  │ • Competitor    │              │     AGENT       │                   │
│  │   analysis      │              │                 │                   │
│  └─────────────────┘              │ • Analyze footage│                  │
│                                   │ • Match to trends│                  │
│  ┌─────────────────┐              │ • Generate      │                   │
│  │  RAW FOOTAGE    │─────────────▶│   narrative     │                   │
│  │  (Meta Glasses) │              │ • Select format │                   │
│  └─────────────────┘              └────────┬────────┘                   │
│                                            │                            │
│                                            ▼                            │
│                                   ┌─────────────────┐                   │
│                                   │  VIDEO EDITING  │                   │
│                                   │     AGENT       │                   │
│                                   │                 │                   │
│                                   │ • Cut/compose   │                   │
│                                   │ • Apply effects │                   │
│                                   │ • Sync music    │                   │
│                                   │ • Multi-format  │                   │
│                                   │   export        │                   │
│                                   └────────┬────────┘                   │
│                                            │                            │
│                                            ▼                            │
│                                   ┌─────────────────┐                   │
│                                   │  SOCIAL MEDIA   │                   │
│                                   │     AGENT       │                   │
│                                   │                 │                   │
│                                   │ • Upload TikTok │                   │
│                                   │ • Upload YouTube│                   │
│                                   │ • Reply comments│                   │
│                                   │ • Boost engage  │                   │
│                                   └─────────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20+ (local)
- **Agent Framework**: Custom orchestrator
- **Video Processing**: Remotion 4.x + FFmpeg
- **AI/ML**: OpenAI GPT-4, Local Whisper
- **Social APIs**: TikTok Developer API, YouTube Data API v3
- **Database**: SQLite (local state)
- **Scheduling**: node-cron for automated tasks

## Project Structure

```
content-creator/
├── src/
│   ├── index.ts                    # Main CLI/orchestrator
│   ├── orchestrator/
│   │   ├── pipeline.ts             # Agent coordination
│   │   ├── state.ts                # Shared state management
│   │   └── scheduler.ts            # Cron jobs for automation
│   │
│   ├── agents/
│   │   ├── market-research/
│   │   │   ├── index.ts
│   │   │   ├── trends.ts           # TikTok/YT trend scraping
│   │   │   ├── sounds.ts           # Trending audio discovery
│   │   │   ├── formats.ts          # Video format analysis
│   │   │   └── competitors.ts      # Niche competitor tracking
│   │   │
│   │   ├── story-generation/
│   │   │   ├── index.ts
│   │   │   ├── analyzer.ts         # Footage content analysis
│   │   │   ├── narrative.ts        # Story arc generation
│   │   │   └── matcher.ts          # Match footage to trends
│   │   │
│   │   ├── video-editing/
│   │   │   ├── index.ts
│   │   │   ├── analysis/           # Scene/motion/audio detection
│   │   │   ├── scoring/            # Highlight ranking
│   │   │   ├── timeline/           # Edit composition
│   │   │   └── export/             # Multi-format render
│   │   │
│   │   └── social-media/
│   │       ├── index.ts
│   │       ├── tiktok/
│   │       │   ├── upload.ts       # TikTok video upload
│   │       │   ├── comments.ts     # Comment monitoring/reply
│   │       │   └── analytics.ts    # Performance tracking
│   │       ├── youtube/
│   │       │   ├── upload.ts       # YouTube video upload
│   │       │   ├── comments.ts     # Comment management
│   │       │   └── analytics.ts    # Performance tracking
│   │       └── engagement.ts       # Cross-platform strategy
│   │
│   ├── remotion/                   # Remotion video compositions
│   │   ├── Root.tsx
│   │   ├── compositions/
│   │   └── index.ts
│   │
│   ├── review/                     # Human review interface
│   │   ├── server.ts
│   │   └── ui/
│   │
│   └── shared/
│       ├── types.ts                # Shared interfaces
│       ├── llm.ts                  # LLM client wrapper
│       └── db.ts                   # State persistence
│
├── public/
│   ├── footage/                    # Raw footage input
│   ├── music/                      # Audio library
│   └── output/                     # Rendered videos
│
├── data/
│   └── content-creator.db          # SQLite database
│
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

---

## Agent 1: Market Research Agent

### Purpose
Research and compile trending content in the cycling/bouldering/travel niche to inform video creation strategy.

### Data Sources
| Source | Data | Method |
|--------|------|--------|
| TikTok | Trending hashtags, sounds, formats | Unofficial API / scraping |
| YouTube | Trending topics in niche | YouTube Data API |
| Instagram Reels | Format trends | Meta API |
| Reddit | Discussion topics | Reddit API |

### Output Schema
```typescript
interface TrendReport {
  generatedAt: Date;
  niche: string[];
  topics: TrendingTopic[];
  formats: VideoFormat[];
  sounds: TrendingSound[];
  competitors: Competitor[];
}
```

---

## Agent 2: Story Generation Agent

### Purpose
Analyze raw footage and generate a compelling narrative that aligns with current trends and maximizes engagement.

### Process
1. **Footage Analysis** - Extract keyframes, run vision model, transcribe speech
2. **Trend Matching** - Compare footage to trending topics
3. **Narrative Generation** - LLM generates story arc with hook, build, payoff

### Output Schema
```typescript
interface StoryPlan {
  title: string;
  hook: string;
  narrative: NarrativeMoment[];
  format: VideoFormat;
  suggestedSound: TrendingSound;
  captions: { tiktok: string; youtube: { title: string; description: string } };
  hashtags: string[];
  estimatedDuration: number;
}
```

---

## Agent 3: Video Editing Agent

### Purpose
Execute the story plan by editing raw footage into polished videos for each platform.

### Process
1. **Analysis**: Scene detection, motion tracking, audio analysis
2. **Highlight Extraction**: Cut clips matching story plan timestamps
3. **Timeline Composition**: Arrange clips, sync to music beats
4. **Effects**: Apply color grading, transitions
5. **Multi-format Export**: YouTube (16:9) + TikTok (9:16)

---

## Agent 4: Social Media Agent

### Purpose
Upload content, manage accounts, engage with audience, and track performance.

### Capabilities
- **Upload**: TikTok and YouTube via APIs
- **Comment Management**: Monitor, filter spam, generate AI replies
- **Engagement Strategy**: Track best posting times, A/B test content
- **Analytics**: Pull performance metrics and feed back to research

---

## CLI Commands

```bash
# Full pipeline
content-creator run \
  --footage ./raw/cycling.mp4 \
  --context "Discovered hidden café downtown"

# Market research only
content-creator research --niche cycling,bouldering

# Review pending edits
content-creator review

# Upload approved content
content-creator post --project abc123

# Engagement management
content-creator engage --check-comments --reply-pending

# Analytics dashboard
content-creator analytics --last 7d

# Start scheduler
content-creator scheduler --start

# Start web dashboard
content-creator dashboard
```

---

## Configuration

### Decisions

| Decision | Choice |
|----------|--------|
| Comment replies | **Full auto** - AI posts replies based on rules |
| Research schedule | **Both** - Daily automated + on-demand triggers |
| Interface | **Both** - CLI commands + web dashboard |
| Database | SQLite for local state |
| Speech transcription | Local Whisper or OpenAI Whisper API |

### Environment Variables

```bash
OPENAI_API_KEY=sk-...
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_ACCESS_TOKEN=...
WHISPER_MODEL_PATH=...  # Optional
DASHBOARD_PORT=3000
DASHBOARD_SECRET=...
```

---

## Web Dashboard Features

- Project overview and status
- Review pending edits (video player + approve/reject)
- Comment queue with auto-reply preview
- Analytics charts
- Trend report browser
- Settings and scheduling
