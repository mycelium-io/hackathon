// Mycelial background canvas — ported verbatim from mycelium-io/mycelium docs/site.js.
// Two-layer simulation: tip-growth (Meškauskas et al.) builds a permanent network,
// then Physarum-style nutrient agents flow through it.
// Looks for #mycelium-bg in the DOM. If absent, bails silently.

(function() {
  const canvas = document.getElementById('mycelium-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ── Pixelated grid ──
  const CELL = 8;
  const cols = 480, rows = 270;
  // Two layers: structure (permanent network) and flow (nutrient transport)
  var structure = new Float32Array(cols * rows);  // permanent hypha map
  var trail = new Float32Array(cols * rows);       // animated nutrient flow
  var colorIdx = new Uint8Array(cols * rows);

  const BG = { r: 12, g: 13, b: 16 };
  const COLORS = [
    { r: 56, g: 189, b: 248 },   // cyan
    { r: 129, g: 140, b: 248 },   // indigo
    { r: 192, g: 132, b: 252 },   // purple
  ];

  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';

  var viewCols, viewRows;
  function resize() {
    viewCols = Math.min(Math.ceil(window.innerWidth / CELL), cols);
    viewRows = Math.min(Math.ceil(window.innerHeight / CELL), rows);
    canvas.width = viewCols;
    canvas.height = viewRows;
  }
  window.addEventListener('resize', resize);
  resize();

  // ══════════════════════════════════════════════════════════════════
  // LAYER 1: Tip-growth (Meškauskas et al.) — builds the network
  // ══════════════════════════════════════════════════════════════════

  const TIP_SPEED = 0.25;
  const BRANCH_PROB = 0.015;
  const BRANCH_ANGLE_MIN = 0.4;
  const BRANCH_ANGLE_MAX = 1.1;
  const WANDER = 0.1;
  const MAX_TIPS = 1200;

  var tips = [];

  function depositStructure(x, y, ci, gen) {
    var gx = Math.floor(x), gy = Math.floor(y);
    var strength = 0.5 / (1 + gen * 0.25);
    var radius = gen < 2 ? 1 : 0;
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        var px = gx + dx, py = gy + dy;
        if (px >= 0 && px < cols && py >= 0 && py < rows) {
          var idx = py * cols + px;
          var str = (dx === 0 && dy === 0) ? strength : strength * 0.4;
          structure[idx] = Math.min(1.0, structure[idx] + str);
          colorIdx[idx] = ci;
        }
      }
    }
  }

  function isOccupied(x, y) {
    var gx = Math.floor(x), gy = Math.floor(y);
    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return true;
    return structure[gy * cols + gx] > 0.2;
  }

  function seedColony(cx, cy, ci, n) {
    for (var i = 0; i < n; i++) {
      var angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
      tips.push({
        x: cx + Math.cos(angle) * 2,
        y: cy + Math.sin(angle) * 2,
        angle: angle, ci: ci, age: 0, gen: 0,
        maxAge: 1500 + Math.floor(Math.random() * 3000),
        speed: TIP_SPEED * (0.7 + Math.random() * 0.6),
      });
    }
    depositStructure(cx, cy, ci, 0);
  }

  function growStep() {
    var newTips = [];
    for (var i = tips.length - 1; i >= 0; i--) {
      var t = tips[i];
      t.age++;

      t.angle += (Math.random() - 0.5) * WANDER * 2;

      var nx = t.x + Math.cos(t.angle) * t.speed;
      var ny = t.y + Math.sin(t.angle) * t.speed;

      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || t.age > t.maxAge) {
        tips.splice(i, 1);
        continue;
      }

      if (t.age > 50 && isOccupied(nx, ny)) {
        depositStructure(nx, ny, t.ci, t.gen);
        tips.splice(i, 1);
        continue;
      }

      depositStructure(t.x, t.y, t.ci, t.gen);
      t.x = nx; t.y = ny;

      // Sporulation
      if (t.age > 300 && t.age % 150 === 0 && Math.random() < 0.12) {
        seedColony(t.x, t.y, t.ci, 2);
      }

      // Branching
      if (tips.length + newTips.length < MAX_TIPS && Math.random() < BRANCH_PROB && t.age > 10) {
        var bAngle = BRANCH_ANGLE_MIN + Math.random() * (BRANCH_ANGLE_MAX - BRANCH_ANGLE_MIN);
        var sign = Math.random() < 0.5 ? -1 : 1;
        newTips.push({
          x: t.x, y: t.y,
          angle: t.angle + sign * bAngle,
          ci: t.ci, age: 0, gen: t.gen + 1,
          maxAge: 600 + Math.floor(Math.random() * 1500),
          speed: t.speed * (0.75 + Math.random() * 0.25),
        });
      }
    }
    for (var j = 0; j < newTips.length; j++) {
      if (tips.length < MAX_TIPS) tips.push(newTips[j]);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYER 2: Nutrient agents (Physarum-style) — flow through network
  // ══════════════════════════════════════════════════════════════════

  var agents = [];
  const MAX_AGENTS = 600;
  const SENSOR_DIST = 6;
  const SENSOR_ANGLE = 0.6;

  function spawnAgentOnNetwork() {
    for (var attempt = 0; attempt < 20; attempt++) {
      var x = Math.random() * viewCols;
      var y = Math.random() * viewRows;
      var gx = Math.floor(x), gy = Math.floor(y);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && structure[gy * cols + gx] > 0.1) {
        agents.push({
          x: x, y: y,
          angle: Math.random() * Math.PI * 2,
          ci: colorIdx[gy * cols + gx],
          speed: 0.08 + Math.random() * 0.1,
        });
        return;
      }
    }
  }

  function senseTrail(ax, ay, angle, offset) {
    var sx = Math.floor(ax + Math.cos(angle + offset) * SENSOR_DIST);
    var sy = Math.floor(ay + Math.sin(angle + offset) * SENSOR_DIST);
    if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) return 0;
    return structure[sy * cols + sx] * 0.5 + trail[sy * cols + sx];
  }

  // ── PRE-WARM: Build the network before first render ──

  var numColonies = 15 + Math.floor(Math.random() * 8);
  for (var c = 0; c < numColonies; c++) {
    seedColony(
      15 + Math.random() * (viewCols - 30),
      15 + Math.random() * (viewRows - 30),
      Math.floor(Math.random() * COLORS.length),
      2 + Math.floor(Math.random() * 3)
    );
  }

  for (var warm = 0; warm < 4000; warm++) {
    growStep();
  }

  for (var a = 0; a < MAX_AGENTS; a++) {
    spawnAgentOnNetwork();
  }

  for (var warm = 0; warm < 200; warm++) {
    for (var i = 0; i < trail.length; i++) {
      trail[i] *= 0.995;
    }
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      var sL = senseTrail(a.x, a.y, a.angle, -SENSOR_ANGLE);
      var sC = senseTrail(a.x, a.y, a.angle, 0);
      var sR = senseTrail(a.x, a.y, a.angle, SENSOR_ANGLE);
      var turn = 0.08 + Math.random() * 0.06;
      if (sC >= sL && sC >= sR) a.angle += (Math.random() - 0.5) * 0.3;
      else if (sL > sR) a.angle -= turn;
      else a.angle += turn;
      a.x += Math.cos(a.angle) * a.speed;
      a.y += Math.sin(a.angle) * a.speed;
      if (a.x < 0) a.x += cols; if (a.x >= cols) a.x -= cols;
      if (a.y < 0) a.y += rows; if (a.y >= rows) a.y -= rows;
      var gx = Math.floor(a.x), gy = Math.floor(a.y);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        trail[gy * cols + gx] = Math.min(1.0, trail[gy * cols + gx] + 0.04);
      }
    }
  }

  // ── ANIMATION LOOP ──

  var lastFrame = 0;
  var frameInterval = 1000 / 20;

  function animate(timestamp) {
    requestAnimationFrame(animate);
    if (timestamp - lastFrame < frameInterval) return;
    lastFrame = timestamp;

    growStep();

    if (tips.length < 5) {
      var cx = 10 + Math.random() * (viewCols - 20);
      var cy = 10 + Math.random() * (viewRows - 20);
      seedColony(cx, cy, Math.floor(Math.random() * COLORS.length), 2 + Math.floor(Math.random() * 2));
    }

    for (var i = 0; i < trail.length; i++) {
      trail[i] *= 0.99;
      if (trail[i] < 0.005) trail[i] = 0;
    }

    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];

      var sL = senseTrail(a.x, a.y, a.angle, -SENSOR_ANGLE);
      var sC = senseTrail(a.x, a.y, a.angle, 0);
      var sR = senseTrail(a.x, a.y, a.angle, SENSOR_ANGLE);

      var turn = 0.08 + Math.random() * 0.06;
      if (sC >= sL && sC >= sR) {
        a.angle += (Math.random() - 0.5) * 0.3;
      } else if (sL > sR) {
        a.angle -= turn;
      } else {
        a.angle += turn;
      }

      a.x += Math.cos(a.angle) * a.speed;
      a.y += Math.sin(a.angle) * a.speed;

      if (a.x < 0) a.x += cols; if (a.x >= cols) a.x -= cols;
      if (a.y < 0) a.y += rows; if (a.y >= rows) a.y -= rows;

      var gx = Math.floor(a.x), gy = Math.floor(a.y);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && structure[gy * cols + gx] < 0.05) {
        for (var att = 0; att < 30; att++) {
          var rx = Math.floor(Math.random() * viewCols);
          var ry = Math.floor(Math.random() * viewRows);
          if (structure[ry * cols + rx] > 0.1) {
            a.x = rx; a.y = ry;
            a.angle = Math.random() * Math.PI * 2;
            a.ci = colorIdx[ry * cols + rx];
            gx = rx; gy = ry;
            break;
          }
        }
      }

      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        var idx = gy * cols + gx;
        trail[idx] = Math.min(1.0, trail[idx] + 0.04);
        colorIdx[idx] = a.ci;
      }
    }

    // ── Render ──
    ctx.fillStyle = 'rgb(' + BG.r + ',' + BG.g + ',' + BG.b + ')';
    ctx.fillRect(0, 0, viewCols, viewRows);

    var rw = Math.min(viewCols, cols);
    var rh = Math.min(viewRows, rows);
    for (var y = 0; y < rh; y++) {
      for (var x = 0; x < rw; x++) {
        var idx = y * cols + x;
        var sVal = structure[idx];
        var tVal = trail[idx];
        if (sVal < 0.01 && tVal < 0.01) continue;
        var c = COLORS[colorIdx[idx]];
        var alpha = sVal * 0.02 + tVal * 0.2;
        ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  requestAnimationFrame(animate);
})();
