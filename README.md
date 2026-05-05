# Mycelium Hackathon Site

Static site that walks attendees through Mycelium, collects feedback, and previews
upcoming experiences. Hosted on GitHub Pages. See [DESIGN.md](DESIGN.md) for the why.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

No build step. Edit HTML/CSS/JS directly.

## Pages

- `index.html` — landing
- `install.html` — guided slideshow (steps from `videos/manifest.json`)
- `survey.html` — end-of-session feedback form
- `preview.html` — future-experiences gallery with per-card reactions

## Adding a slideshow step or preview card

1. Render an MP4 in the `mycelium-promo` repo using HyperFrames.
2. Drop it into `videos/install/<id>.mp4` or `videos/preview/<id>.mp4`.
3. Add an entry to `videos/manifest.json`.

## Backend (Google Apps Script)

See `apps-script/Code.gs` for the full handler. Setup:

1. Create a Google Sheet, copy its ID.
2. [script.google.com](https://script.google.com) → New project → paste `Code.gs`.
3. Project settings → Script properties:
   - `SHEET_ID` — the Sheet ID
   - `TURNSTILE_SECRET` — Cloudflare Turnstile secret key
   - `SESSION_HMAC_KEY` — any long random string
4. Deploy → New deployment → Web app, execute as Me, accessible to Anyone.
5. Copy the Web app URL into `config.js` as `APPS_SCRIPT_URL`.
6. Get a Turnstile site key from Cloudflare and put it in `config.js` as `TURNSTILE_SITE_KEY`.

Without `APPS_SCRIPT_URL` set, submissions log to the browser console and surface a
"dev mode" status — useful while iterating on UI.

## Deploy

GitHub Pages from the `main` branch root. Settings → Pages → Source: main / `/`.
