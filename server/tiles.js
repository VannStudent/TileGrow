// TileGrow server: aksi di tile (pukul/pasang/tanam/wrench), drop item, cek gerakan & jangkauan
'use strict';
const crypto = require('crypto');
const Chess = require('../js/chess.js');
const {RANK} = require('./social');
const {COLS, ROWS, N, econ, D, TS} = require('./config');
const {PROTECTED, FG_IDS, validMeta, isName, lockIndex, canBuildAt, claimTilesS} = require('./validate');

module.exports = function createTiles(ctx){
  const {worlds, scheduleWorldSave, broadcast, inWorld, econOf, saveEcon, pushEcon} = ctx;
  let nextDrop = 1;
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
// drop yang tidak diambil hilang setelah 10 menit
setInterval(() => {
  const now = Date.now();
  for (const w of worlds.values()) for (const [id, d] of w.drops)
    if (now - d.t > 600e3){ w.drops.delete(id); broadcast(w.name, {t: 'dropDel', id}); }
}, 30e3).unref();

// ---------- cek gerakan (anti teleport / terbang / tembus) ----------
// server tidak menjalankan fisika penuh; cukup batas kecepatan + tidak boleh berada di dalam block padat.
// Staff dengan /noclip dibebaskan.
const MAX_SPEED = 900;                                 // px/dtk (jalan 230, jatuh 430, lompat sayap ~900)
function insideSolid(d, x, y, u){
  let meta = null, li = null;                          // dihitung hanya kalau menyentuh House Entrance
  const x0 = Math.floor((x + 3) / TS), x1 = Math.floor((x + 23) / TS), y0 = Math.floor((y + 3) / TS), y1 = Math.floor((y + 27) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++){
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
    const id = d.fg[ty * COLS + tx];
    if (id === 21){ continue; }                           // pintu: bisa dilewati (pintu terkunci dicek di browser)
    if (id === 24){                                      // House Entrance: padat bagi yang tidak punya akses lock
      if (!meta){ meta = new Map(d.meta); li = lockIndex(meta); }
      if (!canBuildAt(meta, li, ty * COLS + tx, u)) return true;
      continue;
    }
    if (econ.solid(id)) return true;
  }
  return false;
}
function checkMove(c, w, s){
  if (c.noclip) return true;
  const now = Date.now(), last = c.lastPos;
  if (c.frozen && last) return false;
  if (insideSolid(w.data, s.x, s.y, c.user)) return false;
  // v1.13: respawn = pindah instan ke pintu utama dari mana saja. Hanya diterima kalau tujuannya memang pintu utama
  // (sampai 3 tile di atasnya, untuk efek malaikat). Dulu ditolak sebagai teleport -> pemain dikembalikan ke tempat mati.
  if (s.rs){ const sp = w.data.spawn, dx = s.x - (sp.x * TS + 3), dy = s.y - (sp.y * TS + 2);
    return Math.abs(dx) <= 4 && dy <= 4 && dy >= -TS * 3 - 4; }
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
  const can = canBuildAt(meta, li, i, u) || (c.noclip && ctx.social.rankOf(u) >= RANK.dev);
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
        return broadcast(c.world, {t: 'roll', i, kind: rd.roll, v, by: ctx.social.display(u)});
      }
    }
    if (!can) return deny(c, w, i, 'Area ini dikunci.');
    if (om && om.lock && om.lock.owner !== u) return deny(c, w, i, 'Lock milik ' + om.lock.owner + '.');
    if (om && om.vend && (om.vend.n || om.vend.earned || om.vend.gemsOld))
      return deny(c, w, i, om.vend.owner === u ? 'Ambil dulu stok dan hasil penjualan di Vending Machine sebelum memecahnya.' : 'Vending Machine milik ' + om.vend.owner + '. Pakai kunci inggris untuk membeli.');
    if (om && om.chess && om.chess.log.length && !om.chess.res && (om.chess.b || om.chess.bot)) return deny(c, w, i, 'Permainan catur sedang berjalan. Tunggu selesai dulu.');
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
    econ.run(E, g => {
      if (isBg) g.questEvent('bgbreak', null, 1);
      if (r.ore){ g.stat('ores', 1); g.questEvent('ore', null, 1); }
      g.stat('broken', 1); g.questEvent('break', null, 1); g.addXP(r.xp);
    });
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
    if (def.solid || def.entrance) for (const o of inWorld(c.world)) if (o.state && insideSolidAt(o.state, tx, ty)) return deny(c, w, i, 'Ada pemain di situ.');
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
    else if (def.wrench === 'vend') mt = {vend: {owner: u, key: null, n: 0, price: 0, earned: 0, per: 'item', cur: 'wl', gemsOld: 0}};
    else if (def.wrench === 'chess') mt = {chess: Chess.newTable()};
    econ.run(E, g => { g.takeItem(key, 1); g.stat('placed', 1); g.questEvent('place', null, 1); if (def.lock === 'world') g.stat('worldLocks', 1); });
    applyTile(w, i, id, d.bgw[i], mt, null);
    saveEcon(u); return pushEcon(c);
  }
  if (m.a === 'meta'){
    // simpan dialog wrench (papan, pintu, kotak pajang, lock)
    const mt = m.meta; if (!om || !mt || typeof mt !== 'object') return;
    if (om.vend) return deny(c, w, i, '');               // vending diatur lewat aksi 'vend' (stok & gems dihitung server)
    if (om.chess) return deny(c, w, i, '');              // catur diatur lewat aksi 'chess' (langkah dicek server)
    if (!validMeta(fgId, i, mt)) return deny(c, w, i, 'Data tidak valid.');
    if (om.lock){
      if (om.lock.owner !== u) return deny(c, w, i, 'Hanya pemilik lock.');
      const L = mt.lock; if (!L || L.type !== om.lock.type || L.owner !== om.lock.owner) return deny(c, w, i, 'Lock tidak boleh pindah tangan.');
      L.access = [...new Set(L.access.filter(n => isName(n) && n !== u))].slice(0, 1000);   // v1.13: admin world tak terbatas (batas teknis 1000)
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
function insideSolidAt(st, tx, ty){ return st.x < (tx + 1) * TS && st.x + 26 > tx * TS && st.y < (ty + 1) * TS && st.y + 30 > ty * TS; }
  return {spawnDropS, dropsAt, checkMove, inReachS, applyTile, tileState, deny, handleAct, insideSolidAt};
};
