// TileGrow v0.4 — render
function drawSeed(g, cx, cy, s, color){
  g.fillStyle = OL; g.beginPath(); g.ellipse(cx, cy, 5.2*s, 6.4*s, 0, 0, Math.PI*2); g.fill();
  g.fillStyle = color; g.beginPath(); g.ellipse(cx, cy, 3.9*s, 5.1*s, 0, 0, Math.PI*2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(cx-1.4*s, cy-2*s, 1.2*s, 1.6*s, 0, 0, Math.PI*2); g.fill();
}
function drawFist(g, cx, cy, s){
  g.fillStyle = OL; g.beginPath(); g.roundRect(cx-7*s, cy-6*s, 14*s, 12*s, 4*s); g.fill();
  g.fillStyle = '#f2c79e'; g.beginPath(); g.roundRect(cx-5.5*s, cy-4.5*s, 11*s, 9*s, 3*s); g.fill();
  g.fillStyle = '#d29d72'; for (let i=0;i<3;i++) g.fillRect(cx-3*s+i*3*s, cy-4.5*s, 1*s, 4*s);
}
function drawWrench(g, cx, cy, s){
  g.save(); g.translate(cx, cy); g.rotate(-Math.PI/4);
  g.fillStyle = OL; g.fillRect(-2.6*s, -2*s, 5.2*s, 13*s); g.beginPath(); g.arc(0, -4*s, 6*s, 0, Math.PI*2); g.fill();
  g.fillStyle = '#b9c3d1'; g.fillRect(-1.3*s, -2*s, 2.6*s, 12*s); g.beginPath(); g.arc(0, -4*s, 4.6*s, 0, Math.PI*2); g.fill();
  g.fillStyle = OL; g.fillRect(-1.6*s, -10*s, 3.2*s, 6*s);
  g.restore();
}
function drawGem(g, x, y, s, n){
  const t = typeof gemTier === 'function' ? gemTier(n || 1) : [1,'#3fa8f0','#c8ecff'];
  const sz = s * (1 + Math.min(.5, Math.log10(n || 1) * .25));
  g.fillStyle = OL; g.beginPath(); g.moveTo(x, y-8*sz); g.lineTo(x+6*sz, y); g.lineTo(x, y+8*sz); g.lineTo(x-6*sz, y); g.closePath(); g.fill();
  g.fillStyle = t[1]; g.beginPath(); g.moveTo(x, y-5.5*sz); g.lineTo(x+3.8*sz, y); g.lineTo(x, y+5.5*sz); g.lineTo(x-3.8*sz, y); g.closePath(); g.fill();
  g.fillStyle = t[2]; g.beginPath(); g.moveTo(x, y-5.5*sz); g.lineTo(x+3.8*sz, y); g.lineTo(x, y); g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(x-1.5*sz, y-3*sz, 1.2*sz, 2.4*sz);
}
function drawBlockIcon(g, x, y, size, id){
  g.fillStyle = OL; g.fillRect(x-2, y-2, size+4, size+4);
  g.imageSmoothingEnabled = false; g.drawImage(TEX[id], x, y, size, size);
}
// sayap v3: gaya pixel chunky ala Growtopia (desain sendiri). Garis luar = warna sayap yang digelapkan,
// bulu terpisah jelas, kilau di atas. dir = 1 kanan / -1 kiri, up = kepakan (derajat kecil).
function wingShape(g, path, fill, ol, lw){ g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = ol; path(); g.stroke(); g.fillStyle = fill; path(); g.fill(); }
function drawWing(g, x, y, s, dir, up, w){
  const [c0, c1, c2] = w.color, ol = shadeHex(c1, -60), lw = 2.6*s;
  g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(-(up || 0)*.035);
  const k = w.key || '';
  if (k === 'w_devil'){
    // sayap kelelawar: 3 tulang runcing, selaput bergerigi di bawah
    const mem = ()=>{ g.beginPath(); g.moveTo(0, -2*s); g.lineTo(7*s, -19*s); g.lineTo(12*s, -11*s); g.lineTo(19*s, -24*s);
      g.lineTo(23*s, -12*s); g.lineTo(28*s, -16*s); g.lineTo(27*s, -2*s);
      g.quadraticCurveTo(23*s, -3*s, 21*s, 4*s); g.quadraticCurveTo(17*s, 0, 13*s, 7*s); g.quadraticCurveTo(9*s, 2*s, 5*s, 6*s); g.lineTo(0, 3*s); g.closePath(); };
    wingShape(g, mem, c0, ol, lw);
    g.save(); mem(); g.clip();
    g.fillStyle = c1; g.beginPath(); g.moveTo(0, 3*s); g.lineTo(27*s, -2*s); g.lineTo(28*s, 10*s); g.lineTo(0, 10*s); g.closePath(); g.fill();   // bawah lebih gelap
    g.fillStyle = c2; g.globalAlpha = .55; g.beginPath(); g.moveTo(1*s, -3*s); g.lineTo(7*s, -17*s); g.lineTo(10*s, -11*s); g.closePath(); g.fill(); g.globalAlpha = 1;
    g.restore();
    g.strokeStyle = ol; g.lineWidth = 1.6*s; g.lineCap = 'round'; g.beginPath();
    for (const [tx, ty] of [[7, -19], [19, -24], [28, -16]]){ g.moveTo(1*s, 0); g.lineTo(tx*s, ty*s); }
    g.stroke();
    g.fillStyle = shadeHex(c2, 20); for (const [tx, ty] of [[7, -19], [19, -24], [28, -16]]){ g.beginPath(); g.arc(tx*s, ty*s, 1.3*s, 0, Math.PI*2); g.fill(); }
  } else if (k === 'w_storm'){
    // sayap badai: 5 bulu runcing besar dikipas dari punggung ke atas-luar, ujung putih, kilat kuning
    const fan = [[-1.25, 22], [-.92, 27], [-.6, 28], [-.28, 25], [.05, 19]];
    for (let i = 0; i < fan.length; i++){
      const [a0, L] = fan[i], base = shadeHex(c0, (2 - i)*8);
      g.save(); g.rotate(a0);
      const fe = ()=>{ g.beginPath(); g.moveTo(0, -3.5*s); g.quadraticCurveTo(L*.55*s, -6.5*s, L*s, 0); g.quadraticCurveTo(L*.55*s, 5.5*s, 0, 3.5*s); g.closePath(); };
      wingShape(g, fe, base, ol, lw);
      g.save(); fe(); g.clip(); g.fillStyle = c1; g.fillRect(0, 1.4*s, L*s, 6*s); g.fillStyle = c2; g.fillRect(L*.74*s, -7*s, L*.3*s, 14*s); g.restore();
      g.restore();
    }
    g.fillStyle = '#fff36a'; g.strokeStyle = ol; g.lineWidth = 1.4*s; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(25*s, -20*s); g.lineTo(19*s, -11*s); g.lineTo(23*s, -11*s); g.lineTo(18*s, -2*s); g.lineTo(28*s, -14*s); g.lineTo(23.5*s, -14*s); g.closePath(); g.stroke(); g.fill();
  } else {
    for (const [x0, y0, L, ang] of [[27, -16, 13, 1.05], [23, -9, 12, 1.25], [18, -4, 10, 1.45], [12, 0, 8, 1.6]]){
      const pf = ()=>{ g.beginPath(); g.moveTo((x0 - 3)*s, y0*s); g.quadraticCurveTo((x0 + Math.cos(ang)*L*.5 - 3)*s, (y0 + Math.sin(ang)*L*.6)*s, (x0 + Math.cos(ang)*L)*s, (y0 + Math.sin(ang)*L)*s);
        g.quadraticCurveTo((x0 + Math.cos(ang)*L*.5 + 3)*s, (y0 + Math.sin(ang)*L*.4)*s, (x0 + 3)*s, (y0 - 1)*s); g.closePath(); };
      wingShape(g, pf, c1, ol, lw);
    }
    // sayap malaikat: siluet menyapu ke atas-luar, tepi bawah bergelombang (bulu), 3 tingkat bulu, ujung bulu panjang
    const sil = ()=>{ g.beginPath(); g.moveTo(0, 2*s);
      g.quadraticCurveTo(4*s, -16*s, 20*s, -24*s); g.quadraticCurveTo(28*s, -27*s, 30*s, -22*s);   // tepi atas
      // tepi bawah: 5 lekuk bulu dari ujung ke pangkal
      const sc = [[30, -22], [29, -13], [25, -6], [19, -1], [12, 2], [5, 4]];
      for (let i = 1; i < sc.length; i++){ const [x0, y0] = sc[i-1], [x1, y1] = sc[i];
        g.quadraticCurveTo(((x0 + x1)/2 + 2.5)*s, ((y0 + y1)/2 + 3.5)*s, x1*s, y1*s); }
      g.closePath(); };
    wingShape(g, sil, c0, ol, lw);
    g.save(); sil(); g.clip();
    // tingkat bulu dalam: pita gelap di bawah, terang di atas
    g.fillStyle = c1; g.beginPath(); g.moveTo(0, 6*s); g.lineTo(32*s, -14*s); g.lineTo(32*s, 10*s); g.lineTo(0, 10*s); g.closePath(); g.fill();
    g.fillStyle = c2; g.beginPath(); g.ellipse(15*s, -16*s, 11*s, 3.2*s, -.55, 0, Math.PI*2); g.fill();
    g.restore();
    // garis lekuk bulu (2 baris) supaya terbaca sebagai bulu, bukan awan
    g.strokeStyle = shadeHex(c1, -25); g.lineWidth = 1.2*s; g.lineCap = 'round';
    for (const row of [[[8, -6], [14, -10], [20, -14], [25, -17]], [[6, -1], [12, -4], [18, -7], [24, -10]]]){
      g.beginPath();
      for (const [x, y] of row){ g.moveTo((x - 2.5)*s, (y - 1.5)*s); g.quadraticCurveTo((x + .5)*s, (y + 2.2)*s, (x + 3)*s, (y - 1.8)*s); }
      g.stroke();
    }
    g.lineCap = 'butt';
  }
  g.restore();
}
function drawWingIcon(g, cx, cy, w){ drawWing(g, cx + 1, cy + 4, .5, 1, 0, w); drawWing(g, cx - 1, cy + 4, .5, -1, 0, w); }
// ----- pakaian -----
function drawHat(g, w, f){
  // topi v3: membungkus kepala besar (r≈13), garis luar tebal, sisi terang kiri-atas + bayangan, kilau kecil
  const [c0, c1, c2] = w.color;
  g.lineJoin = 'round';
  const blob = (path, fill)=>{ g.save(); g.lineWidth = 3.4; g.strokeStyle = OL; path(); g.stroke(); g.restore(); g.fillStyle = fill; path(); g.fill(); };
  const shade = (path, c)=>{ g.save(); path(); g.clip(); g.fillStyle = shadeHex(c, -30); g.fillRect(f > 0 ? 3 : -30, -30, 27, 40); g.fillStyle = shadeHex(c, 35); g.fillRect(f > 0 ? -30 : 20, -30, 10, 40); g.restore(); };
  const dome = (r, y)=>()=>{ g.beginPath(); g.arc(0, y, r, Math.PI, 0); g.closePath(); };
  if (w.style === 'cowboy'){
    const crown = ()=>{ g.beginPath(); g.moveTo(-10, 0); g.lineTo(-9, -12); g.quadraticCurveTo(-5, -16, 0, -13); g.quadraticCurveTo(5, -16, 9, -12); g.lineTo(10, 0); g.closePath(); };
    const brim = ()=>{ g.beginPath(); g.moveTo(-21, -4); g.quadraticCurveTo(-16, 2, 0, 2); g.quadraticCurveTo(16, 2, 21, -4); g.quadraticCurveTo(14, 4, 0, 4.5); g.quadraticCurveTo(-14, 4, -21, -4); g.closePath(); };
    blob(crown, c0); shade(crown, c0);
    g.fillStyle = c1; g.fillRect(-10, -4.5, 20, 3.5); g.fillStyle = c2; g.fillRect(-3, -4.5, 4, 3.5);
    blob(brim, shadeHex(c0, -8));
  } else if (w.style === 'crown'){
    const cr = ()=>{ g.beginPath(); g.moveTo(-12, 0); g.lineTo(-13, -13); g.lineTo(-6.5, -7); g.lineTo(0, -16); g.lineTo(6.5, -7); g.lineTo(13, -13); g.lineTo(12, 0); g.closePath(); };
    blob(cr, c0); shade(cr, c0);
    g.fillStyle = c1; g.fillRect(-12, -4, 24, 4);
    for (const [x, col] of [[-7, '#3fa8ff'], [0, '#e8344a'], [7, '#3fd17a']]){ g.fillStyle = OL; g.beginPath(); g.arc(x, -2, 2.4, 0, Math.PI*2); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, -2, 1.6, 0, Math.PI*2); g.fill(); }
    for (const [x, y] of [[-13, -13], [0, -16], [13, -13]]){ g.fillStyle = OL; g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI*2); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI*2); g.fill(); }
  } else if (w.style === 'cap'){
    const d = dome(13.5, 0);
    blob(d, c0); shade(d, c0);
    g.fillStyle = shadeHex(c0, -20); g.fillRect(-1, -13, 2, 13);
    blob(()=>{ g.beginPath(); g.roundRect(f > 0 ? 6 : -18, -2.5, 12, 4.5, [1, 3, 3, 1]); }, c1);
    g.fillStyle = OL; g.beginPath(); g.arc(0, -13.5, 2.3, 0, Math.PI*2); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(0, -13.5, 1.4, 0, Math.PI*2); g.fill();
    g.fillStyle = c2; g.beginPath(); g.arc(-4*f, -6, 3, 0, Math.PI*2); g.fill();                                            // logo
  } else if (w.style === 'miner'){
    const d = ()=>{ g.beginPath(); g.arc(0, -.5, 14, Math.PI, 0); g.closePath(); };
    blob(d, c0); shade(d, c0);
    g.fillStyle = shadeHex(c0, -22); g.fillRect(-1.2, -14, 2.4, 13);
    blob(()=>{ g.beginPath(); g.roundRect(-16, -2.5, 32, 4.5, 2); }, c1);
    blob(()=>{ g.beginPath(); g.roundRect(-4.5 + 3*f, -12, 9, 7, 2); }, '#5a5f6e');
    g.fillStyle = '#fff6c4'; g.beginPath(); g.arc(3*f, -8.5, 2.6, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(255,246,196,.25)'; g.beginPath(); g.moveTo(3*f, -8.5); g.lineTo(26*f, -15); g.lineTo(26*f, -2); g.closePath(); g.fill();
  } else {   // beanie
    const d = ()=>{ g.beginPath(); g.moveTo(-13.5, 0); g.quadraticCurveTo(-14, -15, 0, -15); g.quadraticCurveTo(14, -15, 13.5, 0); g.closePath(); };
    blob(d, c0); shade(d, c0);
    g.save(); d(); g.clip(); g.fillStyle = c1; for (let x = -12; x <= 10; x += 5) g.fillRect(x, -15, 2.2, 15); g.restore();
    blob(()=>{ g.beginPath(); g.roundRect(-14.5, -4, 29, 5.5, 2.5); }, c2);
    g.fillStyle = shadeHex(c2, -25); for (let x = -12; x <= 12; x += 3) g.fillRect(x, -3.5, 1, 4.5);
    blob(()=>{ g.beginPath(); g.arc(0, -16, 4, 0, Math.PI*2); }, c2);
    g.fillStyle = shadeHex(c2, 40); g.fillRect(-2, -18, 2, 1.4);
  }
}
function drawShirtIcon(g, w){
  const [c0,c1,c2] = w.color;
  g.fillStyle = OL; g.beginPath(); g.moveTo(6,8); g.lineTo(12,5); g.lineTo(20,5); g.lineTo(26,8); g.lineTo(29,15); g.lineTo(24,17); g.lineTo(24,27); g.lineTo(8,27); g.lineTo(8,17); g.lineTo(3,15); g.closePath(); g.fill();
  g.fillStyle = c0; g.beginPath(); g.moveTo(8,10); g.lineTo(13,7.5); g.lineTo(19,7.5); g.lineTo(24,10); g.lineTo(26,14); g.lineTo(22,15); g.lineTo(22,25); g.lineTo(10,25); g.lineTo(10,15); g.lineTo(6,14); g.closePath(); g.fill();
  shirtDetail(g, w, 10, 9, 12, 16);
}
function shirtDetail(g, w, x, y, wd, h){
  // detail baju v3: lebih besar dan jelas di badan 17x11
  const [c0, c1, c2] = w.color, cx = x + wd/2;
  if (w.style === 'stripe'){ g.fillStyle = c1; for (let k = y + 1.5; k < y + h; k += 3.6) g.fillRect(x, k, wd, 1.8); }
  else if (w.style === 'jacket'){
    g.fillStyle = shadeHex(c0, -25); g.fillRect(cx - 4, y, 8, h);                                      // kaos dalam
    g.fillStyle = '#e9eef5'; g.fillRect(cx - 3, y, 6, h);
    g.fillStyle = c0; g.beginPath(); g.moveTo(cx - 4, y); g.lineTo(cx - 1, y + 4); g.lineTo(cx - 4, y + h); g.closePath(); g.fill();   // kerah lipat
    g.beginPath(); g.moveTo(cx + 4, y); g.lineTo(cx + 1, y + 4); g.lineTo(cx + 4, y + h); g.closePath(); g.fill();
    g.fillStyle = c2; g.fillRect(cx - .6, y + 4, 1.2, h - 4);                                         // ritsleting
    g.fillStyle = shadeHex(c0, -30); g.fillRect(x + 1.5, y + h - 4, 4, 1.2); g.fillRect(x + wd - 5.5, y + h - 4, 4, 1.2);   // saku
  }
  else if (w.style === 'suit'){
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.moveTo(cx - 4, y); g.lineTo(cx + 4, y); g.lineTo(cx, y + 8); g.closePath(); g.fill();
    g.fillStyle = '#d83a3a'; g.beginPath(); g.moveTo(cx - 1.2, y + 1); g.lineTo(cx + 1.2, y + 1); g.lineTo(cx + 1.6, y + 7); g.lineTo(cx, y + 9); g.lineTo(cx - 1.6, y + 7); g.closePath(); g.fill();
    g.fillStyle = shadeHex(c0, 30); g.beginPath(); g.moveTo(cx - 4, y); g.lineTo(cx - 6, y + 3); g.lineTo(cx - 1, y + 8); g.closePath(); g.fill();   // kerah jas
    g.beginPath(); g.moveTo(cx + 4, y); g.lineTo(cx + 6, y + 3); g.lineTo(cx + 1, y + 8); g.closePath(); g.fill();
    g.fillStyle = '#e0c060'; g.fillRect(cx - .6, y + 9, 1.2, 1.2);
  }
  else if (w.style === 'hoodie'){
    g.fillStyle = shadeHex(c0, -28); g.beginPath(); g.ellipse(cx, y, 7, 2.6, 0, 0, Math.PI); g.fill();     // tudung di leher
    g.fillStyle = c1; g.beginPath(); g.roundRect(x + 3, y + h - 5.5, wd - 6, 4.5, 1.5); g.fill();       // kantong depan
    g.fillStyle = shadeHex(c1, -25); g.fillRect(x + 3, y + h - 5.5, wd - 6, 1);
    g.fillStyle = c2; g.fillRect(cx - 3, y + 1, 1.2, 5); g.fillRect(cx + 1.8, y + 1, 1.2, 5);            // tali
    g.beginPath(); g.arc(cx - 2.4, y + 6.3, 1, 0, Math.PI*2); g.arc(cx + 2.4, y + 6.3, 1, 0, Math.PI*2); g.fill();
  }
  else { g.fillStyle = c2; g.fillRect(cx - 4, y, 8, 2.2); g.fillStyle = shadeHex(c0, -20); g.fillRect(cx - .6, y + 2, 1.2, 4); }
}
function drawPantsIcon(g, w){
  const [c0,c1] = w.color;
  g.fillStyle = OL; g.beginPath(); g.moveTo(8,5); g.lineTo(24,5); g.lineTo(26,28); g.lineTo(17.5,28); g.lineTo(16,14); g.lineTo(14.5,28); g.lineTo(6,28); g.closePath(); g.fill();
  g.fillStyle = c0; g.beginPath(); g.moveTo(10,7); g.lineTo(22,7); g.lineTo(23.7,26); g.lineTo(19,26); g.lineTo(16,11); g.lineTo(13,26); g.lineTo(8.3,26); g.closePath(); g.fill();
  g.fillStyle = c1; g.fillRect(10, 7, 12, 2.5);
}
function drawPickaxe(g, x, y, s, w){
  g.save(); g.translate(x, y); g.rotate(-Math.PI/4); g.scale(s, s);
  g.fillStyle = OL; g.fillRect(-2.2, -4, 4.4, 17);
  g.fillStyle = '#8a5a2b'; g.fillRect(-1.2, -3, 2.4, 15); g.fillStyle = '#b07a42'; g.fillRect(-1.2, -3, 1, 15);
  g.fillStyle = OL; g.beginPath(); g.moveTo(-12,-3); g.quadraticCurveTo(0,-12,12,-3); g.lineTo(12,0); g.quadraticCurveTo(0,-7,-12,0); g.closePath(); g.fill();
  g.fillStyle = w.color[0]; g.beginPath(); g.moveTo(-10.5,-3); g.quadraticCurveTo(0,-10.5,10.5,-3); g.lineTo(10.5,-1.5); g.quadraticCurveTo(0,-7.5,-10.5,-1.5); g.closePath(); g.fill();
  g.fillStyle = w.color[2]; g.fillRect(-4,-7,6,1);
  g.restore();
}
const ICON = {}, ICON_IMG = {};
function iconImg(key){ if (ICON_IMG[key]) return ICON_IMG[key]; const im = new Image(); im.src = icon(key); return ICON_IMG[key] = im; }
function icon(key){
  if (ICON[key]) return ICON[key];
  const c = newCanvas(32), g = c.getContext('2d'), d = itemDef(key);
  if (d.kind === 'fist') drawFist(g,16,16,1.6);
  else if (d.kind === 'wrench') drawWrench(g,16,17,1.3);
  else if (d.kind === 'gem') drawGem(g,16,16,1.6);
  else if (d.kind === 'wear'){ g.imageSmoothingEnabled = false; g.drawImage(pxWearIcon(d), 0, 0); }   // v1.6: ikon pakaian pixel art
  else if (d.kind === 'seed') drawSeed(g,16,16,2,BY_ID[d.id].color);
  else drawBlockIcon(g,5,5,22,d.id);
  return ICON[key] = c.toDataURL();
}

// label nama pohon di atas pohon (hanya pohon yang terlihat di layar)
// label tampil untuk pohon yang ditunjuk kursor atau dekat pemain; label yang bertabrakan dilewati
let labelBoxes = [];
function drawTreeLabel(sx, sy, tr, now){
  if (!tr || !settings.treeLabels) return;
  const tx = sx/TS, ty = sy/TS, mt = mouseTile();
  const hovered = mt.x === tx && mt.y === ty;
  const near = Math.hypot(tx + .5 - (pl.x + pl.w/2)/TS, ty + .5 - (pl.y + pl.h/2)/TS) <= 3.2;
  if (!hovered && !near) return;
  const bw = 64, bx = sx + TS/2 - bw/2, byy = sy - 32;
  if (!hovered && labelBoxes.some(b => bx < b[0] + b[2] && bx + bw > b[0] && byy < b[1] + 22 && byy + 22 > b[1])) return;
  labelBoxes.push([bx, byy, bw]);
  const p = Math.min(1, (now - tr.t0)/GROW_MS[tr.kind]);
  const name = 'Pohon ' + BY_ID[tr.kind].name;
  let sub;
  if (p >= 1) sub = 'Siap panen';
  else { const left = Math.ceil((GROW_MS[tr.kind] - (now - tr.t0))/1000); sub = left >= 60 ? Math.floor(left/60) + 'm ' + (left%60) + 'd' : left + ' detik'; }
  const cx = sx + TS/2, y = sy - 22 + (1 - p)*12;
  ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = OL;
  ctx.strokeText(name, cx, y); ctx.fillStyle = p >= 1 ? '#c9f56a' : '#ffffff'; ctx.fillText(name, cx, y);
  ctx.font = '8px system-ui'; ctx.strokeText(sub, cx, y + 9); ctx.fillStyle = p >= 1 ? '#c9f56a' : '#c7d2de'; ctx.fillText(sub, cx, y + 9);
  ctx.textAlign = 'left';
}
// pohon ala Growtopia: batang lurus tebal + mahkota daun bulat lebar berwarna jenis block,
// saat matang berbuah block mini (kotak kecil bertekstur) yang berkilau; makin tumbuh makin besar
function drawTree(sx, sy, tr, now){
  const kind = tr ? tr.kind : 4, p = tr ? Math.min(1, (now - tr.t0)/GROW_MS[kind]) : 1;
  const col = PAL[kind] || PAL[4], bx = sx + TS/2, by = sy + TS;
  const g = .35 + .65*p;
  const leaf = mixHex(col[0], '#3fae46', .45), leafD = mixHex(col[1], '#1f6a26', .45), leafL = mixHex(col[2], '#9af07a', .35);
  const th = 14*g, tw = 4 + 2*g;
  ctx.fillStyle = OL; ctx.fillRect(bx - tw/2 - 2, by - th - 2, tw + 4, th + 2);
  ctx.fillStyle = '#7a4a24'; ctx.fillRect(bx - tw/2, by - th, tw, th);
  ctx.fillStyle = '#a8703a'; ctx.fillRect(bx - tw/2, by - th, 1.5, th);
  ctx.fillStyle = '#5a3418'; ctx.fillRect(bx + tw/2 - 1.5, by - th, 1.5, th);
  ctx.fillStyle = '#7a4a24'; ctx.fillRect(bx - tw/2 - 3*g, by - 2, 3*g, 2); ctx.fillRect(bx + tw/2, by - 2, 3*g, 2);
  const R = 13*g, cy = by - th - R*.55, sway = Math.sin(now/900 + sx*.07)*.8*g;
  const C = [[-R*.62, R*.18, R*.62],[R*.62, R*.18, R*.62],[-R*.3,-R*.42,R*.66],[R*.32,-R*.4,R*.62],[0, R*.05, R*.78]];
  const circ = (x,y,r,c)=>{ ctx.fillStyle = c; ctx.beginPath(); ctx.arc(bx + x + sway, cy + y, r, 0, Math.PI*2); ctx.fill(); };
  C.forEach(([x,y,r]) => circ(x,y,r+2.2,OL));
  C.forEach(([x,y,r]) => circ(x,y,r,leaf));
  ctx.save(); ctx.beginPath(); C.forEach(([x,y,r]) => { ctx.moveTo(bx+x+sway+r, cy+y); ctx.arc(bx+x+sway, cy+y, r, 0, Math.PI*2); }); ctx.clip();
  ctx.fillStyle = leafD; ctx.fillRect(bx - R*1.6, cy + R*.35, R*3.2, R);
  ctx.restore();
  circ(-R*.38, -R*.6, R*.28, leafL); circ(R*.12, -R*.72, R*.16, leafL);
  ctx.fillStyle = leafD;
  for (let k=0;k<6;k++){ const a = k*1.7 + sx, rr = R*.55*((k%3)/3 + .3); ctx.fillRect(bx + Math.cos(a)*rr + sway - 1, cy + Math.sin(a)*rr*.7 - 1, 2, 2); }
  if (p >= 1){
    const tex = TEX[kind];
    for (const [dx,dy,k] of [[-R*.55, R*.1, 0],[R*.5,-R*.15,1],[-R*.05,-R*.62,2]]){
      const bob = Math.sin(now/300 + k*2 + sx)*1.2, fx = bx + dx + sway - 4.5, fy = cy + dy + bob - 4.5;
      ctx.fillStyle = OL; ctx.fillRect(fx - 1.5, fy - 1.5, 12, 12);
      if (tex) ctx.drawImage(tex, fx, fy, 9, 9); else { ctx.fillStyle = col[0]; ctx.fillRect(fx, fy, 9, 9); }
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(fx, fy, 3, 1.5);
    }
    if ((now/600|0) % 3 === 0){ ctx.fillStyle = '#ffffff'; const kx = bx + R*.7 + sway, ky = cy - R*.75;
      ctx.fillRect(kx - .75, ky - 3, 1.5, 6); ctx.fillRect(kx - 3, ky - .75, 6, 1.5); }
  } else {
    ctx.fillStyle = OL; ctx.fillRect(sx+3, sy+TS-5, TS-6, 4);
    ctx.fillStyle = '#9be37e'; ctx.fillRect(sx+4, sy+TS-4, (TS-8)*p, 2);
  }
}

// karakter: desain asli ~50px lalu diskalakan supaya muat 1x1 block
const PS = 0.58;
const ACCESS_GREEN = '#b8ffb0';
function drawPlayer(rx, ry){
  const now = Date.now(), f = pl.face, x = rx + pl.w/2, ground = ry + pl.h;
  if (pl.dead > 0) ctx.globalAlpha = Math.max(0, pl.dead/1.2);
  const walking = pl.onGround && Math.abs(pl.vx) > 20, ph = pl.step;
  let sqx = 1, sqy = 1;
  if (pl.land > 0){ const k = pl.land/.14; sqx = 1 + .18*k; sqy = 1 - .16*k; }
  else if (!pl.onGround){ const v = Math.min(1, Math.abs(pl.vy)/650); sqx = 1 - .08*v; sqy = 1 + .1*v; }
  const hurtFlash = pl.hurt > 0 && ((now/60|0) % 2 === 0);
  // v1.6: karakter pixel art (js/pixchar.js). Ayunan lengan dihitung di sini lalu dikirim ke painter.
  const idle = walking ? Math.sin(ph)*.5 : (pl.onGround ? -.1*0 + Math.sin(now/560)*.08 : -.8);
  let a = idle;
  if (pl.swing > 0){
    const t = 1 - pl.swing/.2, target = (pl.swingAng - Math.PI/2) * f, wind = target - 1.4;
    const k = t < .35 ? t/.35 : 1 - (t-.35)/.65*.5;
    a = wind + (target - wind)*k;
  }
  const s = HELD_OVERRIDE || selected();
  const holdTool = !!(s && s.key === FIST && toolDef());
  const o = {
    walk: walking, phase: walking ? Math.sin(ph) > 0 : false, air: !pl.onGround,
    bob: walking ? (Math.abs(Math.sin(ph)) > .6 ? 1 : 0) : (Math.sin(now/420) > .4 ? 1 : 0),
    aBack: -idle, aFront: a, wings: wingsDef(), hat: worn.hat ? WEAR[worn.hat] : null,
    shirt: worn.shirt ? WEAR[worn.shirt] : null, pants: worn.pants ? WEAR[worn.pants] : null,
    tool: holdTool ? toolDef() : null, flash: hurtFlash,
    flap: pl.flap > 0 ? Math.sin((1 - pl.flap/.3) * Math.PI) : (!pl.onGround ? (Math.sin(now/110) + 1)/2 : (Math.sin(now/700) + 1)/4),
    blink: (now % 3200) < 120, mouth: pl.swing > 0 || pl.hurt > 0
  };
  // v1.7: emote mengubah pose/wajah (js/emotes.js); pukul atau jalan membatalkan emote
  if (pl.emote && (pl.swing > 0 || walking || !pl.onGround)) pl.emote = null;
  const ep = typeof emotePose === 'function' ? emotePose(pl, o) : null;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, ground - 1, 9, 2.5, 0, 0, Math.PI*2); ctx.fill();
  const hand = drawPixelChar(ctx, x + (ep ? ep.dx : 0), ground + (ep ? ep.dy : 0), f * (ep ? ep.flip : 1), o, sqx, sqy);
  // item yang dipegang di kepalan tangan depan
  if (s && s.key !== FIST && pl.swing === 0){
    const d = itemDef(s.key), U = hand.U;
    ctx.save(); ctx.translate(hand.x, hand.y); ctx.scale(U*f, U); ctx.imageSmoothingEnabled = false;
    if (d.kind === 'seed') drawSeed(ctx, 0, 0, .55, BY_ID[d.id].color);
    else if (d.kind === 'wrench') drawWrench(ctx, 0, 0, .5);
    else if (d.kind === 'block'){ ctx.fillStyle = OL; ctx.fillRect(-5, -5, 10, 10); ctx.drawImage(TEX[d.id], -4, -4, 8, 8); }
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (pl.angel > 0){                                    // efek malaikat saat respawn
    const k = Math.min(1, pl.angel / .6), cx = x, hy2 = ground - 50*PS;
    const g2 = ctx.createRadialGradient(cx, ground - 16, 4, cx, ground - 16, 46);
    g2.addColorStop(0, 'rgba(255,250,210,' + (.55*k) + ')'); g2.addColorStop(1, 'rgba(255,250,210,0)');
    ctx.fillStyle = g2; ctx.fillRect(cx - 50, ground - 66, 100, 100);
    ctx.strokeStyle = 'rgba(255,226,120,' + k + ')'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(cx, hy2 - 8 + Math.sin(now/180)*1.5, 9, 3, 0, 0, Math.PI*2); ctx.stroke();
    const AW = {key: 'w_angel', color: ['#ffffff', '#c9d4ea', '#ffffff']};
    ctx.globalAlpha = k;
    drawPixelChar(ctx, x, ground, pl.face, {wings: AW, flap: (Math.sin(now/110) + 1)/2, bob: 0, blink: true, ghost: 1, hideBody: 1});
    ctx.globalAlpha = 1;
    if (Math.random() < .5) parts.push({x: cx + (Math.random()-.5)*30, y: ground - 10, vx:(Math.random()-.5)*20, vy:-30 - Math.random()*40, life:.7, c:'#fff6c8', s:2, g:-.05});
  }

  if (settings.showNames){
    // pemilik World Lock: nama hijau (seperti Growtopia)
    // nama: Moderator = @ ungu, Developer = @ oranye (berlaku untuk diri sendiri & pemain lain); pemilik World Lock hijau
    const wl = worldLock(), nmKey = NAME_OVERRIDE ? playerName : who(), owner = wl && wl.lock.owner === nmKey;
    // v1.4: pemain yang diberi akses oleh pemilik World Lock: nama hijau muda
    const hasAcc = !owner && wl && (wl.lock.access || []).some(a => String(a).toLowerCase() === String(nmKey).toLowerCase());
    ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    const mine = !NAME_OVERRIDE && online(), rc = NAME_OVERRIDE ? NAME_OVERRIDE.color : (mine ? roleColor(net.role) : null);
    const nm = NAME_OVERRIDE ? NAME_OVERRIDE.text : (mine ? net.display || who() : who()), nw = ctx.measureText(nm).width;
    ctx.lineWidth = 3; ctx.strokeStyle = OL; ctx.strokeText(nm, x + 6, ry - 6);
    ctx.fillStyle = rc || (owner ? '#5dff6a' : hasAcc ? ACCESS_GREEN : guest ? '#9fd6ee' : '#ffffff'); ctx.fillText(nm, x + 6, ry - 6);
    if (typeof flagImg === 'function') ctx.drawImage(flagImg(playerFlag), x + 6 - nw/2 - 15, ry - 13, 12, 8);
    ctx.textAlign = 'left';
  }
  const topY = ry - (settings.showNames ? 14 : 4);
  if (typeof drawEmoteIcon === 'function' && drawEmoteIcon(pl, x, topY - (bubble && Date.now() < bubble.until ? 26 : 0))){}
  drawBubble(x, topY);
}

// balon chat di atas kepala (seperti Growtopia), hilang setelah beberapa detik
function drawBubble(cx, topY){
  if (!bubble || Date.now() > bubble.until) return;
  const now = Date.now(), age = now - bubble.t0, life = bubble.until - bubble.t0;
  const a = Math.min(1, age/120, (life - age)/300);
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  ctx.font = '600 10px system-ui';
  const words = bubble.text.split(' '), lines = []; let line = '';
  for (const w of words){ const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > 130 && line){ lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  const L = lines.slice(0, 4), w = Math.max(...L.map(l => ctx.measureText(l).width)) + 14, h = L.length*12 + 8;
  const bx = Math.round(cx - w/2), by = Math.round(topY - h - 14 - (1-Math.min(1,age/120))*6);
  ctx.fillStyle = OL; ctx.beginPath(); ctx.roundRect(bx-2, by-2, w+4, h+4, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx-6, by+h); ctx.lineTo(cx, by+h+9); ctx.lineTo(cx+6, by+h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(bx, by, w, h, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx-4, by+h-1); ctx.lineTo(cx, by+h+6); ctx.lineTo(cx+4, by+h-1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = OL; ctx.textAlign = 'center';
  L.forEach((l,i) => ctx.fillText(l, cx, by + 12 + i*12));
  ctx.restore(); ctx.textAlign = 'left';
}
function drawHitFx(){
  if (pl.swing <= .1) return;
  const {x:tx, y:ty} = mouseTile();
  if (!inReach(tx,ty)) return;
  const k = (pl.swing - .1)/.1;
  ctx.strokeStyle = 'rgba(255,255,255,' + (k*.8) + ')'; ctx.lineWidth = 2;
  const cx = tx*TS + TS/2, cy = ty*TS + TS/2, rr = 6 + (1-k)*14;
  for (let n=0;n<6;n++){ const an = n*Math.PI/3 + .3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(an)*rr*.5, cy + Math.sin(an)*rr*.5); ctx.lineTo(cx + Math.cos(an)*rr, cy + Math.sin(an)*rr); ctx.stroke(); }
}

function drawSignText(x,y,text){
  if (!text) return;
  ctx.font = '10px system-ui'; const w = Math.min(160, ctx.measureText(text).width + 12);
  const bx = x*TS + TS/2 - w/2, by = y*TS - 24;
  ctx.fillStyle = OL; ctx.beginPath(); ctx.roundRect(bx-2, by-2, w+4, 20, 5); ctx.fill();
  ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.roundRect(bx, by, w, 16, 4); ctx.fill();
  ctx.fillStyle = OL; ctx.textAlign = 'center';
  let t = text; while (ctx.measureText(t).width > w - 10 && t.length > 1) t = t.slice(0,-1);
  if (t !== text) t = t.slice(0,-1) + '…';
  ctx.fillText(t, bx + w/2, by + 11.5); ctx.textAlign = 'left';
}
function drawLabel(x,y,text,color){
  ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = OL;
  ctx.strokeText(text, x, y); ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y); ctx.textAlign = 'left';
}

// ===== latar belakang (cuaca) v2 =====
// langit gradasi 3 warna, matahari dengan sinar, 2 lapis bukit parallax, awan bervolume, burung, debu cahaya
const BG = (()=>{
  const r = rng(4242), clouds = [], birds = [], motes = [];
  for (let k=0;k<9;k++) clouds.push({x: r()*2400, y: 30 + r()*170, s: .6 + r()*.9, sp: 4 + r()*8, z: r()});
  for (let k=0;k<5;k++) birds.push({x: r()*2000, y: 60 + r()*120, sp: 26 + r()*20, ph: r()*6});
  for (let k=0;k<40;k++) motes.push({x: r(), y: r(), s: 1 + r()*1.5, ph: r()*6});
  // siluet bukit dibuat sekali (titik-titik ketinggian)
  const hill = (seed, amp, base) => { const rr = rng(seed), pts = []; let y = 0;
    for (let i=0;i<=64;i++){ y += (rr()-.5)*amp; y *= .82; pts.push(base + y + Math.sin(i*.45 + seed)*amp*.9); } return pts; };
  return {clouds, birds, motes, far: hill(7, 60, 0), near: hill(19, 70, 0)};
})();
function drawCloud(cx, cy, sc, a){
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  const puffs = [[0,0,26],[28,-12,30],[58,-2,24],[30,10,26],[-24,8,18],[80,8,16]];
  ctx.fillStyle = 'rgba(120,150,190,' + (.25*a) + ')';                       // bayangan bawah
  for (const [x,y,r] of puffs){ ctx.beginPath(); ctx.arc(x+3, y+7, r, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
  for (const [x,y,r] of puffs){ ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = 'rgba(235,244,255,' + a + ')';                              // shading bawah awan
  ctx.fillRect(-42, 12, 140, 22);
  ctx.restore();
}
function drawHills(pts, color, rim, par, baseY, amp){
  const span = VW + 400, off = -((camX*par*zoom) % (span/4)) - 200;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(off, VH);
  pts.forEach((p,i) => ctx.lineTo(off + i*(span/64)*1.6, baseY + p*amp));
  ctx.lineTo(off + 64*(span/64)*1.6, VH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.beginPath();
  pts.forEach((p,i) => { const X = off + i*(span/64)*1.6, Y = baseY + p*amp; i ? ctx.lineTo(X,Y) : ctx.moveTo(X,Y); }); ctx.stroke();
}
function drawSky(now){
  const depth = Math.min(1, Math.max(0, (cam - 14*TS) / (24*TS)));         // makin dalam, langit makin gelap (masuk gua)
  const sky = ctx.createLinearGradient(0,0,0,VH);
  sky.addColorStop(0, mixHex('#3f8fe6', '#141a2c', depth));
  sky.addColorStop(.55, mixHex('#7cc4f5', '#1d2438', depth));
  sky.addColorStop(1, mixHex('#d8f1ff', '#262c40', depth));
  ctx.fillStyle = sky; ctx.fillRect(0,0,VW,VH);
  if (depth > .95) return;
  const fade = 1 - depth, horizon = VH*.62 - cam*.05*zoom;
  // matahari + sinar berputar pelan
  const sx = VW*.82 - camX*.02*zoom, sy = 90 - cam*.04*zoom;
  ctx.save(); ctx.globalAlpha = .18*fade; ctx.translate(sx, sy); ctx.rotate(now/30000);
  ctx.fillStyle = '#fff6c8';
  for (let k=0;k<12;k++){ ctx.rotate(Math.PI/6); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-18, 260); ctx.lineTo(18, 260); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90);
  sg.addColorStop(0, 'rgba(255,250,215,' + fade + ')'); sg.addColorStop(.35, 'rgba(255,236,150,' + (.55*fade) + ')'); sg.addColorStop(1,'rgba(255,236,150,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx-90, sy-90, 180, 180);
  ctx.fillStyle = 'rgba(255,248,205,' + fade + ')'; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, Math.PI*2); ctx.fill();
  // awan lapis jauh
  for (const c of BG.clouds){ if (c.z > .5) continue; const span = VW + 500;
    const x = ((c.x - camX*.06*zoom + now*.001*c.sp) % span + span) % span - 250;
    drawCloud(x, c.y - cam*.03*zoom, c.s*.7, .7*fade); }
  // bukit jauh & dekat
  drawHills(BG.far,  mixHex('#8fc7e8', '#1d2438', depth), mixHex('#a9d6f0','#1d2438',depth), .12, horizon - 30, 1.1);
  drawHills(BG.near, mixHex('#5aa86a', '#1a2232', depth), mixHex('#7cc98a','#1a2232',depth), .25, horizon + 40, 1.0);
  // burung
  ctx.strokeStyle = 'rgba(40,50,70,' + (.7*fade) + ')'; ctx.lineWidth = 1.6;
  for (const b of BG.birds){ const span = VW + 300, x = ((b.x + now*.001*b.sp - camX*.1*zoom) % span + span) % span - 150, y = b.y - cam*.04*zoom + Math.sin(now/600 + b.ph)*6;
    const w = Math.sin(now/120 + b.ph)*3; ctx.beginPath(); ctx.moveTo(x-6, y - w); ctx.quadraticCurveTo(x-3, y-3, x, y); ctx.quadraticCurveTo(x+3, y-3, x+6, y - w); ctx.stroke(); }
  // awan lapis dekat
  for (const c of BG.clouds){ if (c.z <= .5) continue; const span = VW + 500;
    const x = ((c.x - camX*.16*zoom + now*.0016*c.sp) % span + span) % span - 250;
    drawCloud(x, c.y + 30 - cam*.06*zoom, c.s, .92*fade); }
  // debu cahaya melayang
  ctx.fillStyle = 'rgba(255,255,230,' + (.5*fade) + ')';
  for (const m of BG.motes){ const x = (m.x*VW + Math.sin(now/2000 + m.ph)*20) % VW, y = (m.y*VH*.7 + Math.cos(now/2600 + m.ph)*14);
    ctx.globalAlpha = .3 + .3*Math.sin(now/700 + m.ph); ctx.fillRect(x, y, m.s, m.s); }
  ctx.globalAlpha = 1;
}
function mixHex(a, b, t){
  const A = parseInt(a.slice(1),16), B = parseInt(b.slice(1),16), m = (x,y) => Math.round(x + (y-x)*t);
  return '#' + ((m(A>>16,B>>16)<<16) | (m((A>>8)&255,(B>>8)&255)<<8) | m(A&255,B&255)).toString(16).padStart(6,'0');
}

function draw(alpha){
  const now = Date.now();
  drawSky(now);

  const rx = lerp(pl.px ?? pl.x, pl.x, alpha), ry = lerp(pl.py ?? pl.y, pl.y, alpha);
  const shx = shakeAmt ? (Math.random()-.5)*shakeAmt : 0, shy = shakeAmt ? (Math.random()-.5)*shakeAmt : 0;
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-Math.round((camX + shx)*zoom)/zoom, -Math.round((cam + shy)*zoom)/zoom);
  ctx.imageSmoothingEnabled = false;

  const x0 = Math.max(0, Math.floor(camX/TS) - 1), x1 = Math.min(COLS-1, Math.ceil((camX + VW/zoom)/TS) + 1);
  const y0 = Math.max(0, Math.floor(cam/TS) - 1), y1 = Math.min(ROWS-1, Math.ceil((cam + VH/zoom)/TS) + 1);

  // dinding belakang (bisa dipecah)
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    const b = bgw[idx(x,y)]; if (!b) continue;
    const id = fg[idx(x,y)];
    if (id && BY_ID[id].solid && id !== 5) continue;
    ctx.drawImage(texAt(b, x, y), x*TS, y*TS, TS, TS);
  }
  // retakan di dinding belakang
  for (const [k,d] of dmg) if (d.bg) drawCracks(d.x, d.y, d.n / BY_ID[bgw[idx(d.x,d.y)]||40].hits);

  // outline gelap tebal
  ctx.fillStyle = OL;
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    const id = fg[idx(x,y)]; if (!id || id === 8 || BY_ID[id].deco || BY_ID[id].platform) continue;
    ctx.fillRect(x*TS - 2, y*TS - 2, TS + 4, TS + 4);
  }
  // tekstur
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    const i = idx(x,y), id = fg[i]; if (!id || id === 8) continue;
    const sx = x*TS, sy = y*TS;
    const same = (ax,ay)=> tileAt(ax,ay) === id;
    const l = same(x-1,y)?0:2, r = same(x+1,y)?0:2, t = same(x,y-1)?0:2, b = same(x,y+1)?0:2;
    if (BY_ID[id].platform){ ctx.drawImage(texAt(id, x, y), sx, sy, TS, TS); continue; }
    { const tx0 = texAt(id, x, y); ctx.drawImage(tx0, 0, 0, tx0.width, tx0.height, sx + l, sy + t, TS - l - r, TS - t - b); }
    const above = tileAt(x,y-1), openTop = !above || !BY_ID[above].solid;
    if (id === 1 && openTop){ const gv = GRASSV[tileHash(x,y)]; ctx.drawImage(gv, sx + l, sy + 2, TS - l - r, gv.width >= 32 ? TS - 2 : TS*.5); }
    if (id === 15){                                        // lava padat, permukaan berdenyut
      const a = .18 + .14*Math.sin(now/260 + x*1.7 + y);
      ctx.fillStyle = 'rgba(255,230,120,' + a + ')'; ctx.fillRect(sx + l, sy + t, TS - l - r, TS - t - b);
      for (let k=0;k<2;k++){ const bx = sx + 6 + ((now/40 + x*13 + k*11) % (TS-12)), by = sy + 8 + ((now/70 + y*7 + k*9) % (TS-14));
        ctx.fillStyle = '#fff2a0'; ctx.fillRect(bx, by, 2, 2); }
    }
    if (id === 24 && !canBuild(x, y)){                      // tanda: kamu tidak bisa lewat (gembok kecil di tengah pintu)
      const cx = sx + TS - 7, cy = sy + 7;                // lencana gembok kecil di pojok kanan atas
      ctx.fillStyle = '#1a1208'; ctx.fillRect(cx - 4, cy - 1, 8, 7);
      ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy - 1, 2.6, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = '#d8dde6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy - 1, 2.6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#ffd23d'; ctx.fillRect(cx - 3, cy, 6, 5);
    }
    if (id === 21){ const m = meta.get(i); if (m && m.door && m.door.locked){ ctx.fillStyle = '#f0d24a'; ctx.fillRect(sx+TS/2-3, sy+TS/2-2, 6, 6); } }
    if (id === 22){ const m = meta.get(i); if (m && m.display && m.display.key){
      const d = itemDef(m.display.key);
      if (d.kind === 'seed') drawSeed(ctx, sx+TS/2, sy+TS/2, 1, BY_ID[d.id].color);
      else if (d.kind === 'block') ctx.drawImage(TEX[d.id], sx+9, sy+9, TS-18, TS-18);
      else if (d.kind === 'wrench') drawWrench(ctx, sx+TS/2, sy+TS/2, .8); } }
    if (id === 62){ const m = meta.get(i); if (m && m.vend && m.vend.key){        // v1.4: barang jualan terlihat di kaca mesin
      ctx.drawImage(iconImg(m.vend.key), sx+6, sy+6, 14, 14);
      if (!m.vend.n){ ctx.fillStyle = 'rgba(20,10,20,.55)'; ctx.fillRect(sx+6, sy+6, 14, 14); } } }
  }
  // cahaya
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    const id = fg[idx(x,y)]; if (!id || !BY_ID[id].light) continue;
    const c = id === 15 ? '255,140,50' : id === 14 ? '94,224,208' : id === 11 ? '190,140,255' : '255,225,140';
    const g = ctx.createRadialGradient(x*TS+TS/2, y*TS+TS/2, 4, x*TS+TS/2, y*TS+TS/2, TS*2);
    g.addColorStop(0,'rgba('+c+',.28)'); g.addColorStop(1,'rgba('+c+',0)');
    ctx.fillStyle = g; ctx.fillRect(x*TS - TS*2, y*TS - TS*2, TS*5, TS*5);
  }
  for (const [k,d] of dmg) if (!d.bg && fg[idx(d.x,d.y)]) drawCracks(d.x, d.y, d.n / (BY_ID[fg[idx(d.x,d.y)]].lock ? 5 : BY_ID[fg[idx(d.x,d.y)]].hits));
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) if (fg[idx(x,y)] === 8) drawTree(x*TS, y*TS, trees.get(idx(x,y)), now);
  labelBoxes = [];
  { const mt = mouseTile(); if (tileAt(mt.x, mt.y) === 8) drawTreeLabel(mt.x*TS, mt.y*TS, trees.get(idx(mt.x, mt.y)), now); }
  for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
    if (fg[idx(x,y)] !== 8) continue; const mt = mouseTile(); if (mt.x === x && mt.y === y) continue;
    drawTreeLabel(x*TS, y*TS, trees.get(idx(x,y)), now);
  }

  // area lock: garis putus-putus saat memegang lock / kunci inggris
  const hold = itemDef(selected().key);
  for (const [i,m] of meta){
    const x = i % COLS, y = (i/COLS)|0;
    if (m.sign && x >= x0 && x <= x1 && y >= y0 && y <= y1) drawSignText(x, y, m.sign.text);
    if (m.door && m.door.name && x >= x0 && x <= x1 && y >= y0 && y <= y1) drawLabel(x*TS+TS/2, y*TS-4, m.door.name, '#ffe27a');
    if (m.lock && m.lock.type !== 'world' && (hold.kind === 'wrench' || (hold.kind === 'block' && BY_ID[hold.id].lock))){
      ctx.fillStyle = m.lock.owner === who() ? 'rgba(138,210,240,.22)' : 'rgba(255,110,110,.22)';
      for (const t of lockTilesOf(m)) ctx.fillRect((t % COLS)*TS, ((t / COLS)|0)*TS, TS, TS);
    }
  }
  // v1.4: hasil Dadu / Roulette di atas block (angka berputar dulu, lalu angka akhir)
  for (const [i, f] of rollFx){
    const age = now - f.t; if (age > ROLL_SHOW_MS || fg[i] !== (f.kind === 'dice' ? 60 : 61)){ if (age > ROLL_SHOW_MS) rollFx.delete(i); continue; }
    const x = (i % COLS)*TS + TS/2, y = ((i / COLS)|0)*TS - 10 - Math.min(1, age/200)*6;
    const spinning = age < ROLL_BUSY_MS - 200;
    const v = spinning ? (f.kind === 'dice' ? 1 + ((age/70)|0) % 6 : ((age/45)|0) % 37) : f.v;
    const col = f.kind === 'dice' ? '#ffffff' : v === 0 ? '#3fe07a' : ROULETTE_RED.has(v) ? '#ff5a5a' : '#c9d2de';
    ctx.save(); ctx.globalAlpha = Math.min(1, (ROLL_SHOW_MS - age)/400);
    const w = 26, h = 20; ctx.fillStyle = OL; ctx.fillRect(x - w/2 - 2, y - h/2 - 2, w + 4, h + 4);
    ctx.fillStyle = spinning ? '#2b4566' : '#1d3150'; ctx.fillRect(x - w/2, y - h/2, w, h);
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(String(v), x, y + 1);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.restore();
  }
  // label pintu utama naik ke atas nama pemain kalau pemain berdiri di pintu
  const md = spawn, onDoor = Math.abs((pl.x + pl.w/2) - (md.x*TS + TS/2)) < TS && Math.abs(pl.y - md.y*TS) < TS;
  const bubbleOn = bubble && Date.now() < bubble.until;
  if (!(onDoor && bubbleOn)) drawLabel(md.x*TS+TS/2, md.y*TS - (onDoor && settings.showNames ? 18 : 4), 'EXIT', '#ffe27a');
  if (inGame && onMainDoor() && !bubbleOn) drawLabel(md.x*TS+TS/2, md.y*TS + TS + 12, (controlMode === 'touch' ? 'Tekan ▲ untuk keluar' : 'Tekan W / Atas untuk keluar'), '#ffffff');

  for (const it of items){
    const fy = it.y + Math.sin(now/300 + it.x)*1.5;
    if (it.key === 'gem'){ drawGem(ctx, it.x, fy, .9, it.n);
      if (it.n > 1){ ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.textAlign = 'center';
        ctx.strokeText(it.n, it.x, fy + 17); ctx.fillText(it.n, it.x, fy + 17); ctx.textAlign = 'left'; }
      continue; }
    const d = itemDef(it.key);
    if (d.kind === 'seed') drawSeed(ctx, it.x, fy, 1, BY_ID[d.id].color);
    else if (d.kind === 'wrench') drawWrench(ctx, it.x, fy, .8);
    else { ctx.fillStyle = OL; ctx.fillRect(it.x-8, fy-8, 16, 16); ctx.drawImage(TEX[d.id], it.x-6, fy-6, 12, 12); }
    if (it.n > 1){ ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
      ctx.strokeText(it.n, it.x+4, fy+11); ctx.fillText(it.n, it.x+4, fy+11); }
  }
  for (const p of parts){
    if (p.feather){ ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life*2);
      ctx.fillStyle = OL; ctx.beginPath(); ctx.ellipse(0,0,5,2.4,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0,0,3.8,1.4,0,0,Math.PI*2); ctx.fill(); ctx.restore(); continue; }
    ctx.globalAlpha = Math.min(1, p.life*3);
    ctx.fillStyle = OL; ctx.fillRect(p.x-2, p.y-2, 5, 5); ctx.fillStyle = p.c; ctx.fillRect(p.x-1, p.y-1, 3, 3); ctx.globalAlpha = 1; }
  for (const r of rings){ ctx.strokeStyle = r.c; ctx.globalAlpha = Math.max(0, r.life/.35)*.8; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r*.35, 0, 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1; }

  if (settings.showGrid){ ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    for (let x=x0;x<=x1;x++){ ctx.beginPath(); ctx.moveTo(x*TS, y0*TS); ctx.lineTo(x*TS, (y1+1)*TS); ctx.stroke(); }
    for (let y=y0;y<=y1;y++){ ctx.beginPath(); ctx.moveTo(x0*TS, y*TS); ctx.lineTo((x1+1)*TS, y*TS); ctx.stroke(); } }

  const {x:tx, y:ty} = mouseTile();
  if (inWorld(tx,ty) && !anyUIOpen()){
    const ok = inReach(tx,ty), allowed = canBuild(tx,ty);
    ctx.strokeStyle = !ok ? 'rgba(255,255,255,.25)' : allowed ? 'rgba(255,255,255,.95)' : 'rgba(255,110,110,.95)';
    ctx.lineWidth = 2; ctx.setLineDash(ok ? [] : [4,4]); ctx.strokeRect(tx*TS + 1, ty*TS + 1, TS - 2, TS - 2); ctx.setLineDash([]);
  }
  if (inGame){ drawRemotePlayers(); drawGhost(); drawPlayer(rx, ry); drawHitFx(); }
  ctx.restore();
}
// bayangan item (opacity 25%) di tile kursor saat memegang block / seed
function drawGhost(){
  if (anyUIOpen() || pl.dead > 0) return;
  const s = selected(), d = itemDef(s.key);
  if (d.kind !== 'block' && d.kind !== 'seed') return;
  const {x:tx, y:ty} = mouseTile();
  if (!inWorld(tx,ty) || !inReach(tx,ty)) return;
  const id = tileAt(tx,ty), def = d.kind === 'block' ? BY_ID[d.id] : null;
  const free = def && def.bg ? !bgw[idx(tx,ty)] : id === 0;
  if (!free) return;
  ctx.save(); ctx.globalAlpha = .25;
  if (d.kind === 'seed') drawSeed(ctx, tx*TS + TS/2, ty*TS + TS/2, 1.3, BY_ID[d.id].color);
  else { ctx.fillStyle = OL; ctx.fillRect(tx*TS - 2, ty*TS - 2, TS + 4, TS + 4); ctx.drawImage(TEX[d.id], tx*TS, ty*TS, TS, TS); }
  ctx.restore();
}
function drawCracks(x,y,f){
  const k = Math.min(4, Math.ceil(f*4)), sx = x*TS, sy = y*TS, cx = sx + TS/2, cy = sy + TS/2;
  ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath();
  const C = [[-11,-12],[12,-9],[-12,10],[9,12]];
  for (let c=0;c<k;c++){ ctx.moveTo(cx,cy); ctx.lineTo(cx + C[c][0]*.5 + 2, cy + C[c][1]*.5 - 1); ctx.lineTo(cx + C[c][0], cy + C[c][1]); }
  ctx.stroke();
}
