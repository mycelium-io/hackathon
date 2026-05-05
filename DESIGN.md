# Mycelium Hackathon Site — Design Doc

A static, single-page-ish site hosted on GitHub Pages that walks hackathon attendees through installing and using Mycelium, collects end-of-session feedback, and previews future experiences for reactions/comments.

## Goals

1. **Try** — a guided slideshow that takes a new user from zero to a working Mycelium install with rooms, memory, and a session.
2. **Survey** — collect structured feedback at the end (Likert + free-text + per-concept reactions).
3. **Preview** — show 30-second teasers of future Mycelium experiences and capture reactions/comments per teaser.

Non-goals: live verification of user steps, embedded terminals, account systems, real-time multi-user features.

## Stack

| Layer       | Choice                                              | Why                                                                 |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Hosting     | GitHub Pages (this repo, `gh-pages` or `/docs`)     | Free, static, matches mycelium docs                                 |
| Frontend    | Plain HTML/CSS/JS, ported `mycelium.css` tokens     | No build step, no framework lock-in, matches `mycelium/docs` look   |
| Videos      | Pre-rendered MP4s committed to repo (`videos/`)     | Authored in `mycelium-promo` (HyperFrames), copied here as artifacts |
| API         | Google Apps Script Web App → Google Sheet          | Zero infra, free, Sheet doubles as "internal datastore"             |
| Anti-spam   | Cloudflare Turnstile                                | Free, better UX than reCAPTCHA, privacy-friendly                    |
| Analytics   | None (deliberate — survey *is* the analytics)       |                                                                     |

## Information architecture

Three routes, all client-side (hash-based to keep GH Pages happy):

- `#/` — landing + sectionnav, mirrors mycelium docs chrome
- `#/install/<step>` — guided slideshow, steps 1..N
- `#/survey` — end-of-session form
- `#/preview` — future-experiences gallery with per-card reactions

Sectionnav: `LEARN · SURVEY · PREVIEW` (matching the mycelium docs three-tab pattern).

## Page 1 — Install (`#/install`)

Single-rail slideshow. One step per screen. Each step has:

- A short heading (e.g., "Install the CLI")
- A 15–60s pre-rendered MP4 (autoplays muted, with controls)
- A copy-able command block (uses the `.install-block` + `.install-copy-btn` pattern from `mycelium.css`)
- Prev / Next buttons; keyboard ←/→
- Progress bar at the bottom (mirrors the `#pg-bar` from `stories.html`)

**Tentative steps** (1 video each, authored in mycelium-promo):

1. What is Mycelium? (overview teaser)
2. Install the CLI (`curl ... install.sh | bash`)
3. Run `mycelium install` (Docker stack comes up)
4. Create your first room
5. Write a memory
6. Search by meaning
7. Run `mycelium catchup`
8. Spawn a session, join, await consensus
9. Where to go next (links to docs, adapters)

State: stored in `localStorage` so a refresh resumes at the same step. No verification.

## Page 2 — Survey (`#/survey`)

One form, end-of-session. Sections:

1. **Overall** — NPS-style 0–10, free-text "what stood out"
2. **Per-concept clarity** — Likert (1=confusing, 5=clear) for: rooms, sessions, memory, CognitiveEngine, knowledge graph. Optional free-text per concept.
3. **Flow** — "Was the install order right?", "Where did you get stuck?", "Did anything break?"
4. **Identity (optional)** — GitHub handle, with a checkbox: *"Yes, you can attribute my feedback to this handle. We won't store your IP or any other identifier."*
5. Turnstile widget, then submit.

On submit: POST JSON to the Apps Script endpoint. Show a thank-you screen with a link to the preview page.

## Page 3 — Preview (`#/preview`)

Card grid (mirrors `.card-grid` from `mycelium.css`). Each card:

- Title + 1-line description
- 30s autoplay-muted MP4 (clickable to fullscreen)
- React row: 👍 / 🤔 / 👎 (or "yes please" / "maybe" / "no thanks" — bikeshed later)
- Optional comment textarea, submit button per card
- Subtle "✓ recorded" state on submit

Each reaction is a separate POST (so users can react to N cards without submitting a single huge form). Same Turnstile token can be reused within a session — Apps Script verifies it server-side once, then accepts subsequent posts with a session token we issue.

## Backend — Google Apps Script

Single `doPost(e)` handler routing on a `kind` field:

```
{ kind: "survey", payload: {...}, turnstileToken: "..." }
{ kind: "preview_react", cardId: "...", reaction: "...", comment: "...", sessionToken: "..." }
```

Logic:

1. Verify Turnstile token via `UrlFetchApp` to `challenges.cloudflare.com/turnstile/v0/siteverify`.
2. On success for a `survey` post, mint a short-lived session token (HMAC of timestamp + secret), return it in the response so the client can use it for follow-up `preview_react` posts without re-solving Turnstile.
3. Append a row to the appropriate sheet tab (`survey`, `preview_reacts`).
4. Return `{ ok: true }` with permissive CORS headers (`Access-Control-Allow-Origin: *` is fine — there's no auth to leak).

Schema (Sheet tabs):

- `survey`: timestamp, nps, concept_rooms, concept_sessions, ..., flow_stuck, flow_broke, github_handle, raw_json
- `preview_reacts`: timestamp, card_id, reaction, comment, session_token, github_handle (if linked)

Secrets (Turnstile secret key, HMAC key) live in Apps Script's `PropertiesService`.

## Privacy / consent

- One consent line on the survey: "Responses are stored in a Google Sheet owned by the Mycelium team. We don't log IPs. Providing your GitHub handle is optional and means you're OK being attributed."
- No cookies beyond `localStorage` for slideshow progress.
- No analytics scripts.

## Repo layout

```
hackathon/
  index.html                  # router shell + landing
  install.html                # slideshow shell (or rendered from a single SPA)
  survey.html
  preview.html
  styles/
    mycelium.css              # ported from mycelium/docs (tokens, topnav, cards)
    site.css                  # hackathon-specific
  js/
    router.js                 # tiny hash router
    slideshow.js              # next/prev, localStorage, keyboard
    survey.js                 # form → Apps Script
    preview.js                # per-card react → Apps Script
    turnstile.js              # widget glue
  videos/
    install/01-overview.mp4
    install/02-cli.mp4
    ...
    preview/agent-mesh.mp4
    ...
  videos/manifest.json        # step list + preview cards as data
  config.js                   # APPS_SCRIPT_URL, TURNSTILE_SITE_KEY (public)
  DESIGN.md                   # this file
```

`videos/manifest.json` is the single source of truth for what shows up in install and preview pages. Adding a step or a preview card = add a video + edit JSON.

## Authoring videos in `mycelium-promo`

Videos are authored as HyperFrames compositions in the mycelium-promo repo (existing design tokens, brand). Workflow:

1. Author composition in `mycelium-promo/compositions/<step>.html`.
2. `npm run render` → MP4 in `mycelium-promo/out/`.
3. Copy MP4 into `hackathon/videos/<section>/<step>.mp4` (or use a small script).
4. Update `hackathon/videos/manifest.json` and commit.

We don't symlink or git-submodule the MP4s — keep this repo self-contained so GH Pages just works.

## Open questions for later

- Domain? `mycelium-io.github.io/hackathon/` is fine for v1.
- Do we want a "live during the event" leaderboard or counter ("47 people have completed step 5") — would need a tiny pull endpoint, easy to add to Apps Script.
- Should the install slideshow gate the survey link until the user reaches the last step? (Probably yes — soft gate via localStorage, not a hard block.)
- Reaction taxonomy on preview cards — emoji vs words. Defer to first-pass UX.

## Build order (suggested)

1. Port `mycelium.css` + topnav/sectionnav chrome → render a static landing page.
2. Slideshow shell with placeholder MP4s and a hardcoded manifest of 3 steps. Get keyboard nav, progress bar, localStorage working.
3. Survey form (no backend yet) — render and validate locally.
4. Apps Script + Sheet, plumb survey submit, Turnstile.
5. Preview gallery, per-card react flow.
6. Swap placeholder videos for real renders from mycelium-promo.
7. Deploy to GH Pages.
