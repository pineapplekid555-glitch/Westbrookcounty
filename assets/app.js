const cfg = window.SITE_CONFIG || {};
const updates = window.UPDATES || [];
const $ = (selector, root = document) => root.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function init() {
  document.querySelectorAll("[data-site-name]").forEach(el => el.textContent = cfg.name || "Westbrook County");
  document.querySelectorAll("[data-footer-name]").forEach(el => el.textContent = cfg.name || "Westbrook County");
  document.querySelectorAll("[data-livery-link]").forEach(el => {
    el.href = cfg.links?.liveries || "#";
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });
  document.querySelectorAll("[data-roblox-link]").forEach(el => {
    el.href = cfg.links?.roblox || "#";
  });
  document.querySelectorAll("[data-discord-link]").forEach(el => {
    el.href = cfg.links?.discord || "#";
  });

  const year = $("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  if (cfg.hero) {
    const eyebrow = $("[data-hero-eyebrow]");
    const title = $("[data-hero-title]");
    const text = $("[data-hero-text]");
    const button = $("[data-hero-button]");
    if (eyebrow) eyebrow.textContent = cfg.hero.eyebrow || "";
    if (title) title.textContent = cfg.hero.title || "";
    if (text) text.textContent = cfg.hero.text || "";
    if (button) {
      button.textContent = cfg.hero.buttonText || "Learn more";
      button.href = cfg.hero.buttonLink || "#";
    }
  }

  const highlights = $("[data-highlights]");
  if (highlights) {
    highlights.innerHTML = (cfg.highlights || []).map((item, index) => `
      <article class="info-card">
        <div class="card-number">${String(index + 1).padStart(2, "0")}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </article>
    `).join("");
  }

  renderUpdates();
  setupMobileMenu();
  setupCountdown();
}

function renderUpdates() {
  document.querySelectorAll("[data-updates]").forEach(list => {
    if (!updates.length) {
      list.innerHTML = '<div class="empty-state">No updates have been posted yet.</div>';
      return;
    }

    const limit = list.dataset.limit ? Number(list.dataset.limit) : updates.length;
    list.innerHTML = updates.slice(0, limit).map((item, index) => `
      <article class="update-card">
        <div class="update-number">${String(index + 1).padStart(2, "0")}</div>
        ${item.image ? `
          <div class="update-image">
            <img src="${esc(item.image)}" alt="" loading="lazy">
          </div>
        ` : `
          <div class="update-image update-image-empty" aria-hidden="true">
            <span>WC</span>
          </div>
        `}
        <div class="update-body">
          <div class="update-meta">
            <span>${esc(item.date)}</span>
            ${item.tag ? `<span class="tag">${esc(item.tag)}</span>` : ""}
          </div>
          <h2>${esc(item.title)}</h2>
          ${Array.isArray(item.items) && item.items.length ? `
            <ul class="update-items">
              ${item.items.map(point => `<li>${esc(point)}</li>`).join("")}
            </ul>
          ` : item.text ? `<p>${esc(item.text)}</p>` : ""}
        </div>
      </article>
    `).join("");
  });
}

function setupMobileMenu() {
  const toggle = $(".menu-toggle");
  const nav = $(".site-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

function setupCountdown() {
  const wrap = $("[data-countdown]");
  if (!wrap || !cfg.releaseAt) return;

  const release = Date.parse(cfg.releaseAt);
  if (!Number.isFinite(release)) {
    console.error("Invalid SITE_CONFIG.releaseAt:", cfg.releaseAt);
    wrap.remove();
    return;
  }

  const hoursAfterRelease = Number(cfg.countdownHideAfterHours) || 24;
  const hideAt = release + hoursAfterRelease * 60 * 60 * 1000;

  const set = (selector, value) => {
    const el = $(selector, wrap);
    if (el) el.textContent = String(value).padStart(2, "0");
  };

  function tick() {
    const now = Date.now();

    if (now >= hideAt) {
      wrap.remove();
      return;
    }

    if (now >= release) {
      wrap.innerHTML = `
        <div class="countdown-released">
          <span class="live-dot"></span>
          <strong>Westbrook County is live.</strong>
        </div>
      `;
      return;
    }

    const remaining = release - now;
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    set("[data-days]", days);
    set("[data-hours]", hours);
    set("[data-minutes]", minutes);
    set("[data-seconds]", seconds);
  }

  tick();
  window.setInterval(tick, 1000);
}

document.addEventListener("DOMContentLoaded", init);
