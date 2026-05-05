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
  const counter = document.getElementById("slide-counter");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const surveyBtn = document.getElementById("survey-btn");

  container.innerHTML = "";
  steps.forEach((step, i) => {
    const slide = document.createElement("div");
    slide.className = "slide" + (i === current ? " active" : "");
    slide.innerHTML = `
      <div class="slide-step-label">Step ${i + 1} of ${steps.length}</div>
      <h1 class="slide-title">${escapeHtml(step.title)}</h1>
      <p class="slide-blurb">${escapeHtml(step.blurb)}</p>
      <video class="slide-video" src="${step.video}" controls preload="metadata" muted playsinline
             onerror="this.classList.add('placeholder'); this.outerHTML = '<div class=&quot;slide-video placeholder&quot;>video placeholder — ${escapeHtml(step.id)}.mp4</div>';"></video>
      ${
        step.command
          ? `<pre class="slide-cmd-block"><code>${highlightCmd(step.command)}</code></pre>`
          : ""
      }
    `;
    container.appendChild(slide);
  });

  counter.textContent = `${current + 1} / ${steps.length}`;
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === steps.length - 1;
  surveyBtn.style.display = current === steps.length - 1 ? "inline-block" : "none";

  const pct = ((current + 1) / steps.length) * 100;
  document.getElementById("pg-bar").style.width = pct + "%";

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
