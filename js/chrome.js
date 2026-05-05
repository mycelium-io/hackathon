// Shared chrome (topnav + sectionnav + bg canvas) injected into every page.
// The actual simulation lives in js/mycelium-bg.js — load it after this file
// so the #mycelium-bg canvas exists when its IIFE runs.

const PAGES = [
  { id: "install", file: "install.html", label: "INSTALL" },
  { id: "survey", file: "survey.html", label: "SURVEY" },
  { id: "preview", file: "preview.html", label: "PREVIEW" },
];

function renderChrome(activeId) {
  const sectionLinks = PAGES.map(
    (p) =>
      `<a href="${p.file}" class="${p.id === activeId ? "active" : ""}"><span class="square-dot"></span>${p.label}</a>`,
  ).join("\n    ");

  const html = `
<canvas id="mycelium-bg"></canvas>
<nav class="topnav">
  <a href="index.html" class="topnav-cell topnav-brand">
    <img src="logo.png" alt="Mycelium">
    <span class="brand-word">mycelium</span>
  </a>
  <span class="topnav-cell topnav-page-cell">
    <span class="caps-mono">HACKATHON</span>
  </span>
  <div class="topnav-right">
    <a href="https://mycelium-io.github.io/mycelium/" target="_blank">DOCS ↗</a>
    <a href="https://github.com/mycelium-io/mycelium" aria-label="GitHub">GitHub</a>
  </div>
</nav>
<nav class="sectionnav">
  <div class="sectionnav-inner">
    ${sectionLinks}
  </div>
</nav>
`;

  document.body.insertAdjacentHTML("afterbegin", html);
}

window.renderChrome = renderChrome;
