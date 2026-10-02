(() => {
  "use strict";
  const site = window.WESTBROOK || {};
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  function links() {
    $$("[data-discord]").forEach(a => { a.href = site.links?.discord || "#"; });
    $$("[data-roblox]").forEach(a => { a.href = site.links?.roblox || "#"; });
    $$("[data-liveries]").forEach(a => { a.href = site.links?.liveries || "#"; });
    $$("[data-year]").forEach(e => e.textContent = new Date().getFullYear());
    const tagline = $("[data-tagline]");
    if (tagline) tagline.textContent = site.tagline || "";
  }

  function nav() {
    const button = $(".nav-toggle"), nav = $(".nav");
    if (!button || !nav) return;
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
    $$("[data-nav]").forEach(a => {
      const target = new URL(a.href, location.href).pathname.replace(/\/+$/, "") || "/";
      const here = location.pathname.replace(/\/+$/, "") || "/";
      if (target === here) a.classList.add("active");
    });
  }

  function features() {
    const box = $("[data-features]");
    if (!box) return;
    box.innerHTML = (site.features || []).map(x => `
      <article class="feature-card">
        <span>${esc(x.number)}</span>
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.text)}</p>
      </article>`).join("");
  }

  function updates() {
    const box = $("[data-updates]");
    if (!box) return;
    box.innerHTML = (site.updates || []).map(x => `
      <article class="update">
        ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : ""}
        <div class="update-body">
          <div class="update-meta"><span>${esc(x.date)}</span>${x.tag ? `<b>${esc(x.tag)}</b>` : ""}</div>
          <h2>${esc(x.title)}</h2>
          <ul>${(x.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul>
        </div>
      </article>`).join("");
  }

  function countdown() {
    const box = $("[data-countdown]");
    if (!box || !site.releaseAt) return;
    const release = Date.parse(site.releaseAt);
    if (!Number.isFinite(release)) return;
    const hideAt = release + (Number(site.countdownHideAfterHours) || 24) * 3600000;
    const set = (s,v) => { const e=$(s,box); if(e)e.textContent=String(v).padStart(2,"0"); };

    function tick() {
      const now = Date.now();
      if (now >= hideAt) { box.remove(); return; }
      if (now >= release) {
        box.innerHTML = `<div class="countdown-live"><span></span><strong>Westbrook County is live.</strong></div>`;
        return;
      }
      const d = release-now;
      set("[data-days]", Math.floor(d/86400000));
      set("[data-hours]", Math.floor((d%86400000)/3600000));
      set("[data-minutes]", Math.floor((d%3600000)/60000));
      set("[data-seconds]", Math.floor((d%60000)/1000));
    }
    tick(); setInterval(tick,1000);
  }

  function formatNumber(value) {
    if (typeof value !== "number") return "—";
    if (value >= 1e9) return (value/1e9).toFixed(value >= 1e10 ? 0 : 1).replace(".0","") + "B";
    if (value >= 1e6) return (value/1e6).toFixed(value >= 1e7 ? 0 : 1).replace(".0","") + "M";
    if (value >= 1e3) return (value/1e3).toFixed(value >= 1e4 ? 0 : 1).replace(".0","") + "K";
    return value.toLocaleString();
  }

  async function stats() {
    const box = $("[data-stats]");
    if (!box) return;
    const id = String(site.robloxUniverseId || "").trim();
    const note = $("[data-stats-note]");
    if (!id) {
      if (note) note.textContent = "Real Roblox stats will appear here after the Roblox universe ID is added to assets/js/content.js.";
      return;
    }
    try {
      const res = await fetch(`/api/stats?universeId=${encodeURIComponent(id)}`, {cache:"no-store"});
      if (!res.ok) throw new Error("Stats request failed");
      const s = await res.json();
      box.innerHTML = `
        <article class="stat-card"><span>PLAYING NOW</span><strong>${formatNumber(s.playing)}</strong><small>Players in-game</small></article>
        <article class="stat-card"><span>TOTAL VISITS</span><strong>${formatNumber(s.visits)}</strong><small>Roblox visits</small></article>
        <article class="stat-card"><span>LIKES</span><strong>${formatNumber(s.likes)}</strong><small>Roblox likes</small></article>
        <article class="stat-card"><span>FAVOURITES</span><strong>${formatNumber(s.favorites)}</strong><small>Roblox favourites</small></article>`;
      if (note) note.textContent = "Live data supplied by Roblox.";
    } catch {
      if (note) note.textContent = "Roblox stats could not be loaded right now.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    links(); nav(); features(); updates(); countdown(); stats();
  });
})();
