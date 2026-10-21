// TileGrow LAN server v1.0.1 — tanpa paket npm (Node >= 18).
// - HTTP: menyajikan game (tilegrow.html + js/) supaya HP/laptop di WiFi yang sama cukup buka http://IP-PC:PORT
// - WebSocket (/ws): akun, daftar world, world bersama, sinkron block, posisi pemain, chat
// - Data disimpan di server/data: accounts.json, players/<user>.json, worlds/<NAMA>.json
// v1.0 masih PERCAYA laporan browser untuk isi tas, gems, XP, dan perubahan block (anti-cheat menyusul di v1.1).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const COLS = 100, ROWS = 60, N = COLS * ROWS;
const MAX_MSG = 2 * 1024 * 1024;

for (const d of [DATA, path.join(DATA, 'players'), path.join(DATA, 'worlds')]) fs.mkdirSync(d, {recursive: true});

// ---------- penyimpanan ----------
function readJSON(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return fallback; } }
function writeJSON(file, obj){ const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
const ACC_FILE = path.join(DATA, 'accounts.json');
const accounts = readJSON(ACC_FILE, {});              // lower -> {name, salt, hash, flag, created}
const saveAccounts = () => writeJSON(ACC_FILE, accounts);
const playerFile = u => path.join(DATA, 'players', u.toLowerCase() + '.json');
const worldFile = n => path.join(DATA, 'worlds', n + '.json');

const worlds = new Map();                            // nama -> {data, dirty, timer}
function validWorldName(n){ return typeof n === 'string' && /^[A-Z0-9]{1,16}$/.test(n); }
function loadWorld(name){
  if (worlds.has(name)) return worlds.get(name);
  const data = readJSON(worldFile(name), null);
  if (!data) return null;
  const w = {name, data, timer: null};
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
const FG_IDS = new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,30,31,32,33,41,42,50,51,52,53,54]);
const BG_IDS = new Set([0,40]);
const PROTECTED = new Set([7, 23]);                    // Dasar & Pintu Utama: tidak bisa dipasang / dihapus pemain
const LOCK_TYPE = {30: 'world', 31: 'small', 32: 'big', 33: 'huge'};
const LOCK_TILES = {small: 10, big: 48, huge: 200}, LOCK_RADIUS = {small: 6, big: 10, huge: 18};
// jenis pohon: semua seed (SEEDABLE di data.js) + hasil splice (RECIPES), termasuk Bijih Pirus (14)
const SEED_KINDS = new Set([1,2,3,4,5,6,9,10,11,14,15,16,17,18,41,42,50,51,52,53,54]);
const isName = v => typeof v === 'string' && /^[A-Za-z0-9]{1,16}$/.test(v);
const isStr = (v, n) => typeof v === 'string' && v.length <= n;
// bentuk meta harus cocok dengan block-nya; kalau tidak, data bisa membuat game pemain lain error
function validMeta(f, i, mt){
  const need = LOCK_TYPE[f] ? 'lock' : f === 20 ? 'sign' : f === 21 ? 'door' : f === 22 ? 'display' : null;
  if (!need) return mt === null || mt === undefined;
  if (!mt || typeof mt !== 'object' || Object.keys(mt).length !== 1 || !mt[need] || typeof mt[need] !== 'object') return false;
  const v = mt[need];
  if (need === 'sign') return isStr(v.text, 120);
  if (need === 'door') return isStr(v.name, 24) && typeof v.locked === 'boolean';
  if (need === 'display') return v.key === null || (isStr(v.key, 24) && /^[a-z0-9_]+$/i.test(v.key));
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
function leaveWorld(c){
  if (!c.world) return;
  const w = c.world; c.world = null; c.state = null;
  broadcast(w, {t: 'pleave', id: c.id, name: c.user});
}
function enterWorld(c, w){
  leaveWorld(c);
  c.world = w.name;
  const players = inWorld(w.name).filter(o => o !== c).map(o => ({id: o.id, name: o.user, flag: o.flag, state: o.state}));
  c.send({t: 'world', name: w.name, you: c.id, data: w.data, players});
  broadcast(w.name, {t: 'pjoin', id: c.id, name: c.user, flag: c.flag}, c);
}

function cleanWornS(w){ const o = {}; if (w && typeof w === 'object') for (const k of ['wings','hat','shirt','pants','tool']) if (isStr(w[k], 24)) o[k] = w[k]; return o; }

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
  if (t === 'register'){
    if (pass.length < 6) return c.send({t: 'auth', ok: false, err: 'Password minimal 6 karakter.'});
    if (accounts[key]) return c.send({t: 'auth', ok: false, err: 'Username sudah dipakai di server ini.'});
    const r = regs.get(c.ip) || {n: 0, t: Date.now()};
    if (r.n >= REG_MAX) return c.send({t: 'auth', ok: false, err: 'Terlalu banyak akun baru dari perangkat ini. Coba lagi nanti.'});
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
  fails.delete('u:' + key);
  // satu akun hanya boleh login di satu perangkat
  for (const o of clients) if (o !== c && o.user && o.user.toLowerCase() === key){ o.send({t: 'kicked', reason: 'Akun ini baru saja login di perangkat lain.'}); leaveWorld(o); o.user = null; o.close(); }
  if (flag && flag !== a.flag){ a.flag = flag; saveAccounts(); }
  c.user = a.name; c.flag = a.flag;
  return c.send({t: 'auth', ok: true, user: a.name, flag: a.flag, player: readJSON(playerFile(a.name), null), isNew: t === 'register'});
}

// ---------- pesan ----------
function handle(c, m){
  const t = m && m.t;
  if (t === 'hello') return c.send({t: 'hi', server: os.hostname(), v: 1});
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
      const w = loadWorld(name);
      if (!w) return c.send({t: 'needWorld', name});
      return enterWorld(c, w);
    }
    case 'create': {
      const name = String(m.name || '').toUpperCase();
      if (!validWorldName(name)) return c.send({t: 'err', text: 'Nama world tidak valid.'});
      let w = loadWorld(name);
      if (!w){
        if (!validWorldData(m.world)) return c.send({t: 'err', text: 'Data world tidak valid.'});
        w = {name, data: cleanWorld(m.world, c.user), timer: null}; worlds.set(name, w); writeJSON(worldFile(name), w.data);
        console.log('[world] dibuat', name, 'oleh', c.user);
      }
      return enterWorld(c, w);
    }
    case 'leave': leaveWorld(c); return c.send({t: 'left'});
    case 'ops': {
      // perubahan tile: [idx, fg, bg, meta|null, tree|null]. Diterapkan berurutan lalu dikirim ke SEMUA pemain di world
      // (termasuk pengirim) supaya urutannya sama di semua layar.
      if (!c.world || !Array.isArray(m.ops) || m.ops.length > 400) return;
      const w = worlds.get(c.world); if (!w) return;
      // v1.0.1: tiap op dicek (lock, block terlarang, bentuk data). Op yang ditolak dibalas ke pengirim dengan isi tile
      // versi server, supaya layarnya kembali sinkron. Pemain lain hanya menerima op yang sah.
      const d = w.data, meta = new Map(d.meta), trees = new Map(d.trees), ok = [], mine = [];
      let li = lockIndex(meta), denied = 0, reason = '';
      for (const op of m.ops){
        if (!Array.isArray(op) || op.length !== 5) continue;
        const [i, f, b, mt, tr] = op;
        if (!Number.isInteger(i) || i < 0 || i >= N || !isByte(f) || !isByte(b)) continue;
        if (mt !== null && (typeof mt !== 'object' || JSON.stringify(mt).length > 6000)) continue;
        if (tr !== null && (typeof tr !== 'object' || JSON.stringify(tr).length > 300)) continue;
        const why = checkOp(d, meta, trees, li, c.user, op);
        if (why){ denied++; reason = why; mine.push([i, d.fg[i], d.bgw[i], meta.get(i) || null, trees.get(i) || null]); continue; }
        const lockTouched = !!((meta.get(i) && meta.get(i).lock) || (mt && mt.lock));
        d.fg[i] = f; d.bgw[i] = b;
        if (mt) meta.set(i, mt); else meta.delete(i);
        if (tr) trees.set(i, tr); else trees.delete(i);
        ok.push([i, f, b, mt, tr]); mine.push([i, f, b, mt, tr]);
        if (lockTouched) li = lockIndex(meta);
      }
      if (denied) console.log('[ops] ditolak', denied, 'dari', c.user, 'di', c.world, '-', reason);
      if (!mine.length) return;
      if (ok.length){
        d.meta = [...meta.entries()]; d.trees = [...trees.entries()];
        scheduleWorldSave(w);
        broadcast(c.world, {t: 'ops', from: c.id, ops: ok}, c);
      }
      return c.send({t: 'ops', from: c.id, ops: mine, denied});
    }
    case 'pos': {
      if (!c.world || !m.s || typeof m.s !== 'object') return;
      const s = m.s, num = v => typeof v === 'number' && isFinite(v) ? v : 0;
      c.state = {x: num(s.x), y: num(s.y), vx: num(s.vx), vy: num(s.vy), f: s.f < 0 ? -1 : 1, g: !!s.g, sw: num(s.sw), sa: num(s.sa),
                 fl: num(s.fl), dead: num(s.dead), an: num(s.an), held: typeof s.held === 'string' ? s.held.slice(0, 24) : 'fist',
                 worn: cleanWornS(s.worn)};
      return broadcast(c.world, {t: 'pos', id: c.id, s: c.state}, c);
    }
    case 'chat': {
      if (!c.world) return;
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
      if (!text) return;
      return broadcast(c.world, {t: 'chat', id: c.id, name: c.user, text}, c);
    }
    case 'save': {
      if (!m.data || typeof m.data !== 'object') return;
      const s = JSON.stringify(m.data); if (s.length > 400000) return;
      fs.writeFile(playerFile(c.user) + '.tmp', s, e => { if (!e) fs.rename(playerFile(c.user) + '.tmp', playerFile(c.user), ()=>{}); });
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
  console.error(e.code === 'EADDRINUSE' ? 'Port ' + PORT + ' sudah dipakai program lain. Tutup server lama atau pakai PORT lain.' : 'Server gagal jalan: ' + e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log('TileGrow server jalan di port ' + PORT);
  console.log('  Di PC ini      : http://localhost:' + PORT);
  if (HOST === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) console.log('  Di WiFi/LAN    : http://' + a.address + ':' + PORT);
  console.log('Data disimpan di ' + DATA + '. Tekan Ctrl+C untuk berhenti.');
});
function shutdown(){ console.log('\nMenyimpan world...'); flushAll(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
// jaring pengaman: error tak terduga dicatat dan world disimpan, server tidak ikut mati
process.on('uncaughtException', e => { console.error('uncaught', e); try { flushAll(); } catch(_){} });
