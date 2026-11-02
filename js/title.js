'use strict';
// TileGrow v1.6 — layar judul: langit biru, awan kotak, gunung ungu berlapis, logo kartun (semua digambar sendiri).
const TITLE = {raf: 0, t0: 0};
function drawTitleLogo(){
  const c = $('titleLogo'); if (!c) return; const g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  // pohon kecil di antara "Tile" dan "Grow" + matahari
  const text = 'TileGrow';
  g.font = '900 86px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const tw = g.measureText(text).width, x0 = (W - tw)/2, by = 132;
  // matahari
  const sx = x0 + tw - 6, sy = 40;
  g.fillStyle = '#7a4a10'; g.beginPath(); g.arc(sx, sy, 21, 0, Math.PI*2); g.fill();
  const sg = g.createRadialGradient(sx - 6, sy - 6, 2, sx, sy, 18); sg.addColorStop(0, '#fff8c0'); sg.addColorStop(.6, '#ffd23d'); sg.addColorStop(1, '#f29b1f');
  g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, 17, 0, Math.PI*2); g.fill();
  // pohon di antara 'Tile' & 'Grow'
  const tx = x0 + g.measureText('Tile').width + 2;
  g.fillStyle = '#3a2410'; g.fillRect(tx - 7, 44, 14, 56);
  g.fillStyle = '#8a5a2b'; g.fillRect(tx - 4, 46, 8, 52);
  for (const [dx, dy, r] of [[0, 34, 26], [-18, 44, 17], [18, 44, 17]]){ g.fillStyle = '#17361a'; g.beginPath(); g.arc(tx + dx, dy, r + 4, 0, Math.PI*2); g.fill(); }
  for (const [dx, dy, r, c2] of [[0, 34, 26, '#3fa548'], [-18, 44, 17, '#348f3e'], [18, 44, 17, '#348f3e'], [-6, 26, 10, '#7be37a']]){ g.fillStyle = c2; g.beginPath(); g.arc(tx + dx, dy, r, 0, Math.PI*2); g.fill(); }
  // teks: garis luar cokelat tebal, isi kuning bergradasi, kilau
  g.lineWidth = 16; g.strokeStyle = '#5a2c08'; g.strokeText(text, x0, by + 4);
  g.lineWidth = 12; g.strokeStyle = '#8a4a10'; g.strokeText(text, x0, by);
  const lg = g.createLinearGradient(0, by - 70, 0, by); lg.addColorStop(0, '#fff6a8'); lg.addColorStop(.45, '#ffd84a'); lg.addColorStop(1, '#f2a21f');
  g.fillStyle = lg; g.fillText(text, x0, by);
  g.save(); g.beginPath(); g.rect(0, by - 70, W, 26); g.clip(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillText(text, x0, by); g.restore();
  // ikon kepalan kecil untuk header berita (kotak pixel sederhana)
  const ic = $('nwIcon'); if (ic){ const q = ic.getContext('2d'); q.imageSmoothingEnabled = false; q.clearRect(0, 0, 28, 28);
    const px = (x, y, w, h, col) => { q.fillStyle = col; q.fillRect(x*2, y*2, w*2, h*2); };
    px(2, 3, 10, 9, '#17121c'); px(3, 4, 8, 7, '#f4c39a'); px(3, 4, 8, 1, '#ffdcbc'); for (const x of [5, 7, 9]) px(x, 4, 1, 3, '#d8956a'); px(3, 9, 8, 2, '#d8956a'); }
}
function titleSky(now){
  const c = $('titleSky'); if (!c || $('scr-title').classList.contains('hidden')){ TITLE.raf = 0; return; }
  const S = 4, W = Math.ceil(c.clientWidth / S), H = Math.ceil(c.clientHeight / S);
  if (c.width !== W || c.height !== H){ c.width = W; c.height = H; }
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#3fb4f0'); sky.addColorStop(1, '#8fdcff');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const t = (now || 0) / 1000;
  // awan kotak (bentuk plus/tangga), bergerak pelan
  const cloud = (cx, cy, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(cx, cy, 6*s, 2*s); g.fillRect(cx + s, cy - s, 4*s, s); g.fillRect(cx + 2*s, cy - 2*s, 2*s, s); g.fillRect(cx - s, cy + s, 8*s, s);
    g.fillStyle = '#d8f0ff'; g.fillRect(cx - s, cy + 2*s, 8*s, s);
  };
  const CL = [[.06, .14, 3], [.8, .1, 4], [.16, .4, 2], [.7, .36, 2], [.94, .5, 3], [.38, .06, 2]];
  for (const [fx, fy, s] of CL){ const span = W + 60; const x = ((fx*span + t * (3 + s)) % span) - 40; cloud(Math.round(x), Math.round(fy*H), s); }
  // gunung ungu berlapis (tangga pixel)
  const ridge = (base, amp, col, top, seed, step) => {
    g.fillStyle = col;
    for (let x = 0; x < W; x += step){
      const y = Math.round(H*base - amp*(Math.sin(x*.021 + seed)*.6 + Math.sin(x*.053 + seed*2)*.3 + Math.sin(x*.009 + seed*3)*.5));
      g.fillRect(x, y, step, H - y);
      g.fillStyle = top; g.fillRect(x, y, step, 1); g.fillStyle = col;
    }
  };
  ridge(.66, H*.16, '#7a5cc4', '#9a80e0', 1.3, 3);
  ridge(.76, H*.11, '#9a7ae0', '#b9a0f5', 4.1, 3);
  ridge(.86, H*.07, '#b49af0', '#d4c4ff', 7.7, 2);
  TITLE.raf = requestAnimationFrame(titleSky);
}
function titleStart(){ drawTitleLogo(); if (!TITLE.raf) TITLE.raf = requestAnimationFrame(titleSky); }
function bindTitle(){
  $('tAbout').onclick = () => $('aboutBox').classList.remove('hidden');
  const mb = $('tMusic');
  const upd = () => mb.classList.toggle('off', !settings.music);
  mb.onclick = e => { e.stopPropagation(); settings.music = !settings.music; upd(); if (settings.music) musicStart(); else musicStop(); try { save && save(); } catch(_){} };
  upd();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawTitleLogo);
}
