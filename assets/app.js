const cfg=window.SITE_CONFIG||{}, updates=window.UPDATES||[];
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function init(){
 document.querySelectorAll("[data-site-name]").forEach(e=>e.textContent=cfg.name);
 document.querySelectorAll("[data-livery-link]").forEach(e=>e.href=cfg.links?.liveries||"#");
 const y=$("[data-year]"); if(y)y.textContent=new Date().getFullYear();
 const f=$("[data-footer-name]"); if(f)f.textContent=cfg.name;
 if(cfg.hero){
  const a=$("[data-hero-eyebrow]"),b=$("[data-hero-title]"),c=$("[data-hero-text]"),d=$("[data-hero-button]");
  if(a)a.textContent=cfg.hero.eyebrow;if(b)b.textContent=cfg.hero.title;if(c)c.textContent=cfg.hero.text;
  if(d){d.textContent=cfg.hero.buttonText;d.href=cfg.hero.buttonLink;}
 }
 const h=$("[data-highlights]");
 if(h)h.innerHTML=(cfg.highlights||[]).map((x,i)=>`<article class="info-card"><div class="card-number">0${i+1}</div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join("");
 const list=$("[data-updates]");
 if(list)list.innerHTML=updates.map(x=>`<article class="update-card">${x.image?`<div class="update-image"><img src="${esc(x.image)}" alt="" loading="lazy"></div>`:""}<div class="update-body"><div class="update-meta"><span>${esc(x.date)}</span>${x.tag?`<span class="tag">${esc(x.tag)}</span>`:""}</div><h2>${esc(x.title)}</h2><p>${esc(x.text)}</p></div></article>`).join("");
 const toggle=$(".menu-toggle"),nav=$(".site-nav");
 if(toggle&&nav)toggle.onclick=()=>{nav.classList.toggle("open");toggle.setAttribute("aria-expanded",nav.classList.contains("open"));};
 countdown();
}
function countdown(){
 const wrap=$("[data-countdown]");if(!wrap||!cfg.releaseAt)return;
 const release=new Date(cfg.releaseAt).getTime(),hide=release+(cfg.countdownHideAfterHours||24)*3600000;
 function tick(){
  const now=Date.now();
  if(now>=hide){wrap.remove();return;}
  if(now>=release){wrap.innerHTML='<div class="countdown-released"><span class="live-dot"></span><strong>Westbrook County is live.</strong></div>';return;}
  let d=release-now;
  const vals=[Math.floor(d/86400000),Math.floor(d%86400000/3600000),Math.floor(d%3600000/60000),Math.floor(d%60000/1000)];
  ["days","hours","minutes","seconds"].forEach((k,i)=>{const e=$(`[data-${k}]`);if(e)e.textContent=String(vals[i]).padStart(2,"0")});
 }
 tick();setInterval(tick,1000);
}
document.addEventListener("DOMContentLoaded",init);
