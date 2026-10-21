// TileGrow v0.4 — fisika (fixed timestep 120 Hz + interpolasi render), aksi, wrench
// Satuan fisika: piksel per detik. Lompat ~2 block, naik cepat, turun melayang.
const PHYS_HZ = 120, DT = 1 / PHYS_HZ;
const MOVE = 230, ACCEL = 3400, FRICTION = 26;      // v0.7: friksi naik (kurang licin), akselerasi naik
const G_UP = 3500, G_DOWN = 1150, MAX_FALL = 430;                 // v0.7: jatuh lebih lambat / melayang
const JUMP_V = Math.sqrt(2 * G_UP * (3 * TS + 6));               // v0.8: lompat 3 block
// lompatan kedua (sayap) dihitung supaya naik tepat 2 block: v = sqrt(2 * g * h)
const KNOCK_DIST = 0.75 * TS;          // knockback 0,75 block saat kena hit
const REGEN_DELAY = 4, REGEN_EVERY = 1.2;   // nyawa pulih 1 tiap 1,2 detik setelah 4 detik tanpa hit
const COYOTE_T = .09, BUFFER_T = .11, CUT = .55;
const LAVA_BOUNCE = 420, HURT_T = .55;

const keys = {};
const ZOOM_MIN = 1.25, ZOOM_MAX = 2.5;      // zoom out paling jauh 125% (permintaan user)
const mouse = {x:0, y:0, down:false, btn:0};
let actCool = 0;

function anyUIOpen(){ return !!document.querySelector('.modal:not(.hidden)'); }
function hitsSolid(px,py,w,h){
  const x0 = Math.floor(px/TS), x1 = Math.floor((px+w-1)/TS), y0 = Math.floor(py/TS), y1 = Math.floor((py+h-1)/TS);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) if (solidAt(x,y)) return true;
  return false;
}
// platform: bisa dipijak dari atas, ditembus dari bawah/samping; tahan S/Bawah untuk turun
function isPlatform(x,y){ const d = BY_ID[tileAt(x,y)]; return !!(d && d.platform); }
function landsOnPlatform(oldBottom, newBottom, px, w){
  if (keys.KeyS || keys.ArrowDown) return false;
  const y = Math.floor(newBottom / TS);
  if (oldBottom > y*TS) return false;                 // sudah di bawah permukaan platform
  const x0 = Math.floor(px/TS), x1 = Math.floor((px+w-1)/TS);
  for (let x=x0;x<=x1;x++) if (isPlatform(x,y)) return true;
  return false;
}
// lava sekarang padat: cek tile yang bersentuhan (1px di sekitar badan)
function touches(id){
  const x0 = Math.floor((pl.x-1)/TS), x1 = Math.floor((pl.x+pl.w)/TS), y0 = Math.floor((pl.y-1)/TS), y1 = Math.floor((pl.y+pl.h)/TS);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) if (tileAt(x,y) === id) return true;
  return false;
}

function physicsStep(){
  pl.px = pl.x; pl.py = pl.y;                       // posisi lama untuk interpolasi
  if (pl.dead > 0){ pl.dead -= DT; if (pl.dead <= 0) respawn('Kamu respawn di pintu utama.'); return; }
  const lock = anyUIOpen();
  const left = !lock && (keys.KeyA || keys.ArrowLeft), right = !lock && (keys.KeyD || keys.ArrowRight);
  const want = (right?1:0) - (left?1:0);
  if (want){ pl.vx += want * ACCEL * DT; pl.vx = Math.max(-MOVE, Math.min(MOVE, pl.vx)); pl.face = want; }
  else { pl.vx *= Math.max(0, 1 - FRICTION*DT); if (Math.abs(pl.vx) < 6) pl.vx = 0; }

  pl.coyote = pl.onGround ? COYOTE_T : Math.max(0, pl.coyote - DT);
  const jumpKey = !lock && (keys.Space || ((keys.KeyW || keys.ArrowUp) && !onMainDoor()));
  if (jumpKey && !pl.jumpHeld) pl.buffer = BUFFER_T;
  pl.jumpHeld = jumpKey; pl.buffer = Math.max(0, pl.buffer - DT);
  if (pl.onGround) jumpsLeft = maxJumps() - 1;
  if (pl.buffer > 0 && pl.coyote > 0){ pl.vy = -JUMP_V; pl.onGround = false; pl.coyote = 0; pl.buffer = 0; pl.baseY = pl.y; sfx('jump'); questEvent('jump',null,1); }
  else if (pl.buffer > 0 && !pl.onGround && jumpsLeft > 0 && jumpKey){
    // lompatan kedua (sayap): +3 block di atas puncak lompatan pertama → total ±6 block dari tanah.
    // Kalau ditekan saat sudah turun, tetap naik minimal 3 block dari posisi sekarang.
    const base = pl.baseY ?? pl.y, target = base - 6*TS - 6;
    const need = Math.max(3*TS + 6, Math.min(6*TS + 12, pl.y - target));
    pl.vy = -Math.sqrt(2 * G_UP * need); jumpsLeft--; pl.buffer = 0; pl.flap = .35; sfx('flap'); questEvent('jump',null,1);
    wingBurst();
  }
  if (pl.flap > 0) pl.flap = Math.max(0, pl.flap - DT);
  if (!jumpKey && pl.vy < -200 && pl.flap <= 0) pl.vy *= Math.pow(CUT, DT*60);      // lepas tombol = lompat pendek
  pl.vy = Math.min(pl.vy + (pl.vy < 0 ? G_UP : G_DOWN) * DT, MAX_FALL);
  if (pl.angel > 0){ pl.vy = Math.min(pl.vy, 75); pl.vx *= .5; }       // efek malaikat: melayang turun pelan

  // gerak per sumbu dengan langkah ≤1px supaya tidak tembus
  let dx = pl.vx * DT; const sx = Math.sign(dx);
  while (Math.abs(dx) > 0){ const d = Math.abs(dx) > 1 ? sx : dx;
    if (!hitsSolid(pl.x + d, pl.y, pl.w, pl.h)){ pl.x += d; dx -= d; } else { pl.vx = 0; break; } }
  let dy = pl.vy * DT; const sy = Math.sign(dy); let grounded = false;
  while (Math.abs(dy) > 0){ const d = Math.abs(dy) > 1 ? sy : dy;
    const ob = pl.y + pl.h, nb = ob + d;
    if (sy > 0 && landsOnPlatform(ob, nb, pl.x, pl.w)){ grounded = true; pl.vy = 0; break; }
    if (!hitsSolid(pl.x, pl.y + d, pl.w, pl.h)){ pl.y += d; dy -= d; }
    else { if (sy > 0) grounded = true; pl.vy = 0; break; } }
  if (!grounded && pl.vy >= 0 && (hitsSolid(pl.x, pl.y + 1, pl.w, pl.h) || landsOnPlatform(pl.y + pl.h, pl.y + pl.h + 1, pl.x, pl.w))) grounded = true;
  // tahan S/Bawah di atas platform: turun menembus platform
  if (grounded && (keys.KeyS || keys.ArrowDown) && !hitsSolid(pl.x, pl.y + 2, pl.w, pl.h)){ pl.y += 2; grounded = false; pl.vy = Math.max(pl.vy, 60); }
  if (grounded && !pl.onGround) pl.land = .14;
  pl.onGround = grounded;
  pl.x = Math.max(0, Math.min(pl.x, COLS*TS - pl.w));

  // block berbahaya (lava, dll): -1 nyawa + knockback 0,75 block menjauhi sumber
  if (pl.hurt > 0) pl.hurt -= DT;
  const src = dangerTouching();
  if (src && pl.hurt <= 0) hurtPlayer(src);
  // knockback horizontal: dorong total KNOCK_DIST dalam ~0,12 detik
  if (pl.kb){ const step = Math.sign(pl.kb) * Math.min(Math.abs(pl.kb), KNOCK_DIST / .12 * DT);
    if (!hitsSolid(pl.x + step, pl.y, pl.w, pl.h)) pl.x += step; else pl.kb = 0;
    pl.kb -= step; if (Math.abs(pl.kb) < .5) pl.kb = 0; }
  // regen: setelah REGEN_DELAY detik tanpa hit, +1 nyawa tiap REGEN_EVERY detik
  pl.regen += DT;
  if (pl.hp < MAX_HP && pl.regen >= REGEN_DELAY){ pl.hp++; pl.regen = REGEN_DELAY - REGEN_EVERY; }
  if (pl.angel > 0) pl.angel = Math.max(0, pl.angel - DT);
  // pintu utama: berdiri di depan pintu lalu tekan W/Atas = keluar ke lobby (lompat dinonaktifkan selama di pintu)
  if (onMainDoor() && (keys.KeyW || keys.ArrowUp) && pl.onGround && !pl.doorLock){ pl.doorLock = true; exitDoorPrompt(); }
  if (!(keys.KeyW || keys.ArrowUp)) pl.doorLock = false;

  if (pl.onGround && Math.abs(pl.vx) > 20) pl.step += Math.abs(pl.vx) * DT * .055;
  else pl.step *= Math.pow(.8, DT*60);
  if (pl.swing > 0) pl.swing = Math.max(0, pl.swing - DT);
  if (pl.land > 0) pl.land = Math.max(0, pl.land - DT);
  if (actCool > 0) actCool = Math.max(0, actCool - DT);
}

function dangerTouching(){
  const x0 = Math.floor((pl.x-1.5)/TS), x1 = Math.floor((pl.x+pl.w+1)/TS), y0 = Math.floor((pl.y-1.5)/TS), y1 = Math.floor((pl.y+pl.h+1)/TS);
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){ const d = BY_ID[tileAt(x,y)]; if (d && d.danger) return {x, y}; }
  return null;
}
function hurtPlayer(src){
  pl.hp--; pl.hurt = HURT_T; pl.regen = 0;
  const cx = (src.x + .5) * TS, dir = (pl.x + pl.w/2) >= cx ? 1 : -1;
  pl.kb = dir * KNOCK_DIST; pl.vy = -LAVA_BOUNCE; pl.onGround = false;
  burst(pl.x + pl.w/2, pl.y + pl.h, '#ff8a2b', 10); sfx('hurt'); shake(5);
  if (pl.hp <= 0){ pl.dead = 1.2; prog.stats.deaths++; burst(pl.x + pl.w/2, pl.y + pl.h/2, '#ff9494', 30); say('sys','Kamu mati. Respawn di pintu utama.'); }
}
// efek kepakan sayap: bulu/serpih yang menyebar ke bawah + cincin angin
function wingBurst(){
  const W = wingsDef(), c = W ? W.color : ['#fff','#ccc','#fff'];
  const cx = pl.x + pl.w/2, cy = pl.y + pl.h;
  for (let k=0;k<16;k++){ const a = Math.PI*(.15 + .7*Math.random()), v = 90 + Math.random()*170, side = k%2 ? 1 : -1;
    parts.push({x: cx + side*8, y: cy - 14, vx: Math.cos(a)*v*side, vy: Math.sin(a)*v*.6, life:.55 + Math.random()*.35,
      c: c[k%3], s: 3, feather: true, rot: Math.random()*6, g: .22}); }
  rings.push({x: cx, y: cy, r: 4, life: .35, c: c[2]});
}
const rings = [];
function updateCamera(alpha){
  const vw = VW/zoom, vh = VH/zoom;
  const rx = lerp(pl.px ?? pl.x, pl.x, alpha), ry = lerp(pl.py ?? pl.y, pl.y, alpha);
  // geser kamera ke atas sebesar tinggi panel tas supaya pemain tetap terlihat
  const invH = (typeof invRows !== 'undefined' && invRows) ? (invRows*(CELL+GAP) + 46 + 60) : 60;
  const offY = invH / zoom / 2;
  camX += (rx + pl.w/2 - vw/2 - camX) * .16;
  cam  += (ry + pl.h/2 - vh/2 + offY - cam) * .16;
  clampCam();
}
function lerp(a,b,t){ return a + (b-a)*t; }
function clampCam(){
  camX = Math.max(0, Math.min(camX, COLS*TS - VW/zoom));
  cam  = Math.max(0, Math.min(cam,  ROWS*TS - VH/zoom));
}
function setZoom(z){
  const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z*4)/4));
  if (nz === zoom) return;
  const oz = zoom || nz, cx = camX + VW/oz/2, cy = cam + VH/oz/2;
  zoom = nz; camX = cx - VW/zoom/2; cam = cy - VH/zoom/2; clampCam();
  const el = document.getElementById('zlv'); if (el) el.textContent = Math.round(zoom*100) + '%';
}
function worldMouse(){ return {x: mouse.x/zoom + camX, y: mouse.y/zoom + cam}; }
function mouseTile(){ const w = worldMouse(); return {x: Math.floor(w.x/TS), y: Math.floor(w.y/TS)}; }

function onMainDoor(){ const p = playerTile(); return p.x === spawn.x && p.y === spawn.y && pl.angel <= 0; }
// ================= AKSI =================
// jangkauan kotak: maksimal REACH tile ke segala arah dari tile pemain (5x5)
function playerTile(){ return {x: Math.floor((pl.x + pl.w/2)/TS), y: Math.floor((pl.y + pl.h/2)/TS)}; }
function inReach(tx,ty){
  const p = playerTile();
  return Math.abs(tx - p.x) <= REACH && Math.abs(ty - p.y) <= REACH;
}
function overlapsPlayer(tx,ty){ return pl.x < (tx+1)*TS && pl.x + pl.w > tx*TS && pl.y < (ty+1)*TS && pl.y + pl.h > ty*TS; }

function act(){
  if (actCool > 0 || pl.dead > 0) return;
  const {x:tx, y:ty} = mouseTile(), w = worldMouse();
  if (!inWorld(tx,ty)) return;
  pl.swingAng = Math.atan2(w.y - (pl.y + 12), w.x - (pl.x + pl.w/2));
  pl.face = w.x >= pl.x + pl.w/2 ? 1 : -1;
  pl.swing = .2; actCool = .17;
  if (!inReach(tx,ty)) return toast('Terlalu jauh.');
  const s = selected(), d = itemDef(s.key);
  if (mouse.btn === 2 || d.kind === 'fist') return punch(tx,ty);
  if (d.kind === 'wrench') return wrenchAt(tx,ty);
  if (d.kind === 'seed') return useSeed(tx,ty,d);
  return placeBlock(tx,ty,d);
}
function denied(){ toast('Area ini dikunci. Kamu tidak punya akses.'); sfx('deny'); }

function placeBlock(tx,ty,d){
  const def = BY_ID[d.id], i = idx(tx,ty);
  if (!canBuild(tx,ty)) return denied();
  if (def.bg){                                     // dinding belakang
    if (bgw[i]) return;
    if (!takeItem('b'+d.id,1)) return;
    bgw[i] = d.id; netTouch(i); stat('placed',1); questEvent('place',null,1); sfx('place'); return;
  }
  if (tileAt(tx,ty) !== 0) return;
  if (def.solid && overlapsPlayer(tx,ty)) return toast('Tidak bisa pasang di tempatmu berdiri.');
  if (def.lock){
    if (def.lock === 'world'){
      const wl = worldLock();
      if (wl) return toast('World ini sudah punya World Lock milik ' + wl.lock.owner + '.');
      for (const [,m] of meta) if (m.lock && m.lock.owner !== who()) return toast('Ada lock milik orang lain di world ini.');
    } else {
      const ls = locksCovering(tx,ty).filter(m => m.lock.owner !== who());
      if (ls.length) return toast('Area ini sudah dikunci orang lain.');
      const own = locksCovering(tx,ty).filter(m => m.lock.type !== 'world');
      if (own.length) return toast('Tile ini sudah diklaim lock lain.');
    }
  }
  if (!takeItem('b'+d.id,1)) return;
  fg[i] = d.id; puff(tx,ty,d.id,5); sfx('place');
  if (def.lock){
    meta.set(i, {lock:{type:def.lock, owner:who(), access:[], public:false, ignoreAir:false, tiles:null}});
    if (def.lock === 'world') stat('worldLocks',1);
    else { reclaimLock(i); }
    markLocksDirty();
    toast(def.name + ' terpasang' + (def.lock !== 'world' ? ' (' + meta.get(i).lock.tiles.length + ' tile diklaim)' : '') + '. Pakai kunci inggris untuk atur.');
  }
  if (def.wrench === 'sign')    meta.set(i, {sign:{text:''}});
  if (def.wrench === 'door')    meta.set(i, {door:{name:'', locked:false}});
  if (def.wrench === 'display') meta.set(i, {display:{key:null}});
  netTouch(i); stat('placed',1); questEvent('place',null,1);
}

function useSeed(tx,ty,d){
  const i = idx(tx,ty), id = tileAt(tx,ty);
  if (!canBuild(tx,ty)) return denied();
  if (id === 8){
    const tr = trees.get(i);
    if (tr.spliced) return toast('Pohon ini sudah hasil splice.');
    const out = recipe(tr.kind, d.id);
    if (!out) return toast(BY_ID[tr.kind].name + ' + ' + BY_ID[d.id].name + ' tidak menghasilkan apa-apa.');
    takeItem('s'+d.id,1); trees.set(i, {kind:out, t0:Date.now(), spliced:true}); netTouch(i);
    discoverRecipe(tr.kind, d.id, out);
    stat('spliced',1); questEvent('splice',null,1); addXP(5); sfx('place');
    return toast('Splice berhasil: pohon ' + BY_ID[out].name + '.');
  }
  if (id !== 0) return;
  if (!solidAt(tx,ty+1) || BY_ID[tileAt(tx,ty+1)].deco) return toast('Seed harus ditanam di atas block padat.');
  takeItem('s'+d.id,1); fg[i] = 8; trees.set(i, {kind:d.id, t0:Date.now()}); netTouch(i); sfx('place'); questEvent('plant',null,1);
}

function punch(tx,ty){
  const i = idx(tx,ty), id = tileAt(tx,ty);
  // tidak ada block depan: pukul dinding belakang
  if (id === 0){
    if (!bgw[i]) return;
    if (!canBuild(tx,ty)) return denied();
    return hitTile(tx,ty,bgw[i],true);
  }
  if (id === 7 || id === 23) return toast(id === 7 ? 'Block dasar tidak bisa dipecah.' : 'Pintu utama tidak bisa dipecah.');
  if (!canBuild(tx,ty)) return denied();
  const m = meta.get(i);
  if (m && m.lock && m.lock.owner !== who()) return denied();
  if (m && m.display && m.display.key){             // ambil item dari kotak pajang dulu
    const k = m.display.key; m.display.key = null; netTouch(i); spawnDrop(tx,ty,k,1); return toast('Item diambil dari Kotak Pajang.');
  }
  if (id === 8){
    const tr = trees.get(i);
    if (Date.now() - tr.t0 < GROW_MS[tr.kind]) return toast('Pohon belum siap dipanen.');
    trees.delete(i); fg[i] = 0; netTouch(i); puff(tx,ty,4,10); sfx('break');
    spawnDrop(tx,ty,'b'+tr.kind, 1 + (Math.random()*3|0));
    if (Math.random() < .5) spawnDrop(tx,ty,'s'+tr.kind,1);
    const g = GEM_FROM_TREE[0] + (Math.random()*(GEM_FROM_TREE[1]-GEM_FROM_TREE[0]+1)|0);
    for (let k=0;k<g;k++) spawnDrop(tx,ty,'gem',1);
    stat('harvested',1); questEvent('harvest',null,1); addXP(3 + (BY_ID[tr.kind].xp||1)*2);
    return;
  }
  hitTile(tx,ty,id,false);
}
function hitTile(tx,ty,id,isBg){
  const def = BY_ID[id], base = def.lock ? 5 : def.hits;
  const i = idx(tx,ty), hits = toolDef() ? Math.max(1, base - 1) : base;   // pickaxe: 1 pukulan lebih sedikit
  const key = (isBg ? 'g' : 'f') + i;
  const dd = dmg.get(key) || {n:0, x:tx, y:ty, bg:isBg};
  dd.n++; dd.t = Date.now(); dmg.set(key, dd); puff(tx,ty,id,3); sfx('hit'); shake(1.5);
  if (dd.n < hits) return;
  dmg.delete(key);
  if (isBg) bgw[i] = 0; else { fg[i] = 0; if (meta.has(i)) markLocksDirty(); meta.delete(i); }
  netTouch(i);
  puff(tx,ty,id,12); sfx('break');
  if (isBg){
    if (Math.random() < DROP_SEED_BG) spawnDrop(tx,ty,'s1',1);          // dinding gua: 35% seed tanah
    if (Math.random() < DROP_BLOCK) spawnDrop(tx,ty,'b'+id,1);
    questEvent('bgbreak', null, 1);
  }
  else if (def.lock || def.wrench){ spawnDrop(tx,ty,'b'+id,1); if (def.lock) markLocksDirty(); }   // item khusus selalu kembali
  else {
    if (Math.random() < DROP_BLOCK) spawnDrop(tx,ty,'b'+id,1);
    if (SEEDABLE.includes(id) && Math.random() < DROP_SEED) spawnDrop(tx,ty,'s'+id,1);
  }
  if (def.gem){ const g = def.gem[0] + (Math.random()*(def.gem[1]-def.gem[0]+1)|0); for (let k=0;k<g;k++) spawnDrop(tx,ty,'gem',1); stat('ores',1); questEvent('ore',null,1); }
  else if (!isBg && Math.random() < GEM_FROM_BLOCK) spawnDrop(tx,ty,'gem',1);
  stat('broken',1); questEvent('break',null,1); addXP(def.xp || 1);
}

// tumpukan gems: drop gems yang berdekatan digabung, warnanya ikut total nilai
const GEM_TIERS = [[100,'#1f3fbf','#7f9cff'],[50,'#8a3fd6','#e0b8ff'],[25,'#e03a3a','#ffb0b0'],[5,'#f2c230','#fff2a0'],[1,'#3fa8f0','#c8ecff']];
function gemTier(n){ for (const t of GEM_TIERS) if (n >= t[0]) return t; return GEM_TIERS[GEM_TIERS.length-1]; }
function mergeGems(){
  for (let a=0;a<items.length;a++){ const A = items[a]; if (A.key !== 'gem' || A.vy !== 0) continue;
    for (let b=items.length-1;b>a;b--){ const B = items[b]; if (B.key !== 'gem' || B.vy !== 0) continue;
      if (Math.abs(A.x - B.x) < 14 && Math.abs(A.y - B.y) < 10){ A.n += B.n; A.x = (A.x + B.x)/2; items.splice(b,1); } } }
}
function spawnDrop(tx,ty,key,n){
  items.push({x: tx*TS + TS/2 + (Math.random()-.5)*14, y: ty*TS + TS/2, vy: -120 - Math.random()*90, vx:(Math.random()-.5)*60,
              key, n, lock: Date.now() + 250});
}
// drop selalu lewat dialog konfirmasi (askDrop di ui.js) supaya tidak bisa spam drop tanpa sadar
function dropSelected(n){
  const s = selected(); if (!s || s.key === FIST || s.key === WRENCH) return toast('Item ini tidak bisa di-drop.');
  const key = s.key, k = takeItem(key, n); if (!k) return;
  items.push({x: pl.x + pl.w/2 + pl.face*TS*1.2, y: pl.y + 6, vy:-120, vx:0, key, n:k, lock: Date.now() + 1500});
  toast(k + ' ' + itemDef(key).name + ' di-drop.'); say('act', 'Kamu men-drop ' + k + ' ' + itemDef(key).name + '.');
}
function trashSelected(n){
  const s = selected(); if (!s || s.key === FIST || s.key === WRENCH) return toast('Item ini tidak bisa dibuang.');
  const nm = itemDef(s.key).name, k = takeItem(s.key, n); if (k) toast(k + ' ' + nm + ' dibuang.');
}

function updateWorld(){
  const now = Date.now(), px = pl.x + pl.w/2, py = pl.y + pl.h/2;
  for (let k=items.length-1;k>=0;k--){
    const it = items[k];
    it.vy = Math.min(it.vy + 1300*DT, 500); it.vx *= .96;
    const nx = it.x + it.vx*DT; if (!solidAt(Math.floor(nx/TS), Math.floor(it.y/TS))) it.x = nx;
    const ny = it.y + it.vy*DT;
    if (solidAt(Math.floor(it.x/TS), Math.floor((ny+7)/TS))){ it.vy = 0; it.y = Math.floor((ny+7)/TS)*TS - 7; } else it.y = ny;
    if (it.y > ROWS*TS){ items.splice(k,1); continue; }
    if (pl.dead <= 0 && now > it.lock && Math.hypot(px-it.x, py-it.y) < 26){
      const got = addItem(it.key, it.n);
      if (got){ it.n -= got; if (it.n <= 0){ items.splice(k,1); sfx(it.key === 'gem' ? 'gem' : 'pick'); } }
      else if (!it.warned){ it.warned = true; toast('Tas penuh atau stack sudah 200.'); }
    }
  }
  mergeGems();
  for (const [k,d] of dmg) if (now - d.t > 2200) dmg.delete(k);
  for (let k=parts.length-1;k>=0;k--){ const p = parts[k]; p.vy += 900*(p.g || 1)*DT;
    if (p.feather){ p.vx *= .96; p.rot += DT*6; } p.x += p.vx*DT; p.y += p.vy*DT; p.life -= DT; if (p.life <= 0) parts.splice(k,1); }
  for (let k=rings.length-1;k>=0;k--){ const r = rings[k]; r.r += 160*DT; r.life -= DT; if (r.life <= 0) rings.splice(k,1); }
  if (shakeAmt > 0) shakeAmt = Math.max(0, shakeAmt - 30*DT);
}
function puff(tx,ty,id,n){
  const P = PAL[id] || PAL[1];
  for (let k=0;k<n;k++) parts.push({x: tx*TS + TS/2, y: ty*TS + TS/2, vx:(Math.random()-.5)*240, vy:-Math.random()*220,
    life:.35 + Math.random()*.2, c:P[Math.random()*3|0], s:3});
}
function burst(x,y,c,n){ for (let k=0;k<n;k++){ const a = Math.random()*Math.PI*2, v = 80 + Math.random()*200;
  parts.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 120, life:.5 + Math.random()*.4, c, s:3}); } }
let shakeAmt = 0;
function shake(n){ if (settings.shake) shakeAmt = Math.max(shakeAmt, n); }

// ================= TOMBOL E: pecah 2 block di depan =================
// Block terdekat dipukul dulu; setelah hancur baru block kedua.
function frontTiles(){
  const cy = Math.floor((pl.y + pl.h/2)/TS);
  const cx = pl.face > 0 ? Math.floor((pl.x + pl.w - 1)/TS) : Math.floor(pl.x/TS);
  return [[cx + pl.face, cy], [cx + pl.face*2, cy]];
}
function breakableFront(x,y){
  const id = tileAt(x,y);
  if (!inWorld(x,y)) return false;
  if (id === 0) return !!bgw[idx(x,y)];
  return id !== 7 && id !== 23;
}
function punchFront(){
  if (actCool > 0 || pl.dead > 0) return;
  const target = frontTiles().find(([x,y]) => breakableFront(x,y));
  if (!target) return;
  const [tx,ty] = target;
  pl.swingAng = pl.face > 0 ? 0 : Math.PI; pl.swing = .2; actCool = .17;
  punch(tx,ty);
}

// ================= WRENCH =================
// wrench ke diri sendiri: buka profil pemain (level, quest, goals, bestiary)
function playerAtTile(tx,ty){ return pl.x < (tx+1)*TS && pl.x + pl.w > tx*TS && pl.y < (ty+1)*TS && pl.y + pl.h > ty*TS; }
function wrenchAt(tx,ty){
  const i = idx(tx,ty), id = tileAt(tx,ty), def = BY_ID[id], m = meta.get(i);
  if (id === 23) return openDialog('maindoor', {tx,ty});
  if (!def || !def.wrench || !m) return toast('Block ini tidak punya pengaturan.');
  if (def.wrench === 'lock'){
    if (m.lock.owner !== who()) return toast('Lock milik ' + m.lock.owner + '. Hanya pemilik yang bisa mengatur.');
    return openDialog('lock', {tx,ty,i});
  }
  if (!canBuild(tx,ty)) return denied();
  openDialog(def.wrench, {tx,ty,i});
}
