// Survey form — renders Likert scales, collects answers, posts to Apps Script.

const CONCEPTS = [
  { id: "rooms", label: "Rooms" },
  { id: "sessions", label: "Sessions" },
  { id: "memory", label: "Memory" },
  { id: "cognitive_engine", label: "CognitiveEngine" },
  { id: "knowledge_graph", label: "Knowledge Graph" },
];

function buildLikert(name, min, max, labels, modifier = "") {
  const opts = [];
  for (let i = min; i <= max; i++) {
    opts.push(
      `<button type="button" class="likert-option" data-name="${name}" data-value="${i}">${i}</button>`,
    );
  }
  return `
    <div class="likert ${modifier}">${opts.join("")}</div>
    <div class="likert-scale-labels">
      <span>${labels[0]}</span>
      <span>${labels[1]}</span>
    </div>
  `;
}

function attachLikertHandlers() {
  document.querySelectorAll(".likert").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".likert-option");
      if (!btn) return;
      group
        .querySelectorAll(".likert-option")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

function getLikertValue(name) {
  const sel = document.querySelector(`.likert-option.selected[data-name="${name}"]`);
  return sel ? parseInt(sel.dataset.value, 10) : null;
}

function renderSurvey() {
  const root = document.getElementById("survey-root");
  root.innerHTML = `
    <h1>How did it go?</h1>
    <p class="lead">Tell us what worked, what didn't, and what was confusing. Takes about 3 minutes.</p>

    <form class="survey-form" id="survey-form">
      <div class="survey-section">
        <h2>Overall</h2>
        <div class="survey-section-blurb">How likely are you to recommend Mycelium to a colleague?</div>
        <div class="survey-field">
          ${buildLikert("nps", 0, 10, ["Not at all (0)", "Definitely (10)"], "likert-nps")}
        </div>
        <div class="survey-field">
          <label for="overall_text">What stood out — good or bad?</label>
          <textarea class="survey-textarea" id="overall_text" name="overall_text"></textarea>
        </div>
      </div>

      <div class="survey-section">
        <h2>Concept clarity</h2>
        <div class="survey-section-blurb">How clear was each concept by the end of the walkthrough? (1 = confusing, 5 = clear)</div>
        ${CONCEPTS.map(
          (c) => `
          <div class="survey-field">
            <label>${c.label}</label>
            ${buildLikert("concept_" + c.id, 1, 5, ["Confusing", "Clear"])}
            <textarea class="survey-textarea" name="concept_${c.id}_notes" placeholder="(optional notes on ${c.label.toLowerCase()})"></textarea>
          </div>
        `,
        ).join("")}
      </div>

      <div class="survey-section">
        <h2>Flow</h2>
        <div class="survey-field">
          <label for="flow_stuck">Where did you get stuck, if anywhere?</label>
          <textarea class="survey-textarea" id="flow_stuck" name="flow_stuck"></textarea>
        </div>
        <div class="survey-field">
          <label for="flow_broke">Did anything break or behave unexpectedly?</label>
          <textarea class="survey-textarea" id="flow_broke" name="flow_broke"></textarea>
        </div>
        <div class="survey-field">
          <label for="flow_order">Was the order of steps right?</label>
          ${buildLikert("flow_order", 1, 5, ["Wrong order", "Right order"])}
        </div>
      </div>

      <div class="survey-section">
        <h2>Identity (optional)</h2>
        <div class="survey-field">
          <label for="github_handle">GitHub handle</label>
          <input class="survey-input" type="text" id="github_handle" name="github_handle" placeholder="(optional)">
          <span class="hint">Leave blank to stay anonymous.</span>
        </div>
        <label class="consent">
          <input type="checkbox" id="consent" name="consent">
          <span>Responses are stored in a Google Sheet owned by the Mycelium team. We don't log IPs. If you provide a GitHub handle, we'll attribute your feedback to it. You can submit anonymously by leaving the handle blank.</span>
        </label>
      </div>

      <div id="turnstile-container"></div>

      <div class="survey-nav">
        <button type="button" class="survey-back" id="survey-back">← Back</button>
        <div class="survey-progress" id="survey-progress"></div>
        <button type="button" class="survey-next" id="survey-next">Continue →</button>
        <button type="submit" class="submit-btn" id="submit-btn" hidden>Submit feedback</button>
      </div>
      <span class="form-status" id="form-status"></span>
    </form>
  `;

  attachLikertHandlers();
  document.getElementById("survey-form").addEventListener("submit", onSubmit);
  initProgressive();
  mountTurnstile();
}

let currentStep = 0;
let totalSteps = 0;

function initProgressive() {
  const sections = document.querySelectorAll(".survey-section");
  totalSteps = sections.length;
  sections.forEach((s, i) => {
    s.dataset.step = i;
    s.hidden = i !== 0;
  });
  document.getElementById("survey-back").addEventListener("click", () => goStep(currentStep - 1));
  document.getElementById("survey-next").addEventListener("click", () => goStep(currentStep + 1));
  updateNav();
}

function goStep(n) {
  if (n < 0 || n >= totalSteps) return;
  document.querySelectorAll(".survey-section").forEach((s) => {
    s.hidden = parseInt(s.dataset.step, 10) !== n;
  });
  currentStep = n;
  updateNav();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateNav() {
  const back = document.getElementById("survey-back");
  const next = document.getElementById("survey-next");
  const submit = document.getElementById("submit-btn");
  const progress = document.getElementById("survey-progress");
  const isLast = currentStep === totalSteps - 1;
  back.hidden = currentStep === 0;
  next.hidden = isLast;
  submit.hidden = !isLast;
  progress.textContent = `Step ${currentStep + 1} of ${totalSteps}`;
  document.getElementById("turnstile-container").hidden = !isLast;
}

let turnstileToken = "";

function mountTurnstile() {
  const cfg = window.MYCELIUM_HACKATHON_CONFIG || {};
  const container = document.getElementById("turnstile-container");
  if (!cfg.TURNSTILE_SITE_KEY) {
    container.innerHTML =
      '<div class="form-status">Turnstile site key not configured — bypassing in dev.</div>';
    turnstileToken = "DEV_BYPASS";
    return;
  }
  // Cloudflare Turnstile script auto-renders when present.
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
  container.innerHTML = `<div class="cf-turnstile" data-sitekey="${cfg.TURNSTILE_SITE_KEY}" data-callback="onTurnstileToken"></div>`;
  window.onTurnstileToken = (t) => {
    turnstileToken = t;
  };
}

async function onSubmit(e) {
  e.preventDefault();
  const status = document.getElementById("form-status");
  const btn = document.getElementById("submit-btn");

  if (!document.getElementById("consent").checked) {
    status.textContent = "Please acknowledge the consent line.";
    status.className = "form-status error";
    return;
  }
  if (!turnstileToken) {
    status.textContent = "Please complete the verification.";
    status.className = "form-status error";
    return;
  }

  const form = e.target;
  const fd = new FormData(form);
  const payload = {
    nps: getLikertValue("nps"),
    overall_text: fd.get("overall_text") || "",
    flow_stuck: fd.get("flow_stuck") || "",
    flow_broke: fd.get("flow_broke") || "",
    flow_order: getLikertValue("flow_order"),
    github_handle: (fd.get("github_handle") || "").trim(),
    concepts: {},
  };
  for (const c of CONCEPTS) {
    payload.concepts[c.id] = {
      score: getLikertValue("concept_" + c.id),
      notes: fd.get("concept_" + c.id + "_notes") || "",
    };
  }

  btn.disabled = true;
  status.textContent = "Submitting...";
  status.className = "form-status";

  try {
    const res = await window.MyceliumApi.postToApi({
      kind: "survey",
      turnstileToken,
      payload,
    });
    if (res.ok === false && res.reason === "not_configured") {
      status.textContent = "Submitted (dev mode — see console).";
      status.className = "form-status success";
    } else if (res.ok) {
      window.MyceliumApi.setSessionToken(res.sessionToken);
      status.textContent = "Thanks. Want to react to upcoming experiences? →";
      status.className = "form-status success";
      status.innerHTML += ' <a href="preview.html">Preview gallery</a>';
    } else {
      throw new Error(res.error || "unknown");
    }
  } catch (err) {
    status.textContent = "Submit failed: " + err.message;
    status.className = "form-status error";
    btn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", renderSurvey);
