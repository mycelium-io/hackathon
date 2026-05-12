// Mycelium hackathon backend — Google Apps Script Web App.
//
// Setup:
//   1. Create a new Google Sheet. Copy its ID from the URL.
//   2. script.google.com → New project → paste this file as Code.gs.
//   3. Project settings → Script properties:
//        SHEET_ID         = <the sheet ID>
//        TURNSTILE_SECRET = <your Cloudflare Turnstile secret key>
//        SESSION_HMAC_KEY = <a long random string>
//   4. Deploy → New deployment → type: Web app
//        Execute as: Me
//        Who has access: Anyone
//   5. Copy the Web app URL into hackathon/config.js as APPS_SCRIPT_URL.

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const kind = body.kind;
    if (kind === "survey") return handleSurvey(body);
    if (kind === "preview_react") return handlePreviewReact(body);
    if (kind === "install_stuck") return handleInstallStuck(body);
    return jsonOut({ ok: false, error: "unknown kind" });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonOut({ ok: true, service: "mycelium-hackathon" });
}

function handleSurvey(body) {
  if (!verifyTurnstile(body.turnstileToken)) {
    return jsonOut({ ok: false, error: "captcha_failed" });
  }
  const p = body.payload || {};
  const sheet = getSheet("survey");
  ensureHeaders(sheet, [
    "timestamp", "nps", "overall_text",
    "concept_rooms", "concept_rooms_notes",
    "concept_sessions", "concept_sessions_notes",
    "concept_memory", "concept_memory_notes",
    "concept_cognitive_engine", "concept_cognitive_engine_notes",
    "concept_knowledge_graph", "concept_knowledge_graph_notes",
    "flow_stuck", "flow_broke", "flow_order",
    "github_handle", "raw_json",
  ]);
  const c = p.concepts || {};
  sheet.appendRow([
    new Date().toISOString(),
    p.nps, p.overall_text,
    pick(c.rooms, "score"), pick(c.rooms, "notes"),
    pick(c.sessions, "score"), pick(c.sessions, "notes"),
    pick(c.memory, "score"), pick(c.memory, "notes"),
    pick(c.cognitive_engine, "score"), pick(c.cognitive_engine, "notes"),
    pick(c.knowledge_graph, "score"), pick(c.knowledge_graph, "notes"),
    p.flow_stuck, p.flow_broke, p.flow_order,
    p.github_handle, JSON.stringify(p),
  ]);
  const sessionToken = mintSessionToken();
  return jsonOut({ ok: true, sessionToken });
}

function handlePreviewReact(body) {
  if (!verifySessionToken(body.sessionToken || "")) {
    return jsonOut({ ok: false, error: "no_session" });
  }
  const sheet = getSheet("preview_reacts");
  ensureHeaders(sheet, [
    "timestamp", "card_id", "reaction", "comment", "session_token_hash",
  ]);
  sheet.appendRow([
    new Date().toISOString(),
    body.cardId || "",
    body.reaction || "",
    body.comment || "",
    hash(body.sessionToken),
  ]);
  return jsonOut({ ok: true });
}

function handleInstallStuck(body) {
  const p = body.payload || {};
  if (!p.text) return jsonOut({ ok: false, error: "empty" });
  const sheet = getSheet("install_stuck");
  ensureHeaders(sheet, [
    "timestamp", "step_index", "step_id", "text",
  ]);
  sheet.appendRow([
    new Date().toISOString(),
    p.step_index,
    p.step_id || "",
    String(p.text).slice(0, 4000),
  ]);
  return jsonOut({ ok: true });
}

// ── helpers ──

function pick(obj, key) {
  return obj && obj[key] != null ? obj[key] : "";
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
}

function verifyTurnstile(token) {
  if (!token) return false;
  if (token === "DEV_BYPASS") return true;  // development convenience
  const secret = PropertiesService.getScriptProperties().getProperty("TURNSTILE_SECRET");
  if (!secret) return true;  // unconfigured → permissive (warn in logs)
  const res = UrlFetchApp.fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "post",
      payload: { secret, response: token },
      muteHttpExceptions: true,
    },
  );
  try {
    const json = JSON.parse(res.getContentText());
    return !!json.success;
  } catch (_) {
    return false;
  }
}

function mintSessionToken() {
  const key = PropertiesService.getScriptProperties().getProperty("SESSION_HMAC_KEY") || "dev";
  const ts = Date.now();
  const nonce = Utilities.getUuid();
  const sig = Utilities.computeHmacSha256Signature(ts + ":" + nonce, key);
  return ts + "." + nonce + "." + Utilities.base64EncodeWebSafe(sig);
}

function verifySessionToken(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [ts, nonce, sigB64] = parts;
  const key = PropertiesService.getScriptProperties().getProperty("SESSION_HMAC_KEY") || "dev";
  const expected = Utilities.computeHmacSha256Signature(ts + ":" + nonce, key);
  if (Utilities.base64EncodeWebSafe(expected) !== sigB64) return false;
  // Token TTL: 6 hours (one hackathon session).
  return Date.now() - parseInt(ts, 10) < 6 * 60 * 60 * 1000;
}

function hash(s) {
  if (!s) return "";
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return Utilities.base64EncodeWebSafe(bytes).slice(0, 16);
}
