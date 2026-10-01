(() => {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const updates = Array.isArray(window.UPDATES) ? window.UPDATES : [];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

  function applySiteConfig() {
    $$("[data-site-name]").forEach(el => el.textContent = cfg.name || "Westbrook County");
    $$("[data-footer-name]").forEach(el => el.textContent = cfg.name || "Westbrook County");
    $$("[data-livery-link]").forEach(el => {
      el.href = cfg.links?.liveries || "#";
      el.target = "_blank";
      el.rel = "noopener";
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
        button.textContent = cfg.hero.buttonText || "View updates";
        button.href = cfg.hero.buttonLink || "pages/updates.html";
      }
    }

    const highlights = $("[data-highlights]");
    if (highlights) {
      highlights.innerHTML = (cfg.highlights || []).map((item, index) => `
        <article class="info-card">
          <span class="card-number">${String(index + 1).padStart(2, "0")}</span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.text)}</p>
        </article>
      `).join("");
    }
  }

  function renderUpdates() {
    const list = $("[data-updates]");
    if (!list) return;

    if (!updates.length) {
      list.innerHTML = `<div class="empty-state">No updates have been posted yet.</div>`;
      return;
    }

    list.innerHTML = updates.map(update => {
      const image = update.image
        ? `<div class="update-image"><img src="${esc(update.image)}" alt="" loading="lazy"></div>`
        : "";

      const items = Array.isArray(update.items)
        ? update.items.map(item => `<li>${esc(item)}</li>`).join("")
        : "";

      return `
        <article class="update-card">
          ${image}
          <div class="update-content">
            <div class="update-meta">
              <span>${esc(update.date)}</span>
              ${update.tag ? `<span class="tag">${esc(update.tag)}</span>` : ""}
            </div>
            <h2>${esc(update.title)}</h2>
            ${items ? `<ul class="update-list">${items}</ul>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function initNavigation() {
    const toggle = $(".menu-toggle");
    const nav = $(".site-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  function initCountdown() {
    const wrap = $("[data-countdown]");
    if (!wrap || !cfg.releaseAt) return;

    // Parse the explicit timezone in the config. This is independent
    // of the visitor's local computer timezone.
    const release = Date.parse(cfg.releaseAt);

    if (!Number.isFinite(release)) {
      console.error("Invalid releaseAt:", cfg.releaseAt);
      wrap.hidden = true;
      return;
    }

    const hours = Number(cfg.countdownHideAfterHours);
    const hideAfter = release + (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600000;

    const daysEl = $("[data-days]", wrap);
    const hoursEl = $("[data-hours]", wrap);
    const minutesEl = $("[data-minutes]", wrap);
    const secondsEl = $("[data-seconds]", wrap);

    const set = (el, value) => {
      if (el) el.textContent = String(value).padStart(2, "0");
    };

    const tick = () => {
      const now = Date.now();

      if (now >= hideAfter) {
        wrap.remove();
        return;
      }

      if (now >= release) {
        wrap.innerHTML = `
          <div class="countdown-live">
            <span class="live-dot"></span>
            <strong>Westbrook County is live.</strong>
          </div>
        `;
        return;
      }

      const remaining = release - now;
      set(daysEl, Math.floor(remaining / 86400000));
      set(hoursEl, Math.floor((remaining % 86400000) / 3600000));
      set(minutesEl, Math.floor((remaining % 3600000) / 60000));
      set(secondsEl, Math.floor((remaining % 60000) / 1000));
    };

    tick();
    window.setInterval(tick, 1000);
  }

  function markActiveNav() {
    const current = location.pathname.replace(/\/+$/, "") || "/";
    $$("[data-nav]").forEach(link => {
      const target = new URL(link.href, location.href).pathname.replace(/\/+$/, "") || "/";
      if (target === current) link.classList.add("active");
    });
  }

  function init() {
    applySiteConfig();
    renderUpdates();
    initNavigation();
    initCountdown();
    markActiveNav();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
