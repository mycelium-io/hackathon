// Shared chrome (topnav + sectionnav) injected into every page.
// Keeps page HTML small and consistent.

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
  startMyceliumBg();
}

// Lightweight canvas background — single-layer, much smaller than the docs site.
// We keep the docs background's spirit (drifting points + faint connecting lines)
// without the full Physarum simulation.
function startMyceliumBg() {
  const canvas = document.getElementById("mycelium-bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, points;
  const COLORS = ["#5dd4e0", "#818cf8", "#c084fc"];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(80, Math.floor((w * h) / 20000));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }
  window.addEventListener("resize", resize);
  resize();

  function tick() {
    ctx.fillStyle = "rgba(12, 13, 16, 1)";
    ctx.fillRect(0, 0, w, h);
    for (const p of points) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 18000) {
          const alpha = 1 - d2 / 18000;
          ctx.strokeStyle = `rgba(93, 212, 224, ${alpha * 0.08})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of points) {
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }
  tick();
}

window.renderChrome = renderChrome;
