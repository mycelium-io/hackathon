// Preview gallery — loads cards from manifest, posts a reaction per card.

async function loadManifest() {
  const res = await fetch("videos/manifest.json");
  const data = await res.json();
  return data.preview || [];
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderCards(cards) {
  const grid = document.getElementById("preview-grid");
  grid.innerHTML = cards
    .map(
      (card) => `
    <div class="preview-card" data-card-id="${escapeHtml(card.id)}">
      <video src="${escapeHtml(card.video)}" controls muted preload="metadata" playsinline
             onerror="this.outerHTML = '<div class=&quot;preview-video-placeholder&quot;>video placeholder — ${escapeHtml(card.id)}.mp4</div>';"></video>
      <div class="preview-body">
        <div class="preview-title">${escapeHtml(card.title)}</div>
        <div class="preview-desc">${escapeHtml(card.description)}</div>
        <div class="react-row">
          <button type="button" class="react-btn" data-reaction="want">Want this</button>
          <button type="button" class="react-btn" data-reaction="curious">Curious</button>
          <button type="button" class="react-btn" data-reaction="skip">Skip</button>
        </div>
        <textarea class="preview-comment" placeholder="(optional comment)"></textarea>
        <button type="button" class="preview-submit">Submit reaction</button>
      </div>
    </div>
  `,
    )
    .join("");

  grid.querySelectorAll(".preview-card").forEach(wireCard);
}

function wireCard(card) {
  const reactBtns = card.querySelectorAll(".react-btn");
  reactBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      reactBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  const submit = card.querySelector(".preview-submit");
  submit.addEventListener("click", async () => {
    const selected = card.querySelector(".react-btn.selected");
    if (!selected) {
      submit.textContent = "Pick a reaction first";
      setTimeout(() => (submit.textContent = "Submit reaction"), 1800);
      return;
    }
    const cardId = card.dataset.cardId;
    const reaction = selected.dataset.reaction;
    const comment = card.querySelector(".preview-comment").value || "";

    submit.disabled = true;
    submit.textContent = "Submitting...";
    try {
      const res = await window.MyceliumApi.postToApi({
        kind: "preview_react",
        sessionToken: window.MyceliumApi.getSessionToken() || "",
        cardId,
        reaction,
        comment,
      });
      if (res.ok === false && res.reason === "not_configured") {
        submit.textContent = "✓ recorded (dev)";
        submit.classList.add("recorded");
      } else if (res.ok) {
        submit.textContent = "✓ recorded";
        submit.classList.add("recorded");
      } else {
        throw new Error(res.error || "unknown");
      }
    } catch (err) {
      submit.disabled = false;
      submit.textContent = "Failed — retry";
      console.error(err);
    }
  });
}

async function init() {
  const cards = await loadManifest();
  if (!cards.length) {
    document.getElementById("preview-grid").innerHTML =
      "<p>No previews configured yet.</p>";
    return;
  }
  renderCards(cards);
}

window.addEventListener("DOMContentLoaded", init);
