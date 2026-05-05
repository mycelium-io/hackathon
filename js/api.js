// Thin wrapper around the Apps Script Web App endpoint.
// Uses fetch with no-cors fallback would lose responses, so we rely on the
// Apps Script doPost returning permissive CORS headers.

function getConfig() {
  return window.MYCELIUM_HACKATHON_CONFIG || {};
}

async function postToApi(payload) {
  const cfg = getConfig();
  if (!cfg.APPS_SCRIPT_URL) {
    console.warn("APPS_SCRIPT_URL not configured — payload not sent:", payload);
    return { ok: false, reason: "not_configured", payload };
  }

  const res = await fetch(cfg.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return await res.json();
}

function getSessionToken() {
  return sessionStorage.getItem("mycelium_session_token") || "";
}

function setSessionToken(t) {
  if (t) sessionStorage.setItem("mycelium_session_token", t);
}

window.MyceliumApi = { postToApi, getSessionToken, setSessionToken };
