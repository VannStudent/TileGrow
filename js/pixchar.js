'use strict';
// TileGrow v1.6 — karakter PIXEL ART: kepala kotak besar, badan pendek, garis luar 1 px otomatis per bagian.
// Desain sendiri (terinspirasi gaya chibi sandbox 2D), tidak memakai aset game lain.
// Semua digambar ke kanvas kecil (1 piksel = 1 "piksel seni"), lalu diperbesar tanpa smoothing -> tepi tajam.
const PX_HAT = {
  cowboy: {y0: -31, rows: ["....oooooooooooo....", "...o331111111112o...", "...o311111111112o...", "...o111111111122o...", "...o222222222222o...", ".ooo111111111111ooo.", "o333111111111111112o", ".oooooooooooooooooo."]},
  crown: {y0: -31, rows: [".o.....oo.....o.", "o3o...o33o...o3o", "o13o.o3113o.o31o", "o111o111111o111o", "o11111111111111o", "o2b222r2222g222o", "oooooooooooooooo"]},
  cap: {y0: -31, rows: ["....oooooooo......", "...o33111112o.....", "..o3111111112o....", "..o1111311112o....", ".o111111111112o...", ".o2222222222222ooo", "..ooooooooooo2222o", "............ooooo."]},
  miner: {y0: -30, rows: [".....oooooooo.....", "....o33111111o....", "...o3111111kkko...", "..o31111111kllko..", "..o11111111kllko..", ".o22222222222222o.", ".oooooooooooooooo."]},
  beanie: {y0: -31, rows: ["......oooo......", ".....o3333o.....", "...oooo33oooo...", "..o3121212121o..", ".o312121212121o.", ".o121212121212o.", "o33333333333333o", "o32323232323232o", "oooooooooooooooo"]}
};
const PX_WING = {
  angel: ["oooo..........", "o333oo........", ".o33333oo.....", ".o3111133oo...", "..o111111133o.", "..o1111111113o", "...o111111111o", "...o12111111o.", "....o121211o..", ".....oo1o1o...", "......o.o....."],
  devil: ["oo............", "o1oo..........", "o111oo........", ".o3111oo......", ".o12111111oo..", "..o12112111o..", "..o112112111o.", "...o11o11o11o.", "...o.o.oo.oo..", "..............", ".............."],
  storm: ["ooo...........", "o33oo.........", "o3333oo.......", ".o33111oo.....", ".o3111111oo...", "..o111111122o.", "..o11111122o..", "...o1111222o..", "...oo11o22o...", "..yy.oo.oo....", ".yyyy........."]
};
const PX_PICK = ["..ooooooo..", ".o3311122o.", "o33oooo22o.", "oo...on.oo.", ".....on....", ".....on....", ".....on....", ".....on....", ".....on....", ".....on....", ".....oo...."];
const PX_ARM = ['SSS', 'SST', 'SST', 'aab', 'aab', '.ab.', ''].slice(0, 5).concat(['aab', 'aab']);
const PXC = {W: 72, H: 60, OX: 36, OY: 50, U: 1.15};
const PX_SKIN = ['#f4c39a', '#d8956a', '#ffdcbc'];
const pxColCache = new Map();
function pxCol(hex){
  let v = pxColCache.get(hex); if (v !== undefined) return v;
  let h = String(hex).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; pxColCache.set(hex, v); return v;
}
// kanvas piksel dengan "layer": isi bagian di layer, lalu flush() memberi garis luar 1 px dan menempelkannya
// v1.8: warna tepi = warna bagian itu digelapkan ~50% (tanpa garis hitam)
const pxDarkCache = new Map();
function pxDark(v){ let d = pxDarkCache.get(v); if (d !== undefined) return d;
  const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, k = .66;
  d = ((255 << 24) | (Math.round(b*k) << 16) | (Math.round(g*k) << 8) | Math.round(r*k)) >>> 0; pxDarkCache.set(v, d); return d; }
const pxOc = pal => pal.o || shadeHex(pal['2'] || pal['1'] || '#555555', -50);
function pxPainter(W, H, ox, oy){
  const main = new Uint32Array(W*H), lay = new Uint32Array(W*H), OLc = pxCol(OL);
  const P = {W, H, ox, oy, main,
    set(x, y, c){ x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < W && y < H && c) lay[y*W + x] = typeof c === 'number' ? c : pxCol(c); },
    unset(x, y){ x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < W && y < H) lay[y*W + x] = 0; },
    rect(x, y, w, h, c){ for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, c); },
    // gambar peta string; pal: huruf -> warna. 'o' = garis luar. flip = cermin horizontal
    map(rows, x0, y0, pal, flip){
      const w = rows[0].length, oc = pxOc(pal);
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++){
        const ch = rows[r][c]; if (ch === '.') continue;
        P.set(flip ? x0 + (w - 1 - c) : x0 + c, y0 + r, ch === 'o' ? oc : pal[ch]);
      }
    },
    // peta string diputar ang (radian) di sekitar titik pivot (pc, pr) yang ditaruh di (ax, ay); sampling terdekat -> tetap pixel
    mapRot(rows, pal, pc, pr, ax, ay, ang){
      const w = rows[0].length, h = rows.length, R = Math.ceil(Math.hypot(Math.max(pc, w - pc), Math.max(pr, h - pr))) + 1;
      const cs = Math.cos(ang), sn = Math.sin(ang), oc = pxOc(pal);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++){
        const sx = (dx + .5)*cs + (dy + .5)*sn, sy = -(dx + .5)*sn + (dy + .5)*cs;
        const c = Math.floor(pc + sx), r = Math.floor(pr + sy);
        if (c < 0 || r < 0 || c >= w || r >= h) continue;
        const ch = rows[r][c]; if (ch === '.') continue;
        P.set(ax + dx, ay + dy, ch === 'o' ? oc : pal[ch]);
      }
    },
    flush(noOutline){
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const i = y*W + x;
        if (lay[i]) continue;
        if (noOutline) continue;
        const n = (x > 0 && lay[i-1]) || (x < W-1 && lay[i+1]) || (y > 0 && lay[i-W]) || (y < H-1 && lay[i+W]);
        if (n) main[i] = pxDark(n);
      }
      for (let i = 0; i < lay.length; i++) if (lay[i]){ main[i] = lay[i]; lay[i] = 0; }
    }
  };
  return P;
}
let pxcCv = null, pxcG = null;
function pxToCanvas(P, cv){
  cv = cv || newCanvas(P.W, P.H); if (cv.width !== P.W) cv.width = P.W; if (cv.height !== P.H) cv.height = P.H;
  const g = cv.getContext('2d'), im = g.createImageData(P.W, P.H);
  new Uint32Array(im.data.buffer).set(P.main); g.putImageData(im, 0, 0); return cv;
}
// sayap: peta untuk sisi kiri (mengembang ke kiri), sisi kanan = cermin. Pangkal di punggung atas.
function pxWing(P, W, flap, bob, part){
  // part 'far' = sayap sisi depan (di balik badan, lebih kecil & gelap), 'near' = sayap sisi belakang (terlihat penuh)
  const rows = PX_WING[(W.key || '').replace('w_', '')] || PX_WING.angel, w = rows[0].length, ac = w - 1, ar = rows.length - 4;   // pangkal = pojok kanan-bawah peta
  const far = part === 'far', k = far ? -14 : 0;
  const pal = {'1': shadeHex(W.color[0], k), '2': shadeHex(W.color[1], k), '3': shadeHex(W.color[2], k), 'y': '#ffe94a'};
  const side = far ? 1 : -1, maxOut = ac;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++){
    const ch = rows[r][c]; if (ch === '.') continue;
    const out = ac - c; if (out > maxOut) continue;
    const lift = Math.round(flap * out / ac * 3);
    P.set(side < 0 ? -2 - out : 1 + out, -12 + (r - ar) - lift - bob, ch === 'o' ? pxOc(pal) : pal[ch]);
  }
  P.flush();
}
// v1.8: rambut (slot 'hair'). Peta: kolom 0 = x -9 (belakang kepala), kepala = kolom 1..16. dy = baris pertama relatif atas kepala.
const PX_HAIR = {
  cepak: {dy: -1, rows: ["...22222222222", "..2131313131312", ".213131313131312", ".2121212121212.2", ".212", ".21", ".21", ".2"]},
  rapi:  {dy: -2, rows: ["....2222222222", "..22333311111122", ".2133111111111112", ".2111111111111112", ".2111111111111112", ".21111111111112", ".2111111", ".211111", ".21112", ".222"]},
  poni:  {dy: -2, rows: ["....2222222222", "..22333111111122", ".2133111111111112", ".2111111111111112", ".2111111111111112", ".2111111111111112", ".2111111121212112", ".2111112.2.2.2.2", ".211112", ".21112", ".21112", ".2222"]},
  jabrik:{dy: -4, rows: ["..2..212..212..2", "..212211122111122112", ".21111111111111112", ".2133111111111112", ".2131111111111112", ".2111111111111112", ".21111111111122", ".2111112", ".21112", ".212"]}
};
// v1.10: aksesori wajah (slot 'face'): kacamata & monocle. Digambar di atas mata, di bawah topi.
// Koordinat relatif atas kepala (hy). Mata ada di x -4..-1 dan 1..4, baris ey = hy + 6.
// pal: 1 = bingkai, 2 = bingkai gelap, 3 = lensa, 4 = kilau lensa
function pxFace(P, F, hy){
  const ey = hy + 6, c = F.color, L = (x, y, w, h, k) => P.rect(x, y, w, h, k);
  const st = F.style;
  if (st === 'sunglass'){            // kacamata hitam: lensa gelap lebar + jembatan
    L(-6, ey - 1, 6, 4, c[0]); L(0, ey - 1, 1, 1, c[0]); L(1, ey - 1, 5, 4, c[0]);
    L(-5, ey, 4, 2, c[2]); L(2, ey, 3, 2, c[2]); P.set(-5, ey, c[3]); P.set(2, ey, c[3]);
    L(-8, ey - 1, 2, 1, c[1]);       // tangkai ke telinga
  } else if (st === 'round'){       // kacamata bulat: bingkai emas tipis di luar mata, lensa bening berkilau
    for (const ox of [-6, 1]){ L(ox + 2, ey - 2, 2, 1, c[0]); L(ox + 2, ey + 3, 2, 1, c[0]); L(ox, ey, 1, 2, c[0]); L(ox + 5, ey, 1, 2, c[0]);
      P.set(ox + 1, ey - 2 + 1, c[0]); P.set(ox + 4, ey - 1, c[0]); P.set(ox + 1, ey + 2, c[0]); P.set(ox + 4, ey + 2, c[0]);
      L(ox + 1, ey - 1, 4, 1, c[2]); P.set(ox + 1, ey - 1, c[3]); }
    L(0, ey - 1, 1, 1, c[0]); L(-8, ey - 1, 2, 1, c[1]);
  } else if (st === '3d'){          // kacamata 3D: bingkai putih, lensa merah & biru
    L(-6, ey - 1, 12, 5, c[0]); L(-5, ey, 4, 3, '#e8344a'); L(1, ey, 4, 3, '#3f8cff'); L(-1, ey + 2, 2, 2, c[1]);
    P.set(-5, ey, '#ff8a9a'); P.set(1, ey, '#9cc6ff'); L(-8, ey - 1, 2, 1, c[1]);
  } else if (st === 'monocle'){     // monocle: satu lensa bulat di mata depan (bingkai tebal 2 warna) + rantai menjuntai
    const ox = 0; L(ox + 1, ey - 2, 4, 1, c[0]); L(ox + 1, ey + 3, 4, 1, c[1]); L(ox, ey - 1, 1, 4, c[0]); L(ox + 5, ey - 1, 1, 4, c[1]);
    P.unset(ox + 1, ey - 2); P.unset(ox + 4, ey + 3);   // sudut dibulatkan
    P.set(ox + 1, ey - 1, c[0]); P.set(ox + 4, ey + 2, c[1]);
    L(ox + 1, ey - 1, 4, 1, c[2]); P.set(ox + 1, ey - 1, c[3]);
    for (let k = 0; k < 5; k++) P.set(ox + 6 - (k > 2 ? 1 : 0), ey + 2 + k, c[1]);
  } else if (st === 'ski'){         // kacamata ski: tali merah melingkar kepala + lensa oranye besar mengkilap
    L(-9, ey - 1, 3, 3, c[1]); L(7, ey - 1, 2, 3, c[1]);
    L(-6, ey - 2, 13, 6, c[0]); L(-5, ey - 1, 11, 4, c[2]); L(-5, ey - 1, 5, 1, c[3]); L(-5, ey, 2, 1, c[3]); L(0, ey + 2, 1, 1, c[0]); L(-1, ey + 3, 3, 1, c[0]);
  }
}
function pxHair(P, H, hy, hatOn){
  const S = PX_HAIR[H.style] || PX_HAIR.rapi, pal = {'1': H.color[0], '2': H.color[1], '3': H.color[2]};
  for (let r = 0; r < S.rows.length; r++){
    const y = hy + S.dy + r; if (hatOn && y < hy + 2) continue;       // pakai topi: bagian atas rambut tertutup
    const row = S.rows[r];
    for (let c = 0; c < row.length && c < 18; c++){ const ch = row[c]; if (ch !== '.') P.set(-9 + c, y, pal[ch]); }
  }
  P.flush();
}
// o: {walk, phase, air, bob, aBack, aFront, wings, hat, hair, shirt, pants, tool, flash, flap, blink, mouth, face, mouthKind, tears, blush}
// v1.8: proporsi kepala:badan ~1:1, tanpa garis hitam (tepi = warna bagian itu digelapkan), shading kulit 4 tingkat + bintik halus.
function pxPaintChar(P, o){
  const fl = o.flash;
  const skin = fl ? '#ffffff' : PX_SKIN[0], skinD = fl ? '#e6e6e6' : PX_SKIN[1], skinL = fl ? '#ffffff' : PX_SKIN[2];
  const skinM = fl ? '#f0f0f0' : shadeHex(PX_SKIN[0], -14);
  const SH = o.shirt, PA = o.pants;
  const s0 = fl ? '#ffffff' : SH ? SH.color[0] : skin, s1 = fl ? '#e6e6e6' : SH ? SH.color[1] : skinD, s2 = fl ? '#ffffff' : SH ? SH.color[2] : skinL;
  const p0 = fl ? '#ffffff' : PA ? PA.color[0] : skin, p1 = fl ? '#e6e6e6' : PA ? PA.color[1] : skinD;
  const shoe = PA ? '#3a2a22' : skinM, shoeD = PA ? '#241812' : skinD;
  const b = o.bob | 0;
  if (o.wings){ pxWing(P, o.wings, o.flap || 0, b, 'far'); pxWing(P, o.wings, o.flap || 0, b, 'near'); }
  if (o.hideBody) return {fx: 0, fy: 0};
  const armPal = back => ({S: back ? s1 : s0, T: s1, a: back ? skinD : skin, b: back ? shadeHex(skinD, -18) : skinD});
  P.mapRot(PX_ARM, armPal(true), 1.5, .5, -4, -13 - b, o.aBack || 0); P.flush();
  const st = o.walk ? (o.phase ? 1 : -1) : 0;
  const leg = (x0, lift, back)=>{
    P.rect(x0, -7 - lift, 3, 5, back ? p1 : p0);
    if (!back) P.rect(x0 + 2, -7 - lift, 1, 3, PA ? shadeHex(p0, 22) : skinL);
    P.rect(x0, -2 - lift, 4, 1, back ? shoeD : shoe);
  };
  leg(-3 - st, (o.walk && st < 0) || o.air ? 1 : 0, true);
  leg(1 + st, o.walk && st > 0 ? 1 : 0, false);
  P.flush();
  const by = -b;
  P.rect(-4, -14 + by, 9, 7, s0);
  P.rect(-4, -14 + by, 2, 7, s1);
  P.rect(3, -13 + by, 1, 3, s2);
  P.rect(-2, -14 + by, 5, 1, shadeHex(s0, -24));                    // bayangan di bawah dagu
  if (PA){ P.rect(-4, -9 + by, 9, 2, p0); P.rect(-4, -9 + by, 2, 2, p1); }
  if (SH && !fl){
    const st2 = SH.style;
    if (st2 === 'stripe'){ for (const yy of [-12, -10]) P.rect(-4, yy + by, 8, 1, s1); }
    else if (st2 === 'jacket'){ P.rect(0, -13 + by, 2, 5, '#e9eef5'); P.set(-1, -13 + by, s2); P.set(2, -13 + by, s2); }
    else if (st2 === 'suit'){ P.rect(0, -13 + by, 3, 2, '#f4f4f4'); P.rect(1, -12 + by, 1, 4, '#d83a3a'); P.set(-1, -13 + by, s2); }
    else if (st2 === 'hoodie'){ P.rect(-1, -11 + by, 4, 2, s1); P.set(0, -13 + by, s2); P.set(2, -13 + by, s2); }
    else { P.rect(-1, -13 + by, 4, 1, s1); }
  }
  if (!SH && !fl){ P.set(1, -11 + by, skinD); P.rect(-1, -13 + by, 4, 1, skinL); }
  if (!PA && !fl){ P.rect(-4, -9 + by, 9, 2, '#e9eef5'); P.rect(-4, -9 + by, 2, 2, '#b9c3d2'); }
  P.flush();
  // kepala kotak besar 16x15 (~1:1 dengan badan+kaki), sudut terpotong, tepi lebih gelap, sorot di atas, bintik halus
  const hy = -29 - b;
  P.rect(-8, hy, 16, 15, skin); for (const [cx, cy] of [[-8, hy], [7, hy], [-8, hy + 14], [7, hy + 14]]) P.unset(cx, cy);
  P.rect(-8, hy + 1, 1, 13, skinD); P.rect(7, hy + 1, 1, 13, skinD); P.rect(-7, hy + 14, 14, 1, skinD);
  P.rect(-7, hy + 1, 1, 13, skinM); P.rect(-6, hy + 13, 13, 1, skinM); P.rect(6, hy + 2, 1, 11, skinM);
  P.rect(-5, hy + 1, 10, 1, skinL); P.rect(-6, hy + 2, 3, 1, skinL);
  if (!fl) for (const [x, y] of [[-6, 7], [-5, 10], [-4, 4], [4, 12], [5, 3], [-2, 12], [-6, 11]]) P.set(x, hy + y, skinM);
  P.rect(-9, hy + 6, 1, 3, skinM); P.set(-9, hy + 7, skinD);           // telinga
  P.flush();
  if (o.hair) pxHair(P, o.hair, hy, !!o.hat);
  // wajah: mata putih setengah terpejam (kelopak tebal), pupil di sisi depan, mulut datar nyengir sebelah
  const ey = hy + 6, fc = o.face, PUP = '#17121c', BROW = fl ? '#cccccc' : shadeHex(PX_SKIN[1], -70), MC = '#5a3a33', E = [-4, 1];
  const eyeW = (ex, py) => { P.rect(ex, ey, 4, 3, '#ffffff'); P.rect(ex, ey + 2, 4, 1, '#d8dde5'); P.rect(ex + 2, ey + 1 + (py ? 0 : 0), 2, 2, PUP); };
  if (fc === 'happy') for (const ex of E){ P.set(ex, ey + 1, PUP); P.set(ex + 1, ey, PUP); P.set(ex + 2, ey + 1, PUP); }
  else if (fc === 'sad') for (const ex of E){ P.set(ex, ey, PUP); P.set(ex + 1, ey + 1, PUP); P.set(ex + 2, ey, PUP); P.set(ex === E[0] ? ex + 2 : ex, ey - 2, BROW); P.set(ex + 1, ey - 1, BROW); }
  else if (fc === 'closed') for (const ex of E){ P.rect(ex, ey + 1, 3, 1, PUP); P.rect(ex, ey - 1, 3, 1, BROW); }
  else if (fc === 'angry') for (const ex of E){ eyeW(ex, 1); const inner = ex === E[0] ? ex + 2 : ex, outer = ex === E[0] ? ex : ex + 2;
    P.set(outer, ey - 2, BROW); P.set(ex + 1, ey - 1, BROW); P.set(inner, ey, BROW); P.set(inner, ey - 1, BROW); }
  else if (fc === 'love') for (const ex of E){ P.set(ex, ey, '#e8344a'); P.set(ex + 2, ey, '#e8344a'); P.rect(ex, ey + 1, 3, 1, '#e8344a'); P.set(ex + 1, ey + 2, '#a8122a'); P.set(ex, ey - 1, '#ff7a8a'); }
  else if (o.blink) for (const ex of E){ P.rect(ex, ey + 1, 3, 1, PUP); P.rect(ex, ey, 3, 1, BROW); }
  else for (const ex of E){ eyeW(ex); P.rect(ex, ey, 4, 1, BROW); P.rect(ex, ey - 1, 4, 1, shadeHex(PX_SKIN[1], -30)); }
  if (o.mouthKind === 'open'){ P.rect(0, hy + 10, 4, 3, MC); P.rect(1, hy + 11, 2, 1, '#e8566a'); }
  else if (o.mouthKind === 'frown'){ P.set(0, hy + 12, MC); P.rect(1, hy + 11, 3, 1, MC); P.set(4, hy + 12, MC); }
  else if (o.mouthKind === 'o'){ P.rect(1, hy + 11, 2, 2, MC); }
  else if (o.mouth) P.rect(0, hy + 11, 3, 2, MC);
  else { P.rect(-1, hy + 11, 4, 1, MC); P.set(3, hy + 10, MC); }
  if (o.tears){ const k = o.tears % 4; P.set(E[0] + 1, ey + 3 + k, '#5ab8ff'); P.set(E[1] + 1, ey + 3 + ((k + 2) % 4), '#5ab8ff'); }
  if (o.blush){ P.rect(-5, hy + 10, 2, 1, '#ff8a8a'); P.rect(5, hy + 10, 2, 1, '#ff8a8a'); }
  P.flush(true);
  if (o.hat){
    const H = PX_HAT[o.hat.style] || PX_HAT.beanie, rows = H.rows;
    const pal = {'1': o.hat.color[0], '2': o.hat.color[1], '3': o.hat.color[2], b: '#3fa8ff', r: '#e8344a', g: '#3fd17a', k: '#5a5f6e', l: '#fff6c4'};
    P.map(rows, -Math.floor(rows[0].length/2), H.y0 - b, pal); P.flush();
  }
  // aksesori wajah di atas topi (supaya kacamata ski/kacamata tidak tertutup pinggiran topi)
  if (o.face){ pxFace(P, o.face, hy); P.flush(true); }
  P.mapRot(PX_ARM, armPal(false), 1.5, .5, 4, -13 - b, o.aFront || 0); P.flush();
  if (o.tool){
    const a = o.aFront || 0, fx = 4 - Math.sin(a)*6, fy = -13 - b + Math.cos(a)*6;
    P.mapRot(PX_PICK, {'1': o.tool.color[0], '2': o.tool.color[1], '3': o.tool.color[2], n: '#8a5a2b'}, 6, 9, fx, fy, a + 1.1); P.flush();
  }
  return {fx: 4 - Math.sin(o.aFront || 0)*6.5, fy: -13 - b + Math.cos(o.aFront || 0)*6.5};
}
// gambar karakter pixel di (x, ground) dunia. f = arah hadap. Mengembalikan posisi kepalan tangan depan (koordinat dunia).
function drawPixelChar(g, x, ground, f, o, sqx, sqy){
  const P = pxPainter(PXC.W, PXC.H, PXC.OX, PXC.OY);
  const hand = pxPaintChar(P, o);
  pxcCv = pxToCanvas(P, pxcCv);
  const T = g.getTransform(), sc = Math.hypot(T.a, T.b) || 1;
  const U = Math.max(1, Math.round(PXC.U * sc)) / sc;
  const dx = (Math.round(x*T.a + T.e) - T.e) / T.a, dy = (Math.round(ground*T.d + T.f) - T.f) / T.d;
  g.save(); g.imageSmoothingEnabled = false;
  g.translate(dx, dy); g.scale(f*U*(sqx || 1), U*(sqy || 1));
  g.drawImage(pxcCv, -PXC.OX, -PXC.OY);
  g.restore();
  return {x: dx + f*hand.fx*U*(sqx || 1), y: dy + hand.fy*U*(sqy || 1), U};
}
// ikon item pakaian (pixel), 32x32
function pxWearIcon(d){
  const P = pxPainter(24, 24, 12, 12), w = d.wear;
  if (d.slot === 'hat'){ const H = PX_HAT[w.style] || PX_HAT.beanie; P.map(H.rows, -Math.floor(H.rows[0].length/2), -Math.ceil(H.rows.length/2), {'1': w.color[0], '2': w.color[1], '3': w.color[2], b: '#3fa8ff', r: '#e8344a', g: '#3fd17a', k: '#5a5f6e', l: '#fff6c4'}); P.flush(); }
  else if (d.slot === 'hair'){ P.rect(-8, -6, 16, 13, PX_SKIN[0]); P.rect(-8, -6, 1, 13, PX_SKIN[1]); P.rect(-3, 1, 3, 2, '#ffffff'); P.rect(2, 1, 3, 2, '#ffffff'); P.rect(-2, 1, 2, 2, '#17121c'); P.rect(3, 1, 2, 2, '#17121c'); P.flush(); pxHair(P, w, -6, false); }
  else if (d.slot === 'face'){ pxFace(P, w, -9); P.flush(true); }
  else if (d.slot === 'wings'){ const rows = PX_WING[(w.key || '').replace('w_', '')] || PX_WING.angel, pal = {'1': w.color[0], '2': w.color[1], '3': w.color[2], y: '#ffe94a'};
    P.map(rows, -rows[0].length + 1, -5, pal, false); P.flush(); P.map(rows, 0, -5, pal, true); P.flush(); }
  else if (d.slot === 'tool'){ P.mapRot(PX_PICK, {'1': w.color[0], '2': w.color[1], '3': w.color[2], n: '#8a5a2b'}, 5.5, 5.5, 0, 0, Math.PI/4); P.flush(); }
  else if (d.slot === 'shirt'){
    const o = {shirt: w}; const [c0, c1] = w.color;
    P.rect(-5, -5, 10, 9, c0); P.rect(-5, -5, 2, 9, c1); P.rect(-8, -5, 3, 4, c0); P.rect(5, -5, 3, 4, c0); P.rect(-2, -5, 4, 1, shadeHex(c0, -40)); P.flush();
    if (w.style === 'stripe'){ P.rect(-5, -3, 10, 1, c1); P.rect(-5, -1, 10, 1, c1); P.rect(-5, 1, 10, 1, c1); P.flush(true); }
    else if (w.style === 'suit'){ P.rect(-1, -5, 3, 2, '#f4f4f4'); P.rect(0, -4, 1, 5, '#d83a3a'); P.flush(true); }
    else if (w.style === 'jacket'){ P.rect(-1, -5, 2, 9, '#e9eef5'); P.flush(true); }
    else if (w.style === 'hoodie'){ P.rect(-3, 0, 6, 2, c1); P.flush(true); }
  }
  else { const [c0, c1] = w.color; P.rect(-5, -6, 10, 3, c0); P.rect(-5, -3, 4, 9, c0); P.rect(1, -3, 4, 9, c0); P.rect(-5, -6, 10, 1, c1); P.flush(); }
  const small = pxToCanvas(P), c = newCanvas(32), g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.drawImage(small, -4, -4, 40, 40);
  return c;
}
