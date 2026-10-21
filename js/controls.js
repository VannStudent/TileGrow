// TileGrow v0.8 — pilihan kontrol: keyboard & mouse, layar sentuh (Android/iOS), joystick/gamepad
// Disimpan per akun (accounts()[user].controls) dan bisa diganti di Pengaturan.
let controlMode = 'kbm';          // 'kbm' | 'touch' | 'pad'

function setControlMode(mode, persist){
  controlMode = mode;
  document.body.dataset.controls = mode;
  $('touchUI').classList.toggle('hidden', mode !== 'touch');
  const ci = $('chatIn'); if (ci) ci.placeholder = mode === 'touch' ? 'Ketik pesan · /help' : 'Enter / T untuk chat · /help';
  if (persist && account){ if (online()) netSavePlayer(); else { const a = accounts(); if (a[account]){ a[account].controls = mode; saveAccounts(a); } } }
  const lbl = {kbm:'Keyboard & Mouse', touch:'Layar sentuh', pad:'Joystick / Gamepad'}[mode];
  const el = $('ctlNow'); if (el) el.textContent = lbl;
}
function openControlPicker(first){
  $('ctlFirst').style.display = first ? '' : 'none';
  document.querySelectorAll('#ctlPick .ctl').forEach(b => b.classList.toggle('on', b.dataset.m === controlMode));
  openModal('ctlPick');
  $('ctlPick').dataset.first = first ? '1' : '';
}
function bindControlPicker(){
  document.querySelectorAll('#ctlPick .ctl').forEach(b => b.onclick = ()=>{
    setControlMode(b.dataset.m, true);
    const first = $('ctlPick').dataset.first === '1';
    closeModals();
    if (first) showScreen('lobby');
    toast('Kontrol: ' + $('ctlNow').textContent);
  });
}

// ---------- layar sentuh ----------
// ala Growtopia: panah kiri/kanan (+ turun platform) di kiri, tombol pakai item & lompat di kanan, ketuk tile = aksi di tile itu
// tombol lompat = tombol Atas (di pintu utama: keluar world, sama seperti W)
const touch = {act:false};
function bindTouch(){
  const hold = (id, on, off) => { const b = $(id); let pid = null;
    const up = e => { if (pid === null || (e && e.pointerId !== pid)) return; pid = null; off(); b.classList.remove('down'); };
    b.addEventListener('pointerdown', e => { pid = e.pointerId; try { b.setPointerCapture(pid); } catch(_){} on(); b.classList.add('down'); e.preventDefault(); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault()); };
  hold('tLeft', ()=> keys.KeyA = true, ()=> keys.KeyA = false);
  hold('tRight', ()=> keys.KeyD = true, ()=> keys.KeyD = false);
  hold('tDown', ()=> keys.KeyS = true, ()=> keys.KeyS = false);
  hold('tJump', ()=> keys.KeyW = true, ()=> keys.KeyW = false);
  // tombol pakai: pakai item dipegang di tile depan pemain (sama seperti tombol E untuk tinju)
  hold('tAct', ()=>{ touch.act = true; touchAction(); }, ()=> touch.act = false);
  // ketuk langsung di world = aksi di tile itu
  cv.addEventListener('touchstart', e => {
    if (controlMode !== 'touch') return;
    const t = e.changedTouches[0], r = cv.getBoundingClientRect();
    mouse.x = (t.clientX - r.left) * (VW / r.width); mouse.y = (t.clientY - r.top) * (VH / r.height);
    mouse.btn = 0; actCool = 0; act(); e.preventDefault();
  }, {passive:false});
}
function touchAction(){
  const s = selected(), d = itemDef(s.key);
  if (d.kind === 'fist'){ punchFront(); return; }
  // block/seed/wrench: tile di depan pemain
  const [tx,ty] = frontTiles()[0];
  mouse.x = ((tx*TS + TS/2) - camX)*zoom; mouse.y = ((ty*TS + TS/2) - cam)*zoom; mouse.btn = 0; actCool = 0; act();
}

// ---------- joystick / gamepad ----------
// stik kiri: jalan (bawah = turun platform), A: lompat, X: pukul/pasang di kursor, stik kanan: gerakkan kursor,
// LB/RB: ganti slot quick bar, Y: buka/tutup tas, Start: menu
const padState = {prev:[], cursorInit:false};
function pollGamepad(dt){
  if (controlMode !== 'pad' || !navigator.getGamepads) return;
  const gp = [...navigator.getGamepads()].find(Boolean); if (!gp) return;
  const ax = gp.axes, b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const pressed = i => b(i) && !padState.prev[i];
  const dz = v => Math.abs(v) < .2 ? 0 : v;
  keys.KeyA = dz(ax[0]) < -.3 || b(14); keys.KeyD = dz(ax[0]) > .3 || b(15); keys.KeyS = dz(ax[1]) > .6 || b(13);
  keys.Space = b(0);
  if (!padState.cursorInit){ mouse.x = VW/2 + 60; mouse.y = VH/2; padState.cursorInit = true; }
  // kursor mengikuti stik kanan; dibatasi ke area jangkauan di sekitar pemain
  mouse.x += dz(ax[2]) * 520 * dt; mouse.y += dz(ax[3]) * 520 * dt;
  const p = playerTile(), cx = ((p.x + .5)*TS - camX)*zoom, cy = ((p.y + .5)*TS - cam)*zoom, lim = (REACH + .5)*TS*zoom;
  mouse.x = Math.max(cx - lim, Math.min(cx + lim, mouse.x)); mouse.y = Math.max(cy - lim, Math.min(cy + lim, mouse.y));
  if (b(2) && actCool === 0 && !anyUIOpen()){ mouse.btn = 0; act(); }
  if (pressed(4) || pressed(5)){
    const filled = hot.map((k,i) => k && bag.find(s => s.key === k) ? i : -1).filter(i => i >= 0);
    const cur = Math.max(0, filled.indexOf(hot.indexOf(selected().key)));
    const nx = filled[(cur + (pressed(5) ? 1 : -1) + filled.length) % filled.length];
    if (nx !== undefined) select(hot[nx]);
  }
  if (pressed(3)) setInvRows(invRows ? 0 : 2);
  if (pressed(9)){ if (anyUIOpen()) closeModals(); else { renderMenu(); openModal('menu'); } }
  padState.prev = gp.buttons.map(x => x.pressed);
}
addEventListener('gamepadconnected', e => { toast('Gamepad terhubung: ' + e.gamepad.id.slice(0,32)); if (controlMode !== 'pad' && account) toast('Ganti kontrol ke Joystick di Pengaturan untuk memakainya.'); });
