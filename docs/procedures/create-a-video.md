# Create or update a video

Videos on the site (the landing-page hero, install slideshow steps, "What's
Next" preview teasers) are authored as **HyperFrames compositions** living
right here in this repo under [`compositions/`](../../compositions/),
rendered to MP4, then copied into [`videos/`](../../videos/) where the site
serves them.

```
hackathon/
  compositions/                     ← HyperFrames source (one project per video)
    overview/                       ← landing-page hero
    install/
      01-cli/  02-stack/  ...  10-next/
    preview/
      graph-explorer/
      supervisor/
  videos/                           ← rendered MP4s (what the site loads)
    overview.mp4
    install/01-cli.mp4  ...  10-next.mp4
    preview/graph-explorer.mp4  supervisor.mp4
    manifest.json                   ← drives the install slideshow + preview gallery
```

Each composition subdir is a self-contained HyperFrames project
(`index.html`, `hyperframes.json`, `meta.json`, `package.json`, plus copied
brand assets `logo.png` and `mycelium-bg.js`). HyperFrames renders
`index.html` to MP4.

## Prereqs

- Node.js ≥ 22 and ffmpeg (HyperFrames requirements)
- `npx hyperframes@0.4.41` is invoked on demand — no global install needed

## Touch the right files

The install slideshow and preview gallery are data-driven from
[`videos/manifest.json`](../../videos/manifest.json). Each entry points at an
MP4 under `videos/install/` or `videos/preview/` and supplies the title,
blurb, and optional command.

If you're changing copy/command/blurb only, edit the manifest and skip the
render.

If you're changing the video itself, you need to re-author the composition,
re-render, and re-copy the MP4.

## Edit, lint, inspect, render

From the relevant subdir under `compositions/`:

```bash
cd compositions/install/<step>      # or compositions/preview/<name> or compositions/overview

# Author / iterate
npx hyperframes@0.4.41 preview      # studio at http://localhost:3002

# Verify before rendering
npx hyperframes@0.4.41 lint         # must show 0 errors
npx hyperframes@0.4.41 inspect      # 0 layout issues across samples

# Render (≈ 5–15s depending on duration)
npx hyperframes@0.4.41 render
# → compositions/<...>/renders/<name>_<YYYY-MM-DD_HH-MM-SS>.mp4
```

Lint errors block the render. The most common one is
`gsap_infinite_repeat` from `repeat: -1` — replace it with a finite count
(`repeat: Math.floor(totalDuration / cycleDuration) - 1`).

## Copy the rendered MP4 into `videos/`

**Watch this gotcha:** if you scaffolded a new directory by `cp -r`ing an
existing one (e.g. `cp -r 01-cli 06-new-step`), the source `renders/`
folder came along, so the new project's `renders/` will contain stale
MP4s from the original. Always filter `find` by the project name prefix
so you grab the right file:

```bash
NAME=08-session-rounds
SECTION=install                     # or "preview"
src=$(find compositions/$SECTION/$NAME/renders \
        -name "${NAME}_*.mp4" -type f | sort | tail -1)
cp "$src" videos/$SECTION/$NAME.mp4
```

For the overview hero (landing page), the destination is `videos/overview.mp4`:

```bash
src=$(find compositions/overview/renders -name "overview_*.mp4" -type f | sort | tail -1)
cp "$src" videos/overview.mp4
```

## Adding a brand-new step or preview card

1. Pick the id — `NN-slug` (install) or just `slug` (preview).
2. Scaffold the subdir:

   ```bash
   cd compositions/install                     # or compositions/preview
   npx --yes hyperframes@0.4.41 init <slug> --example blank --non-interactive
   cp ../overview/logo.png ../overview/mycelium-bg.js <slug>/
   ```

   Or clone an existing project's scaffold (`cp -r 01-cli 06-new-step`) —
   just remember to delete the inherited `renders/` directory.
3. Replace `<slug>/index.html` with your composition. Keep the shared
   visual pattern: eyebrow → step title → centerpiece (terminal, chat box,
   or app frame) → subhead. Use the brand tokens (`--accent`, `--purple`,
   etc.) — don't invent colors.
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
   `compositions/install/` so everything stays in sync.

## Iterating on a sketch first

For ambitious vignettes, sketch the UX as a static interactive HTML page
under [`docs/sketches/`](../sketches/) before committing to an animated
HyperFrames composition. Examples:
[`graph-explorer.html`](../sketches/graph-explorer.html),
[`supervisor.html`](../sketches/supervisor.html). The sketch is much faster
to iterate on visually; once the layout and content lands, it ports cleanly
into a HyperFrames composition.

## Commit and push

```bash
git add compositions/<...>/ videos/<...>.mp4 videos/manifest.json
git commit -m "..."
git push origin main
```

GH Pages picks up the new MP4 within ~30s. Hard-reload (Cmd+Shift+R) since
browsers cache MP4s aggressively under the same filename.

## Conventions

- **Aspect** — always 1920×1080. The slide CSS uses `aspect-ratio: 16/9` so
  videos shrink to fit; HTML `width="1920" height="1080"` attrs prevent the
  intrinsic-size flash on load.
- **Length** — keep each install step 6–10s. Hero/preview vignettes can run
  20–35s. The hero overview parks on the final frame (no fade-out, no loop
  attribute).
- **No audio** — compositions are silent; slideshow + hero videos are muted
  for autoplay. Don't add an audio track unless you explicitly want the
  user to unmute.
- **Brand assets** — `logo.png` and `mycelium-bg.js` are copied into every
  composition subdir. The background canvas (`#mycelium-bg`) is
  deterministic (mulberry32 PRNG), so renders are byte-stable.
- **Fonts** — Cormorant Garamond (italic display), IBM Plex Sans (body),
  Geist Mono (terminal/UI mono). Loaded via Google Fonts in each
  composition.
- **Visual style** — see existing compositions for the recipe. Don't reach
  for `#333` or `Roboto`; the HyperFrames `/hyperframes` skill enforces
  this via design tokens.

## Related

- `compositions/<name>/CLAUDE.md` — agent-facing rules HyperFrames init
  drops into each new project
- `videos/manifest.json` — source of truth for what shows in the slideshow
  + preview gallery
- `docs/sketches/` — static sketches we iterate on before animating
