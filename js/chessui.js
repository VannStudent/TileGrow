'use strict';
// TileGrow v1.7 — tampilan Papan Catur (wrench pada block Papan Catur).
// Online: semua aksi dikirim ke server (t:'chess'), hasil datang lewat update meta tile. Offline: aturan dijalankan lokal (js/chess.js).
let chessOpen = null, chessSel = -1, chessPromo = null;
const PIECE_CH = {K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'};
const PIECE_NM = {Q: 'Menteri', R: 'Benteng', B: 'Gajah', N: 'Kuda'};
function chessTable(){ const m = chessOpen !== null && meta.get(chessOpen); return m && m.chess && fg[chessOpen] === 63 ? m.chess : null; }
function openChess(i){ chessOpen = i; chessSel = -1; chessPromo = null; renderChess(); $('chessBox').classList.remove('hidden'); }
function closeChess(){ chessOpen = null; $('chessBox').classList.add('hidden'); }
function chessDo(op, a){
  if (chessOpen === null) return;
  if (online()) return netSend(Object.assign({t: 'chess', i: chessOpen, op}, a || {}));
  // offline: jalankan aturan di sini
  const T = chessTable(); if (!T) return;
  const r = Chess.tableAct(T, who(), op, a, true);
  if (r.err){ toast(r.err); sfx('deny'); return; }
  meta.set(chessOpen, {chess: r.T}); save(); renderChess();
  if (r.botDue){ const i = chessOpen; setTimeout(() => { const m = meta.get(i); if (!m || !m.chess) return; const T2 = Chess.botStep(m.chess); if (T2){ meta.set(i, {chess: T2}); save(); if (chessOpen === i) renderChess(); sfx('place'); } }, 500); }
}
function renderChess(){
  const T = chessTable();
  if (!T){ if (chessOpen !== null) closeChess(); return; }
  const me = Chess.seatOf(T, who()), flip = me === 'b';
  const g = T.g, st = T.res ? 'end' : Chess.status(g);
  const legal = (me && g.t === me && !T.res && (T.b || T.bot) && T.w) ? Chess.moves(g) : [];
  const targets = new Set(legal.filter(m => m.from === chessSel).map(m => m.to));
  const ck = !T.res && Chess.inCheck(g) ? Chess.kingAt(g.b, g.t) : -1;
  let h = '<div class="chBoard' + (flip ? ' flip' : '') + '">';
  for (let k = 0; k < 64; k++){
    const i = flip ? 63 - k : k, r = i >> 3, c = i & 7, p = g.b[i];
    const cls = ['chSq', (r + c) % 2 ? 'dk' : 'lt'];
    if (T.last && (T.last[0] === i || T.last[1] === i)) cls.push('last');
    if (i === chessSel) cls.push('sel');
    if (targets.has(i)) cls.push(p !== '.' || (g.b[chessSel] || '').toUpperCase() === 'P' && (i & 7) !== (chessSel & 7) ? 'mvCap' : 'mvDot');
    if (i === ck) cls.push('chk');
    const lab = (flip ? r === 0 : r === 7) ? '<i class="fl">' + 'abcdefgh'[c] + '</i>' : '';
    const rlab = (flip ? c === 7 : c === 0) ? '<i class="rl">' + (8 - r) + '</i>' : '';
    h += '<div class="' + cls.join(' ') + '" data-i="' + i + '">' + (p !== '.' ? '<span class="pc ' + (p === p.toUpperCase() ? 'w' : 'b') + '">' + PIECE_CH[p] + '</span>' : '') + lab + rlab + '</div>';
  }
  h += '</div>';
  const nmW = T.w || '—', nmB = T.bot ? Chess.BOT_NAME(T.bot) : (T.b || '—');
  const turnTxt = T.res ? T.res : st === 'mate' ? 'Skakmat!' : (g.t === 'w' ? 'Giliran Putih' : 'Giliran Hitam') + (st === 'check' ? ' — SKAK!' : '') + ((T.w && (T.b || T.bot)) ? '' : ' · menunggu pemain');
  let side = '<div class="chSide">' +
    '<div class="chSeat' + (g.t === 'b' && !T.res ? ' on' : '') + '"><span class="pc b">♚</span><b>' + esc(nmB) + '</b>' + (!T.b && !T.bot && !me ? '<button class="btn" data-op="sitb">Duduk</button>' : '') + '</div>' +
    '<div class="chSeat' + (g.t === 'w' && !T.res ? ' on' : '') + '"><span class="pc w">♔</span><b>' + esc(nmW) + '</b>' + (!T.w && !me ? '<button class="btn" data-op="sitw">Duduk</button>' : '') + '</div>' +
    '<div class="chTurn' + (st === 'check' ? ' warn' : '') + (T.res ? ' end' : '') + '">' + esc(turnTxt) + '</div>';
  if (me === 'w' && !T.b && (!T.log.length || T.res || T.bot))
    side += '<div class="chBot"><span>Lawan bot:</span><button class="btn" data-op="bot1">Mudah</button><button class="btn" data-op="bot2">Sedang</button><button class="btn" data-op="bot3">Sulit</button></div>';
  if (chessPromo) side += '<div class="chPromo"><span>Promosi pion jadi:</span>' + 'QRBN'.split('').map(q => '<button class="btn" data-promo="' + q + '" title="' + PIECE_NM[q] + '">' + PIECE_CH[me === 'b' ? q.toLowerCase() : q] + '</button>').join('') + '</div>';
  side += '<div class="chLog">' + (T.log.length ? T.log.map((x, k) => (k % 2 ? '' : '<span class="n">' + (k/2 + 1) + '.</span>') + esc(x) + ' ').join('') : '<span class="note">Belum ada langkah.</span>') + '</div>';
  side += '<div class="chBtns">' + (me && !T.res && T.log.length ? '<button class="btn" data-op="resign">Menyerah</button>' : '') +
    (T.res || (!T.log.length && me) || (T.bot && me) ? '<button class="btn" data-op="reset">Main lagi</button>' : '') +
    (me ? '<button class="btn" data-op="leave">Berdiri</button>' : '') + '<button class="btn" data-op="close">Tutup</button></div>';
  side += '<p class="note">' + (me ? 'Klik bidakmu lalu klik kotak tujuan.' : 'Kamu menonton. Duduk di kursi kosong untuk bermain.') + '</p></div>';
  $('chessBody').innerHTML = h + side;
  $('chessBody').querySelectorAll('.chSq').forEach(el => el.onclick = () => chessClick(+el.dataset.i, legal));
  $('chessBody').querySelectorAll('[data-op]').forEach(el => el.onclick = () => {
    const op = el.dataset.op;
    if (op === 'close') return closeChess();
    if (op === 'sitw' || op === 'sitb') return chessDo('sit', {side: op[3]});
    if (op.startsWith('bot')) return chessDo('bot', {level: +op[3]});
    if (op === 'resign' && !confirm('Yakin menyerah?')) return;
    chessDo(op);
  });
  $('chessBody').querySelectorAll('[data-promo]').forEach(el => el.onclick = () => { const p = chessPromo; chessPromo = null; chessSel = -1; chessDo('move', {from: p.from, to: p.to, promo: el.dataset.promo}); });
}
function chessClick(i, legal){
  const T = chessTable(); if (!T) return;
  const me = Chess.seatOf(T, who()); if (!me) return;
  const p = T.g.b[i];
  if (chessSel >= 0){
    const ms = legal.filter(m => m.from === chessSel && m.to === i);
    if (ms.length){
      if (ms[0].promo){ chessPromo = {from: chessSel, to: i}; return renderChess(); }
      const from = chessSel; chessSel = -1; sfx('place'); return chessDo('move', {from, to: i});
    }
  }
  chessSel = (p !== '.' && (me === 'w' ? p === p.toUpperCase() : p === p.toLowerCase()) && legal.some(m => m.from === i)) ? i : -1;
  chessPromo = null; renderChess();
}
