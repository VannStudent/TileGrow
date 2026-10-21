// TileGrow v0.4 — input, simpan/muat, loop utama (fixed timestep + render interpolasi)
addEventListener('keydown', e=>{
  const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if (!inGame && !typing && e.code === 'Escape') closeModals();
  if (!inGame) return;
  if (typing){ if (e.code === 'Escape'){ closeModals(); e.target.blur(); } return; }
  keys[e.code] = true;
  if (/^Digit[1-4]$/.test(e.code)){ const i = +e.code.slice(5)-1; if (hot[i]) select(hot[i]); }
  if (e.code === 'KeyI') setInvRows(invRows ? 0 : 2);
  if (e.code === 'Enter' || e.code === 'KeyT'){ e.preventDefault(); openChatInput(); return; }
  if (e.code === 'KeyB') toggleModal('shop');
  if (e.code === 'KeyH'){ toggleHud(); }
  if (e.code === 'KeyL'){ profTab = 'level'; toggleModal('prof'); }
  if (e.code === 'KeyQ'){ profTab = 'quest'; toggleModal('prof'); }
  if (e.code === 'KeyG'){ profTab = 'bestiary'; toggleModal('prof'); }
  if (e.code === 'Escape'){ if (anyUIOpen()) closeModals(); else if (invRows) setInvRows(0); else { renderMenu(); openModal('menu'); } }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(zoom + .25);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(zoom - .25 < ZOOM_MIN && online() && net.staff.zoom ? staffZoomMin() : zoom - .25);
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e=> keys[e.code] = false);
addEventListener('blur', ()=>{ for (const k in keys) keys[k] = false; mouse.down = false; });

cv.addEventListener('contextmenu', e=> e.preventDefault());
cv.addEventListener('mousemove', e=>{
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (VW / r.width); mouse.y = (e.clientY - r.top) * (VH / r.height);
});
cv.addEventListener('mousedown', e=>{ if (anyUIOpen()) return closeModals(); mouse.down = true; mouse.btn = e.button; actCool = 0; act(); });
addEventListener('mouseup', ()=> mouse.down = false);
cv.addEventListener('wheel', e=>{ e.preventDefault(); const z = zoom + (e.deltaY < 0 ? .25 : -.25); setZoom(z < ZOOM_MIN && online() && net.staff.zoom ? (e.deltaY < 0 ? ZOOM_MIN : staffZoomMin()) : z); }, {passive:false});

// ---------- simpan / muat ----------
function save(){
  if (online()) return netSavePlayer();
  if (!account || !fg) return;
  if (prog) prog.lobbyHistory = lobbyHistory;
  try { localStorage.setItem(saveKeyFor(account), JSON.stringify({
    v:8, fg:Array.from(fg), bgw:Array.from(bgw), trees:Array.from(trees.entries()), meta:Array.from(meta.entries()),
    bag, bagSlots, gems, selKey, hot, zoom, prog, settings, spawn, pl:{x:pl.x, y:pl.y, hp:pl.hp},
    worlds: (storeCurrentWorld(), worlds), worldName, playerName, worn, invRows, chat: chat.slice(-40)
  })); } catch(e) {}
}
function load(){
  try {
    if (!account) return false;
    const d = JSON.parse(localStorage.getItem(saveKeyFor(account)) || 'null');
    if (!d || d.v !== 8 || !d.fg || d.fg.length !== COLS*ROWS) return false;
    genWorld();
    fg = Uint8Array.from(d.fg); bgw = Uint8Array.from(d.bgw); trees = new Map(d.trees); meta = new Map(d.meta);
    bag = d.bag; bagSlots = d.bagSlots; gems = d.gems; prog = d.prog; spawn = d.spawn;
    worlds = d.worlds || {}; worldName = d.worldName || 'START'; playerName = d.playerName || 'Kamu'; worn = Object.assign({wings:null,hat:null,shirt:null,pants:null,tool:null}, d.worn || {}); markLocksDirty(); invRows = d.invRows || 0;
    selKey = d.selKey || FIST; hot = d.hot || []; if (!hot.length) initHotbar();
    chat.length = 0; (d.chat || []).forEach(c => chat.push(c));
    Object.assign(settings, d.settings || {});
    newPlayer(); pl.x = d.pl.x; pl.y = d.pl.y; pl.hp = d.pl.hp || MAX_HP;
    if (d.zoom) zoom = d.zoom;
    return true;
  } catch(e) { console.warn('save rusak', e); return false; }
}
setInterval(()=> { if (fg && inGame) save(); }, 4000);
addEventListener('beforeunload', ()=> save());

// ---------- loop ----------
let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0, fps = 0;
function frame(now){
  let dt = (now - last) / 1000; last = now;
  if (dt > .25) dt = .25;                 // tab tidak aktif: jangan lompat jauh
  acc += dt;
  if (!inGame){ draw(0); requestAnimationFrame(frame); return; }   // layar menu: world tetap tergambar di belakang
  pollGamepad(dt);
  while (acc >= DT){
    physicsStep();
    if (mouse.down && actCool === 0 && !anyUIOpen()){
      const s = selected();
      if (mouse.btn === 2 || s.key === FIST) act();   // tahan = pukul terus
    }
    if (keys.KeyE && actCool === 0 && !anyUIOpen()) punchFront();   // tahan E = pukul 2 block depan
    updateWorld();
    acc -= DT;
  }
  netTick(dt);
  const alpha = acc / DT;
  updateCamera(alpha);
  draw(alpha);
  fpsN++; fpsT += dt; if (fpsT >= .5){ fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; const f = $('fps'); if (f) f.textContent = fps + ' FPS'; }
  requestAnimationFrame(frame);
}

function boot(){
  bindUI(); bindScreens(); bindControlPicker(); bindTouch(); bindSocial();
  genWorld();                 // world latar untuk layar judul (bukan save siapa pun)
  rollQuests();
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom || ZOOM_MIN)); zoom = 0; setZoom(z);
  renderChat();
  camX = pl.x - VW/zoom/2; cam = pl.y - VH/zoom/2; clampCam();
  refreshUI();
  $('wrenchIcon').src = icon(WRENCH);
  setControlMode('ontouchstart' in window && !matchMedia('(pointer:fine)').matches ? 'touch' : 'kbm');
  showScreen('title');
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}
boot();
