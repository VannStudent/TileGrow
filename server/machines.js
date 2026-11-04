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
  // v1.10: pembayaran pakai World Lock (Crystal Lock = 100 WL otomatis dipecah). Mesin lama (harga gems) dimigrasi:
  // harga direset, kas gems lama disimpan di gemsOld dan tetap bisa diambil pemilik.
  vendMigrate(V);
  const wlTxt = k => fmt(k) + ' World Lock';
  if (m.op === 'buy'){
    if (mine) return deny(c, w, i, 'Ini mesinmu sendiri.');
    if (!V.key || V.n < 1) return deny(c, w, i, 'Stok habis.');
    if (V.price < 1) return deny(c, w, i, 'Pemilik belum memasang harga.');
    if (m.key !== V.key || m.price !== V.price || m.per !== V.per) return deny(c, w, i, 'Harga atau barang baru saja diganti pemilik. Cek lagi.');
    if (!Number.isInteger(n) || n < 1) return deny(c, w, i, 'Jumlah tidak valid.');
    // mode 'item': n = jumlah item, bayar n x harga WL. mode 'wl': n = jumlah WL dibayar, dapat n x harga item
    const qty = V.per === 'wl' ? n * V.price : n, total = V.per === 'wl' ? n : n * V.price;
    if (qty > V.n) return deny(c, w, i, 'Stok tidak cukup (stok ' + V.n + ').');
    const pay = planWL(E, total);
    if (!pay) return deny(c, w, i, 'World Lock tidak cukup (butuh ' + wlTxt(total) + ').');
    const err = econ.fits(E, [['b30', pay.after], [V.key, qty]].filter(x => x[1] > 0), pay.removed); if (err) return deny(c, w, i, err);
    econ.run(E, g => { payWL(g, pay); g.addItem(V.key, qty); });
    V.n -= qty; V.earned += total; const key = V.key;   // barang tetap tercatat saat habis, supaya pemilik tahu apa yang perlu diisi
    done('Kamu membeli ' + qty + ' ' + nm(key) + ' seharga ' + wlTxt(total) + '.');
    ctx.econLog('vend', {world: w.name, i, buyer: u, seller: V.owner, key, n: qty, wl: total, per: V.per, price: V.price, stockLeft: V.n});
    const oc = findOnline(V.owner);
    if (oc) oc.send({t: 'note', text: ctx.social.display(u) + ' membeli ' + qty + ' ' + nm(key) + ' dari Vending Machine-mu (' + wlTxt(total) + ').'});
    return;
  }
  if (!mine) return deny(c, w, i, 'Hanya pemilik (' + V.owner + ') yang bisa mengatur Vending Machine ini.');
  if (m.op === 'stock'){
    const key = String(m.key || '');
    if (!econ.isKey(key) || key === D.FIST || key === D.WRENCH) return deny(c, w, i, 'Item ini tidak bisa dijual.');
    if (key === 'b30' || key === 'b34') return deny(c, w, i, 'World Lock & Crystal Lock adalah alat bayar, tidak bisa dijual di mesin.');
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
    const p = m.price, per = m.per === 'wl' ? 'wl' : 'item', max = per === 'wl' ? D.STACK : VEND_PRICE_MAX;
    if (!Number.isInteger(p) || p < 1 || p > max)
      return deny(c, w, i, per === 'wl' ? 'Isi 1–' + D.STACK + ' item per World Lock.' : 'Harga 1–' + fmt(VEND_PRICE_MAX) + ' World Lock per item.');
    V.price = p; V.per = per;
    return done(per === 'wl' ? 'Harga diatur: 1 World Lock dapat ' + p + ' item.' : 'Harga diatur: ' + wlTxt(p) + ' per item.');
  }
  if (m.op === 'collect'){
    if (!V.earned && !V.gemsOld) return deny(c, w, i, 'Belum ada hasil penjualan.');
    // hasil WL diberikan sebagai Crystal Lock (per 100) + sisa World Lock
    const cl = Math.floor(V.earned / 100), wl = V.earned % 100;
    const err = econ.fits(E, [['b34', cl], ['b30', wl]].filter(x => x[1] > 0)); if (err) return deny(c, w, i, err);
    const g0 = V.gemsOld || 0, e0 = V.earned;
    econ.run(E, g => { if (cl) g.addItem('b34', cl); if (wl) g.addItem('b30', wl); if (g0) g.addGems(g0); });
    V.earned = 0; V.gemsOld = 0;
    ctx.econLog('vendCollect', {world: w.name, i, owner: u, wl: e0, cl, wlRest: wl, gemsOld: g0});
    const parts = [];
    if (e0) parts.push(wlTxt(e0) + (cl ? ' (' + cl + ' Crystal Lock' + (wl ? ' + ' + wl + ' World Lock' : '') + ')' : ''));
    if (g0) parts.push(fmt(g0) + ' gems dari penjualan lama');
    return done('Hasil penjualan diambil: ' + parts.join(' dan ') + '.');
  }
}
// v1.10: mesin dari versi lama (harga gems) -> format World Lock
function vendMigrate(V){
  if (V.cur === 'wl') return V;
  V.gemsOld = (V.gemsOld || 0) + (V.earned || 0); V.earned = 0; V.price = 0; V.per = 'item'; V.cur = 'wl';
  return V;
}
// rencana bayar `total` WL dari tas: pakai World Lock dulu, kurangnya dari Crystal Lock (1 CL = 100 WL, kembalian jadi WL)
function planWL(E, total){
  const has = k => (E.bag.find(s => s.key === k) || {n: 0}).n;
  const w0 = has('b30'), c0 = has('b34');
  if (w0 + c0 * 100 < total) return null;
  const k = w0 >= total ? 0 : Math.ceil((total - w0) / 100);
  return {removed: [['b30', w0], ['b34', k]].filter(x => x[1] > 0), w0, k, after: w0 + k * 100 - total};
}
function payWL(g, p){ if (p.w0) g.takeItem('b30', p.w0); if (p.k) g.takeItem('b34', p.k); if (p.after) g.addItem('b30', p.after); }
  return {handleChess, handleVend, vendMigrate};
};
