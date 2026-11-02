// TileGrow texture pack v3 (32x32) — gaya chunky ala Growtopia, digambar sendiri dengan kode.
// Aturan gaya (sama untuk semua block):
//  - cahaya dari kiri-atas: tepi atas/kiri terang 2px, tepi bawah/kanan gelap 2px
//  - garis luar = warna block itu sendiri yang digelapkan (bukan hitam)
//  - sedikit detail tapi BESAR dan jelas (batu bulat bergaris luar, nugget, papan), bukan bintik acak
//  - block yang menyambung (bata, kayu) polanya nyambung antar tile
// makeTex32(id, v) mengembalikan canvas 32x32, atau null kalau block itu belum punya versi v3.
const TS3 = 32;
function t3px(g, x, y, c, w, h){ g.fillStyle = c; g.fillRect(x|0, y|0, w || 1, h || 1); }
function t3sh(hex, a){ return shadeHex(hex, a); }
// gumpalan bulat: garis luar, badan 3 tingkat (cahaya kiri-atas), kilau
function t3blob(g, cx, cy, rx, ry, base, ol, shine){
  const inE = (x, y, ax, ay) => (x*x)/(ax*ax) + (y*y)/(ay*ay) <= 1;
  if (ol) for (let y = -ry-1; y <= ry+1; y++) for (let x = -rx-1; x <= rx+1; x++) if (inE(x, y, rx+.9, ry+.9)) t3px(g, cx+x, cy+y, ol);
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++){
    if (!inE(x, y, rx+.3, ry+.3)) continue;
    const t = -(x/(rx||1))*.5 - (y/(ry||1))*.8;
    t3px(g, cx+x, cy+y, t3sh(base, t > .5 ? 36 : t > 0 ? 14 : t > -.5 ? 0 : -26));
  }
  if (shine !== false && rx >= 2) t3px(g, cx - Math.ceil(rx*.4), cy - Math.ceil(ry*.45), t3sh(base, 80), rx >= 3 ? 2 : 1, 1);
}
// persegi membulat bershading (boulder, bata, kerak lava)
function t3slab(g, x, y, w, h, base, ol, r){
  r = r == null ? 2 : r;
  const inside = (i, j) => { const dx = i < r ? r - i : i > w-1-r ? i-(w-1-r) : 0, dy = j < r ? r - j : j > h-1-r ? j-(h-1-r) : 0; return dx*dx + dy*dy <= r*r + .5; };
  if (ol) for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++){
    const ii = Math.max(0, Math.min(w-1, i)), jj = Math.max(0, Math.min(h-1, j));
    if (inside(ii, jj)) t3px(g, x+i, y+j, ol);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
    if (!inside(i, j)) continue;
    let a = 0;
    if (j === 0 || i === 0) a = 34; else if (j === 1 || i === 1) a = 16;
    if (j === h-1 || i === w-1) a = -36; else if (j === h-2 || i === w-2) a = -16;
    t3px(g, x+i, y+j, t3sh(base, a));
  }
}
// bevel seluruh block + garis luar dari warna block sendiri
function t3frame(g, base, ol){
  ol = ol || t3sh(base, -90);
  t3px(g, 1, 1, t3sh(base, 40), 30, 2); t3px(g, 1, 1, t3sh(base, 40), 2, 30);
  t3px(g, 1, 29, t3sh(base, -42), 30, 2); t3px(g, 29, 1, t3sh(base, -42), 2, 30);
  t3px(g, 1, 1, t3sh(base, 58), 1, 1);
  t3px(g, 0, 0, ol, 32, 1); t3px(g, 0, 31, ol, 32, 1); t3px(g, 0, 0, ol, 1, 32); t3px(g, 31, 0, ol, 1, 32);
}
function t3edge(g, ol){ t3px(g, 0, 0, ol, 32, 1); t3px(g, 0, 31, ol, 32, 1); t3px(g, 0, 0, ol, 1, 32); t3px(g, 31, 0, ol, 1, 32); }
// nugget bijih: gumpalan besar bergaris luar gelap + kilau putih
function t3nugget(g, cx, cy, s, c){
  t3blob(g, cx, cy, s, s - (s > 2 ? 1 : 0), c, '#1d1626', false);
  t3px(g, cx - s + 1, cy - s + 1, '#ffffff', 2, 1); t3px(g, cx - s + 1, cy - s + 2, '#ffffff', 1, 1);
}
// lapangan batu: baris boulder besar, nat gelap
function t3stones(g, r, base, mortar, ol, bigger){
  t3px(g, 0, 0, mortar, 32, 32);
  const rows = bigger ? [[1, 15], [16, 15]] : [[1, 10], [11, 10], [21, 10]];
  rows.forEach(([y, h], k) => {
    let x = (k % 2) ? -7 - ((r()*3)|0) : -((r()*4)|0);
    while (x < 32){
      const w = (bigger ? 14 : 11) + ((r()*5)|0), xs = Math.max(1, x+1), xe = Math.min(31, x + w - 1);
      if (xe - xs >= 4) t3slab(g, xs, y + 1, xe - xs, h - 2, t3sh(base, ((r()*16)|0) - 8), ol, 3);
      x += w;
    }
  });
}

function makeTex32(id, v){
  v = v || 0;
  const c = newCanvas(TS3), g = c.getContext('2d'), r = rng(id*7919 + v*104729 + 991);
  const R = n => (r()*n)|0;
  switch (id){
    case 1: {   // tanah: coklat hangat, beberapa kerikil besar bergaris luar
      const base = '#b06a32';
      t3px(g, 0, 0, base, 32, 32);
      for (let i = 0; i < 3; i++) t3blob(g, 6 + R(20), 6 + R(20), 4, 3, t3sh(base, -14), null, false);
      const spots = [[8, 8], [23, 7], [15, 19], [25, 24], [7, 25]];
      for (let i = 0; i < 3; i++){ const [sx, sy] = spots[(v + i*2) % spots.length];
        t3blob(g, sx + R(3) - 1, sy + R(3) - 1, 2 + (i === 0 ? 1 : 0), 2, i === 2 ? '#d2a774' : '#9b968f', '#4e2c12'); }
      t3frame(g, base, '#4e2c12'); break; }
    case 2: case 42:   // batu: boulder besar dengan nat gelap
      t3stones(g, r, '#9aa4b5', '#4a5162', '#353b4a');
      t3edge(g, '#2c313d'); break;
    case 12: case 13: case 14: {   // bijih: batu polos + nugget besar
      t3px(g, 0, 0, '#7d8697', 32, 32);
      for (let i = 0; i < 3; i++) t3blob(g, 6 + R(20), 6 + R(20), 5, 3, '#737c8d', null, false);
      t3frame(g, '#7d8697', '#2c313d');
      const col = {12: '#e4dcef', 13: '#ffc21f', 14: '#2fe0cc'}[id];
      const sets = [[[9, 9, 4], [22, 11, 3], [13, 22, 3], [24, 23, 2]], [[10, 8, 3], [21, 9, 4], [9, 22, 3], [22, 23, 3]]];
      for (const [x, y, s] of sets[v % 2]) t3nugget(g, x, y, s, col);
      break; }
    case 3: {   // kayu: 3 papan rata, urat lembut, paku; nyambung antar tile
      const base = '#c4843f';
      for (const [y, h] of [[0, 11], [11, 10], [21, 11]]){
        const b = t3sh(base, R(10) - 5);
        t3px(g, 0, y, b, 32, h);
        for (let k = 0; k < 2; k++){ const gy = y + 3 + R(h - 6); t3px(g, R(8), gy, t3sh(b, -16), 10 + R(12), 1); }
        t3px(g, 0, y, t3sh(b, 40), 32, 1); t3px(g, 0, y+1, t3sh(b, 18), 32, 1);
        t3px(g, 0, y+h-1, '#5a3412', 32, 1); t3px(g, 0, y+h-2, t3sh(b, -24), 32, 1);
        const j = (v % 2 ? 10 : 20) + (y % 3) * 2; t3px(g, j, y, '#5a3412', 1, h); t3px(g, j+1, y+1, t3sh(b, 26), 1, h-2);
        for (const nx of [j-3, j+3]){ t3px(g, nx, y+3, '#5a3412', 2, 2); t3px(g, nx, y+3, '#d9c4a4'); }
      }
      break; }
    case 4: {   // daun: gumpalan daun rimbun dengan kilau
      t3px(g, 0, 0, '#236a27', 32, 32);
      const pts = [];
      for (let y = 3; y < 32; y += 7) for (let x = (y % 2 ? 2 : 6); x < 32; x += 8) pts.push([x + R(3) - 1, y + R(3) - 1]);
      for (const [x, y] of pts) t3blob(g, x, y, 5, 4, t3sh('#45ac44', R(14) - 7), '#1b5420');
      t3edge(g, '#17461b'); break; }
    case 5: {   // kaca: bingkai biru, kaca biru muda, pantulan tebal + tipis
      t3px(g, 0, 0, '#2b5f86', 32, 32);
      t3px(g, 2, 2, '#e4f6ff', 28, 28); t3px(g, 4, 4, '#8fd0f0', 24, 24);
      t3px(g, 4, 4, '#b5e3f8', 24, 2); t3px(g, 4, 4, '#b5e3f8', 2, 24);
      t3px(g, 4, 26, '#68aed4', 24, 2); t3px(g, 26, 4, '#68aed4', 2, 24);
      for (let i = 0; i < 13; i++) t3px(g, 7 + i, 21 - i, '#ffffff', 4, 1);
      for (let i = 0; i < 7; i++) t3px(g, 17 + i, 25 - i, '#f2fbff', 2, 1);
      break; }
    case 9: {   // bata: bata merah bershading, nat krem, nyambung antar tile
      t3px(g, 0, 0, '#d9c0a6', 32, 32);
      for (let row = 0; row < 4; row++){
        const off = row % 2 ? 8 : 0, y = row*8;
        for (let b = -1; b < 2; b++){
          const x = b*16 + off, xs = Math.max(0, x + 1), xe = Math.min(32, x + 15);
          if (xe - xs < 2) continue;
          t3slab(g, xs, y + 1, xe - xs, 6, t3sh('#c4553a', R(18) - 9), null, 0);
        }
      }
      break; }
    case 16: {  // pasir: kuning hangat, riak besar, bevel
      const base = '#f0cf78';
      t3px(g, 0, 0, base, 32, 32);
      for (let k = 0; k < 3; k++){
        const y0 = 7 + k*9 + R(2), ph = R(10);
        for (let x = 3; x < 29; x++){ const y = y0 + Math.round(Math.sin((x + ph)/4.5)*1.6);
          t3px(g, x, y, t3sh(base, 34)); t3px(g, x, y+1, t3sh(base, -34)); }
      }
      t3blob(g, 8 + R(16), 8 + R(16), 1, 1, '#c99a5a', '#8a6228', false);
      t3frame(g, base, '#8a6228'); break; }
    case 18: {  // salju: putih, bayangan biru dingin, kilau
      const base = '#eef5fd';
      t3px(g, 0, 0, base, 32, 32);
      t3blob(g, 10 + R(10), 20 + R(5), 7, 3, '#dbe7f6', null, false);
      for (let i = 0; i < 4; i++){ const x = 5 + R(22), y = 5 + R(22); t3px(g, x, y-1, '#ffffff'); t3px(g, x-1, y, '#ffffff', 3, 1); t3px(g, x, y+1, '#ffffff'); }
      t3px(g, 1, 1, '#ffffff', 30, 2); t3px(g, 1, 1, '#ffffff', 2, 30);
      t3px(g, 1, 29, '#a9bfdc', 30, 2); t3px(g, 29, 1, '#a9bfdc', 2, 30);
      t3edge(g, '#6f86a8'); break; }
    case 7: {   // dasar (bedrock): lempeng abu gelap rata, retakan terang bersudut, bevel tegas
      const base = '#3c3f4c';
      t3px(g, 0, 0, base, 32, 32);
      for (let i = 0; i < 2; i++) t3blob(g, 7 + R(18), 7 + R(18), 6, 4, t3sh(base, -10), null, false);
      const cracks = [[[4, 6], [10, 11], [9, 18], [15, 24]], [[22, 4], [18, 12], [25, 17], [23, 27]]];
      for (const path of cracks) for (let k = 0; k < path.length - 1; k++){
        const [x0, y0] = path[k], [x1, y1] = path[k+1], n = Math.max(Math.abs(x1-x0), Math.abs(y1-y0));
        for (let st = 0; st <= n; st++){ const x = Math.round(x0 + (x1-x0)*st/n), y = Math.round(y0 + (y1-y0)*st/n);
          t3px(g, x, y, '#1c1e26'); t3px(g, x+1, y, '#6b7084'); } }
      t3frame(g, base, '#121318'); break; }
    case 15: {  // lava: oranye-merah menyala, arus kuning bergelombang, sedikit kerak
      t3px(g, 0, 0, '#d8401c', 32, 32);
      for (let k = 0; k < 5; k++){
        const y0 = 2 + k*6 + R(2), ph = R(12) + v*3, amp = 1.5 + r();
        for (let x = 0; x < 32; x++){ const y = y0 + Math.round(Math.sin((x + ph)/4)*amp);
          t3px(g, x, y, '#ff8a1e', 1, 3); t3px(g, x, y + 1, '#ffd23a'); } }
      for (let i = 0; i < 3; i++){ const x = 3 + R(26), y = 3 + R(26); t3px(g, x, y, '#fff6b8', 2, 1); }
      for (let i = 0; i < 2; i++) t3blob(g, 6 + R(20), 6 + R(20), 3, 2, '#7a1e0c', '#4a0e04', false);
      t3frame(g, '#d8401c', '#5a1406'); break; }
    case 10: {  // lumut: batu + lumut tebal di atas, gumpalan di tepi
      t3stones(g, r, '#8f99a9', '#454c5b', '#353b4a');
      t3edge(g, '#2c313d');
      for (let x = 0; x < 32; x++){ const d = 6 + Math.round(Math.sin(x/2.6 + v)*1.6);
        t3px(g, x, 0, '#2f6a24', 1, d + 1); t3px(g, x, 0, '#5cb840', 1, d); t3px(g, x, 0, '#8fe06a', 1, 2); }
      for (const [x, y] of [[4, 18], [26, 14]]) t3blob(g, x + R(3), y + R(5), 3, 2, '#5cb840', '#2f6a24');
      break; }
    case 17: {  // papan gelap: papan vertikal, tepi terang, paku
      const base = '#765738';
      for (const [x, w] of [[0, 11], [11, 10], [21, 11]]){
        const b = t3sh(base, R(10) - 5); t3px(g, x, 0, b, w, 32);
        t3px(g, x + 3 + R(w - 6), 0, t3sh(b, -14), 1, 32);
        t3px(g, x, 0, t3sh(b, 34), 1, 32); t3px(g, x + 1, 0, t3sh(b, 14), 1, 32);
        t3px(g, x + w - 1, 0, '#3e2a18', 1, 32); t3px(g, x + w - 2, 0, t3sh(b, -20), 1, 32);
        for (const ny of [4, 26]){ t3px(g, x + 4, ny, '#3e2a18', 2, 2); t3px(g, x + 4, ny, '#c9b89e'); }
      }
      t3px(g, 0, 0, t3sh(base, 40), 32, 1); t3px(g, 0, 31, '#3e2a18', 32, 1);
      break; }
    case 24: {  // house entrance: kusen kayu, daun pintu terbuka setengah (terlihat ke dalam), anak tangga batu
      t3px(g, 0, 0, '#3e2510', 32, 32);
      t3slab(g, 1, 0, 30, 32, '#a8703a', null, 0);
      t3px(g, 6, 3, '#5a3412', 20, 26);                                     // kusen dalam
      t3px(g, 7, 4, '#120a06', 18, 25);                                     // ruang gelap di dalam rumah
      g.fillStyle = 'rgba(255,214,130,.22)'; g.fillRect(8, 5, 6, 24);          // cahaya lampu dari dalam
      // daun pintu terbuka ke dalam (sisi kanan, tampak menyerong)
      t3px(g, 17, 4, '#2a1808', 8, 25); t3px(g, 18, 5, '#c4843f', 6, 23);
      t3px(g, 18, 5, '#e0a861', 1, 23); t3px(g, 23, 5, '#8a5222', 1, 23);
      t3px(g, 19, 8, '#8a5222', 4, 7); t3px(g, 19, 17, '#8a5222', 4, 8);    // panel pintu
      t3px(g, 19, 15, '#ffd23d', 2, 2);                                      // gagang
      t3px(g, 5, 0, '#c99a5a', 22, 3); t3px(g, 5, 0, '#e8c088', 22, 1);      // ambang atas
      t3px(g, 3, 29, '#7d8697', 26, 3); t3px(g, 3, 29, '#b9c3d2', 26, 1);    // anak tangga batu
      t3edge(g, '#2a1808'); break; }
    default: return null;
  }
  return c;
}

// rumput v3: tutup rumput tebal (~9px), tepi bawah bergelombang, kilau atas, kadang bunga
function makeGrass32(v){
  const c = newCanvas(TS3), g = c.getContext('2d'), r = rng(177 + v*31);
  for (let x = 0; x < 32; x++){
    const d = 9 + Math.round(Math.sin((x + v*5)/2.4)*1.8);
    t3px(g, x, 0, '#2a6a1e', 1, d + 2);
    t3px(g, x, 0, '#4cb336', 1, d);
    t3px(g, x, 0, '#78d653', 1, Math.max(3, d - 4));
    t3px(g, x, 0, '#b4f088', 1, 2);
  }
  t3px(g, 0, 0, '#2a6a1e', 32, 1);
  if (r() < .5){ const x = 5 + ((r()*20)|0); t3px(g, x, 2, '#ff6f91', 3, 3); t3px(g, x+1, 3, '#ffe066'); t3px(g, x+1, 1, '#ff6f91'); }
  else { const x = 6 + ((r()*18)|0); t3px(g, x, 3, '#ffffff', 3, 2); t3px(g, x+1, 3, '#ffe066'); }
  return c;
}
