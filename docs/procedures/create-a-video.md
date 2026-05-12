# Create or update an install / hero video

Step videos for the install slideshow (and the overview hero on the landing
page) are authored as HyperFrames compositions in the sibling
[`mycelium-promo`](https://github.com/mycelium-io/mycelium-promo) repo, rendered
to MP4, then copied into this repo.

Both repos must be cloned side-by-side:

```
~/Documents/GitHub/
  hackathon/                          ← this repo (gh-pages site)
  mycelium/
    mycelium-promo/                   ← HyperFrames project authoring lives here
      overview/                       ← landing-page hero composition
      install/
        01-cli/                       ← one subdir per install step
        02-stack/
        ...
        10-next/
```

Each HyperFrames subdir is a self-contained project (`index.html`,
`hyperframes.json`, `meta.json`, `package.json`, plus copied brand assets
`logo.png` + `mycelium-bg.js`). HyperFrames renders `index.html` to MP4.

## Prereqs

- Node.js ≥ 22 and ffmpeg (HyperFrames requirements)
- The `npx hyperframes@0.4.41` CLI is invoked on demand — no global install

## Touch the right files

The slideshow is data-driven from
[`videos/manifest.json`](../../videos/manifest.json). Each `install[*]` entry
points at an MP4 under `videos/install/` and supplies the title, blurb, and
optional command shown beside the video. Steps render in the order they appear
in `install[]`.

If you're changing copy/command/blurb only, edit the manifest and skip the
render.

If you're changing the video itself, you need to re-author the composition,
re-render, and re-copy the MP4.

## Edit, lint, inspect, render

From the relevant subdir under `mycelium-promo`:

```bash
cd ~/Documents/GitHub/mycelium/mycelium-promo/install/<step>

# Author / iterate
npx hyperframes@0.4.41 preview            # studio at http://localhost:3002

# Verify before rendering
npx hyperframes@0.4.41 lint               # must show 0 errors
npx hyperframes@0.4.41 inspect            # 0 layout issues across samples

# Render (≈ 5–15s depending on duration)
npx hyperframes@0.4.41 render
# → install/<step>/renders/<step>_<YYYY-MM-DD_HH-MM-SS>.mp4
```

Lint errors block the render. The most common one is
`gsap_infinite_repeat` from `repeat: -1` — replace it with a finite count
(`repeat: Math.floor(totalDuration / cycleDuration) - 1`).

## Copy the MP4 into the hackathon repo

**Watch this gotcha:** if you scaffolded the directory with `cp -r 01-cli
06-newstep`, the source `renders/` folder came along, so the new dir's
`renders/` will contain the stale `01-cli_*.mp4` *and* the new render. Always
filter `find` by the step prefix so you grab the right file:

```bash
STEP=08-session-rounds
src=$(find ~/Documents/GitHub/mycelium/mycelium-promo/install/$STEP/renders \
        -name "${STEP}_*.mp4" -type f | sort | tail -1)
cp "$src" ~/Documents/GitHub/hackathon/videos/install/$STEP.mp4
```

For the overview hero (landing page), the destination is
`videos/overview.mp4`:

```bash
src=$(find ~/Documents/GitHub/mycelium/mycelium-promo/overview/renders \
        -name "overview_*.mp4" -type f | sort | tail -1)
cp "$src" ~/Documents/GitHub/hackathon/videos/overview.mp4
```

## Adding a brand-new step

1. Pick the id — `NN-slug` (e.g. `06-openclaw`). The NN determines order in
   the slideshow.
2. Scaffold the subdir:

   ```bash
   cd ~/Documents/GitHub/mycelium/mycelium-promo/install
   npx --yes hyperframes@0.4.41 init <NN-slug> --example blank --non-interactive
   cp ../logo.png ../mycelium-bg.js <NN-slug>/
   ```

   Or clone an existing step's scaffold (`cp -r 01-cli 06-openclaw`) — just
   remember to delete or ignore the inherited `renders/` directory.
3. Replace `<NN-slug>/index.html` with your composition. Keep the shared
   visual pattern: eyebrow → step title → centerpiece (terminal or chat box)
   → subhead. Use the brand tokens (`--accent`, `--purple`, etc.) — don't
   invent colors.
4. Lint + inspect + render + copy as above.
5. Add the entry to [`videos/manifest.json`](../../videos/manifest.json):

   ```json
   {
     "id": "06-openclaw",
     "title": "Wire up OpenClaw",
     "blurb": "...",
     "video": "videos/install/06-openclaw.mp4",
     "command": "mycelium adapter add openclaw"
   }
   ```

6. If you renumber existing steps, also rename their MP4s, their manifest
   `id`/`video` fields, and (optionally) their subdir under
   `mycelium-promo/install/` so things stay synced.

## Commit and push

```bash
cd ~/Documents/GitHub/hackathon
git add videos/install/<step>.mp4 videos/manifest.json
git commit -m "..."
git push origin main
```

GH Pages picks up the new MP4 within ~30s. Hard-reload (Cmd+Shift+R) since
browsers cache MP4s aggressively under the same filename.

## Conventions

- **Aspect** — always 1920×1080. The slide CSS uses `aspect-ratio: 16/9` so
  videos shrink to fit; HTML `width="1920" height="1080"` attrs prevent the
  intrinsic-size flash on load.
- **Length** — keep each step 6–10s. The hero overview is currently 7s and
  parks on the final frame (no fade-out, no loop attribute).
- **No audio** — compositions are silent; slideshow + hero videos are muted
  for autoplay. Don't add an audio track unless you explicitly want the user
  to unmute.
- **Brand assets** — `logo.png` and `mycelium-bg.js` are copied into every
  composition subdir. The background canvas (`#mycelium-bg`) is deterministic
  (mulberry32 PRNG), so renders are byte-stable.
- **Fonts** — Cormorant Garamond (italic display), IBM Plex Sans (body),
  Geist Mono (terminal/UI mono). Loaded via Google Fonts in each composition.
- **Visual style** — see existing compositions for the recipe. Don't reach
  for `#333` or `Roboto`; the HyperFrames `/hyperframes` skill enforces this
  via design tokens.

## Related

- `mycelium-promo/CLAUDE.md` — agent-facing rules for the HyperFrames project
- `mycelium-promo/skills/hyperframes/SKILL.md` — composition authoring guide
- `videos/manifest.json` — the source of truth for what shows in the slideshow
