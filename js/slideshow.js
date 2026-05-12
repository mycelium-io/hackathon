// Install slideshow — loads videos/manifest.json, renders one slide at a time,
// keyboard nav, localStorage progress, mark-complete on last step.

const STORAGE_KEY = "mycelium_install_step";
const COMPLETE_KEY = "mycelium_install_complete";

let steps = [];
let current = 0;

async function loadManifest() {
  const res = await fetch("videos/manifest.json");
  const data = await res.json();
  steps = data.install || [];
}

function persist() {
  localStorage.setItem(STORAGE_KEY, String(current));
  if (current === steps.length - 1) {
    localStorage.setItem(COMPLETE_KEY, "1");
  }
}

function restore() {
  const saved = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (Number.isFinite(saved) && saved >= 0 && saved < steps.length) {
    current = saved;
  }
}

function highlightCmd(cmd) {
  // Trivial highlighter — bold the leading "mycelium" tokens.
  return cmd
    .split("\n")
    .map((line) => {
      const m = line.match(/^(mycelium(?:\s+\w+){0,2})(.*)$/);
      if (m) {
        return `<span class="cmd">${escapeHtml(m[1])}</span>${escapeHtml(m[2])}`;
      }
      return escapeHtml(line);
    })
    .join("\n");
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function render() {
  const container = document.getElementById("slides");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  container.innerHTML = "";
  steps.forEach((step, i) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (i === current ? " active" : "");
    const isLast = i === steps.length - 1;
    slide.innerHTML = `
      <div class="slide-step-label">Step ${i + 1} of ${steps.length}</div>
      <h1 class="slide-title">${escapeHtml(step.title)}</h1>
      <p class="slide-blurb">${escapeHtml(step.blurb)}</p>
      <video class="slide-video" src="${step.video}" controls autoplay muted playsinline preload="metadata"
             onerror="this.classList.add('placeholder'); this.outerHTML = '<div class=&quot;slide-video placeholder&quot;>video placeholder — ${escapeHtml(step.id)}.mp4</div>';"></video>
      ${
        step.command
          ? `<pre class="slide-cmd-block"><code>${highlightCmd(step.command)}</code></pre>`
          : ""
      }
      <details class="slide-stuck">
        <summary>Stuck? Give feedback</summary>
        <form class="slide-stuck-form" data-step-id="${escapeHtml(step.id)}" data-step-index="${i}">
          <textarea class="slide-stuck-text" name="text" placeholder="What's not working, what's confusing, what would you change?" required></textarea>
          <div class="slide-stuck-row">
            <button type="submit" class="slide-stuck-submit">Send</button>
            <span class="slide-stuck-status"></span>
          </div>
        </form>
      </details>
      ${isLast ? '<a class="slide-cta" href="survey.html">Give feedback →</a>' : ""}
    `;
    container.appendChild(slide);
  });

  container.querySelectorAll(".slide-stuck-form").forEach((form) => {
    form.addEventListener("submit", onStuckSubmit);
  });

  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === steps.length - 1;

  const pct = ((current + 1) / steps.length) * 100;
  document.getElementById("pg-bar").style.width = pct + "%";

  // Autoplay only the active slide's video. Pause + rewind everyone else
  // so when a slide is revisited it starts from the top.
  container.querySelectorAll(".slide").forEach((slide, i) => {
    const video = slide.querySelector("video");
    if (!video) return;
    if (i === current) {
      video.currentTime = 0;
      // play() may reject on first interaction; ignore — autoplay attr handles initial.
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  });

  persist();
}

function next() {
  if (current < steps.length - 1) {
    current++;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
function prev() {
  if (current > 0) {
    current--;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function onStuckSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const status = form.querySelector(".slide-stuck-status");
  const btn = form.querySelector(".slide-stuck-submit");
  const text = form.querySelector(".slide-stuck-text").value.trim();
  if (!text) return;

  btn.disabled = true;
  status.textContent = "Sending…";
  status.className = "slide-stuck-status";

  try {
    const res = await window.MyceliumApi.postToApi({
      kind: "install_stuck",
      payload: {
        step_id: form.dataset.stepId,
        step_index: parseInt(form.dataset.stepIndex, 10),
        text,
      },
    });
    if (res.ok === false && res.reason === "not_configured") {
      status.textContent = "Sent (dev mode — see console).";
      status.className = "slide-stuck-status success";
    } else if (res.ok) {
      status.textContent = "Thanks — got it.";
      status.className = "slide-stuck-status success";
      form.querySelector(".slide-stuck-text").value = "";
    } else {
      throw new Error(res.error || "unknown");
    }
  } catch (err) {
    status.textContent = "Send failed: " + err.message;
    status.className = "slide-stuck-status error";
    btn.disabled = false;
  }
}

async function init() {
  await loadManifest();
  if (!steps.length) {
    document.getElementById("slides").innerHTML =
      '<div class="slide active"><p class="slide-blurb">No steps configured. Check videos/manifest.json.</p></div>';
    return;
  }
  restore();
  render();

  document.getElementById("prev-btn").addEventListener("click", prev);
  document.getElementById("next-btn").addEventListener("click", next);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  });
}

window.addEventListener("DOMContentLoaded", init);
