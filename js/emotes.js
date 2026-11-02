'use strict';
// TileGrow v1.7 — emote: /wave /dance /cry /laugh /angry /love /sleep /cheer (+ alias Indonesia).
// Karakter bergerak (lengan, badan, wajah) + ikon pixel di atas kepala. Online: server menyiarkan ke world (t:'emote').
// Sudut lengan: 0 = lurus ke bawah, negatif = ke depan/atas depan, -PI = lurus ke atas.
const EMOTE_ALIAS = {lambai: 'wave', joget: 'dance', nangis: 'cry', ketawa: 'laugh', marah: 'angry', cinta: 'love', tidur: 'sleep', hore: 'cheer'};
const EMOTE_DEF = {
  wave:  {ms: 2600, name: 'melambai', icon: 'hand'},
  dance: {ms: 3600, name: 'berjoget', icon: 'note'},
  cry:   {ms: 3200, name: 'menangis', icon: 'drop'},
  laugh: {ms: 2800, name: 'tertawa',  icon: 'haha'},
  angry: {ms: 2600, name: 'marah',    icon: 'anger'},
  love:  {ms: 3000, name: 'jatuh cinta', icon: 'heart'},
  sleep: {ms: 5000, name: 'tidur',    icon: 'zzz'},
  cheer: {ms: 2600, name: 'bersorak', icon: 'star'}
};
function emoteName(cmd){ cmd = String(cmd || '').toLowerCase(); cmd = EMOTE_ALIAS[cmd] || cmd; return EMOTE_DEF[cmd] ? cmd : null; }
function startEmote(p, e){ if (!EMOTE_DEF[e]) return; p.emote = {e, t0: Date.now()}; }
function activeEmote(p){
  const E = p && p.emote; if (!E) return null;
  const age = Date.now() - E.t0, D = EMOTE_DEF[E.e];
  if (!D || age > D.ms){ p.emote = null; return null; }
  return {e: E.e, age, k: age / D.ms};
}
// ubah parameter gambar karakter. o = opsi drawPixelChar, mengembalikan {dx, dy, flip}
function emotePose(p, o){
  const A = activeEmote(p); if (!A) return null;
  const t = A.age / 1000, s = Math.sin, PI = Math.PI;
  const r = {dx: 0, dy: 0, flip: 1};
  o.walk = false;
  switch (A.e){
    case 'wave':  o.aFront = -2.15 + s(t*14)*.3; o.aBack = .1; o.mouthKind = 'open'; o.face = 'happy'; break;
    case 'cheer': { const up = (t*3) % 1 < .5; o.aFront = -2.6 + s(t*16)*.1; o.aBack = 2.7 - s(t*16)*.1; o.face = 'happy'; o.mouthKind = 'open'; r.dy = up ? -3 : 0; o.air = up; break; }
    case 'dance': { const beat = Math.floor(t*4); o.aFront = beat % 2 ? -2.2 : -.7; o.aBack = beat % 2 ? .7 : 2.3; o.bob = beat % 2; o.face = 'happy';
      r.dx = beat % 4 < 2 ? -2 : 2; r.flip = beat % 4 === 3 ? -1 : 1; o.phase = beat % 2 === 0; o.walk = true; break; }
    case 'cry':   o.aFront = -2.75 + s(t*9)*.2; o.aBack = -.35; o.face = 'sad'; o.mouthKind = 'frown'; o.tears = Math.floor(t*8); r.dy = Math.floor(t*6) % 2; break;
    case 'laugh': o.face = 'happy'; o.mouthKind = 'open'; o.aFront = .9; o.aBack = -.9; o.bob = Math.floor(t*10) % 2; r.dx = -1; break;
    case 'angry': o.face = 'angry'; o.mouthKind = 'frown'; o.aFront = -.9 + s(t*20)*.25; o.aBack = .4; r.dx = Math.floor(t*30) % 2 ? 1 : -1; o.blush = 1; break;
    case 'love':  o.face = 'love'; o.blush = 1; o.aFront = -1.9; o.aBack = 1.9; o.mouth = false; r.dy = Math.round(s(t*4)*1.5); break;
    case 'sleep': o.face = 'closed'; o.mouthKind = 'o'; o.aFront = .05; o.aBack = -.05; o.bob = 1; r.dy = Math.floor(t*1.2) % 2; o.blink = false; break;
  }
  return r;
}
// ikon pixel kecil di atas kepala (koordinat dunia). u = ukuran 1 piksel ikon
const EMOTE_ICON = {
  heart: ['.oo.oo.', 'o22o22o', 'o22222o', 'o22222o', '.o222o.', '..o2o..', '...o...'],
  drop:  ['...o...', '..o1o..', '.o111o.', 'o11311o', 'o11111o', '.o111o.', '..ooo..'],
  note:  ['...ooo.', '...o1o.', '...o.o.', '...o...', '.ooo...', 'o111o..', '.ooo...'],
  anger: ['.o...o.', 'o2o.o2o', '.o2.2o.', '.......', '.o2.2o.', 'o2o.o2o', '.o...o.'],
  star:  ['...o...', '..o4o..', 'oo444oo', 'o44444o', '.o444o.', 'o4o.o4o', 'oo...oo'],
  hand:  ['.o.o.o..', 'o5o5o5o.', 'o5o5o5oo', 'o555555o', 'o55555o.', '.o5555o.', '..oooo..'],
  zzz:   ['ooooooo', '....oo.', '...oo..', '..oo...', '.oo....', 'ooooooo'],
  haha:  ['o.o.oo.', 'o.o.o.o', 'ooo.ooo', 'o.o.o.o', 'o.o.o.o', '.......', '.......']
};
const EMOTE_PAL = {'1': '#5ab8ff', '2': '#e8344a', '3': '#ffffff', '4': '#ffd23d', '5': '#f4c39a'};
function drawEmoteIcon(p, cx, topY){
  const A = activeEmote(p); if (!A) return false;
  const D = EMOTE_DEF[A.e], map = EMOTE_ICON[D.icon], t = A.age / 1000;
  const u = 1.6, w = map[0].length * u, h = map.length * u;
  // muncul membesar, mengambang naik-turun, memudar di akhir
  const pop = Math.min(1, A.age / 180), fade = A.k > .85 ? (1 - A.k) / .15 : 1;
  const x0 = Math.round(cx - w/2 + (A.e === 'sleep' ? 6 + s1(t) : 0)), y0 = Math.round(topY - h - 4 - Math.sin(t*4)*2 - (A.e === 'sleep' ? Math.floor(t*2) % 3 : 0));
  ctx.save(); ctx.globalAlpha *= fade;
  ctx.translate(x0 + w/2, y0 + h/2); ctx.scale(pop, pop); ctx.translate(-w/2, -h/2);
  // bulatan latar putih supaya terbaca di langit/gua
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.strokeStyle = OL; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-3, -3, w + 6, h + 6, 4); ctx.fill(); ctx.stroke();
  for (let r = 0; r < map.length; r++) for (let c = 0; c < map[r].length; c++){
    const ch = map[r][c]; if (ch === '.') continue;
    ctx.fillStyle = ch === 'o' ? (D.icon === 'zzz' || D.icon === 'haha' ? '#3a4a8a' : OL) : EMOTE_PAL[ch];
    ctx.fillRect(c*u, r*u, u + .05, u + .05);
  }
  ctx.restore();
  return true;
}
function s1(t){ return Math.sin(t*2) * 2; }
// perintah lokal (offline / pratinjau langsung sebelum balasan server)
function doEmote(cmd){
  const e = emoteName(cmd); if (!e) return false;
  if (online()){ netSend({t: 'chat', text: '/' + e}); }
  else { startEmote(pl, e); }
  return true;
}
function onEmote(m){
  if (m.id === net.myId){ startEmote(pl, m.e); return; }
  const r = net.players.get(m.id); if (r) startEmote(r.fake, m.e);
}
