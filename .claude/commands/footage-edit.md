---
description: Start the footage editor UI and pre-load specified video files. Usage: /footage-edit /path/to/clip1.mp4 /path/to/clip2.mp4
---

Open the footage editor dashboard with the provided video files pre-loaded so the user can select clips and build an editing prompt.

**File paths to load:** $ARGUMENTS

## Steps

### 1. Parse and validate the file paths

Split `$ARGUMENTS` on whitespace to get individual file paths. For each path:
- Confirm the file exists on disk
- Confirm it has a video extension (.mp4, .mov, .avi, .mkv, .webm, .m4v)
- Report any missing or invalid paths to the user

### 2. Check if the dashboard server is already running

```bash
lsof -ti:3000 2>/dev/null | head -1
```

If nothing is returned, the server is not running — start it:

```bash
cd /Users/vincentlaw/content-creator && npm run dashboard > /tmp/footage-dashboard.log 2>&1 &
echo "Server starting (PID $!)..."
sleep 3
# Confirm it's up
curl -sf http://localhost:3000/api/footage > /dev/null && echo "Server ready" || echo "Server may still be starting"
```

### 3. Build the browser URL and open it

Encode the file paths (pipe `|` delimited) as the `files` query parameter:

```bash
# Join paths with pipe delimiter and URL-encode
PATHS="$ARGUMENTS"
ENCODED=$(python3 -c "
import sys, urllib.parse
paths = sys.argv[1].strip()
print(urllib.parse.quote(paths, safe=''))
" "$PATHS")
open -a "Brave Browser" "http://localhost:3000/?tab=footage&files=${ENCODED}"
```

### 4. Report back to the user

Tell the user:
- Which files were loaded into the editor (list them)
- That the Footage Editor tab is now open in their browser
- How to use the UI:
  - **File browser (left)** — their files appear under "Session Files"; click to load in the player
  - **Video player** — scrub through the footage; use **Mark In** / **Mark Out** to capture clip intervals
  - **Clip notes** — type context about what each clip shows or why to include it
  - **Edit Instructions** — describe the overall approach (mood, pacing, format, style)
  - **Generate Prompt** — builds a structured ffmpeg prompt from all selections
  - **Send to Claude Code** — streams the edit back into the terminal here

Ask the user: *"What's the editing approach you have in mind for this footage?"* — capture their answer and pre-fill the "Additional Editing Instructions" field by navigating to the dashboard and calling:

```bash
# Paste context into the edit-context textarea via browser automation if agent-browser is available,
# or just remind the user to paste it into the "Additional Editing Instructions" field in the UI.
```
