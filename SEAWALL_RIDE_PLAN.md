# Vancouver Seawall Ride — TikTok Video Execution Plan
**Date:** 2026-06-30  
**Footage:** 7 x MOV files, ~5 min each (1408×1872 portrait, 30fps, ~545MB each)

---

## Footage Map

| File | Path | Duration | Content |
|------|------|----------|---------|
| 1 | `/Users/vincentlaw/Downloads/1 - seawall to granville 1.MOV` | 5:00 | Seawall → Granville Island approach |
| 2 | `/Users/vincentlaw/Downloads/2 - granvile to vanier.MOV` | 5:00 | Granville Island → Vanier Park |
| 3 | `/Users/vincentlaw/Downloads/3- vanier .MOV` | 3:30 | Vanier Park & Elsje Point |
| 4 | `/Users/vincentlaw/Downloads/4 - show the new vancouver burrard appartment rentals Sen̓áḵw.MOV` | 5:00 | Sen̓áḵw building views |
| 5 | `/Users/vincentlaw/Downloads/5 - burrard bridge and also showing Sen̓áḵw building .MOV` | 5:00 | Burrard Bridge + Sen̓áḵw |
| 6 | `/Users/vincentlaw/Downloads/6 - underneath the granvile bridge and chandelier.MOV` | 5:00 | Under Granville Bridge + chandelier |
| 7 | `/Users/vincentlaw/Downloads/7 - seawall going back home.MOV` | 4:00 | Seawall homebound |

---

## Universal Rules (apply to ALL videos)

- **No head-turn shots** — avoid clips where camera pans left/right (causes shake/blur on Meta Glasses)
- **No mid-intersection cuts** — every clip must end either before entering or after fully clearing an intersection
- **Output folder** — each video gets its own subfolder: `public/output/<slug>-2026-06-30/`
- **Aspect ratio** — source is 1408×1872 (~3:4). Crop to 9:16 for TikTok:
  ```
  ffmpeg crop filter: crop=1053:1872:178:0, then scale=1080:1920
  ```
- **Target duration** — 45–60 seconds per TikTok (enough for the story, short enough to retain watch time)
- **Music** — upbeat cycling/city vibe. Place in `public/music/` before running

---

## Video 1 — POV Seawall to Granville Island

**Output:** `public/output/seawall-to-granville-island-2026-06-30/`  
**Source files:** File 1 + File 2  
**Target duration:** 45–55 seconds

### Story Brief
Hook: "POV biking to Granville Island on Vancouver's seawall 🚲"  
Narrative: Fast-paced cycling POV — passing other cyclists on the flat seawall path, weaving through, building energy, then the payoff: arriving under the Burrard Bridge and spotting the Granville Island entrance sign.

### Key Moments to Find (scan File 1 then File 2)
1. **Opening hook (0–3s)** — A clean forward-facing shot on the seawall with open water visible. No turns, good speed. Use the first good moment from File 1.
2. **Passing cyclists (3–20s)** — Multiple clips of overtaking other bikers. Look for: stable forward motion, another biker visibly in frame being passed. Take 3–4 separate pass moments, each 2–4s long.
3. **Bridge underpass approach (20–35s)** — The approach toward and under the Burrard Bridge (on the seawall). Look for the dramatic darkening as you enter the underpass.
4. **Granville Island sign (35–45s)** — The entrance sign to Granville Island underneath the bridge. This is the payoff shot. Hold for 3–4 seconds.
5. **Outro (45–55s)** — Cruising out the other side or a final open water seawall shot.

### Editing Notes
- Pace the cyclist-passing clips fast (jump cuts, no more than 3s each)
- The sign reveal should feel earned — slow down the cut pace just before it
- Add text overlay: "Granville Island ✓" on the sign shot
- Music: something energetic with a beat drop before the sign reveal

### Content Creator CLI Command
```bash
cd /Users/vincentlaw/content-creator
npx tsx src/index.ts run \
  --footage "/Users/vincentlaw/Downloads/1 - seawall to granville 1.MOV" \
           "/Users/vincentlaw/Downloads/2 - granvile to vanier.MOV" \
  --context "POV cycling on Vancouver seawall, passing other bikers, arriving at Granville Island entrance sign under the bridge" \
  --niche cycling lifestyle vancouver \
  --duration 50 \
  --platforms tiktok
```

### TikTok Caption
```
POV: passing everyone on Vancouver's seawall 🚴‍♂️💨 ending at Granville Island 🌉

#vancouver #granvilleisland #seawall #cycling #pov #bikevancouver #cyclingvancouver #yvr #explorevancouver
```

### Fallback FFmpeg (if CLI fails)
```bash
OUTPUT_DIR="/Users/vincentlaw/content-creator/public/output/seawall-to-granville-island-2026-06-30"
mkdir -p "$OUTPUT_DIR"

# First identify key timestamps with scene detection:
ffprobe -v quiet -show_frames -select_streams v \
  -skip_frame noref -show_entries frame=best_effort_timestamp_time,pict_type \
  -of csv "/Users/vincentlaw/Downloads/1 - seawall to granville 1.MOV" 2>/dev/null | \
  grep "I" | awk -F',' '{print $2}' | head -20

# Then cut clips and assemble (adjust timestamps after reviewing):
# Example composite command — timestamps must be verified by watching footage:
ffmpeg -i "/Users/vincentlaw/Downloads/1 - seawall to granville 1.MOV" \
  -i "/Users/vincentlaw/Downloads/2 - granvile to vanier.MOV" \
  -filter_complex "
    [0:v]trim=start=5:end=8,setpts=PTS-STARTPTS,crop=1053:1872:178:0,scale=1080:1920[c1];
    [0:v]trim=start=45:end=49,setpts=PTS-STARTPTS,crop=1053:1872:178:0,scale=1080:1920[c2];
    [0:v]trim=start=120:end=124,setpts=PTS-STARTPTS,crop=1053:1872:178:0,scale=1080:1920[c3];
    [1:v]trim=start=30:end=35,setpts=PTS-STARTPTS,crop=1053:1872:178:0,scale=1080:1920[c4];
    [1:v]trim=start=200:end=205,setpts=PTS-STARTPTS,crop=1053:1872:178:0,scale=1080:1920[c5];
    [c1][c2][c3][c4][c5]concat=n=5:v=1:a=0[outv]
  " \
  -map "[outv]" -c:v libx264 -crf 23 -preset fast \
  "$OUTPUT_DIR/seawall_granville_tiktok.mp4"
```

---

## Video 2 — Seawall to Vanier Park & Elsje Point

**Output:** `public/output/vanier-park-elsje-point-2026-06-30/`  
**Source files:** File 2 + File 3  
**Target duration:** 45–55 seconds

### Story Brief
Hook: "This hidden pocket of Vancouver will make you want to bike here every day 🌿"  
Narrative: Riding from the Granville Island area, the seawall opens up and leads to Vanier Park — a quiet green space with mountain views — and on to Elsje Point at the water's edge.

### Key Moments to Find (scan File 2 then File 3)
1. **Opening shot (0–4s)** — File 2: wide open seawall with mountains in background or water visible. No head turns.
2. **Transition to park (4–20s)** — File 2: the path leaving the busy seawall into the greener Vanier Park stretch. Look for tree canopy or change in environment (path type, foliage).
3. **Vanier Park arrival (20–35s)** — File 3: First clear views of Vanier Park. Flat green grass, possibly the HR MacMillan Space Centre or the park signage visible. 2–3 clips.
4. **Elsje Point (35–50s)** — File 3: The water's edge point. Look for a wide water/mountain view from the tip of the point, or a moment slowing down to take in the view.
5. **Payoff shot (50–55s)** — File 3: A still, beautiful frame — ocean, North Shore mountains, or the harbour. Let it breathe for 3s.

### Editing Notes
- This video should be more relaxed paced than Video 1 — fewer jump cuts, longer clips
- The contrast between the busy seawall and quiet Vanier Park is the story
- Add text overlay at Vanier Park: "Vanier Park 🌿" and at Elsje Point: "Elsje Point 💙"
- Music: lo-fi or soft city/nature vibe

### Content Creator CLI Command
```bash
cd /Users/vincentlaw/content-creator
npx tsx src/index.ts run \
  --footage "/Users/vincentlaw/Downloads/2 - granvile to vanier.MOV" \
           "/Users/vincentlaw/Downloads/3- vanier .MOV" \
  --context "Cycling from Granville Island area along the seawall to Vanier Park and Elsje Point, beautiful ocean and mountain views, quiet hidden gem in Vancouver" \
  --niche cycling lifestyle vancouver nature \
  --duration 50 \
  --platforms tiktok
```

### TikTok Caption
```
Hidden gem on Vancouver's seawall — Vanier Park → Elsje Point 🌊⛰️

#vancouver #vanierpark #seawall #cycling #yvr #hiddengem #vancouverbc #explorevancouver #bikevancouver #elsjepoint
```

---

## Video 3 — Sen̓áḵw: Vancouver's Viral Controversial Building

**Output:** `public/output/senakw-controversy-2026-06-30/`  
**Source files:** File 4 + File 5  
**Target duration:** 50–60 seconds

### Story Brief
Hook: "This Vancouver apartment building went viral for being 'affordable' — until people saw the prices 😳"  
Narrative: POV cycling past the Sen̓áḵw development, revealing the building's dramatic scale, then commentary context through text overlays explaining the controversy (advertised as affordable housing, actual rental prices shocked people).

### Key Moments to Find (scan File 4 then File 5)
1. **Hook — building reveal (0–5s)** — File 4: The first clear wide shot of the Sen̓áḵw towers coming into view. Dramatic if you can see multiple towers.
2. **Ride past the building (5–20s)** — File 4: 3–4 clips cycling past/along the building complex. Look for moments where the scale is apparent.
3. **Burrard Bridge + building view (20–35s)** — File 5: Views of Sen̓áḵw from the Burrard Bridge crossing or approach, where you can see the full development in context of the city.
4. **Close building shots (35–50s)** — File 4 or 5: Any close exterior shots showing the building's design, any signage, or context clues.
5. **Final wide (50–60s)** — A wide shot that captures Sen̓áḵw in context with Vancouver skyline or the bridge.

### Text Overlays (add in editing)
- At hook: "Sen̓áḵw — Vancouver's most talked-about development"
- Mid-video: "Marketed as 'affordable housing' 🏗️"  
- Late: "Rents starting at $2,800+/month 😬"
- End: "Is this affordable to you? 👇"

### Editing Notes
- This is an opinion/news-style video — pacing should feel deliberate, not hyper-fast
- Add captions/text overlays telling the story (the footage is the B-roll, the text tells the story)
- May want to add a talking-head hook if user wants to narrate; otherwise text-only works well on TikTok
- The controversy angle will drive comments — make sure the CTA ("Is this affordable to you?") is visible for 3s minimum

### Content Creator CLI Command
```bash
cd /Users/vincentlaw/content-creator
npx tsx src/index.ts run \
  --footage "/Users/vincentlaw/Downloads/4 - show the new vancouver burrard appartment rentals Sen̓áḵw.MOV" \
           "/Users/vincentlaw/Downloads/5 - burrard bridge and also showing Sen̓áḵw building .MOV" \
  --context "POV cycling past Sen̓áḵw, Vancouver's controversial new apartment building that was advertised as affordable housing but has rental prices starting at 2800+ per month. Show the building's scale and the controversy around it." \
  --niche lifestyle vancouver housing controversy \
  --duration 55 \
  --platforms tiktok
```

### TikTok Caption
```
They said Sen̓áḵw would be "affordable housing" for Vancouver... 👀

Starting at $2,800/month. Is that affordable to you? 👇

#vancouver #senakw #affordablehousing #vancouverrealestate #yvr #housingcrisis #vancouverapartment #cycling #pov
```

---

## Video 4 — Burrard Bridge + Under Granville Bridge Chandelier

**Output:** `public/output/burrard-bridge-chandelier-2026-06-30/`  
**Source files:** File 5 + File 6  
**Target duration:** 45–55 seconds

### Story Brief
Hook: "Wait till you see what's hiding under the Granville Bridge in Vancouver 🤯"  
Narrative: Crossing the Burrard Bridge (epic city views), then the payoff — cycling underneath the Granville Bridge and discovering the massive chandelier art installation suspended from the bridge underside.

### Key Moments to Find (scan File 5 then File 6)
1. **Opening — Burrard Bridge approach (0–5s)** — File 5: Approaching or entering the Burrard Bridge crossing. Look for the bridge railings coming into view and the city/water vista opening up.
2. **Bridge crossing views (5–18s)** — File 5: 2–3 clips from the middle of the Burrard Bridge — False Creek below, Vancouver skyline, mountains. These are the bridge's iconic views.
3. **Descent off bridge (18–25s)** — File 5 or 6: The descent after the bridge, entering the path toward the Granville Bridge underside.
4. **Chandelier reveal (25–40s)** — File 6: THE KEY SHOT. The moment the chandelier comes into view under the Granville Bridge. This should be the longest uncut moment — hold for 5–8 seconds minimum. Look for the overhead ornate installation.
5. **Ride through under the bridge (40–50s)** — File 6: Cruising under the bridge with the chandelier overhead. Multiple angles if available.
6. **Back to seawall (50–55s)** — File 6: Emerging from under the bridge back onto the open seawall.

### Editing Notes
- The reveal of the chandelier is the entire payoff — do NOT cut away from it too fast
- Build anticipation: use slightly slower pace on the bridge, then jump cut to the chandelier appearance
- Text overlay just before the chandelier: "Wait for it..." then text on chandelier shot: "The chandelier under Granville Bridge 🕯️"
- Music: something with a moment of surprise/magic at the chandelier reveal

### Content Creator CLI Command
```bash
cd /Users/vincentlaw/content-creator
npx tsx src/index.ts run \
  --footage "/Users/vincentlaw/Downloads/5 - burrard bridge and also showing Sen̓áḵw building .MOV" \
           "/Users/vincentlaw/Downloads/6 - underneath the granvile bridge and chandelier.MOV" \
  --context "POV cycling across Burrard Bridge with city views, then riding underneath the Granville Bridge where there is a dramatic chandelier art installation suspended from the underside of the bridge, then back to the seawall" \
  --niche cycling lifestyle vancouver architecture \
  --duration 50 \
  --platforms tiktok
```

### TikTok Caption
```
There's a CHANDELIER hanging under the Granville Bridge in Vancouver 🕯️✨

Not joking. Cycling POV 🚴‍♂️

#vancouver #granvillebridge #chandelier #yvr #hiddengem #explorevancouver #cycling #pov #vancouverbc #seawall
```

---

## Video 5 — Seawall Back Home

**Output:** `public/output/seawall-back-home-2026-06-30/`  
**Source files:** File 6 + File 7  
**Target duration:** 40–50 seconds

### Story Brief
Hook: "The best part of the ride is always the way home 🌅"  
Narrative: The golden-hour (or late afternoon) vibe of riding the seawall home. This is the chill, relaxed finale — wide water views, the city glowing, a satisfying end to the loop.

### Key Moments to Find (scan File 6 then File 7)
1. **Opening — seawall emerge (0–5s)** — File 6: After the chandelier, returning to the open seawall. First clear view of False Creek or English Bay opening up.
2. **Seawall scenery (5–30s)** — File 7: 4–5 clips of the most beautiful seawall moments on the way home. Look for: water reflections, the city skyline in view, other cyclists/joggers for life context, any golden light.
3. **Recognizable landmark (30–40s)** — File 7: Any recognizable Vancouver seawall landmark — Science World dome, the inlet, sailboats, the mountains.
4. **Final home stretch (40–50s)** — File 7: The last stretch before reaching home/destination. Could be a familiar corner or building if visible.

### Editing Notes
- This is the vibe/aesthetic video of the set — prioritize visual beauty over fast pace
- Slightly longer clips (3–5s each), smooth transitions
- Add subtle text at start: "The ride home 🏠" — no other overlays needed
- Music: something warm and satisfying, lower BPM than the other videos

### Content Creator CLI Command
```bash
cd /Users/vincentlaw/content-creator
npx tsx src/index.ts run \
  --footage "/Users/vincentlaw/Downloads/6 - underneath the granvile bridge and chandelier.MOV" \
           "/Users/vincentlaw/Downloads/7 - seawall going back home.MOV" \
  --context "POV cycling back home on Vancouver seawall, beautiful late afternoon scenery, False Creek, city views, relaxed end to a long bike ride through the seawall loop" \
  --niche cycling lifestyle vancouver \
  --duration 45 \
  --platforms tiktok
```

### TikTok Caption
```
The best part of the ride is always the way home 🏠🌊

Vancouver seawall POV 🚴‍♂️

#vancouver #seawall #cycling #yvr #falsecreek #pov #bikevancouver #explorevancouver #sunsetvibes
```

---

## Additional Content Ideas from This Footage

These are bonus ideas that don't require new footage — remix/mashup from the 7 files:

### A. "Full Seawall Loop in 60 Seconds"
- **Files:** All 7, 1 clip each (~6–8s per file)
- **Concept:** Time-lapse style compilation of the full loop — seawall → Granville → Vanier → Sen̓áḵw → Burrard → Chandelier → home
- **Caption:** "Vancouver's seawall loop in 60 seconds 🔄"
- **Best for:** High shareability, good overview hook for new followers

### B. "Vancouver Cycling POV: Things That Surprised Me"
- **Files:** 1, 4, 6 (the three most visually surprising moments: passing cyclists, the building scale, the chandelier)
- **Concept:** Listicle format — "1. The seawall bikers / 2. That new building / 3. The chandelier under the bridge"
- **Caption:** "3 things that surprised me cycling Vancouver's seawall 😱"

### C. "Is Vancouver's 'Affordable' Housing a Scam?" (Deep dive)
- **Files:** 4 + 5 (same as Video 3, but longer edit)
- **Concept:** 60-second explainer with heavy text overlay, statistics, B-roll of the building
- Research text overlays to add: income needed to afford $2,800/month rent (typically 3x rent = ~$100k/yr income)
- **Caption:** "Vancouver housing math doesn't add up 🧮 #housingcrisis"

### D. Lo-Fi Seawall Chill Ride
- **Files:** 1, 2, 7 (seawall-only clips, no building, no bridges)
- **Concept:** Pure aesthetic — no text, just water + path + motion + lo-fi music
- For a different audience: people who follow city lifestyle/aesthetic accounts
- **Caption:** "Vancouver seawall Sunday 🎶 #lofi #cycling"

### E. "Granville Island Chandelier POV" (Short clip)
- **Files:** 6 only
- **Concept:** Just the chandelier approach and ride-through, trimmed to 15 seconds
- Post as a Reel or YouTube Short for maximum algorithm spread
- **Caption:** "Did you know there's a chandelier under Vancouver's Granville Bridge? 🕯️"

---

## Execution Order Recommendation

Run these in this order for momentum and to learn from each:

1. **Video 3** (Sen̓áḵw) — highest viral potential due to controversy angle, good to post first and monitor engagement
2. **Video 4** (Chandelier) — strong hook, visually surprising payoff
3. **Video 1** (Granville Island) — classic cycling POV, solid engagement
4. **Video 2** (Vanier Park) — more niche/local, good second week content
5. **Video 5** (Home) — vibe video, can post any time

Space them 1–2 days apart for TikTok algorithm.

---

## Pre-Session Checklist (for each new Claude session)

Before running the CLI command, verify:
- [ ] `OPENAI_API_KEY` is set in `.env`
- [ ] Node modules installed: `npm install` in `/Users/vincentlaw/content-creator`
- [ ] Output directory doesn't already exist (or is intentionally being overwritten)
- [ ] Music file placed in `public/music/` if adding background audio
- [ ] TypeScript compiled: `npm run build` or use `npx tsx` directly
