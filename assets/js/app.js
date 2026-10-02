(function () {
  'use strict';
  const C = window.WESTBROOK;
  if (!C) { console.error('Westbrook content file did not load.'); return; }

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setCommon() {
    $$('[data-site-name]').forEach(e => e.textContent = C.siteName);
    $$('[data-year]').forEach(e => e.textContent = new Date().getFullYear());
    $$('[data-footer-name]').forEach(e => e.textContent = C.siteName);
    $$('[data-livery-link]').forEach(e => { e.href = C.links.liveries || '#'; });
  }

  function setHome() {
    if (!document.body.dataset.page || document.body.dataset.page !== 'home') return;
    $('[data-hero-eyebrow]').textContent = C.home.eyebrow;
    $('[data-hero-title]').textContent = C.home.title;
    $('[data-hero-text]').textContent = C.home.text;
    $('[data-hero-button]').textContent = C.home.buttonText;
    const h = $('[data-highlights]');
    h.innerHTML = C.highlights.map((x,i) => `
      <article class="info-card">
        <span class="card-number">${String(i+1).padStart(2,'0')}</span>
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.text)}</p>
      </article>`).join('');
  }

  function renderUpdates() {
    const list = $('[data-updates]');
    if (!list) return;
    list.innerHTML = C.updates.length ? C.updates.map(x => `
      <article class="update-card">
        ${x.image ? `<img class="update-image" src="${esc(x.image)}" alt="" loading="lazy">` : ''}
        <div class="update-content">
          <div class="update-meta"><span>${esc(x.date)}</span>${x.tag ? `<span class="tag">${esc(x.tag)}</span>` : ''}</div>
          <h2>${esc(x.title)}</h2>
          <ul class="update-list">${(x.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      </article>`).join('') : '<div class="empty-state">No updates have been posted yet.</div>';
  }

  function countdown() {
    const box = $('[data-countdown]');
    if (!box) return;
    const release = Date.parse(C.releaseAt);
    if (!Number.isFinite(release)) { box.remove(); return; }
    const hideAt = release + (Number(C.hideCountdownAfterHours) || 24) * 3600000;
    const tick = () => {
      const now = Date.now();
      if (now >= hideAt) { box.remove(); return; }
      if (now >= release) {
        box.innerHTML = '<div class="countdown-live"><span class="live-dot"></span><strong>Westbrook County is live.</strong></div>';
        return;
      }
      let d = release - now;
      const vals = [Math.floor(d/86400000), Math.floor(d%86400000/3600000), Math.floor(d%3600000/60000), Math.floor(d%60000/1000)];
      ['days','hours','minutes','seconds'].forEach((k,i) => { const el = $(`[data-${k}]`, box); if (el) el.textContent = String(vals[i]).padStart(2,'0'); });
    };
    tick();
    setInterval(tick, 1000);
  }

  function nav() {
    const btn = $('.menu-toggle'), nav = $('.site-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => { const open = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', open); });
    const path = location.pathname.replace(/\\/g,'/').replace(/\/+$/,'') || '/';
    $$('[data-nav]').forEach(a => { const p = new URL(a.href, location.href).pathname.replace(/\/+$/,'') || '/'; if (p === path) a.classList.add('active'); });
  }

  setCommon(); setHome(); renderUpdates(); countdown(); nav();
})();
