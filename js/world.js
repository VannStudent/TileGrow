// TileGrow v0.4 — state dunia, inventory, lock, progres
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let VW = cv.width, VH = cv.height;

let fg, bgw, trees, meta, items, parts, pl, cam = 0, camX = 0, zoom = 1.25;
let bag, bagSlots, gems = 0;
let selKey = 'fist';      // item yang dipegang
let hot = [];             // isi hotbar (key), slot 0 = Tinju/Kunci Inggris
let prog;                 // level, xp, statistik, quest, goals
let spawn = {x:0, y:0};   // posisi pintu utama
let guest = false;        // mode tamu: menguji izin lock
let playerName = 'Kamu';  // = username akun
let playerFlag = 'ID';   // bendera dipilih saat login
let worn = {wings:null, hat:null, shirt:null, pants:null, tool:null};   // pakaian yang dipakai per slot
let jumpsLeft = 0;        // sisa lompatan udara (wings)
let worlds = {};          // nama world -> snapshot {fg,bgw,trees,meta,spawn}
let worldName = 'START';  // world yang sedang dibuka
const chat = [];          // riwayat chat & notifikasi
const GUEST_NAME = 'Tamu';
const settings = {sound:true, shake:true, showGrid:false, showNames:true, treeLabels:true};
const dmg = new Map();

function idx(x,y){ return y*COLS + x; }
function inWorld(x,y){ return x>=0 && x<COLS && y>=0 && y<ROWS; }
function tileAt(x,y){ if (!inWorld(x,y)) return 7; return fg[idx(x,y)]; }
function solidAt(x,y){
  const id = tileAt(x,y), d = BY_ID[id];
  if (!d) return false;
  if (id === 21){ const m = meta.get(idx(x,y)); return !!(m && m.locked && !canBuild(x,y)); }
  return d.solid;
}

// ---------- generator dunia ----------
function genTerrain(){
  fg = new Uint8Array(COLS*ROWS); bgw = new Uint8Array(COLS*ROWS);
  trees = new Map(); meta = new Map(); items = []; parts = []; markLocksDirty();
  const h = [];
  for (let x=0;x<COLS;x++) h[x] = Math.round(24 + Math.sin(x*.21)*1.6 + Math.sin(x*.07+1)*2.6);
  for (let x=0;x<COLS;x++) for (let y=0;y<ROWS;y++){
    const i = idx(x,y);
    if (y >= ROWS-2){ fg[i] = 7; continue; }          // bedrock 2 lapis
    if (y < h[x]) continue;
    bgw[i] = 40;
    const depth = y - h[x];
    let id = depth < 4 ? 1 : (Math.random() < .8 ? 2 : 1);
    if (depth > 6 && Math.random() < .06) id = 0;
    if (depth > 5){
      const r = Math.random();
      if (r < .045) id = 12; else if (r < .045 + .022*(depth/30)) id = 13;
      else if (depth > 22 && r < .075) id = 14;
    }
    fg[i] = id;
  }
  // kolam lava di bawah tanah
  for (let n=0;n<6;n++){
    const cx = 4 + (Math.random()*(COLS-8)|0), cy = ROWS - 3 - (Math.random()*10|0), w = 3 + (Math.random()*4|0);
    for (let dx=0;dx<w;dx++) for (let dy=0;dy<2;dy++){ const x=cx+dx, y=cy+dy; if (inWorld(x,y) && fg[idx(x,y)] !== 7){ fg[idx(x,y)] = 15; } }
  }
  // pintu utama di tengah, area spawn dibersihkan
  const sx = COLS>>1, sy = h[sx] - 1;
  for (let dx=-2;dx<=2;dx++){ const x = sx+dx; for (let y=h[x]-4; y<h[x]; y++) if (inWorld(x,y)) fg[idx(x,y)] = 0; fg[idx(x, h[sx])] = 1; }
  for (let dx=-2;dx<=2;dx++) for (let y=h[sx]; y<h[sx]+3; y++) if (fg[idx(sx+dx,y)] === 0 || fg[idx(sx+dx,y)] === 15) fg[idx(sx+dx,y)] = 1;
  fg[idx(sx,sy)] = 23; fg[idx(sx,sy+1)] = 7; spawn = {x: sx, y: sy};   // bedrock di bawah pintu utama
  // pohon awal
  for (let n=0;n<14;n++){
    const x = 2 + (Math.random()*(COLS-4)|0), y = h[x]-1;
    if (Math.abs(x - sx) > 2 && !tileAt(x,y) && solidAt(x,y+1)){
      fg[idx(x,y)] = 8; const kind = [1,2,3,4,5,6][Math.random()*6|0];
      trees.set(idx(x,y), {kind, t0: Date.now() - Math.random()*GROW_MS[kind]});
    }
  }
  dmg.clear();
}
function genWorld(){
  worlds = {}; worldName = 'START'; worn = {wings:null, hat:null, shirt:null, pants:null, tool:null};
  genTerrain(); worlds[worldName] = snapshotWorld();
  newPlayer();
  bagSlots = 16; gems = 50;
  bag = [{key:FIST,n:1},{key:WRENCH,n:1}];
  for (const id of [1,2,3,4,5]) bag.push({key:'b'+id, n:10});
  for (const id of [1,2,4]) bag.push({key:'s'+id, n:3});
  selKey = FIST; initHotbar(); prog = newProgress(); chat.length = 0;
  say('sys', 'Selamat datang di TileGrow. Ketik /help untuk perintah chat.');
}
function newPlayer(){
  pl = {x: spawn.x*TS + 3, y: spawn.y*TS + 2, vx:0, vy:0, w:26, h:30, face:1, onGround:false,
        step:0, swing:0, swingAng:0, land:0, coyote:0, buffer:0, jumpHeld:false,
        hp: MAX_HP, hurt:0, dead:0, regen:0, angel:0, kb:0};
  jumpsLeft = maxJumps() - 1;
}
function respawn(msg){
  const keepFace = pl ? pl.face : 1;
  newPlayer(); pl.face = keepFace;
  if (msg){ pl.angel = 1.6; pl.y -= TS*2.2; pl.vy = 0; }   // efek malaikat: turun dari atas pintu utama
  camX = pl.x - VW/zoom/2; cam = pl.y - VH/zoom/2; clampCam();
  if (msg) toast(msg);
}

// ---------- lock (ala Growtopia) ----------
// World Lock: seluruh world. Small/Big/Huge Lock: mengklaim N tile yang menyebar (flood fill) dari lock.
// Opsi 'ignoreAir' (atur lewat wrench): tile udara kosong tidak diklaim, jadi jatah habis untuk tile yang ada isinya.
// meta per tile: lock {type, owner, access:[], public, ignoreAir, tiles:[idx...]}
const lockOwnerOf = new Map();         // idx tile -> idx lock pemiliknya (cache, dibangun ulang saat perlu)
let lockCacheDirty = true;
function markLocksDirty(){ lockCacheDirty = true; }
function hasContent(i){ return fg[i] !== 0 || bgw[i] !== 0; }
// min-heap kecil untuk BFS berurutan jarak (cepat walau ada banyak udara)
function heapPush(h, it){ h.push(it); let i = h.length-1; while (i){ const p = (i-1)>>1; if (h[p][0] <= h[i][0]) break; [h[p],h[i]] = [h[i],h[p]]; i = p; } }
function heapPop(h){ const top = h[0], last = h.pop(); if (h.length){ h[0] = last; let i = 0;
  for(;;){ const l = 2*i+1, r = l+1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m],h[i]] = [h[i],h[m]]; i = m; } } return top; }
const LOCK_RADIUS = {small:6, big:10, huge:18};   // batas sebar supaya 'ignore air' tidak memindai seluruh langit
function claimTiles(li, m){
  const L = m.lock, cap = LOCK_TILES[L.type]; if (!cap) return [];
  const lx = li % COLS, ly = (li / COLS) | 0, rad = LOCK_RADIUS[L.type] || 10;
  const taken = new Set();
  for (const [i,o] of meta) if (o.lock && o.lock.tiles && i !== li) for (const t of o.lock.tiles) taken.add(t);
  const out = [], seen = new Set([li]), h = [[0, lx, ly]];
  while (h.length && out.length < cap){
    const [, x, y] = heapPop(h);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx = x+dx, ny = y+dy, ni = idx(nx,ny);
      if (!inWorld(nx,ny) || seen.has(ni) || taken.has(ni)) continue;
      if (Math.abs(nx-lx) > rad || Math.abs(ny-ly) > rad) continue;
      seen.add(ni);
      const d = (nx-lx)*(nx-lx) + (ny-ly)*(ny-ly);
      if (L.ignoreAir && !hasContent(ni)){ heapPush(h, [d, nx, ny]); continue; }   // udara: tidak diklaim, tetap disebari
      if (fg[ni] === 7) continue;
      out.push(ni); heapPush(h, [d, nx, ny]);
      if (out.length >= cap) break;
    }
  }
  return out;
}
function rebuildLockCache(){
  lockOwnerOf.clear();
  for (const [i,m] of meta){
    if (!m.lock || m.lock.type === 'world') continue;
    if (!m.lock.tiles) m.lock.tiles = claimTiles(i, m);
    lockOwnerOf.set(i, i);
    for (const t of m.lock.tiles) lockOwnerOf.set(t, i);
  }
  lockCacheDirty = false;
}
function locksCovering(x,y){
  if (lockCacheDirty) rebuildLockCache();
  const out = [], li = lockOwnerOf.get(idx(x,y));
  if (li !== undefined){ const m = meta.get(li); if (m && m.lock) out.push(m); }
  const wl = worldLock(); if (wl) out.push(wl);
  return out;
}
function worldLock(){ for (const [,m] of meta) if (m.lock && m.lock.type === 'world') return m; return null; }
function who(){ return guest ? GUEST_NAME : playerName; }
function hasAccess(m){ const u = who(); return m.lock.owner === u || m.lock.access.includes(u) || m.lock.public; }
function canBuild(x,y){
  const ls = locksCovering(x,y);
  if (!ls.length) return true;
  const area = ls.filter(m => m.lock.type !== 'world');
  if (area.length) return area.every(hasAccess);    // lock area lebih spesifik dari World Lock
  return ls.every(hasAccess);
}
function lockAt(x,y){ const m = meta.get(idx(x,y)); return m && m.lock ? m : null; }
function lockTilesOf(m){ if (lockCacheDirty) rebuildLockCache(); return m.lock.tiles || []; }
function reclaimLock(li){ const m = meta.get(li); if (!m || !m.lock || m.lock.type === 'world') return; m.lock.tiles = null; markLocksDirty(); rebuildLockCache(); }

// ---------- multi world ----------
function snapshotWorld(){
  return {fg: Array.from(fg), bgw: Array.from(bgw), trees: Array.from(trees.entries()),
          meta: Array.from(meta.entries()), spawn: {...spawn}, cols: COLS, rows: ROWS};
}
function restoreWorld(w){
  fg = Uint8Array.from(w.fg); bgw = Uint8Array.from(w.bgw);
  trees = new Map(w.trees); meta = new Map(w.meta); spawn = {...w.spawn};
  items = []; parts = []; dmg.clear(); markLocksDirty();
}
function storeCurrentWorld(){ if (fg) worlds[worldName] = snapshotWorld(); }
function worldList(){ return Object.keys(worlds).sort(); }
// nama world: hanya huruf & angka (tanpa spasi/simbol), maks 16, huruf besar
function normWorldName(n){ return String(n||'').trim().toUpperCase().slice(0,16); }
function validWorldName(n){ return /^[A-Z0-9]{1,16}$/.test(String(n||'').trim().toUpperCase()); }
const WORLD_RULE = 'Nama world hanya boleh huruf dan angka (tanpa spasi atau simbol), maks 16.';
// pindah ke world: yang lama disimpan dulu, jadi progresnya tidak hilang
function gotoWorld(name, opts){
  if (!validWorldName(name)) return toast(WORLD_RULE);
  const n = normWorldName(name);
  if (online()){ if (n === worldName) return toast('Kamu sudah di world ' + n + '.'); return netJoin(n); }
  if (n === worldName && worlds[n]) return toast('Kamu sudah di world ' + n + '.');
  storeCurrentWorld();
  worldName = n;
  if (worlds[n]){ restoreWorld(worlds[n]); say('sys', 'Masuk ke world ' + n + '.'); }
  else {
    genTerrain(); worlds[n] = snapshotWorld(); say('sys', 'World ' + n + ' dibuat.');
  }
  respawn(); refreshUI(); save();
}
function renameWorld(nm){
  if (online()) return toast('Ganti nama world belum bisa di mode online.');
  if (!validWorldName(nm)) return toast(WORLD_RULE);
  const n = normWorldName(nm);
  if (worlds[n] && n !== worldName) return toast('World ' + n + ' sudah ada.');
  delete worlds[worldName]; worldName = n; storeCurrentWorld();
  say('sys', 'World diganti nama jadi ' + n + '.'); refreshUI(); save();
}

// ---------- chat ----------
// jenis pesan: me (chat pemain), sys (sistem), pick (ambil barang), level/quest (progres), act (aktivitas: drop, beli, buang)
function say(kind, text){
  chat.push({kind, text, t: Date.now()});
  if (chat.length > 120) chat.shift();
  renderChat();
}
function playerSay(text){
  const t = String(text||'').trim().slice(0,120); if (!t) return;
  if (t[0] === '/' && !(online() && !['/help', '/worlds', '/who', '/warp', '/world'].includes(t.split(' ')[0].toLowerCase()))) return chatCommand(t);
  if (online()){
    // command (/...) diproses server; command staff hanya jalan untuk Moderator/Developer
    if (t[0] === '/' && !['/help', '/worlds', '/who', '/warp', '/world'].includes(t.split(' ')[0].toLowerCase())){ netSend({t: 'chat', text: t}); return; }
    if (t[0] !== '/'){ chat.push({kind: 'me', text: (net.display || who()) + ': ' + t, t: Date.now(), role: net.role}); if (chat.length > 120) chat.shift(); renderChat();
      netSend({t: 'chat', text: t}); bubble = {text: t, t0: Date.now(), until: Date.now() + 2500 + t.length*90}; return; }
  }
  say('me', who() + ': ' + t);
  bubble = {text: t, t0: Date.now(), until: Date.now() + 2500 + t.length*90};   // balon chat di atas kepala
}
let bubble = null;
function chatCommand(line){
  const [cmd, ...rest] = line.slice(1).split(' ');
  const arg = rest.join(' ');
  const c = cmd.toLowerCase();
  if (c === 'warp' || c === 'world'){ if (!arg) return say('sys','Pakai: /warp NAMA'); return gotoWorld(arg); }
  if (c === 'worlds') return online() ? say('sys', 'World di server: ' + net.worldList.map(w => w.name).join(', ')) : say('sys', 'World kamu: ' + worldList().join(', '));
  if (c === 'who' && online()) return say('sys', 'Di world ini: ' + [who(), ...[...net.players.values()].map(r => r.name)].join(', '));
  if (c === 'help') return say('sys', 'Perintah: /warp NAMA, /worlds, ' + (online() ? '/who, ' : '') + '/help' + (online() && net.role !== 'player' ? ' · staff: /staffhelp' : ''));
  say('sys', 'Perintah tidak dikenal: /' + c);
}
function setPlayerName(n){
  const t = String(n||'').trim();
  if (!/^[A-Za-z0-9]{3,16}$/.test(t)) return toast('Nama hanya huruf dan angka, 3–16 karakter.');
  // pemilik lock ikut diganti supaya tetap jadi pemilik
  for (const [,m] of meta) if (m.lock && m.lock.owner === playerName) m.lock.owner = t;
  for (const w of Object.values(worlds)) for (const [,m] of w.meta) if (m && m.lock && m.lock.owner === playerName) m.lock.owner = t;
  playerName = t; say('sys','Nama kamu sekarang ' + t + '.'); refreshUI(); save();
}

// ---------- pakaian (wearables) ----------
function isWorn(key){ const w = WEAR[key]; return !!(w && worn[w.slot] === key); }
function toggleWear(key){
  const w = WEAR[key]; if (!w) return;
  if (worn[w.slot] === key){ worn[w.slot] = null; say('sys', w.name + ' dilepas.'); }
  else {
    worn[w.slot] = key; questEvent('wear', null, 1); if (online()) netSend({t:'stat', k:'wear'});
    say('sys', w.name + ' dipakai.' + (w.jumps ? ' Lompat ' + w.jumps + ' kali.' : ''));
  }
  refreshUI();
}
function wingsDef(){ return worn.wings ? WEAR[worn.wings] : null; }
function toolDef(){ return worn.tool ? WEAR[worn.tool] : null; }
function maxJumps(){ const w = wingsDef(); return w ? w.jumps : 1; }

// ---------- inventory ----------
function countOf(key){ const s = bag.find(s=>s.key===key); return s ? s.n : 0; }
function canAdd(key, n){ const s = bag.find(s=>s.key===key); if (s) return Math.min(n, STACK - s.n); return bag.length < bagSlots ? Math.min(n, STACK) : 0; }
// notifikasi "dapat x item" digabung 1,2 detik supaya chat tidak banjir
let pickBuf = {}, pickT = 0;
function notePickup(key, n){
  pickBuf[key] = (pickBuf[key] || 0) + n;
  clearTimeout(pickT);
  pickT = setTimeout(()=>{
    for (const k in pickBuf) say('pick', '+' + pickBuf[k] + ' ' + itemDef(k).name);
    pickBuf = {};
  }, 1200);
}
function addItem(key, n){
  if (key === 'gem'){ gems += n; notePickup('gem', n); questEvent('collect','gem',n); refreshUI(); return n; }
  const k = canAdd(key, n); if (k <= 0) return 0;
  const s = bag.find(s=>s.key===key);
  if (s) s.n += k;
  else {
    bag.push({key, n:k});
    if (hot && itemDef(key).kind !== 'wear' && key !== WRENCH){
      const empty = hot.findIndex((h,i) => i > 0 && !h);
      if (empty > 0) hot[empty] = key; else if (hot.length < HOT_SIZE) hot.push(key);
    }
  }
  questEvent('collect', key, k); notePickup(key, k); refreshUI(); return k;
}
function takeItem(key, n){
  const i = bag.findIndex(s=>s.key===key); if (i < 0 || key === FIST) return 0;
  const k = Math.min(n, bag[i].n); bag[i].n -= k;
  if (bag[i].n <= 0){
    bag.splice(i,1);
    if (selKey === key) selKey = hot[0] || FIST;
    hot = hot.map(h => h === key ? null : h);
    const wd = WEAR[key]; if (wd && worn[wd.slot] === key) worn[wd.slot] = null;
  }
  refreshUI(); return k;
}
function selected(){ return bag.find(s => s.key === selKey) || bag.find(s => s.key === FIST) || bag[0]; }
function select(key){ selKey = key; refreshUI(); }
// hotbar ala Growtopia: memilih item dari tas memasukkannya ke hotbar (paling kiri setelah slot 0)
const HOT_SIZE = 4;   // seperti Growtopia: Tinju/Kunci Inggris + 3 item terakhir dipilih
function putInHotbar(key){
  if (key === FIST || key === WRENCH){ hot[0] = key; return; }
  if (hot.includes(key)) return;
  const rest = hot.slice(1).filter(Boolean);
  rest.unshift(key);
  hot = [hot[0] || FIST, ...rest.slice(0, HOT_SIZE - 1)];
}
function pickFromBag(key){
  if (itemDef(key).kind === 'wear') return toggleWear(key);
  putInHotbar(key); select(key);
}
// klik 2x slot 0: gantian Tinju <-> Kunci Inggris
function toggleFistWrench(){
  if (!countOf(WRENCH)) return toast('Kamu tidak punya Kunci Inggris. Beli di Toko.');
  const k = (hot[0] === WRENCH) ? FIST : WRENCH;
  hot[0] = k; select(k);
}
function initHotbar(){
  hot = [FIST];
  for (const s of bag) if (s.key !== FIST && s.key !== WRENCH && itemDef(s.key).kind !== 'wear' && hot.length < HOT_SIZE) hot.push(s.key);
}
function bagUpgradeCost(){ return 50 * Math.pow(2, (bagSlots - 16) / 8); }

// ---------- progres: level, xp, quest, goals ----------
const GOALS = [
  {id:'break100', name:'Penghancur', desc:'Pecahkan 100 block', stat:'broken', need:100, gems:50},
  {id:'break1k',  name:'Mesin Bor',  desc:'Pecahkan 1.000 block', stat:'broken', need:1000, gems:300},
  {id:'harvest25',name:'Petani',     desc:'Panen 25 pohon', stat:'harvested', need:25, gems:60},
  {id:'splice5',  name:'Ilmuwan',    desc:'Splice 5 kali', stat:'spliced', need:5, gems:60},
  {id:'place200', name:'Arsitek',    desc:'Pasang 200 block', stat:'placed', need:200, gems:80},
  {id:'ore20',    name:'Penambang',  desc:'Pecahkan 20 bijih', stat:'ores', need:20, gems:100},
  {id:'lv5',      name:'Naik Daun',  desc:'Capai level 5', stat:'level', need:5, gems:150},
  {id:'lock1',    name:'Tuan Tanah', desc:'Pasang sebuah World Lock', stat:'worldLocks', need:1, gems:100}
];
const QUEST_POOL = [
  {type:'break',   key:null, need:[30,60],  text:n=>'Pecahkan '+n+' block', xp:40, gems:30},
  {type:'harvest', key:null, need:[3,6],    text:n=>'Panen '+n+' pohon', xp:50, gems:35},
  {type:'collect', key:'b9', need:[5,15],   text:n=>'Kumpulkan '+n+' Bata', xp:60, gems:45},
  {type:'collect', key:'b2', need:[20,40],  text:n=>'Kumpulkan '+n+' Batu', xp:35, gems:25},
  {type:'place',   key:null, need:[20,40],  text:n=>'Pasang '+n+' block', xp:35, gems:25},
  {type:'ore',     key:null, need:[3,6],    text:n=>'Pecahkan '+n+' bijih', xp:70, gems:55},
  {type:'deliver', key:'b4', need:[10,20],  text:n=>'Serahkan '+n+' Daun', xp:45, gems:40},
  {type:'deliver', key:'b1', need:[25,50],  text:n=>'Serahkan '+n+' Tanah', xp:40, gems:35},
  {type:'splice',  key:null, need:[1,3],    text:n=>'Splice '+n+' kali', xp:60, gems:50},
  {type:'plant',   key:null, need:[5,10],   text:n=>'Tanam '+n+' seed', xp:35, gems:25},
  {type:'bgbreak', key:null, need:[10,25],  text:n=>'Pecahkan '+n+' dinding gua', xp:40, gems:30},
  {type:'collect', key:'gem',need:[50,120], text:n=>'Kumpulkan '+n+' gems', xp:45, gems:20},
  {type:'collect', key:'b17',need:[5,12],   text:n=>'Kumpulkan '+n+' Papan Gelap', xp:65, gems:50},
  {type:'collect', key:'b10',need:[5,12],   text:n=>'Kumpulkan '+n+' Lumut', xp:65, gems:50},
  {type:'deliver', key:'b2', need:[30,60],  text:n=>'Serahkan '+n+' Batu', xp:45, gems:40},
  {type:'deliver', key:'s1', need:[5,10],   text:n=>'Serahkan '+n+' Seed Tanah', xp:50, gems:45},
  {type:'jump',    key:null, need:[30,60],  text:n=>'Lompat '+n+' kali', xp:25, gems:15},
  {type:'level',   key:null, need:[1,1],    text:()=>'Naik 1 level', xp:0, gems:80},
  {type:'buy',     key:null, need:[1,2],    text:n=>'Beli '+n+' barang di Toko', xp:20, gems:20},
  {type:'wear',    key:null, need:[1,1],    text:()=>'Pakai 1 item wearable', xp:30, gems:30}
];
const QUESTS_PER_DAY = 5;
function newProgress(){
  const p = {level:1, xp:0, stats:{broken:0,harvested:0,spliced:0,placed:0,ores:0,worldLocks:0,deaths:0},
             goalsDone:{}, quests:[], questDay:'', bestiary:[], lobbyHistory:[]};
  return p;
}
function today(){ const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function rollQuests(){
  if (prog.questDay === today() && prog.quests.length) return;
  prog.questDay = today();
  const pool = QUEST_POOL.slice().sort(()=>Math.random()-.5).slice(0,QUESTS_PER_DAY);
  prog.quests = pool.map(q=>{ const n = q.need[0] + (Math.random()*(q.need[1]-q.need[0]+1)|0);
    return {type:q.type, key:q.key, need:n, have:0, text:q.text(n), xp:q.xp, gems:q.gems, done:false, claimed:false}; });
}
// bestiary: resep yang sudah pernah di-splice (sisanya misteri)
function recipeKey(a,b){ return Math.min(a,b) + '+' + Math.max(a,b); }
function discoverRecipe(a, b, out){
  prog.bestiary = prog.bestiary || [];
  const k = recipeKey(a,b);
  if (prog.bestiary.includes(k)) return;
  prog.bestiary.push(k);
  say('level', 'Bestiary baru: ' + BY_ID[a].name + ' + ' + BY_ID[b].name + ' = ' + BY_ID[out].name + '!');
  toast('Resep baru ditemukan: ' + BY_ID[out].name);
}
function questEvent(type, key, n){
  if (!prog) return;
  for (const q of prog.quests){
    if (q.done || q.type === 'deliver') continue;
    if (q.type !== type) continue;
    if (q.key && q.key !== key) continue;
    q.have = Math.min(q.need, q.have + n);
    if (q.have >= q.need){ q.done = true; toast('Quest selesai: ' + q.text + '. Klaim di tab Quest.');
      say('quest', 'Quest selesai: ' + q.text + '. Klaim di tab Quest.'); }
  }
}
function claimQuest(i){
  const q = prog.quests[i]; if (!q || q.claimed) return;
  if (q.type === 'deliver'){
    if (countOf(q.key) < q.need) return toast('Butuh ' + q.need + ' ' + itemDef(q.key).name + '.');
    takeItem(q.key, q.need); q.have = q.need; q.done = true;
  }
  if (!q.done) return;
  q.claimed = true; gems += q.gems; say('quest', 'Hadiah quest: +' + q.gems + ' gems, +' + q.xp + ' XP');
  addXP(q.xp); toast('+' + q.gems + ' gems, +' + q.xp + ' XP'); refreshUI();
}
function addXP(n){
  prog.xp += n;
  while (prog.xp >= xpNeeded(prog.level)){
    prog.xp -= xpNeeded(prog.level); prog.level++; questEvent('level', null, 1);
    const g = levelReward(prog.level); gems += g;
    toast('Naik ke level ' + prog.level + '. Bonus ' + g + ' gems.');
    say('level', 'Naik ke level ' + prog.level + '. Bonus ' + g + ' gems.');
    burst(pl.x + pl.w/2, pl.y, '#ffe27a', 24);
    sfx('level');
  }
  checkGoals(); refreshUI();
}
function stat(k, n){ prog.stats[k] = (prog.stats[k] || 0) + n; checkGoals(); }
function checkGoals(){
  for (const g of GOALS){
    if (prog.goalsDone[g.id]) continue;
    const v = g.stat === 'level' ? prog.level : (prog.stats[g.stat] || 0);
    if (v >= g.need){ prog.goalsDone[g.id] = true; gems += g.gems;
      toast('Goal tercapai: ' + g.name + ' (+' + g.gems + ' gems)');
      say('level', 'Goal tercapai: ' + g.name + ' (+' + g.gems + ' gems)'); }
  }
}
