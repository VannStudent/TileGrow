// TileGrow server: block interaktif yang dihitung server (Papan Catur, Vending Machine)
'use strict';
const Chess = require('../js/chess.js');
const {COLS, N, econ, D} = require('./config');
const {canBuildAt, lockIndex, VEND_PRICE_MAX} = require('./validate');

module.exports = function createMachines(ctx){
  const {worlds, broadcast, econOf, saveEcon, pushEcon, findOnline, applyTile, deny, inReachS} = ctx;
// v1.7: Papan Catur. Semua langkah dicek di server (js/chess.js); bot dihitung di server juga.
const chessBusy = new Set();
function handleChess(c, m){
  const w = worlds.get(c.world); if (!w || c.frozen) return;
  const i = m.i; if (!Number.isInteger(i) || i < 0 || i >= N) return;
  const d = w.data, meta = new Map(d.meta), om = meta.get(i);
  if (d.fg[i] !== 63 || !om || !om.chess) return;
  const tx = i % COLS, ty = (i / COLS) | 0;
  const op = String(m.op || '');
  // duduk / mulai bot / ulang harus dekat papan; yang sudah duduk boleh melangkah dari mana saja di world ini
  if ((op === 'sit' || op === 'bot' || op === 'reset') && !inReachS(c, tx, ty)) return c.send({t: 'note', text: 'Terlalu jauh dari Papan Catur.'});
  const k = c.world + ':' + i; if (chessBusy.has(k) && op === 'move') return c.send({t: 'note', text: 'Bot sedang berpikir...'});
  const canAdmin = canBuildAt(meta, lockIndex(meta), i, c.user);
  const r = Chess.tableAct(om.chess, c.user, op, m, canAdmin);
  if (r.err) return c.send({t: 'note', text: r.err});
  applyTile(w, i, 63, d.bgw[i], {chess: r.T}, null);
  if (r.msg) broadcast(c.world, {t: 'chessMsg', i, text: r.msg});
  if (r.botDue){
    chessBusy.add(k);
    setTimeout(() => {
      chessBusy.delete(k);
      const w2 = worlds.get(w.name); if (!w2) return;
      const om2 = new Map(w2.data.meta).get(i); if (w2.data.fg[i] !== 63 || !om2 || !om2.chess) return;
      const T = Chess.botStep(om2.chess); if (T) applyTile(w2, i, 63, w2.data.bgw[i], {chess: T}, null);
    }, 450 + Math.floor(Math.random() * 500));
  }
}
function handleVend(c, m){
  const w = worlds.get(c.world); if (!w || c.frozen) return;
  const i = m.i; if (!Number.isInteger(i) || i < 0 || i >= N) return;
  const d = w.data, om = new Map(d.meta).get(i);
  if (d.fg[i] !== 62 || !om || !om.vend) return;
  const tx = i % COLS, ty = (i / COLS) | 0;
  if (!inReachS(c, tx, ty)) return deny(c, w, i, 'Terlalu jauh dari Vending Machine.');
  if (ctx.social.inTrade(c.user)) return deny(c, w, i, 'Selesaikan trade dulu.');
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
    if (oc) oc.send({t: 'note', text: ctx.social.display(u) + ' membeli ' + n + ' ' + nm(key) + ' dari Vending Machine-mu (' + fmt(total) + ' gems).'});
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
  return {handleChess, handleVend};
};
