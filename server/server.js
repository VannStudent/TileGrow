// TileGrow LAN server v1.3 — tanpa paket npm (Node >= 18).
// - HTTP: menyajikan game (tilegrow.html + js/) supaya HP/laptop di WiFi yang sama cukup buka http://IP-PC:PORT
// - WebSocket (/ws): akun, daftar world, world bersama, sinkron block, posisi pemain, chat
// - Data disimpan di server/data: accounts.json, players/<user>.json, worlds/<NAMA>.json, staff-log.jsonl, reports.json,
//   ipbans.json, trade-log.jsonl
// v1.3: server MEMEGANG tas, gems, XP, quest (server/econ.js memakai aturan dari js/data.js + js/world.js).
//   Pasang block mengambil item dari tas di server, pecah block menghasilkan drop di server, drop & pickup dibagi semua pemain.
//   Ditambah role (owner/dev/mod), command staff, teman, report, dan trade aman (server/social.js).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const readline = require('readline');
const {loadEcon} = require('./econ');
const {createSocial, RANK} = require('./social');

const PORT = +process.env.PORT || 8080;
const VERSION = 'v1.4';
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const COLS = 100, ROWS = 60, N = COLS * ROWS;
const MAX_MSG = 2 * 1024 * 1024;
const TEST = process.env.TILEGROW_TEST === '1';          // khusus tes otomatis: world dari klien diterima + /testgive
const econ = loadEcon(ROOT);
const {D} = econ;

for (const d of [DATA, path.join(DATA, 'players'), path.join(DATA, 'worlds')]) fs.mkdirSync(d, {recursive: true});

// ---------- penyimpanan ----------
function readJSON(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return fallback; } }
function writeJSON(file, obj){ const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
const ACC_FILE = path.join(DATA, 'accounts.json');
const accounts = readJSON(ACC_FILE, {});              // lower -> {name, salt, hash, flag, created}
const saveAccounts = () => writeJSON(ACC_FILE, accounts);
const playerFile = u => path.join(DATA, 'players', u.toLowerCase() + '.json');
const worldFile = n => path.join(DATA, 'worlds', n + '.json');

const worlds = new Map();                            // nama -> {data, timer, drops: Map}
let nextDrop = 1;
function validWorldName(n){ return typeof n === 'string' && /^[A-Z0-9]{1,16}$/.test(n); }
const isLocalIp = ip => ip === '127.0.0.1' || ip === '::1' || Object.values(os.networkInterfaces()).some(l => (l || []).some(a => a.address === ip));
function loadWorld(name){
  if (worlds.has(name)) return worlds.get(name);
  const data = readJSON(worldFile(name), null);
  if (!data) return null;
  const w = {name, data, timer: null, drops: new Map()};
  worlds.set(name, w); return w;
}
function scheduleWorldSave(w){
  if (w.timer) return;
  w.timer = setTimeout(()=>{ w.timer = null; writeJSON(worldFile(w.name), w.data); }, 1500);
}
function flushAll(){ for (const w of worlds.values()) if (w.timer){ clearTimeout(w.timer); w.timer = null; writeJSON(worldFile(w.name), w.data); } }
function worldOwner(data){ for (const [, m] of data.meta) if (m && m.lock && m.lock.type === 'world') return m.lock.owner; return null; }
function listWorlds(){
  const names = new Set(fs.readdirSync(path.join(DATA, 'worlds')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));
  for (const n of worlds.keys()) names.add(n);
  return [...names].filter(validWorldName).sort().map(n => {
    const w = loadWorld(n);
    return {name: n, owner: w ? worldOwner(w.data) : null, players: [...clients].filter(c => c.world === n).length};
  });
}

// ---------- password: scrypt + salt (password asli tidak pernah disimpan) ----------
function safeEq(a, b){ const A = Buffer.from(a, 'hex'), B = Buffer.from(b, 'hex'); return A.length === B.length && crypto.timingSafeEqual(A, B); }
const FLAGS = new Set(['ID','MY','SG','PH','TH','VN','JP','KR','CN','IN','US','GB','DE','FR','IT','BR','AU','SA','TR','NL']);

// ---------- validasi data dari browser ----------
const isByte = v => Number.isInteger(v) && v >= 0 && v < 256;
function validWorldData(d){
  return d && Array.isArray(d.fg) && d.fg.length === N && d.fg.every(isByte) && Array.isArray(d.bgw) && d.bgw.length === N && d.bgw.every(isByte)
    && Array.isArray(d.trees) && Array.isArray(d.meta) && d.spawn && Number.isInteger(d.spawn.x) && Number.isInteger(d.spawn.y);
}
// v1.0.1: id block yang dikenal (sama dengan data.js). Block lain ditolak.
const FG_IDS = new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,30,31,32,33,34,41,42,50,51,52,53,54,60,61,62]);
const BG_IDS = new Set([0,40]);
const PROTECTED = new Set([7, 23]);                    // Dasar & Pintu Utama: tidak bisa dipasang / dihapus pemain
const LOCK_TYPE = {30: 'world', 31: 'small', 32: 'big', 33: 'huge', 34: 'world'};
const LOCK_TILES = {small: 10, big: 48, huge: 200}, LOCK_RADIUS = {small: 6, big: 10, huge: 18};
// jenis pohon: semua seed (SEEDABLE di data.js) + hasil splice (RECIPES), termasuk Bijih Pirus (14)
const SEED_KINDS = new Set([1,2,3,4,5,6,9,10,11,14,15,16,17,18,41,42,50,51,52,53,54]);
const isName = v => typeof v === 'string' && /^[A-Za-z0-9]{1,16}$/.test(v);
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
// bentuk meta harus cocok dengan block-nya; kalau tidak, data bisa membuat game pemain lain error
function validMeta(f, i, mt){
  const need = LOCK_TYPE[f] ? 'lock' : f === 20 ? 'sign' : f === 21 ? 'door' : f === 22 ? 'display' : f === 62 ? 'vend' : null;
  if (!need) return mt === null || mt === undefined;
  if (!mt || typeof mt !== 'object' || Object.keys(mt).length !== 1 || !mt[need] || typeof mt[need] !== 'object') return false;
  const v = mt[need];
  if (need === 'sign') return isStr(v.text, 120);
  if (need === 'door') return isStr(v.name, 24) && typeof v.locked === 'boolean';
  if (need === 'display') return v.key === null || (isStr(v.key, 24) && /^[a-z0-9_]+$/i.test(v.key));
  if (need === 'vend') return isName(v.owner) && (v.key === null || (econ.isKey(v.key) && v.key !== D.FIST && v.key !== D.WRENCH))
    && Number.isInteger(v.n) && v.n >= 0 && v.n <= D.STACK && Number.isInteger(v.price) && v.price >= 0 && v.price <= VEND_PRICE_MAX
    && Number.isInteger(v.earned) && v.earned >= 0 && (v.key !== null || v.n === 0);
  // lock
  if (v.type !== LOCK_TYPE[f] || !isName(v.owner) || !Array.isArray(v.access) || v.access.length > 50 || !v.access.every(a => isStr(a, 16))
      || typeof v.public !== 'boolean' || (v.ignoreAir !== undefined && typeof v.ignoreAir !== 'boolean')) return false;
  if (v.tiles === null || v.tiles === undefined) return true;
  if (v.type === 'world' || !Array.isArray(v.tiles) || v.tiles.length > LOCK_TILES[v.type]) return false;
  const lx = i % COLS, ly = (i / COLS) | 0, r = LOCK_RADIUS[v.type];
  return v.tiles.every(t => Number.isInteger(t) && t >= 0 && t < N && Math.abs(t % COLS - lx) <= r && Math.abs(((t / COLS) | 0) - ly) <= r);
}
function validTree(f, tr){
  if (f !== 8) return tr === null || tr === undefined;
  return !!tr && typeof tr === 'object' && SEED_KINDS.has(tr.kind) && typeof tr.t0 === 'number' && isFinite(tr.t0)
    && (tr.spliced === undefined || typeof tr.spliced === 'boolean') && Object.keys(tr).every(k => k === 'kind' || k === 't0' || k === 'spliced');
}
// peta lock: tile -> index lock area yang mengklaimnya, + World Lock (kalau ada)
function lockIndex(meta){
  const owner = new Map(); let world = null;
  for (const [i, m] of meta){
    if (!m || !m.lock) continue;
    if (m.lock.type === 'world'){ world = m.lock; continue; }
    owner.set(i, i);
    for (const t of m.lock.tiles || []) if (!owner.has(t)) owner.set(t, i);
  }
  return {owner, world};
}
const hasAccess = (L, u) => L.owner === u || L.access.includes(u) || L.public;
// aturan sama dengan canBuild() di browser: lock area lebih spesifik dari World Lock
function canBuildAt(meta, li, i, u){
  const a = li.owner.get(i);
  if (a !== undefined){ const m = meta.get(a); if (m && m.lock) return hasAccess(m.lock, u); }
  return !li.world || hasAccess(li.world, u);
}
// cek satu perubahan tile dari pemain u. Hasil: alasan ditolak (string) atau null kalau boleh
function checkOp(d, meta, trees, li, u, op){
  const [i, f, b, mt, tr] = op;
  const om = meta.get(i) || null, ot = trees.get(i) || null;
  if (d.fg[i] === f && d.bgw[i] === b && JSON.stringify(om) === JSON.stringify(mt) && JSON.stringify(ot) === JSON.stringify(tr)) return null;
  if (!FG_IDS.has(f) || !BG_IDS.has(b)) return 'block tidak dikenal';
  if ((PROTECTED.has(d.fg[i]) || PROTECTED.has(f)) && d.fg[i] !== f) return 'block dasar/pintu utama';
  if (!validMeta(f, i, mt) || !validTree(f, tr)) return 'data block tidak valid';
  if (!canBuildAt(meta, li, i, u)) return 'area dikunci';
  const oldLock = om && om.lock, newLock = mt && mt.lock;
  if (oldLock && oldLock.owner !== u) return 'lock milik orang lain';
  if (newLock){
    if (oldLock){ if (newLock.owner !== oldLock.owner || newLock.type !== oldLock.type) return 'lock tidak boleh pindah tangan'; }
    else {
      if (newLock.owner !== u) return 'pemilik lock palsu';
      if (newLock.type === 'world'){
        for (const [, m] of meta) if (m && m.lock && (m.lock.type === 'world' || m.lock.owner !== u)) return 'world sudah dikunci';
      } else if (li.owner.has(i)) return 'tile sudah diklaim lock lain';
    }
    if (newLock.tiles) for (const t of newLock.tiles){ const o = li.owner.get(t); if (o !== undefined && o !== i) return 'klaim tile bertabrakan'; }
  }
  return null;
}
// v1.3: world baru dibuat oleh server (generator yang sama dengan browser), jadi isi tambang tidak bisa dipalsukan
function newWorldData(){ const d = econ.genWorldData(); return {...d, cols: COLS, rows: ROWS, created: Date.now()}; }
function cleanWorld(d, user){
  const meta = new Map(), trees = new Map(), ok = e => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < N;
  for (const e of d.meta) if (ok(e) && validMeta(d.fg[e[0]], e[0], e[1]) && !(e[1] && e[1].lock && e[1].lock.owner !== user)) meta.set(e[0], e[1]);
  for (const e of d.trees) if (ok(e) && validTree(d.fg[e[0]], e[1])) trees.set(e[0], e[1]);
  return {fg: d.fg, bgw: d.bgw, trees: [...trees.entries()], meta: [...meta.entries()], spawn: {x: d.spawn.x, y: d.spawn.y}, cols: COLS, rows: ROWS, created: Date.now()};
}

// ---------- WebSocket minimal (RFC 6455) ----------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsFrame(str){
  const p = Buffer.from(str), n = p.length;
  let h;
  if (n < 126){ h = Buffer.alloc(2); h[1] = n; }
  else if (n < 65536){ h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  h[0] = 0x81; return Buffer.concat([h, p]);
}
function wsControl(op, payload){ const p = payload || Buffer.alloc(0); return Buffer.concat([Buffer.from([0x80 | op, p.length]), p]); }

const clients = new Set();
let nextId = 1;
class Client {
  constructor(sock){
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = [];
    this.id = nextId++; this.user = null; this.flag = 'ID'; this.world = null; this.state = null;
    this.rate = {t: Date.now(), n: 0}; this.alive = true; this.authBusy = false;
    this.noclip = false; this.fullzoom = false; this.invis = false; this.frozen = false; this.lastPos = null;
    this.ip = String(sock.remoteAddress || '').replace(/^::ffff:/, '');
    sock.on('data', d => this.onData(d));
    sock.on('close', () => this.onClose());
    sock.on('error', () => {});
  }
  send(obj){ if (this.alive) try { this.sock.write(wsFrame(JSON.stringify(obj))); } catch(e){} }
  close(){ if (!this.alive) return; try { this.sock.write(wsControl(8)); this.sock.end(); } catch(e){} }
  onData(d){
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > MAX_MSG + 16) return this.sock.destroy();
    for (;;){
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126){ if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127){ if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MSG) return this.sock.destroy();
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked){ const k = this.buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= k[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 8){ this.close(); return; }
      if (op === 9){ try { this.sock.write(wsControl(10, payload)); } catch(e){} continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0){
        this.frag.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(this.frag).toString('utf8'); this.frag = [];
        let msg; try { msg = JSON.parse(text); } catch(e){ continue; }
        if (!this.limit()) continue;
        try { handle(this, msg); } catch(e){ console.error('handler error', e); }
      }
    }
  }
  limit(){ const now = Date.now(); if (now - this.rate.t > 1000){ this.rate = {t: now, n: 0}; } return ++this.rate.n <= 300; }
  onClose(){ if (!this.alive) return; this.alive = false; leaveWorld(this); clients.delete(this); }
}

function inWorld(name){ return [...clients].filter(c => c.world === name); }
function broadcast(world, obj, except){ const f = wsFrame(JSON.stringify(obj)); for (const c of clients) if (c.world === world && c !== except && c.alive) try { c.sock.write(f); } catch(e){} }
function findOnline(name){ const k = String(name || '').toLowerCase(); for (const c of clients) if (c.user && c.user.toLowerCase() === k) return c; return null; }
// pemain invisible (dev /invis) tidak dikirim ke pemain biasa
const visibleTo = (o, viewer) => !o.invis || social.rankOf(viewer.user) >= RANK.mod;
function playerInfo(o){ return {id: o.id, name: o.user, display: social.display(o.user), role: social.roleOf(o.user), flag: o.flag, state: o.state}; }
function leaveWorld(c){
  if (!c.world) return;
  social.onLeave(c);
  const w = c.world; c.world = null; c.state = null;
  for (const o of clients) if (o.world === w && o !== c && visibleTo(c, o)) o.send({t: 'pleave', id: c.id, name: c.user});
}
function enterWorld(c, w){
  leaveWorld(c);
  c.world = w.name; c.state = null; c.lastPos = null;
  const players = inWorld(w.name).filter(o => o !== c && visibleTo(o, c)).map(playerInfo);
  c.send({t: 'world', name: w.name, you: c.id, data: w.data, players, drops: [...w.drops.values()]});
  for (const o of clients) if (o.world === w.name && o !== c && visibleTo(c, o)) o.send({t: 'pjoin', ...playerInfo(c)});
}
function refreshVisibility(c){
  if (!c.world) return;
  for (const o of clients) if (o.world === c.world && o !== c && social.rankOf(o.user) < RANK.mod)
    o.send(c.invis ? {t: 'pleave', id: c.id, name: c.user, quiet: true} : {t: 'pjoin', ...playerInfo(c), quiet: true});
}
function kickClient(o, reason){ o.send({t: 'kicked', reason}); leaveWorld(o); o.user = null; setTimeout(() => o.close(), 50); }

function cleanWornS(w){ const o = {}; if (w && typeof w === 'object') for (const k of ['wings','hat','shirt','pants','tool']) if (isStr(w[k], 24)) o[k] = w[k]; return o; }

// ---------- ekonomi per pemain (dipegang server) ----------
const econs = new Map();                              // lower -> {bag, bagSlots, gems, prog}
const econTimers = new Map();
function econOf(user){
  const k = String(user || '').toLowerCase();
  if (econs.has(k)) return econs.get(k);
  const f = readJSON(playerFile(user), null);
  let E;
  if (f && f.econ && Array.isArray(f.econ.bag)) E = f.econ;
  else {
    E = econ.newEcon();
    // pindahan dari v1.2 (dulu browser yang menyimpan): progres level/quest dipakai, tas & gems dibatasi supaya tidak bisa dicurangi
    if (f && f.v === 10 && f.prog && typeof f.prog === 'object' && Number.isInteger(f.prog.level)){
      E.prog = Object.assign(E.prog, {level: Math.min(f.prog.level, 30), xp: 0, bestiary: Array.isArray(f.prog.bestiary) ? f.prog.bestiary.slice(0, 50) : []});
      if (Array.isArray(f.bag)) for (const sl of f.bag) if (sl && econ.isKey(sl.key) && Number.isInteger(sl.n) && sl.n > 0 && !E.bag.some(x => x.key === sl.key) && E.bag.length < E.bagSlots) E.bag.push({key: sl.key, n: Math.min(sl.n, D.STACK)});
      if (Number.isInteger(f.gems)) E.gems = Math.max(0, Math.min(f.gems, 5000));
      if (Number.isInteger(f.bagSlots)) E.bagSlots = Math.max(16, Math.min(64, f.bagSlots));
      console.log('[econ] migrasi save v1.2', user);
    }
  }
  econs.set(k, E); return E;
}
function saveEcon(user){
  const k = String(user).toLowerCase();
  if (econTimers.has(k)) return;
  econTimers.set(k, setTimeout(() => { econTimers.delete(k); writePlayer(user); }, 1000));
}
function writePlayer(user){
  const k = String(user).toLowerCase(), E = econs.get(k); if (!E) return;
  const f = readJSON(playerFile(user), {}) || {};
  f.econ = E; f.v = 13;
  writeJSON(playerFile(user), f);
}
function flushEcons(){ for (const [k, t] of econTimers){ clearTimeout(t); econTimers.delete(k); const a = accounts[k]; if (a) writePlayer(a.name); } }
// kirim keadaan ekonomi terbaru ke pemain + pesan (naik level, quest selesai, dll)
function pushEcon(c, extra){
  const E = econOf(c.user);
  c.send({t: 'econ', bag: E.bag, bagSlots: E.bagSlots, gems: E.gems, prog: E.prog, msgs: [...econ.out.splice(0), ...(extra || [])]});
}

// ---------- drop item (dibagi semua pemain di world) ----------
const DROP_MAX = 400;
function spawnDropS(w, x, y, key, n, lockMs, owner){
  if (w.drops.size >= DROP_MAX){ const first = w.drops.keys().next().value; w.drops.delete(first); broadcast(w.name, {t: 'dropDel', id: first}); }
  const d = {id: nextDrop++, x: Math.round(x), y: Math.round(y), key, n, t: Date.now(), lock: Date.now() + (lockMs || 250), owner: owner || null};
  w.drops.set(d.id, d);
  broadcast(w.name, {t: 'dropAdd', d});
  return d;
}
function dropsAt(w, tx, ty, list, lockMs){ for (const [k, n] of list) spawnDropS(w, tx * TS + TS / 2 + (Math.random() - .5) * 14, ty * TS + TS / 2, k, n, lockMs); }
const TS = D.TS;
// drop yang tidak diambil hilang setelah 10 menit
setInterval(() => { const now = Date.now(); for (const w of worlds.values()) for (const [id, d] of w.drops) if (now - d.t > 600e3){ w.drops.delete(id); broadcast(w.name, {t: 'dropDel', id}); } }, 30e3).unref();

// ---------- cek gerakan (anti teleport / terbang / tembus) ----------
// server tidak menjalankan fisika penuh; cukup batas kecepatan + tidak boleh berada di dalam block padat.
// Staff dengan /noclip dibebaskan.
const MAX_SPEED = 900;                                 // px/dtk (jalan 230, jatuh 430, lompat sayap ~900)
function insideSolid(d, x, y){
  const x0 = Math.floor((x + 3) / TS), x1 = Math.floor((x + 23) / TS), y0 = Math.floor((y + 3) / TS), y1 = Math.floor((y + 27) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++){
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
    const id = d.fg[ty * COLS + tx];
    if (id === 21){ continue; }                           // pintu: bisa dilewati (pintu terkunci dicek di browser)
    if (econ.solid(id)) return true;
  }
  return false;
}
function checkMove(c, w, s){
  if (c.noclip) return true;
  const now = Date.now(), last = c.lastPos;
  if (c.frozen && last) return false;
  if (insideSolid(w.data, s.x, s.y)) return false;
  if (last){
    const dt = Math.max(.05, (now - last.t) / 1000), dist = Math.hypot(s.x - last.x, s.y - last.y);
    if (dist > MAX_SPEED * dt + TS * 2) return false;
  }
  return true;
}
// jarak pemain ke tile (REACH di browser = 2 tile; server memberi kelonggaran 1 tile karena lag)
function inReachS(c, tx, ty){
  if (c.noclip || !c.state) return true;
  const px = Math.floor((c.state.x + 13) / TS), py = Math.floor((c.state.y + 15) / TS);
  return Math.abs(tx - px) <= D.REACH + 1 && Math.abs(ty - py) <= D.REACH + 1;
}

// ---------- batas percobaan login (anti tebak password) ----------
// 5 gagal dalam 60 dtk (per IP atau per username) = diblokir 60 dtk. Akun baru maks 5 per IP per jam.
const FAIL_MAX = 5, FAIL_WINDOW = 60000, FAIL_BLOCK = 60000, REG_MAX = 5, REG_WINDOW = 3600000;
const fails = new Map(), regs = new Map();
function blockedFor(key){ const f = fails.get(key); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(key){
  const now = Date.now(), f = fails.get(key) || {n: 0, t: now, until: 0};
  if (now - f.t > FAIL_WINDOW){ f.n = 0; f.t = now; }
  if (++f.n >= FAIL_MAX){ f.until = now + FAIL_BLOCK; f.n = 0; f.t = now; }
  fails.set(key, f);
}
setInterval(()=>{ const now = Date.now();
  for (const [k, f] of fails) if (f.until < now && now - f.t > FAIL_WINDOW) fails.delete(k);
  for (const [k, r] of regs) if (now - r.t > REG_WINDOW) regs.delete(k); }, 60000).unref();
// scrypt async: login tidak lagi membekukan server untuk pemain lain
const scryptAsync = (pass, salt) => new Promise((res, rej) => crypto.scrypt(String(pass), salt, 32, (e, k) => e ? rej(e) : res(k.toString('hex'))));


async function handleAuth(c, m, t){
  const user = String(m.user || '').trim(), pass = String(m.pass || '');
  if (!/^[A-Za-z0-9]{3,16}$/.test(user)) return c.send({t: 'auth', ok: false, err: 'Username 3–16 karakter, hanya huruf dan angka.'});
  if (pass.length > 200) return c.send({t: 'auth', ok: false, err: 'Password terlalu panjang.'});
  const key = user.toLowerCase(), flag = FLAGS.has(m.flag) ? m.flag : null;
  const wait = Math.max(blockedFor('ip:' + c.ip), blockedFor('u:' + key));
  if (wait) return c.send({t: 'auth', ok: false, err: 'Terlalu banyak percobaan gagal. Coba lagi dalam ' + wait + ' detik.'});
  const ipb = social.loginBlock('', c.ip); if (ipb) return c.send({t: 'auth', ok: false, err: ipb});
  if (t === 'register'){
    if (pass.length < 6) return c.send({t: 'auth', ok: false, err: 'Password minimal 6 karakter.'});
    if (accounts[key]) return c.send({t: 'auth', ok: false, err: 'Username sudah dipakai di server ini.'});
    const r = regs.get(c.ip) || {n: 0, t: Date.now()};
    if (r.n >= REG_MAX && !TEST) return c.send({t: 'auth', ok: false, err: 'Terlalu banyak akun baru dari perangkat ini. Coba lagi nanti.'});
    const salt = crypto.randomBytes(16).toString('hex'), hash = await scryptAsync(pass, salt);
    if (accounts[key]) return c.send({t: 'auth', ok: false, err: 'Username sudah dipakai di server ini.'});
    accounts[key] = {name: user, salt, hash, flag: flag || 'ID', created: Date.now()};
    saveAccounts(); r.n++; regs.set(c.ip, r);
  }
  const a = accounts[key];
  if (!a){ noteFail('ip:' + c.ip); return c.send({t: 'auth', ok: false, err: 'Akun tidak ditemukan di server ini.'}); }
  if (t === 'login' && !safeEq(await scryptAsync(pass, a.salt), a.hash)){
    noteFail('ip:' + c.ip); noteFail('u:' + key);
    return c.send({t: 'auth', ok: false, err: 'Password salah.'});
  }
  if (!c.alive) return;
  const banned = social.loginBlock(a.name, c.ip); if (banned) return c.send({t: 'auth', ok: false, err: banned});
  fails.delete('u:' + key);
  // satu akun hanya boleh login di satu perangkat
  for (const o of clients) if (o !== c && o.user && o.user.toLowerCase() === key) kickClient(o, 'Akun ini baru saja login di perangkat lain.');
  if (flag && flag !== a.flag) a.flag = flag;
  a.lastIp = c.ip; a.lastSeen = Date.now(); saveAccounts();
  c.user = a.name; c.flag = a.flag;
  const f = readJSON(playerFile(a.name), null) || {};
  const E = econOf(a.name);
  c.send({t: 'auth', ok: true, user: a.name, flag: a.flag, role: social.roleOf(a.name), display: social.display(a.name),
          player: f.client || null, econ: {bag: E.bag, bagSlots: E.bagSlots, gems: E.gems, prog: E.prog}, isNew: t === 'register'});
  c.send({t: 'friends', ...social.friendList(a.name)});
  for (const fr of social.friendList(a.name).friends){ const fc = findOnline(fr.name); if (fc) social.pushFriends(fr.name); }
}

// ---------- aksi ekonomi di tile (pengganti 'ops' untuk pemain) ----------
// browser mengirim maksud (pukul/pasang/tanam/...); server mengecek, mengubah world, menghitung drop/XP, lalu
// mengirim perubahan tile ke semua pemain + keadaan tas ke pemain itu.
const dmgS = new Map();                                // world:idx -> {n, t}
function applyTile(w, i, f, b, mt, tr){
  const d = w.data, meta = new Map(d.meta), trees = new Map(d.trees);
  d.fg[i] = f; d.bgw[i] = b;
  if (mt) meta.set(i, mt); else meta.delete(i);
  if (tr) trees.set(i, tr); else trees.delete(i);
  d.meta = [...meta.entries()]; d.trees = [...trees.entries()];
  scheduleWorldSave(w);
  broadcast(w.name, {t: 'ops', from: 0, ops: [[i, f, b, mt || null, tr || null]]});
}
function tileState(w, i){ const d = w.data; return [i, d.fg[i], d.bgw[i], new Map(d.meta).get(i) || null, new Map(d.trees).get(i) || null]; }
function deny(c, w, i, why){ c.send({t: 'ops', from: 0, ops: [tileState(w, i)], denied: 1, why}); }

function handleAct(c, m){
  const w = worlds.get(c.world); if (!w || c.frozen) return;
  const i = m.i; if (!Number.isInteger(i) || i < 0 || i >= N) return;
  const tx = i % COLS, ty = (i / COLS) | 0, d = w.data, meta = new Map(d.meta), trees = new Map(d.trees), li = lockIndex(meta);
  if (!inReachS(c, tx, ty)) return deny(c, w, i, 'Terlalu jauh.');
  const E = econOf(c.user), u = c.user;
  const can = canBuildAt(meta, li, i, u) || (c.noclip && social.rankOf(u) >= RANK.dev);
  const fgId = d.fg[i], om = meta.get(i) || null;
  if (m.a === 'hit'){
    // pukul: pohon matang = panen; block depan; kalau kosong, dinding belakang
    const isBg = fgId === 0;
    const id = isBg ? d.bgw[i] : fgId;
    if (!id) return;
    if (PROTECTED.has(id)) return;
    // v1.4: Dadu / Roulette: pukulan pertama = acak angka (dihitung di sini, siapa pun boleh); pukul lagi saat masih berputar = merusak
    const rd = !isBg && D.BY_ID[id];
    if (rd && rd.roll){
      const rk = c.world + ':' + i, last = rollS.get(rk) || 0;
      if (Date.now() - last >= ROLL_BUSY_MS){
        rollS.set(rk, Date.now());
        const v = rd.roll === 'dice' ? 1 + crypto.randomInt(6) : crypto.randomInt(37);
        return broadcast(c.world, {t: 'roll', i, kind: rd.roll, v, by: social.display(u)});
      }
    }
    if (!can) return deny(c, w, i, 'Area ini dikunci.');
    if (om && om.lock && om.lock.owner !== u) return deny(c, w, i, 'Lock milik ' + om.lock.owner + '.');
    if (om && om.vend && (om.vend.n || om.vend.earned))
      return deny(c, w, i, om.vend.owner === u ? 'Ambil dulu stok dan gems di Vending Machine sebelum memecahnya.' : 'Vending Machine milik ' + om.vend.owner + '. Pakai kunci inggris untuk membeli.');
    if (om && om.display && om.display.key){
      const k = om.display.key; applyTile(w, i, fgId, d.bgw[i], {display: {key: null}}, null); dropsAt(w, tx, ty, [[k, 1]]); return;
    }
    if (fgId === 8){
      const tr = trees.get(i); if (!tr) return;
      if (Date.now() - tr.t0 < (D.GROW_MS[tr.kind] || 0) - 1500) return deny(c, w, i, 'Pohon belum siap dipanen.');
      const h = econ.rollHarvest(tr.kind);
      applyTile(w, i, 0, d.bgw[i], null, null); dropsAt(w, tx, ty, h.drops);
      econ.run(E, g => { g.stat('harvested', 1); g.questEvent('harvest', null, 1); g.addXP(h.xp); });
      saveEcon(u); return pushEcon(c);
    }
    const def = D.BY_ID[id]; if (!def) return;
    const tool = c.state && c.state.worn && c.state.worn.tool && E.bag.some(s => s.key === c.state.worn.tool);
    const base = def.lock ? 5 : def.hits, need = tool ? Math.max(1, base - 1) : base;
    const k = c.world + ':' + (isBg ? 'g' : 'f') + i, dd = dmgS.get(k) || {n: 0, t: 0};
    if (Date.now() - dd.t > 2400) dd.n = 0;
    // batas kecepatan pukul (browser: 1 pukulan / 0,17 dtk)
    if (Date.now() - (c.lastHit || 0) < 120) return;
    c.lastHit = Date.now();
    dd.n++; dd.t = Date.now(); dmgS.set(k, dd);
    if (dd.n < need) return;
    dmgS.delete(k);
    const r = econ.rollBreak(id, isBg);
    if (isBg) applyTile(w, i, fgId, 0, om, trees.get(i) || null); else applyTile(w, i, 0, d.bgw[i], null, null);
    dropsAt(w, tx, ty, r.drops);
    econ.run(E, g => { if (isBg) g.questEvent('bgbreak', null, 1); if (r.ore){ g.stat('ores', 1); g.questEvent('ore', null, 1); } g.stat('broken', 1); g.questEvent('break', null, 1); g.addXP(r.xp); });
    saveEcon(u); return pushEcon(c);
  }
  if (m.a === 'place' || m.a === 'seed'){
    const key = String(m.key || ''); if (!econ.isKey(key) || key[0] !== (m.a === 'place' ? 'b' : 's')) return;
    const id = +key.slice(1), def = D.BY_ID[id];
    if (!E.bag.some(s => s.key === key && s.n > 0)) return deny(c, w, i, 'Item tidak ada di tas.');
    if (!can) return deny(c, w, i, 'Area ini dikunci.');
    if (m.a === 'seed'){
      if (fgId === 8){
        const tr = trees.get(i); if (!tr) return;
        if (tr.spliced) return deny(c, w, i, 'Pohon ini sudah hasil splice.');
        const out = D.recipe(tr.kind, id); if (!out) return deny(c, w, i, D.BY_ID[tr.kind].name + ' + ' + def.name + ' tidak menghasilkan apa-apa.');
        econ.run(E, g => { g.takeItem(key, 1); g.discoverRecipe(tr.kind, id, out); g.stat('spliced', 1); g.questEvent('splice', null, 1); g.addXP(5); });
        applyTile(w, i, 8, d.bgw[i], null, {kind: out, t0: Date.now(), spliced: true});
        saveEcon(u); return pushEcon(c);
      }
      if (fgId !== 0) return deny(c, w, i, '');
      const below = ty + 1 < ROWS ? d.fg[i + COLS] : 7, bd = D.BY_ID[below];
      if (!bd || !bd.solid || bd.deco) return deny(c, w, i, 'Seed harus ditanam di atas block padat.');
      econ.run(E, g => { g.takeItem(key, 1); g.questEvent('plant', null, 1); });
      applyTile(w, i, 8, d.bgw[i], null, {kind: id, t0: Date.now()});
      saveEcon(u); return pushEcon(c);
    }
    // pasang block
    if (!def || PROTECTED.has(id) || !FG_IDS.has(id) && !def.bg) return;
    if (def.bg){
      if (d.bgw[i]) return deny(c, w, i, '');
      econ.run(E, g => { g.takeItem(key, 1); g.stat('placed', 1); g.questEvent('place', null, 1); });
      applyTile(w, i, fgId, id, om, trees.get(i) || null); saveEcon(u); return pushEcon(c);
    }
    if (fgId !== 0) return deny(c, w, i, '');
    // tidak boleh memasang block padat di posisi pemain lain
    if (def.solid) for (const o of inWorld(c.world)) if (o.state && insideSolidAt(o.state, tx, ty)) return deny(c, w, i, 'Ada pemain di situ.');
    let mt = null;
    if (def.lock){
      if (def.lock === 'world'){
        for (const [, x] of meta) if (x && x.lock && (x.lock.type === 'world' || x.lock.owner !== u)) return deny(c, w, i, 'World ini sudah dikunci atau ada lock milik orang lain.');
      } else if (li.owner.has(i)) return deny(c, w, i, 'Tile ini sudah diklaim lock lain.');
      mt = {lock: {type: def.lock, owner: u, access: [], public: false, ignoreAir: false, tiles: def.lock === 'world' ? null : claimTilesS(d, meta, i, def.lock, false)}};
    }
    else if (def.wrench === 'sign') mt = {sign: {text: ''}};
    else if (def.wrench === 'door') mt = {door: {name: '', locked: false}};
    else if (def.wrench === 'display') mt = {display: {key: null}};
    else if (def.wrench === 'vend') mt = {vend: {owner: u, key: null, n: 0, price: 0, earned: 0}};
    econ.run(E, g => { g.takeItem(key, 1); g.stat('placed', 1); g.questEvent('place', null, 1); if (def.lock === 'world') g.stat('worldLocks', 1); });
    applyTile(w, i, id, d.bgw[i], mt, null);
    saveEcon(u); return pushEcon(c);
  }
  if (m.a === 'meta'){
    // simpan dialog wrench (papan, pintu, kotak pajang, lock)
    const mt = m.meta; if (!om || !mt || typeof mt !== 'object') return;
    if (om.vend) return deny(c, w, i, '');               // vending diatur lewat aksi 'vend' (stok & gems dihitung server)
    if (!validMeta(fgId, i, mt)) return deny(c, w, i, 'Data tidak valid.');
    if (om.lock){
      if (om.lock.owner !== u) return deny(c, w, i, 'Hanya pemilik lock.');
      const L = mt.lock; if (!L || L.type !== om.lock.type || L.owner !== om.lock.owner) return deny(c, w, i, 'Lock tidak boleh pindah tangan.');
      L.access = L.access.filter(n => isName(n) && n !== u).slice(0, 50);
      L.tiles = L.type === 'world' ? null : claimTilesS(d, meta, i, L.type, !!L.ignoreAir);
    } else if (!can) return deny(c, w, i, 'Area ini dikunci.');
    if (om.display){
      const nk = mt.display.key, ok = om.display.key;
      if (nk !== ok){
        if (nk && !E.bag.some(s => s.key === nk && s.n > 0)) return deny(c, w, i, 'Item tidak ada di tas.');
        if (nk && (nk === D.FIST || nk === D.WRENCH || !econ.isKey(nk))) return deny(c, w, i, '');
        if (ok && econ.fits(E, [[ok, 1]], nk ? [[nk, 1]] : [])) return deny(c, w, i, 'Tas penuh.');
        econ.run(E, g => { if (ok) g.addItem(ok, 1); if (nk) g.takeItem(nk, 1); });
        saveEcon(u); pushEcon(c);
      }
    }
    return applyTile(w, i, fgId, d.bgw[i], mt, null);
  }
}
const rollS = new Map(), ROLL_BUSY_MS = 1400;
// ---------- v1.4: Vending Machine ----------
// stok disimpan di mesin; pembeli bayar gems, gems masuk ke kas mesin sampai diambil pemilik.
// Semua dihitung di sini, jadi browser tidak bisa memalsukan stok, harga, atau kas.
const VEND_PRICE_MAX = 100000;
function handleVend(c, m){
  const w = worlds.get(c.world); if (!w || c.frozen) return;
  const i = m.i; if (!Number.isInteger(i) || i < 0 || i >= N) return;
  const d = w.data, om = new Map(d.meta).get(i);
  if (d.fg[i] !== 62 || !om || !om.vend) return;
  const tx = i % COLS, ty = (i / COLS) | 0;
  if (!inReachS(c, tx, ty)) return deny(c, w, i, 'Terlalu jauh dari Vending Machine.');
  if (social.inTrade(c.user)) return deny(c, w, i, 'Selesaikan trade dulu.');
  const u = c.user, E = econOf(u), V = {...om.vend}, mine = V.owner === u;
  const nm = k => D.itemDef(k).name, fmt = n => n.toLocaleString('id-ID');
  const done = (msg, push = true) => { applyTile(w, i, 62, d.bgw[i], {vend: V}, null); saveEcon(u); if (push) pushEcon(c, msg ? [['act', msg]] : []); };
  const n = m.n === undefined ? 1 : m.n;
  if (m.op === 'buy'){
    if (mine) return deny(c, w, i, 'Ini mesinmu sendiri.');
    if (!V.key || V.n < 1) return deny(c, w, i, 'Stok habis.');
    if (V.price < 1) return deny(c, w, i, 'Pemilik belum memasang harga.');
    if (m.key !== V.key || m.price !== V.price) return deny(c, w, i, 'Harga atau barang baru saja diganti pemilik. Cek lagi.');
    if (!Number.isInteger(n) || n < 1 || n > V.n) return deny(c, w, i, 'Jumlah tidak valid (stok ' + V.n + ').');
    const total = V.price * n;
    if (E.gems < total) return deny(c, w, i, 'Gems tidak cukup (butuh ' + fmt(total) + ').');
    const err = econ.fits(E, [[V.key, n]]); if (err) return deny(c, w, i, err);
    econ.run(E, g => { g.addGems(-total); g.addItem(V.key, n); });
    V.n -= n; V.earned += total; const key = V.key;   // barang tetap tercatat saat habis, supaya pemilik tahu apa yang perlu diisi
    done('Kamu membeli ' + n + ' ' + nm(key) + ' seharga ' + fmt(total) + ' gems.');
    const oc = findOnline(V.owner);
    if (oc) oc.send({t: 'note', text: social.display(u) + ' membeli ' + n + ' ' + nm(key) + ' dari Vending Machine-mu (' + fmt(total) + ' gems).'});
    return;
  }
  if (!mine) return deny(c, w, i, 'Hanya pemilik (' + V.owner + ') yang bisa mengatur Vending Machine ini.');
  if (m.op === 'stock'){
    const key = String(m.key || '');
    if (!econ.isKey(key) || key === D.FIST || key === D.WRENCH) return deny(c, w, i, 'Item ini tidak bisa dijual.');
    if (V.key && V.n > 0 && V.key !== key) return deny(c, w, i, 'Mesin masih berisi ' + nm(V.key) + '. Ambil stoknya dulu untuk ganti barang.');
    if (!Number.isInteger(n) || n < 1) return deny(c, w, i, 'Jumlah tidak valid.');
    const have = (E.bag.find(s => s.key === key) || {n: 0}).n;
    if (have < n) return deny(c, w, i, 'Kamu hanya punya ' + have + ' ' + nm(key) + '.');
    if (V.n + n > D.STACK) return deny(c, w, i, 'Stok maksimal ' + D.STACK + ' (sekarang ' + V.n + ').');
    econ.run(E, g => g.takeItem(key, n));
    V.key = key; V.n += n;
    return done(n + ' ' + nm(key) + ' dimasukkan ke Vending Machine (stok ' + V.n + ').');
  }
  if (m.op === 'take'){
    if (!V.key || V.n < 1) return deny(c, w, i, 'Stok kosong.');
    const k = Number.isInteger(m.n) && m.n > 0 ? Math.min(m.n, V.n) : V.n;   // tanpa jumlah = ambil semua
    const err = econ.fits(E, [[V.key, k]]); if (err) return deny(c, w, i, err);
    econ.run(E, g => g.addItem(V.key, k)); V.n -= k; const key = V.key; if (!V.n) V.key = null;
    return done(k + ' ' + nm(key) + ' diambil dari Vending Machine.');
  }
  if (m.op === 'price'){
    const p = m.price; if (!Number.isInteger(p) || p < 1 || p > VEND_PRICE_MAX) return deny(c, w, i, 'Harga 1–' + fmt(VEND_PRICE_MAX) + ' gems per item.');
    V.price = p; return done('Harga diatur: ' + fmt(p) + ' gems per item.');
  }
  if (m.op === 'collect'){
    if (!V.earned) return deny(c, w, i, 'Belum ada hasil penjualan.');
    const g0 = V.earned; econ.run(E, g => g.addGems(g0)); V.earned = 0;
    return done(fmt(g0) + ' gems hasil penjualan diambil.');
  }
}
function insideSolidAt(st, tx, ty){ return st.x < (tx + 1) * TS && st.x + 26 > tx * TS && st.y < (ty + 1) * TS && st.y + 30 > ty * TS; }
// klaim tile lock area (sama dengan claimTiles() di world.js, dihitung server)
function claimTilesS(d, meta, li, type, ignoreAir){
  const cap = LOCK_TILES[type], rad = LOCK_RADIUS[type] || 10;
  const lx = li % COLS, ly = (li / COLS) | 0, taken = new Set();
  for (const [i, o] of meta) if (o && o.lock && o.lock.tiles && i !== li) for (const t of o.lock.tiles) taken.add(t);
  const out = [], seen = new Set([li]), h = [[0, lx, ly]];
  const has = i => d.fg[i] !== 0 || d.bgw[i] !== 0;
  while (h.length && out.length < cap){
    h.sort((a, b) => a[0] - b[0]);
    const [, x, y] = h.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx = x + dx, ny = y + dy, ni = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(ni) || taken.has(ni)) continue;
      if (Math.abs(nx - lx) > rad || Math.abs(ny - ly) > rad) continue;
      seen.add(ni);
      const dist = (nx - lx) ** 2 + (ny - ly) ** 2;
      if (ignoreAir && !has(ni)){ h.push([dist, nx, ny]); continue; }
      if (d.fg[ni] === 7) continue;
      out.push(ni); h.push([dist, nx, ny]);
      if (out.length >= cap) break;
    }
  }
  return out;
}

// ---------- modul sosial ----------
const social = createSocial({
  DATA, accounts, saveAccounts, clients, findOnline, kickClient, econ, econOf, saveEcon, pushEcon, isLocalIp, refreshVisibility,
  roleChanged(name){ const c = findOnline(name); if (!c) return; c.send({t: 'role', role: social.roleOf(name), display: social.display(name)});
    if (social.rankOf(name) < RANK.mod){ c.noclip = c.fullzoom = c.invis = false; c.send({t: 'staffFx', noclip: false, zoom: false, invis: false}); }
    if (c.world) broadcast(c.world, {t: 'prole', id: c.id, role: social.roleOf(name), display: social.display(name)}, c); },
  teleport(c, world, st){ const w = worlds.get(world) || loadWorld(world); if (!w) return; if (c.world !== world) enterWorld(c, w); c.lastPos = null; c.send({t: 'tp', x: st ? st.x : null, y: st ? st.y : null}); },
  shutdown: () => shutdown()
});
const admin = require('./admin.js').createAdmin({social, port: PORT});

// ---------- pesan ----------
function handle(c, m){
  const t = m && m.t;
  if (t === 'hello') return c.send({t: 'hi', server: os.hostname(), v: 13});
  if (t === 'register' || t === 'login'){
    if (c.authBusy) return;                           // satu proses login sekaligus per koneksi
    c.authBusy = true;
    return handleAuth(c, m, t).catch(e => { console.error('auth error', e); c.send({t: 'auth', ok: false, err: 'Server error.'}); }).finally(() => { c.authBusy = false; });
  }
  if (!c.user) return c.send({t: 'err', text: 'Belum login.'});

  switch (t){
    case 'worlds': return c.send({t: 'worlds', list: listWorlds()});
    case 'join': {
      const name = String(m.name || '').toUpperCase();
      if (!validWorldName(name)) return c.send({t: 'err', text: 'Nama world hanya huruf dan angka, maks 16.'});
      let w = loadWorld(name);
      if (!w){
        // v1.3: world baru dibuat server. (Mode tes: klien boleh mengirim world sendiri supaya tes bisa menyusun kasus.)
        if (TEST && m.world && validWorldData(m.world)) w = {name, data: cleanWorld(m.world, c.user), timer: null, drops: new Map()};
        else w = {name, data: newWorldData(), timer: null, drops: new Map()};
        worlds.set(name, w); writeJSON(worldFile(name), w.data);
        console.log('[world] dibuat', name, 'oleh', c.user);
      }
      return enterWorld(c, w);
    }
    case 'create': return handle(c, {...m, t: 'join'});   // klien lama
    case 'leave': leaveWorld(c); return c.send({t: 'left'});
    case 'act': return handleAct(c, m);
    case 'vend': return handleVend(c, m);
    case 'ops': return c.send({t: 'err', text: 'Versi game lama. Muat ulang halaman (Ctrl+F5).'});
    case 'pos': {
      if (!c.world || !m.s || typeof m.s !== 'object') return;
      const w = worlds.get(c.world); if (!w) return;
      const s = m.s, num = v => typeof v === 'number' && isFinite(v) ? v : 0;
      const st = {x: num(s.x), y: num(s.y), vx: num(s.vx), vy: num(s.vy), f: s.f < 0 ? -1 : 1, g: !!s.g, sw: num(s.sw), sa: num(s.sa),
                 fl: num(s.fl), dead: num(s.dead), an: num(s.an), held: typeof s.held === 'string' ? s.held.slice(0, 24) : 'fist',
                 worn: cleanWornS(s.worn)};
      // pakaian hanya boleh yang benar-benar ada di tas
      const E = econOf(c.user);
      for (const k of Object.keys(st.worn)) if (!E.bag.some(x => x.key === st.worn[k])) delete st.worn[k];
      if (!checkMove(c, w, st)){
        c.send({t: 'tp', x: c.lastPos ? c.lastPos.x : w.data.spawn.x * TS + 3, y: c.lastPos ? c.lastPos.y : w.data.spawn.y * TS + 2, fix: true});
        return;
      }
      c.state = st; c.lastPos = {x: st.x, y: st.y, t: Date.now()};
      for (const o of clients) if (o.world === c.world && o !== c && visibleTo(c, o)) o.send({t: 'pos', id: c.id, s: c.state});
      return;
    }
    case 'pickup': {
      // ambil drop: harus dekat (2 tile) dan sudah lewat masa tunggu
      const w = worlds.get(c.world); if (!w || !c.state || c.frozen) return;
      const dr = w.drops.get(m.id); if (!dr) return;
      if (Date.now() < dr.lock || (dr.owner === c.user && Date.now() < dr.t + 1500)) return;
      if (Math.hypot(c.state.x + 13 - dr.x, c.state.y + 15 - dr.y) > TS * 2.2) return;
      const E = econOf(c.user);
      const got = econ.run(E, g => g.addItem(dr.key, dr.n));
      if (!got){ return c.send({t: 'note', text: 'Tas penuh atau stack sudah 200.', once: 'full' + dr.id}); }
      dr.n -= got;
      if (dr.n <= 0){ w.drops.delete(dr.id); broadcast(w.name, {t: 'dropDel', id: dr.id, by: c.id}); }
      else broadcast(w.name, {t: 'dropSet', id: dr.id, n: dr.n});
      saveEcon(c.user); return pushEcon(c);
    }
    case 'drop': case 'trash': {
      const w = worlds.get(c.world); if (!w || !c.state || c.frozen) return;
      const key = String(m.key || ''), n = m.n | 0;
      if (!econ.isKey(key) || key === D.FIST || key === D.WRENCH || n < 1) return;
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user);
      const k = econ.run(E, g => g.takeItem(key, n)); if (!k) return;
      if (t === 'drop'){
        const f = c.state.f || 1;
        spawnDropS(w, c.state.x + 13 + f * TS * 1.2, c.state.y + 6, key, k, 1500, c.user);
        econ.out.push(['act', 'Kamu men-drop ' + k + ' ' + D.itemDef(key).name + '.']);
      } else econ.out.push(['act', k + ' ' + D.itemDef(key).name + ' dibuang.']);
      saveEcon(c.user); return pushEcon(c);
    }
    case 'buy': {
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user), err = econ.buy(E, String(m.key || ''));
      if (err){ econ.out.length = 0; return c.send({t: 'note', text: err}); }
      saveEcon(c.user); return pushEcon(c);
    }
    case 'lockConvert': {
      // v1.4: 100 World Lock <-> 1 Crystal Lock
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user), key = m.key === 'b34' ? 'b34' : 'b30';
      const err = econ.run(E, g => g.convertLocks(key));
      if (err){ econ.out.length = 0; return c.send({t: 'note', text: err}); }
      saveEcon(c.user); return pushEcon(c);
    }
    case 'claim': {
      const E = econOf(c.user), i = m.i | 0;
      econ.run(E, g => g.claimQuest(i)); saveEcon(c.user); return pushEcon(c);
    }
    case 'stat': {
      // statistik tanpa hadiah item/gems yang dihitung browser (lompat, pakai wearable, mati)
      const E = econOf(c.user);
      if (m.k === 'jump' && (c.jumps = (c.jumps || 0) + 1) && Date.now() - (c.jumpT || 0) > 150){ c.jumpT = Date.now(); econ.run(E, g => g.questEvent('jump', null, 1)); }
      else if (m.k === 'wear') econ.run(E, g => g.questEvent('wear', null, 1));
      else if (m.k === 'death') econ.run(E, g => { E.prog.stats.deaths = (E.prog.stats.deaths || 0) + 1; });
      else return;
      saveEcon(c.user); if (econ.out.length) pushEcon(c); return;
    }
    case 'chat': {
      if (!c.world) return;
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
      if (!text) return;
      if (text[0] === '/'){
        if (TEST && /^\/testgive /.test(text)){ const [, k, n] = text.split(' '); econ.run(econOf(c.user), g => k === 'gem' ? g.addGems(+n) : g.addItem(k, +n)); return pushEcon(c); }
        if (social.command(c, text)) return;
        return c.send({t: 'note', text: 'Perintah tidak dikenal: ' + text.split(' ')[0]});
      }
      const mu = social.muteInfo(accounts[c.user.toLowerCase()]);
      if (mu) return c.send({t: 'note', text: 'Kamu di-mute sampai ' + new Date(mu.until).toLocaleTimeString('id-ID') + '.'});
      for (const o of clients) if (o.world === c.world && o !== c && visibleTo(c, o)) o.send({t: 'chat', id: c.id, name: c.user, display: social.display(c.user), role: social.roleOf(c.user), text});
      return;
    }
    // ----- teman / report / trade -----
    case 'friendReq': return social.friendReq(c, m.name);
    case 'friendAccept': return social.friendAccept(c, m.name);
    case 'friendDecline': return social.friendDecline(c, m.name);
    case 'friendRemove': return social.friendRemove(c, m.name);
    case 'friends': return c.send({t: 'friends', ...social.friendList(c.user)});
    case 'report': return social.report(c, m.name, m.reason, m.note);
    case 'tradeReq': return social.tradeRequest(c, m.name);
    case 'tradeAccept': return social.tradeAccept(c, m.name);
    case 'tradeDecline': return social.tradeDecline(c, m.name);
    case 'tradeOffer': return social.tradeOffer(c, m.items, m.gems);
    case 'tradeOk': return social.tradeOk(c, m.v);
    case 'tradeConfirm': return social.tradeConfirm(c);
    case 'tradeCancel': return social.tradeCancel(c);
    case 'profile': {
      const a = accounts[String(m.name || '').toLowerCase()]; if (!a) return;
      const E = econOf(a.name), o = findOnline(a.name);
      return c.send({t: 'profile', name: a.name, display: social.display(a.name), role: social.roleOf(a.name), flag: a.flag, level: E.prog.level,
                     online: !!o, world: o ? o.world : null, created: a.created, friend: (accounts[c.user.toLowerCase()].friends || []).includes(a.name)});
    }
    case 'save': {
      // v1.3: browser hanya menyimpan pengaturan tampilan (hotbar, zoom, kontrol). Tas/gems/XP disimpan server.
      if (!m.data || typeof m.data !== 'object') return;
      const d = m.data, f = readJSON(playerFile(c.user), {}) || {};
      const cl = {selKey: isStr(d.selKey, 24) ? d.selKey : 'fist', hot: Array.isArray(d.hot) ? d.hot.slice(0, 4).map(k => isStr(k, 24) ? k : null) : [],
                  zoom: typeof d.zoom === 'number' ? d.zoom : 1.25, settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
                  worn: cleanWornS(d.worn), invRows: d.invRows | 0, controls: ['kbm','touch','pad'].includes(d.controls) ? d.controls : null,
                  lobbyHistory: Array.isArray(d.lobbyHistory) ? d.lobbyHistory.filter(validWorldName).slice(0, 8) : []};
      if (JSON.stringify(cl).length > 20000) return;
      f.client = cl; if (!f.econ && econs.has(c.user.toLowerCase())) f.econ = econOf(c.user);
      f.v = 13; writeJSON(playerFile(c.user), f);
      return;
    }
    case 'logout': leaveWorld(c); c.user = null; return c.send({t: 'loggedOut'});
  }
}

// ---------- HTTP: sajikan game ----------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8'};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch(e){ res.writeHead(400); return res.end('Bad request'); }
  if (admin.handle(req, res, p)) return;                    // panel role: hanya dari PC server (localhost)
  if (p === '/' || p === '/index.html') p = '/tilegrow.html';
  if (!/^\/(tilegrow\.html|js\/[a-z0-9_-]+\.js)$/i.test(p)){ res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(buf);
  });
});
server.on('upgrade', (req, sock) => {
  if ((req.url || '').split('?')[0] !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket') return sock.destroy();
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  clients.add(new Client(sock));
});
// ping tiap 20 dtk supaya koneksi mati terdeteksi
setInterval(()=>{ for (const c of clients) try { c.sock.write(wsControl(9)); } catch(e){} }, 20000);

server.on('error', e => {
  if (e.code === 'EADDRINUSE'){
    console.error('');
    console.error('  GAGAL: port ' + PORT + ' sudah dipakai program lain.');
    console.error('  Biasanya ini jendela server TileGrow LAMA yang masih terbuka.');
    console.error('  Tutup semua jendela hitam "TileGrow Server" yang lain, lalu jalankan start-server.bat lagi.');
    console.error('  (Atau pakai port lain: buka cmd di folder ini, ketik  set PORT=8081 && node server\\server.js )');
    console.error('');
  } else console.error('Server gagal jalan: ' + e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log('TileGrow server jalan di port ' + PORT);
  console.log('  Di PC ini      : http://localhost:' + PORT);
  if (HOST === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) console.log('  Di WiFi/LAN    : http://' + a.address + ':' + PORT);
  console.log('Data disimpan di ' + DATA + '. Tekan Ctrl+C untuk berhenti.');
  console.log('Ketik "help" di jendela ini untuk perintah server (misalnya: role NAMA dev).');
  console.log('Panel role (hanya dari PC ini): ' + admin.url + '   <- atau klik dua kali Panel-Role.bat');
  console.log('Versi server: ' + VERSION);
});
function shutdown(){ console.log('\nMenyimpan world & pemain...'); flushAll(); flushEcons(); process.exit(0); }
// console server: atur role dari jendela server (ketik help)
if (process.stdin.isTTY || process.env.TILEGROW_CONSOLE === '1'){
  const rl = readline.createInterface({input: process.stdin});
  rl.on('line', line => { try { social.consoleCmd(line); } catch(e){ console.error(e.message); } });
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
// jaring pengaman: error tak terduga dicatat dan world disimpan, server tidak ikut mati
process.on('uncaughtException', e => { console.error('uncaught', e); try { flushAll(); flushEcons(); } catch(_){} });
