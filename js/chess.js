'use strict';
// TileGrow v1.7 — mesin catur: aturan lengkap (gerak sah, skak, skakmat, remis, rokade, en passant, promosi) + bot.
// Dipakai BERSAMA klien (script tag) dan server (require). Tanpa library luar.
// Papan: string 64 huruf, indeks 0 = a8 (kiri atas), 63 = h1. Huruf besar = putih, kecil = hitam, '.' = kosong.
(function(root){
const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
const W = c => c >= 'A' && c <= 'Z', B = c => c >= 'a' && c <= 'z';
const isOwn = (c, t) => c !== '.' && (t === 'w' ? W(c) : B(c));
const isFoe = (c, t) => c !== '.' && (t === 'w' ? B(c) : W(c));
const newGame = () => ({b: START, t: 'w', cas: 'KQkq', ep: -1, hm: 0, mv: 1});
// arah: dalam array, +8 = turun satu baris (ke arah hitam-ke-putih)
const DIRS = {N: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
  B: [[-1,-1],[-1,1],[1,-1],[1,1]], R: [[-1,0],[1,0],[0,-1],[0,1]],
  Q: [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]};
const rc = i => [i >> 3, i & 7], ix = (r, c) => r*8 + c;
const onb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
// apakah kotak i diserang oleh pihak 'by'?
function attacked(b, i, by){
  const [r, c] = rc(i);
  // pion
  const pr = by === 'w' ? r + 1 : r - 1, P = by === 'w' ? 'P' : 'p';
  for (const dc of [-1, 1]) if (onb(pr, c + dc) && b[ix(pr, c + dc)] === P) return true;
  for (const [dr, dc] of DIRS.N){ const r2 = r + dr, c2 = c + dc; if (onb(r2, c2)){ const p = b[ix(r2, c2)]; if (p === (by === 'w' ? 'N' : 'n')) return true; } }
  for (const [dr, dc] of DIRS.Q){
    const diag = dr !== 0 && dc !== 0;
    for (let k = 1; k < 8; k++){
      const r2 = r + dr*k, c2 = c + dc*k; if (!onb(r2, c2)) break;
      const p = b[ix(r2, c2)]; if (p === '.') continue;
      const up = p.toUpperCase();
      if (isOwn(p, by) && (up === 'Q' || up === (diag ? 'B' : 'R') || (k === 1 && up === 'K'))) return true;
      break;
    }
  }
  return false;
}
const kingAt = (b, t) => b.indexOf(t === 'w' ? 'K' : 'k');
const inCheck = (s, t) => { const k = kingAt(s.b, t || s.t); return k < 0 ? false : attacked(s.b, k, (t || s.t) === 'w' ? 'b' : 'w'); };
// semua gerakan tanpa cek legalitas raja
function rawMoves(s){
  const b = s.b, t = s.t, out = [];
  const add = (from, to, extra) => out.push(Object.assign({from, to}, extra));
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (!isOwn(p, t)) continue;
    const [r, c] = rc(i), up = p.toUpperCase();
    if (up === 'P'){
      const d = t === 'w' ? -1 : 1, last = t === 'w' ? 0 : 7;
      const r1 = r + d;
      if (onb(r1, c) && b[ix(r1, c)] === '.'){
        if (r1 === last) for (const q of 'QRBN') add(i, ix(r1, c), {promo: q}); else add(i, ix(r1, c));
        const r2 = r + 2*d;
        if (r === (t === 'w' ? 6 : 1) && b[ix(r2, c)] === '.') add(i, ix(r2, c), {dbl: 1});
      }
      for (const dc of [-1, 1]){
        const c2 = c + dc; if (!onb(r1, c2)) continue;
        const j = ix(r1, c2);
        if (isFoe(b[j], t)){ if (r1 === last) for (const q of 'QRBN') add(i, j, {promo: q}); else add(i, j); }
        else if (j === s.ep) add(i, j, {epCap: 1});
      }
      continue;
    }
    if (up === 'N' || up === 'K'){
      for (const [dr, dc] of (up === 'N' ? DIRS.N : DIRS.Q)){
        const r2 = r + dr, c2 = c + dc; if (!onb(r2, c2)) continue;
        const j = ix(r2, c2); if (isOwn(b[j], t)) continue; add(i, j);
      }
      if (up === 'K'){
        // rokade: raja & benteng belum pernah jalan, kotak antara kosong, raja tidak lewat kotak terserang
        const home = t === 'w' ? 60 : 4, foe = t === 'w' ? 'b' : 'w';
        if (i === home && !attacked(b, home, foe)){
          const K = t === 'w' ? 'K' : 'k', Q = t === 'w' ? 'Q' : 'q';
          if (s.cas.includes(K) && b[home+1] === '.' && b[home+2] === '.' && !attacked(b, home+1, foe)) add(i, home+2, {cas: 'k'});
          if (s.cas.includes(Q) && b[home-1] === '.' && b[home-2] === '.' && b[home-3] === '.' && !attacked(b, home-1, foe)) add(i, home-2, {cas: 'q'});
        }
      }
      continue;
    }
    for (const [dr, dc] of DIRS[up]) for (let k = 1; k < 8; k++){
      const r2 = r + dr*k, c2 = c + dc*k; if (!onb(r2, c2)) break;
      const j = ix(r2, c2); if (isOwn(b[j], t)) break;
      add(i, j); if (b[j] !== '.') break;
    }
  }
  return out;
}
const setCh = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);
// jalankan gerakan (tanpa cek legal); mengembalikan state baru
function apply(s, m){
  let b = s.b; const p = b[m.from], t = s.t, cap = b[m.to] !== '.' || m.epCap;
  b = setCh(b, m.from, '.');
  b = setCh(b, m.to, m.promo ? (t === 'w' ? m.promo : m.promo.toLowerCase()) : p);
  if (m.epCap) b = setCh(b, m.to + (t === 'w' ? 8 : -8), '.');
  if (m.cas){ const home = t === 'w' ? 60 : 4;
    if (m.cas === 'k'){ b = setCh(b, home+3, '.'); b = setCh(b, home+1, t === 'w' ? 'R' : 'r'); }
    else { b = setCh(b, home-4, '.'); b = setCh(b, home-1, t === 'w' ? 'R' : 'r'); }
  }
  let cas = s.cas;
  const drop = ch => { cas = cas.split('').filter(x => x !== ch).join(''); };
  const up = p.toUpperCase();
  if (up === 'K'){ drop(t === 'w' ? 'K' : 'k'); drop(t === 'w' ? 'Q' : 'q'); }
  if (up === 'R'){ if (m.from === (t === 'w' ? 63 : 7)) drop(t === 'w' ? 'K' : 'k'); if (m.from === (t === 'w' ? 56 : 0)) drop(t === 'w' ? 'Q' : 'q'); }
  if (m.to === 63) drop('K'); if (m.to === 56) drop('Q'); if (m.to === 7) drop('k'); if (m.to === 0) drop('q');
  return {b, t: t === 'w' ? 'b' : 'w', cas: cas || '-', ep: m.dbl ? (m.from + m.to)/2 : -1,
    hm: (cap || up === 'P') ? 0 : s.hm + 1, mv: t === 'b' ? s.mv + 1 : s.mv};
}
// gerakan yang benar-benar sah (raja sendiri tidak tertinggal dalam skak)
function moves(s){
  const out = [];
  for (const m of rawMoves(s)){ const n = apply(s, m); if (!inCheck({...n, t: s.t})) out.push(m); }
  return out;
}
// status: 'play' | 'check' | 'mate' | 'stalemate' | 'draw50' | 'material'
function status(s){
  const ms = moves(s), ck = inCheck(s);
  if (!ms.length) return ck ? 'mate' : 'stalemate';
  if (s.hm >= 100) return 'draw50';
  const pcs = s.b.replace(/\./g, '');
  if (/^[Kk]{2}$/.test(pcs.split('').sort().join('')) || pcs.length === 2) return 'material';
  if (pcs.length === 3 && /[NnBb]/.test(pcs)) return 'material';
  return ck ? 'check' : 'play';
}
const VAL = {P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0};
// bonus posisi sederhana: pion maju, bidak dekat tengah
const CENTER = (() => { const a = []; for (let i = 0; i < 64; i++){ const [r, c] = rc(i); a.push(7 - (Math.abs(3.5 - r) + Math.abs(3.5 - c))); } return a; })();
function evalBoard(b){
  let v = 0;
  for (let i = 0; i < 64; i++){
    const p = b[i]; if (p === '.') continue;
    const up = p.toUpperCase(), base = VAL[up] + CENTER[i]*(up === 'P' ? 1.5 : up === 'K' ? 0 : 2);
    const adv = up === 'P' ? (W(p) ? (6 - (i >> 3))*4 : ((i >> 3) - 1)*4) : 0;
    v += (W(p) ? 1 : -1) * (base + adv);
  }
  return v;
}
const ORD = {P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6};
function negamax(s, depth, alpha, beta){
  const ms = moves(s);
  if (!ms.length) return inCheck(s) ? -99000 - depth : 0;
  if (depth === 0){ const v = evalBoard(s.b); return s.t === 'w' ? v : -v; }
  // urutan: makan bidak besar dulu -> alpha-beta lebih tajam
  ms.sort((a, c) => (s.b[c.to] !== '.' ? ORD[s.b[c.to].toUpperCase()] * 10 : 0) - (s.b[a.to] !== '.' ? ORD[s.b[a.to].toUpperCase()] * 10 : 0));
  let best = -1e9;
  for (const m of ms){
    const v = -negamax(apply(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
// pilih gerakan bot. level 1 = acak-agak-pintar, 2 = depth 2, 3 = depth 3
function botMove(s, level){
  const ms = moves(s); if (!ms.length) return null;
  const depth = level >= 3 ? 3 : level === 2 ? 2 : 1;
  let best = -1e9, pick = [];
  for (const m of ms){
    let v = -negamax(apply(s, m), depth - 1, -1e9, 1e9);
    v += Math.random()*8;                                  // sedikit variasi supaya tidak selalu sama
    if (v > best + 1e-9){ best = v; pick = [m]; } else if (v > best - 1e-9) pick.push(m);
  }
  return pick[(Math.random()*pick.length)|0];
}
const SQ = i => 'abcdefgh'[i & 7] + (8 - (i >> 3));
// catatan langkah singkat (bukan SAN lengkap, cukup untuk daftar langkah)
function moveText(s, m){
  const p = s.b[m.from].toUpperCase(), cap = s.b[m.to] !== '.' || m.epCap;
  if (m.cas) return m.cas === 'k' ? 'O-O' : 'O-O-O';
  return (p === 'P' ? '' : p) + SQ(m.from) + (cap ? 'x' : '-') + SQ(m.to) + (m.promo ? '=' + m.promo : '');
}
function findMove(s, from, to, promo){
  return moves(s).find(m => m.from === from && m.to === to && (!m.promo || !promo || m.promo === promo)) || null;
}
// papan valid? (dipakai server sebelum menyimpan meta)
function validBoard(b){
  if (typeof b !== 'string' || b.length !== 64 || !/^[rnbqkpRNBQKP.]{64}$/.test(b)) return false;
  return (b.match(/K/g) || []).length === 1 && (b.match(/k/g) || []).length === 1;
}

// ---------- meja catur (block Papan Catur): dipakai server DAN mode offline ----------
// meta: {w, b: nama pemain atau null; bot: 0 (lawan pemain) | 1..3 (level bot, bot = hitam); g: state; last: [from,to]|null; res: null|teks; log: [teks..]}
const BOT_NAME = lv => 'Bot ' + ['', 'Mudah', 'Sedang', 'Sulit'][lv];
const newTable = () => ({w: null, b: null, bot: 0, g: newGame(), last: null, res: null, log: []});
const lc = x => String(x || '').toLowerCase();
const seatOf = (T, u) => lc(T.w) === lc(u) ? 'w' : lc(T.b) === lc(u) ? 'b' : null;
const started = T => T.log.length > 0 && !T.res;
function finish(T){
  const st = status(T.g), side = T.g.t === 'w' ? 'Putih' : 'Hitam', other = T.g.t === 'w' ? 'Hitam' : 'Putih';
  const nm = c => c === 'w' ? T.w : (T.bot ? BOT_NAME(T.bot) : T.b);
  if (st === 'mate') T.res = 'Skakmat! ' + other + ' (' + nm(T.g.t === 'w' ? 'b' : 'w') + ') menang.';
  else if (st === 'stalemate') T.res = 'Remis: ' + side + ' tidak punya langkah (stalemate).';
  else if (st === 'draw50') T.res = 'Remis: 50 langkah tanpa makan / gerak pion.';
  else if (st === 'material') T.res = 'Remis: bidak tidak cukup untuk skakmat.';
  return st;
}
function pushMove(T, m){
  T.log.push(moveText(T.g, m)); if (T.log.length > 400) T.log.shift();
  T.g = apply(T.g, m); T.last = [m.from, m.to]; finish(T);
}
// op: sit {side}, leave, bot {level}, move {from,to,promo}, resign, reset. canAdmin = pemilik/akses lock tile.
// Mengembalikan {T, err?, msg?, botDue?}
function tableAct(T0, user, op, a, canAdmin){
  const T = JSON.parse(JSON.stringify(T0 || newTable()));
  const me = seatOf(T, user), err = e => ({T: T0, err: e});
  a = a || {};
  if (op === 'sit'){
    const side = a.side === 'b' ? 'b' : 'w';
    if (me) return err('Kamu sudah duduk di meja ini.');
    if (side === 'b' && T.bot) return err('Kursi hitam dipakai bot. Tunggu permainan selesai.');
    if (T[side]) return err('Kursi ' + (side === 'w' ? 'putih' : 'hitam') + ' sudah dipakai ' + T[side] + '.');
    T[side] = String(user);
    if (T.res){ T.g = newGame(); T.last = null; T.res = null; T.log = []; }
    return {T, msg: user + ' duduk sebagai ' + (side === 'w' ? 'Putih' : 'Hitam') + '.'};
  }
  if (op === 'bot'){
    const lv = Math.max(1, Math.min(3, a.level | 0 || 1));
    if (me !== 'w') return err('Duduk di kursi putih dulu untuk melawan bot.');
    if (T.b && !T.bot) return err('Kursi hitam sudah dipakai ' + T.b + '.');
    if (started(T)) return err('Permainan sedang berjalan.');
    T.bot = lv; T.b = null; T.g = newGame(); T.last = null; T.res = null; T.log = [];
    return {T, msg: 'Lawan ' + BOT_NAME(lv) + '. Kamu Putih, jalan duluan.'};
  }
  if (op === 'move'){
    if (!me) return err('Kamu tidak duduk di meja ini.');
    if (T.res) return err('Permainan sudah selesai. Tekan "Main lagi".');
    if (!T.w || (!T.b && !T.bot)) return err('Tunggu lawan duduk dulu.');
    if (T.g.t !== me) return err('Bukan giliranmu.');
    const m = findMove(T.g, a.from | 0, a.to | 0, a.promo && 'QRBN'.includes(a.promo) ? a.promo : 'Q');
    if (!m) return err('Langkah tidak sah.');
    if (m.promo && a.promo && 'QRBN'.includes(a.promo)) m.promo = a.promo;
    pushMove(T, m);
    return {T, botDue: !!(T.bot && !T.res && T.g.t === 'b')};
  }
  if (op === 'resign'){
    if (!me) return err('Kamu tidak duduk di meja ini.');
    if (!started(T) && !T.log.length) return err('Permainan belum dimulai.');
    if (T.res) return err('Permainan sudah selesai.');
    T.res = (me === 'w' ? 'Putih' : 'Hitam') + ' (' + user + ') menyerah. ' + (me === 'w' ? 'Hitam' : 'Putih') + ' menang.';
    return {T};
  }
  if (op === 'leave'){
    if (!me) return err('Kamu tidak duduk di meja ini.');
    if (started(T) && !T.bot && T.w && T.b) T.res = (me === 'w' ? 'Putih' : 'Hitam') + ' (' + user + ') meninggalkan meja. ' + (me === 'w' ? 'Hitam' : 'Putih') + ' menang.';
    T[me] = null; if (me === 'w' && T.bot){ T.bot = 0; if (!T.res && T.log.length) T.res = 'Permainan melawan bot dihentikan.'; }
    return {T, msg: user + ' meninggalkan meja.'};
  }
  if (op === 'reset'){
    if (!me && !canAdmin) return err('Hanya pemain di meja atau pemilik lock yang bisa mengulang.');
    if (started(T) && !T.bot && T.w && T.b) return err('Permainan masih berjalan. Menyerah dulu kalau mau mengulang.');
    T.g = newGame(); T.last = null; T.res = null; T.log = [];
    if (canAdmin && !me){ T.w = null; T.b = null; T.bot = 0; }
    return {T, msg: 'Papan diulang.'};
  }
  return err('Aksi tidak dikenal.');
}
function botStep(T0){
  const T = JSON.parse(JSON.stringify(T0));
  if (!T.bot || T.res || T.g.t !== 'b') return null;
  const m = botMove(T.g, T.bot); if (!m) return null;
  pushMove(T, m); return T;
}
// bentuk meta valid? (server)
function validTable(T){
  if (!T || typeof T !== 'object') return false;
  const nm = v => v === null || (typeof v === 'string' && /^[A-Za-z0-9]{1,16}$/.test(v));
  const g = T.g;
  return nm(T.w) && nm(T.b) && Number.isInteger(T.bot) && T.bot >= 0 && T.bot <= 3 && g && validBoard(g.b) && (g.t === 'w' || g.t === 'b')
    && typeof g.cas === 'string' && /^(-|K?Q?k?q?)$/.test(g.cas) && Number.isInteger(g.ep) && g.ep >= -1 && g.ep < 64
    && Number.isInteger(g.hm) && Number.isInteger(g.mv) && (T.last === null || (Array.isArray(T.last) && T.last.length === 2))
    && (T.res === null || (typeof T.res === 'string' && T.res.length < 160)) && Array.isArray(T.log) && T.log.length <= 400;
}
const API = {newTable, tableAct, botStep, validTable, seatOf, BOT_NAME, START, newGame, moves, rawMoves, apply, inCheck, status, botMove, evalBoard, moveText, findMove, validBoard, SQ, attacked, kingAt};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else Object.assign(root, {Chess: API});
})(typeof globalThis !== 'undefined' ? globalThis : this);
