// TileGrow server: validasi data dari browser + aturan lock (fungsi murni, tanpa state)
'use strict';
const Chess = require('../js/chess.js');
const {COLS, ROWS, N, econ, D} = require('./config');

const isByte = v => Number.isInteger(v) && v >= 0 && v < 256;
function validWorldData(d){
  return d && Array.isArray(d.fg) && d.fg.length === N && d.fg.every(isByte) && Array.isArray(d.bgw) && d.bgw.length === N && d.bgw.every(isByte)
    && Array.isArray(d.trees) && Array.isArray(d.meta) && d.spawn && Number.isInteger(d.spawn.x) && Number.isInteger(d.spawn.y);
}
// v1.0.1: id block yang dikenal (sama dengan data.js). Block lain ditolak.
const FG_IDS = new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,24,30,31,32,33,34,41,42,50,51,52,53,54,60,61,62,63]);
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
  const need = LOCK_TYPE[f] ? 'lock' : f === 20 ? 'sign' : f === 21 ? 'door' : f === 22 ? 'display' : f === 62 ? 'vend' : f === 63 ? 'chess' : null;
  if (!need) return mt === null || mt === undefined;
  if (!mt || typeof mt !== 'object' || Object.keys(mt).length !== 1 || !mt[need] || typeof mt[need] !== 'object') return false;
  const v = mt[need];
  if (need === 'sign') return isStr(v.text, 120);
  if (need === 'door') return isStr(v.name, 24) && typeof v.locked === 'boolean';
  if (need === 'chess') return Chess.validTable(v);
  if (need === 'display') return v.key === null || (isStr(v.key, 24) && /^[a-z0-9_]+$/i.test(v.key));
  if (need === 'vend') return isName(v.owner) && (v.key === null || (econ.isKey(v.key) && v.key !== D.FIST && v.key !== D.WRENCH))
    && Number.isInteger(v.n) && v.n >= 0 && v.n <= D.STACK && Number.isInteger(v.price) && v.price >= 0 && v.price <= VEND_PRICE_MAX
    && Number.isInteger(v.earned) && v.earned >= 0 && (v.key !== null || v.n === 0)
    // v1.10: bayar World Lock. per = 'item' (X WL per item) | 'wl' (1 WL dapat X item); gemsOld = kas gems dari versi lama
    && (v.per === undefined || v.per === 'item' || v.per === 'wl') && (v.cur === undefined || v.cur === 'wl')
    && (v.gemsOld === undefined || (Number.isInteger(v.gemsOld) && v.gemsOld >= 0));
  // lock
  if (v.type !== LOCK_TYPE[f] || !isName(v.owner) || !Array.isArray(v.access) || v.access.length > 1000 || !v.access.every(a => isStr(a, 16))
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
// v1.3: world baru dibuat oleh server (generator yang sama dengan browser), jadi isi tambang tidak bisa dipalsukan
function newWorldData(){ const d = econ.genWorldData(); return {...d, cols: COLS, rows: ROWS, created: Date.now()}; }
function cleanWorld(d, user){
  const meta = new Map(), trees = new Map(), ok = e => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < N;
  for (const e of d.meta) if (ok(e) && validMeta(d.fg[e[0]], e[0], e[1]) && !(e[1] && e[1].lock && e[1].lock.owner !== user)) meta.set(e[0], e[1]);
  for (const e of d.trees) if (ok(e) && validTree(d.fg[e[0]], e[1])) trees.set(e[0], e[1]);
  return {fg: d.fg, bgw: d.bgw, trees: [...trees.entries()], meta: [...meta.entries()], spawn: {x: d.spawn.x, y: d.spawn.y}, cols: COLS, rows: ROWS, created: Date.now()};
}
function cleanWornS(w){ const o = {}; if (w && typeof w === 'object') for (const k of ['wings','hat','hair','face','shirt','pants','tool']) if (isStr(w[k], 24)) o[k] = w[k]; return o; }
// harga maksimal per item di Vending Machine
const VEND_PRICE_MAX = 100000;
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

module.exports = {isByte, validWorldData, FG_IDS, BG_IDS, PROTECTED, LOCK_TYPE, LOCK_TILES, LOCK_RADIUS, SEED_KINDS, isName, isStr,
  validMeta, validTree, lockIndex, hasAccess, canBuildAt, newWorldData, cleanWorld, cleanWornS, VEND_PRICE_MAX, claimTilesS};
