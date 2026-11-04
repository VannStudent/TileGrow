'use strict';
// TileGrow v1.13 — ikon status di atas kepala pemain lain: balon chat kecil saat dia sedang mengetik,
// dan ikon menu (tiga garis) saat dia sedang membuka jendela (tas, toko, pengaturan, dll).
// Gambar dibuat sendiri dengan canvas (bukan aset dari game lain).
// Dipanggil dari drawRemotePlayers() lewat drawStatusIcon(r, x, topY).

// titik-titik animasi "..." di dalam balon chat
function dot3(g, x, y, t){
  for (let i = 0; i < 3; i++){
    const up = Math.max(0, Math.sin(t * 6 - i * .8)) * 1.6;
    g.fillStyle = '#2b3b47';
    g.beginPath(); g.arc(x + i * 4, y - up, 1.3, 0, 7); g.fill();
  }
}
function statusBox(g, x, y, w, h, fill){
  g.fillStyle = OL; g.beginPath(); g.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 4); g.fill();
  g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, 3); g.fill();
}
// balon chat + ekor kecil di bawah
function drawTypingIcon(g, cx, baseY, t){
  const w = 17, h = 13, x = Math.round(cx - w/2), y = Math.round(baseY - h - Math.sin(t*3)*1.2);
  statusBox(g, x, y, w, h, '#ffffff');
  g.fillStyle = OL; g.beginPath(); g.moveTo(x + 4, y + h); g.lineTo(x + 9, y + h + 4.5); g.lineTo(x + 9.5, y + h); g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x + 5, y + h - .5); g.lineTo(x + 8.4, y + h + 2.8); g.lineTo(x + 8.6, y + h - .5); g.closePath(); g.fill();
  dot3(g, x + 4.5, y + h/2 + .5, t);
}
// ikon menu: tiga garis di kotak kuning (seperti tombol menu di game)
function drawMenuIcon(g, cx, baseY, t){
  const w = 15, h = 13, x = Math.round(cx - w/2), y = Math.round(baseY - h - Math.sin(t*3 + 1)*1.2);
  statusBox(g, x, y, w, h, '#ffd25e');
  g.fillStyle = '#4a3410';
  for (let i = 0; i < 3; i++) g.fillRect(x + 3, y + 3 + i * 3.2, w - 6, 1.8);
}
// r = pemain lain (remote). Mengembalikan tinggi yang dipakai supaya balon chat tidak tumpang tindih.
function drawStatusIcon(r, cx, topY){
  const s = r && r.s; if (!s) return 0;
  const t = Date.now() / 1000;
  let used = 0;
  if (s.ty){ drawTypingIcon(ctx, cx, topY, t); used = 18; }
  else if (s.mn){ drawMenuIcon(ctx, cx, topY, t); used = 18; }
  return used;
}
