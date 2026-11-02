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
function pxPainter(W, H, ox, oy){
  const main = new Uint32Array(W*H), lay = new Uint32Array(W*H), OLc = pxCol(OL);
  const P = {W, H, ox, oy, main,
    set(x, y, c){ x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < W && y < H && c) lay[y*W + x] = typeof c === 'number' ? c : pxCol(c); },
    unset(x, y){ x = Math.round(x) + ox; y = Math.round(y) + oy; if (x >= 0 && y >= 0 && x < W && y < H) lay[y*W + x] = 0; },
    rect(x, y, w, h, c){ for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, c); },
    // gambar peta string; pal: huruf -> warna. 'o' = garis luar. flip = cermin horizontal
    map(rows, x0, y0, pal, flip){
      const w = rows[0].length;
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++){
        const ch = rows[r][c]; if (ch === '.') continue;
        P.set(flip ? x0 + (w - 1 - c) : x0 + c, y0 + r, ch === 'o' ? OL : pal[ch]);
      }
    },
    // peta string diputar ang (radian) di sekitar titik pivot (pc, pr) yang ditaruh di (ax, ay); sampling terdekat -> tetap pixel
    mapRot(rows, pal, pc, pr, ax, ay, ang){
      const w = rows[0].length, h = rows.length, R = Math.ceil(Math.hypot(Math.max(pc, w - pc), Math.max(pr, h - pr))) + 1;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++){
        const sx = (dx + .5)*cs + (dy + .5)*sn, sy = -(dx + .5)*sn + (dy + .5)*cs;
        const c = Math.floor(pc + sx), r = Math.floor(pr + sy);
        if (c < 0 || r < 0 || c >= w || r >= h) continue;
        const ch = rows[r][c]; if (ch === '.') continue;
        P.set(ax + dx, ay + dy, ch === 'o' ? OL : pal[ch]);
      }
    },
    flush(noOutline){
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        const i = y*W + x;
        if (lay[i]) continue;
        if (noOutline) continue;
        if ((x > 0 && lay[i-1] && lay[i-1] !== OLc) || (x < W-1 && lay[i+1] && lay[i+1] !== OLc) || (y > 0 && lay[i-W] && lay[i-W] !== OLc) || (y < H-1 && lay[i+W] && lay[i+W] !== OLc)) main[i] = OLc;
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
    P.set(side < 0 ? -2 - out : 1 + out, -16 + (r - ar) - lift - bob, ch === 'o' ? OL : pal[ch]);
  }
  P.flush();
}
// o: {walk, phase, air, bob, aBack, aFront, wings, hat, shirt, pants, tool, flash, flap, blink, mouth}
function pxPaintChar(P, o){
  const fl = o.flash;
  const skin = fl ? '#ffffff' : PX_SKIN[0], skinD = fl ? '#e6e6e6' : PX_SKIN[1], skinL = fl ? '#ffffff' : PX_SKIN[2];
  const SH = o.shirt, PA = o.pants;
  const s0 = fl ? '#ffffff' : SH ? SH.color[0] : skin, s1 = fl ? '#e6e6e6' : SH ? SH.color[1] : skinD, s2 = fl ? '#ffffff' : SH ? SH.color[2] : skinL;
  const p0 = fl ? '#ffffff' : PA ? PA.color[0] : skin, p1 = fl ? '#e6e6e6' : PA ? PA.color[1] : skinD;
  const shoe = PA ? '#3a2a22' : skin, shoeD = PA ? '#241812' : skinD;
  const b = o.bob | 0;
  if (o.wings){ pxWing(P, o.wings, o.flap || 0, b, 'far'); pxWing(P, o.wings, o.flap || 0, b, 'near'); }
  if (o.hideBody) return {fx: 0, fy: 0};
  const armPal = back => ({S: back ? s1 : s0, T: s1, a: back ? skinD : skin, b: skinD});
  // lengan belakang (lebih gelap, sebagian tertutup badan)
  P.mapRot(PX_ARM, armPal(true), 1.5, .5, -4, -14 - b, o.aBack || 0); P.flush();
  // kaki: belakang lebih gelap; saat jalan bergantian maju/naik 1 px
  const st = o.walk ? (o.phase ? 1 : -1) : 0;
  const leg = (x0, lift, back)=>{
    P.rect(x0, -8 - lift, 3, 6, back ? p1 : p0);
    if (!back && PA) P.rect(x0 + 2, -8 - lift, 1, 3, shadeHex(p0, 22));
    P.rect(x0, -2 - lift, 4, 1, back ? shoeD : shoe);
  };
  leg(-3 - st, (o.walk && st < 0) || o.air ? 1 : 0, true);
  leg(1 + st, o.walk && st > 0 ? 1 : 0, false);
  P.flush();
  // badan: lebih sempit dari kepala (8 px), sisi belakang gelap, sorot depan
  const by = -b;
  P.rect(-4, -15 + by, 9, 8, s0);
  P.rect(-4, -15 + by, 2, 8, s1);
  P.rect(3, -14 + by, 1, 4, s2);
  if (PA){ P.rect(-4, -9 + by, 9, 2, p0); P.rect(-4, -9 + by, 2, 2, p1); }
  if (SH && !fl){
    const st2 = SH.style;
    if (st2 === 'stripe'){ for (const yy of [-12, -10]) P.rect(-4, yy + by, 8, 1, s1); }
    else if (st2 === 'jacket'){ P.rect(0, -14 + by, 2, 6, '#e9eef5'); P.set(-1, -14 + by, s2); P.set(2, -14 + by, s2); }
    else if (st2 === 'suit'){ P.rect(0, -14 + by, 3, 2, '#f4f4f4'); P.rect(1, -13 + by, 1, 4, '#d83a3a'); P.set(-1, -14 + by, s2); }
    else if (st2 === 'hoodie'){ P.rect(-1, -10 + by, 4, 2, s1); P.set(0, -13 + by, s2); P.set(2, -13 + by, s2); }
    else { P.rect(-1, -14 + by, 4, 1, s1); }
  }
  if (!SH && !fl){ P.set(1, -11 + by, skinD); }            // pusar kecil saat tidak berbaju
  if (!PA && !fl){ P.rect(-4, -9 + by, 9, 2, '#e9eef5'); P.rect(-4, -9 + by, 2, 2, '#b9c3d2'); }   // celana dalam putih (pemain baru)
  P.flush();
  // kepala kotak besar 14x13 (menggantung 3 px di tiap sisi badan), sudut membulat, telinga di belakang
  const hy = -28 - b;
  P.rect(-7, hy, 14, 13, skin); for (const [cx, cy] of [[-7, hy], [6, hy], [-7, hy + 12], [6, hy + 12]]) P.unset(cx, cy);
  P.rect(-7, hy + 1, 1, 11, skinD); P.rect(-6, hy + 12, 12, 1, skinD); P.rect(6, hy + 2, 1, 10, skinD);
  P.rect(-8, hy + 5, 1, 3, skin); P.set(-8, hy + 6, skinD);
  P.rect(-5, hy + 1, 3, 1, skinL); P.set(-6, hy + 2, skinL);
  P.flush();
  const ey = hy + 5, fc = o.face;
  if (fc === 'closed' || fc === 'happy' || fc === 'sad'){
    // mata tertutup: garis datar (tidur), lengkung ke atas (senang), lengkung ke bawah (sedih)
    if (fc === 'happy'){ for (const ex of [0, 3]){ P.set(ex, ey + 1, OL); P.set(ex + 1, ey, OL); P.set(ex + 2, ey + 1, OL); } }
    else if (fc === 'sad'){ for (const ex of [0, 3]){ P.set(ex, ey, OL); P.set(ex + 1, ey + 1, OL); P.set(ex + 2, ey, OL); } }
    else { P.rect(0, ey + 1, 2, 1, OL); P.rect(3, ey + 1, 2, 1, OL); }
    if (fc === 'sad'){ P.set(-1, ey - 2, '#6a4030'); P.set(0, ey - 3, '#6a4030'); P.set(4, ey - 3, '#6a4030'); P.set(5, ey - 2, '#6a4030'); }
  } else if (fc === 'angry'){
    P.rect(0, ey - 1, 2, 4, '#ffffff'); P.rect(3, ey - 1, 2, 4, '#ffffff'); P.rect(1, ey + 1, 1, 2, OL); P.rect(4, ey + 1, 1, 2, OL);
    P.set(-1, ey - 2, OL); P.set(0, ey - 1, OL); P.set(1, ey - 1, OL); P.set(5, ey - 2, OL); P.set(4, ey - 1, OL); P.set(3, ey - 1, OL);
  } else if (fc === 'love'){
    for (const ex of [0, 3]){ P.set(ex, ey, '#e8344a'); P.set(ex + 1, ey, '#e8344a'); P.rect(ex, ey + 1, 2, 1, '#e8344a'); P.set(ex, ey - 1, '#ff7a8a'); P.set(ex + 1, ey + 2, '#a8122a'); }
  } else if (o.blink){ P.rect(0, ey + 2, 2, 1, OL); P.rect(3, ey + 2, 2, 1, OL); }
  else {
    P.rect(0, ey - 1, 2, 4, '#ffffff'); P.rect(3, ey - 1, 2, 4, '#ffffff');
    P.rect(1, ey, 1, 3, OL); P.rect(4, ey, 1, 3, OL);
    P.set(0, ey - 2, '#6a4030'); P.set(1, ey - 3, '#6a4030'); P.set(3, ey - 3, '#6a4030'); P.set(4, ey - 2, '#6a4030');
  }
  if (o.mouthKind === 'open'){ P.rect(1, hy + 9, 4, 3, OL); P.rect(2, hy + 10, 2, 1, '#e8566a'); }
  else if (o.mouthKind === 'frown'){ P.set(1, hy + 10, OL); P.rect(2, hy + 9, 3, 1, OL); P.set(5, hy + 10, OL); }
  else if (o.mouthKind === 'o'){ P.rect(2, hy + 9, 2, 2, OL); }
  else if (o.mouth) P.rect(2, hy + 10, 2, 2, OL); else { P.set(1, hy + 9, OL); P.rect(2, hy + 10, 3, 1, OL); P.set(5, hy + 9, OL); }
  if (o.tears){ const k = o.tears % 4; P.set(0, ey + 3 + k, '#5ab8ff'); P.set(4, ey + 3 + ((k + 2) % 4), '#5ab8ff'); }
  if (o.blush){ P.set(-2, hy + 8, '#ff8a8a'); P.set(-1, hy + 8, '#ff8a8a'); P.set(5, hy + 8, '#ff8a8a'); }
  P.flush(true);
  // topi
  if (o.hat){
    const H = PX_HAT[o.hat.style] || PX_HAT.beanie, rows = H.rows;
    const pal = {'1': o.hat.color[0], '2': o.hat.color[1], '3': o.hat.color[2], b: '#3fa8ff', r: '#e8344a', g: '#3fd17a', k: '#5a5f6e', l: '#fff6c4'};
    P.map(rows, -Math.floor(rows[0].length/2), H.y0 + 1 - b, pal); P.flush();
  }
  // lengan depan (+ pickaxe)
  P.mapRot(PX_ARM, armPal(false), 1.5, .5, 4, -14 - b, o.aFront || 0); P.flush();
  if (o.tool){
    const a = o.aFront || 0, fx = 4 - Math.sin(a)*6, fy = -14 - b + Math.cos(a)*6;
    P.mapRot(PX_PICK, {'1': o.tool.color[0], '2': o.tool.color[1], '3': o.tool.color[2], n: '#8a5a2b'}, 6, 9, fx, fy, a + 1.1); P.flush();
  }
  return {fx: 4 - Math.sin(o.aFront || 0)*6.5, fy: -14 - b + Math.cos(o.aFront || 0)*6.5};
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
