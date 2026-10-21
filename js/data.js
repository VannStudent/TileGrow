// TileGrow v0.4 — data, tekstur, dunia
// Semua tekstur digambar lewat kode (pixel art 16x16), bukan aset game lain.
const TS = 32, COLS = 100, ROWS = 60, STACK = 200, SAVE_KEY = 'tilegrow-save-v8';
const OL = '#17121c';                 // outline kartun
const REACH = 2;                      // v0.8: jangkauan 2 tile → area 5x5 di sekitar pemain
const MAX_HP = 10;                    // 10 kali kena lava = mati

// --- palet: [dasar, gelap, terang] — warna cerah ala Growtopia ---
const PAL = {
  1:['#9a6033','#5e3415','#c98f52'],   2:['#8893a6','#515a69','#b9c3d2'],
  3:['#b57a3c','#6e4316','#e0a861'],   4:['#46a847','#215f26','#7ddc6a'],
  5:['#a8e2f5','#4f8fb5','#f4fdff'],   6:['#ffd84a','#8a5a16','#fff8c8'],
  7:['#2d3340','#121620','#4a5366'],   9:['#c2563a','#78281a','#ef8a66'],
  10:['#6f8a6a','#3f5340','#8ed86a'],  11:['#9a5ce0','#4f2593','#e6ccff'],
  12:['#8893a6','#515a69','#eef3fa'],  13:['#8893a6','#515a69','#ffd23d'],
  14:['#8893a6','#515a69','#4ff0da'],  15:['#f26a1b','#8a2606','#ffd45e'],
  16:['#e8cf86','#9a7c3a','#fff4c2'],  17:['#6a4f33','#3a2a18','#9a7a52'],
  18:['#dce8f5','#92a3b8','#ffffff'],  20:['#a8763f','#5e3f18','#e8d7b4'],
  21:['#c08a4a','#6e4518','#ecc07a'],  22:['#343c4e','#161a22','#5a6680'],
  23:['#8a5a2b','#3e2510','#c08a50'],  30:['#ffd74a','#8a6b14','#fff8c0'],
  31:['#7fd8f5','#2d6c8a','#e0f8ff'],  32:['#c2a05a','#7a5a20','#ffe9a0'],
  33:['#d87ae8','#7a2d8a','#ffd8f8'],  40:['#4e3f31','#281f16','#6b5847'],
  41:['#b57a3c','#6e4316','#e0a861'],  42:['#8893a6','#515a69','#b9c3d2'],
  50:['#3fb86a','#1f6a3a','#9af0b8'],  51:['#5a7bd8','#2a3f8a','#b8e8ff'],
  52:['#3a3238','#1a1418','#ff7a2a'],  53:['#e0a52a','#7a4f10','#fff3a0'],
  54:['#e85aa8','#7a2a6a','#ffe0f4']
};
// kind: block padat, bg = dinding belakang, deco = tidak padat
const T = {
  AIR:    {id:0,  name:'Udara',        hits:0},
  DIRT:   {id:1,  name:'Tanah',        hits:3,  xp:1,  price:1},
  STONE:  {id:2,  name:'Batu',         hits:6,  xp:2,  price:2},
  WOOD:   {id:3,  name:'Kayu',         hits:4,  xp:2,  price:3},
  LEAF:   {id:4,  name:'Daun',         hits:2,  xp:1,  price:2},
  GLASS:  {id:5,  name:'Kaca',         hits:2,  xp:2,  price:4},
  LAMP:   {id:6,  name:'Lampu',        hits:3,  xp:3,  price:12, light:1},
  BEDROCK:{id:7,  name:'Dasar',        hits:0},
  TREE:   {id:8,  name:'Pohon',        hits:1,  deco:1},
  BRICK:  {id:9,  name:'Bata',         hits:7,  xp:3,  price:6},
  MOSS:   {id:10, name:'Lumut',        hits:4,  xp:2,  price:5},
  CRYST:  {id:11, name:'Kristal',      hits:8,  xp:6,  price:30, light:1},
  ORE_S:  {id:12, name:'Bijih Perak',  hits:7,  xp:5,  gem:[2,4]},
  ORE_G:  {id:13, name:'Bijih Emas',   hits:9,  xp:8,  gem:[4,7]},
  ORE_C:  {id:14, name:'Bijih Pirus',  hits:11, xp:12, gem:[7,12], light:1},
  LAVA:   {id:15, name:'Lava',         hits:5,  xp:3, light:1, danger:1, price:30},
  SAND:   {id:16, name:'Pasir',        hits:2,  xp:1,  price:2},
  PLANK:  {id:17, name:'Papan Gelap',  hits:5,  xp:2,  price:4},
  SNOW:   {id:18, name:'Salju',        hits:2,  xp:1,  price:3},
  SIGN:   {id:20, name:'Papan Tulis',  hits:3,  xp:2,  price:15, wrench:'sign', deco:1},
  DOOR:   {id:21, name:'Pintu',        hits:4,  xp:2,  price:20, deco:1, wrench:'door'},
  DISPLAY:{id:22, name:'Kotak Pajang', hits:4,  xp:2,  price:25, wrench:'display'},
  MAINDOOR:{id:23,name:'Pintu Utama',  hits:0,  deco:1},
  WLOCK:  {id:30, name:'World Lock',   hits:0,  xp:0,  price:200, wrench:'lock', lock:'world'},
  SLOCK:  {id:31, name:'Small Lock',   hits:0,  xp:0,  price:40,  wrench:'lock', lock:'small'},
  BLOCK_BG:{id:40,name:'Dinding Gua',  hits:2,  xp:1,  bg:1, price:1},
  BLOCK:  {id:32, name:'Big Lock',     hits:0,  xp:0,  price:120, wrench:'lock', lock:'big'},
  HLOCK:  {id:33, name:'Huge Lock',    hits:0,  xp:0,  price:400, wrench:'lock', lock:'huge'},
  // farmable: dibeli di toko (500–2000), saat dipecah menjatuhkan gems lebih banyak + seed (30%)
  FARM1:  {id:50, name:'Semak Permata', hits:3, xp:3,  gem:[1,3],   farm:1},
  FARM2:  {id:51, name:'Jamur Kristal', hits:4, xp:4,  gem:[2,5],   farm:1},
  FARM3:  {id:52, name:'Batu Bara Api', hits:5, xp:6,  gem:[3,7],   farm:1},
  FARM4:  {id:53, name:'Lentera Emas',  hits:6, xp:8,  gem:[5,10],  farm:1, light:1},
  FARM5:  {id:54, name:'Bunga Pelangi', hits:7, xp:10, gem:[7,14],  farm:1},
  PLANKP: {id:41, name:'Platform Kayu',hits:3,  xp:2,  price:5, platform:1},
  ROCKP:  {id:42, name:'Platform Batu',hits:5,  xp:2,  price:6, platform:1}
};
// ===== WEARABLES (pakaian) =====
// slot: wings (sayap, lompat ekstra), hat (topi), shirt (baju), pants (celana)
const WINGS = {
  devil: {key:'w_devil', slot:'wings', name:'Devil Wings', price:1200, jumps:2, color:['#c6304a','#7a1526','#ff7a8f'], desc:'Sayap iblis. Lompat 2 kali'},
  angel: {key:'w_angel', slot:'wings', name:'Angel Wings', price:1200, jumps:2, color:['#f2f6ff','#b9c6de','#ffffff'], desc:'Sayap malaikat. Lompat 2 kali'},
  storm: {key:'w_storm', slot:'wings', name:'Storm Wings', price:1200, jumps:2, color:['#6fd0f5','#2d6c8a','#d8f4ff'], desc:'Sayap badai. Lompat 2 kali'}
};
// pakaian lain murni kosmetik
const CLOTHES = {
  h_cowboy: {slot:'hat',   name:'Topi Koboi',     price:180, color:['#8a5a2b','#5a3a18','#c08a50'], style:'cowboy'},
  h_crown:  {slot:'hat',   name:'Mahkota Kertas', price:350, color:['#f0d24a','#a8851c','#fff3ad'], style:'crown'},
  h_cap:    {slot:'hat',   name:'Topi Pet Biru',  price:90,  color:['#2f6fd1','#1b4187','#7fb0f5'], style:'cap'},
  h_miner:  {slot:'hat',   name:'Helm Tambang',   price:240, color:['#f2c230','#a8851c','#fff2a0'], style:'miner'},
  h_beanie: {slot:'hat',   name:'Kupluk Hijau',   price:120, color:['#3e9a52','#24653a','#7be37a'], style:'beanie'},
  s_red:    {slot:'shirt', name:'Kaos Merah',     price:80,  color:['#e04848','#8f2222','#ff8a8a']},
  s_hoodie: {slot:'shirt', name:'Hoodie Ungu',    price:260, color:['#7d4fc9','#4b2a87','#b994ff'], style:'hoodie'},
  s_jacket: {slot:'shirt', name:'Jaket Kulit',    price:320, color:['#3a2a22','#1e1410','#6a5040'], style:'jacket'},
  s_stripe: {slot:'shirt', name:'Kaos Belang',    price:140, color:['#f2f2f2','#1f2a44','#ffffff'], style:'stripe'},
  s_suit:   {slot:'shirt', name:'Jas Hitam',      price:450, color:['#1d2230','#0d1018','#3a4258'], style:'suit'},
  p_jeans:  {slot:'pants', name:'Celana Jeans',   price:110, color:['#3b5a9a','#24386a','#6f8fd1']},
  p_brown:  {slot:'pants', name:'Celana Cokelat', price:90,  color:['#7a5230','#4a3018','#a8774b']},
  p_white:  {slot:'pants', name:'Celana Putih',   price:160, color:['#e8ecf2','#a9b2c2','#ffffff']}
};
// alat yang dipakai: pickaxe mempercepat pecah block
const TOOLS = {
  pick_iron: {slot:'tool', name:'Pickaxe Besi',   price:900,  color:['#b9c3d2','#5b6478','#f0f4fa'], desc:'Pecah block 1 pukulan lebih cepat'},
  pick_gold: {slot:'tool', name:'Pickaxe Emas',   price:1500, color:['#ffd23d','#8a6b14','#fff8c8'], desc:'Pecah block 1 pukulan lebih cepat'}
};
const WEAR = {};   // key -> definisi pakaian
for (const k in WINGS) WEAR[WINGS[k].key] = WINGS[k];
for (const k in CLOTHES){ CLOTHES[k].key = k; WEAR[k] = CLOTHES[k]; }
for (const k in TOOLS){ TOOLS[k].key = k; WEAR[k] = TOOLS[k]; }
const WING_BY_KEY = {}; for (const k in WINGS) WING_BY_KEY[WINGS[k].key] = WINGS[k];


const BY_ID = {}; for (const k in T){ const d = T[k]; BY_ID[d.id] = d;
  d.solid = !(d.deco || d.bg || d.platform || d.id === 0);
  if (PAL[d.id]) d.color = PAL[d.id][0]; }
// kapasitas lock dalam jumlah tile (menyebar dari lock, seperti Growtopia)
const LOCK_TILES = {small:10, big:48, huge:200};
T.TREE.color = '#5fae63';
const BLOCK_IDS = [1,2,3,4,5,6,9,10,11,16,17,18,20,21,22,41,42];
const SEEDABLE  = [1,2,3,4,5,6,9,10,11,15,16,17,18,41,42,50,51,52,53,54];   // lava & farmable juga menjatuhkan seed
const ORES = [12,13,14];
const GROW_MS = {1:4000,2:9000,3:7000,4:5000,5:11000,6:14000,9:16000,10:12000,11:24000,16:5000,17:8000,18:6000,41:9000,42:11000,15:15000,50:20000,51:30000,52:42000,53:55000,54:70000};
const RECIPES = {'1+2':9,'2+4':10,'5+6':11,'1+16':17,'3+16':41,'2+16':42,'4+18':10,'6+11':14,'2+6':15};
function recipe(a,b){ return RECIPES[Math.min(a,b)+'+'+Math.max(a,b)]; }

// --- drop rate (atas permintaan user: block kembali 20–25%, seed 30%) ---
const DROP_BLOCK = 0.225, DROP_SEED = 0.30, DROP_SEED_BG = 0.35;   // dinding gua: 30–40% seed
const GEM_FROM_BLOCK = 0.12, GEM_FROM_TREE = [2,4];
// XP level: butuh makin besar; level up memberi gems
function xpNeeded(lv){ return Math.round(40 * Math.pow(1.35, lv - 1)); }
function levelReward(lv){ return 25 * lv; }

const FIST = 'fist', WRENCH = 'wrench';
function itemDef(key){
  if (key === FIST) return {name:'Tinju', kind:'fist', id:0};
  if (key === WRENCH) return {name:'Kunci Inggris', kind:'wrench', id:0};
  if (key === 'gem') return {name:'Gems', kind:'gem', id:0};
  if (WEAR[key]) return {name:WEAR[key].name, kind:'wear', slot:WEAR[key].slot, id:0, wear:WEAR[key]};
  const id = +key.slice(1), k = key[0];
  return {name:(k==='s'?'Seed ':'') + BY_ID[id].name, kind: k==='s'?'seed':'block', id};
}

// --- shop ---
const SHOP = [
  {key:'starter', name:'Starter Pack', desc:'10 tiap block dasar, 5 seed, 1 Small Lock, kunci inggris', price:120,
   give:[['b1',10],['b2',10],['b3',10],['b5',10],['s1',5],['s4',5],['b31',1],[WRENCH,1]]},
  {key:'builder', name:'Builder Pack', desc:'40 Bata, 40 Papan, 20 Kaca, 10 Lampu', price:400,
   give:[['b9',40],['b17',40],['b5',20],['b6',10]]},
  {key:'farmer',  name:'Farmer Pack',  desc:'5 seed tiap jenis dasar', price:150,
   give:[['s1',5],['s2',5],['s3',5],['s4',5],['s5',5],['s6',5]]},
  {key:'b30', name:'World Lock',  desc:'Kunci seluruh world jadi milikmu', price:200, give:[['b30',1]]},
  {key:'b31', name:'Small Lock',  desc:'Klaim 10 tile di sekitarnya', price:40,  give:[['b31',1]]},
  {key:'b32', name:'Big Lock',    desc:'Klaim 48 tile', price:120, give:[['b32',1]]},
  {key:'b33', name:'Huge Lock',   desc:'Klaim 200 tile', price:400, give:[['b33',1]]},
  {key:WRENCH, name:'Kunci Inggris', desc:'Edit properti block (papan, pintu, kotak pajang, lock)', price:25, give:[[WRENCH,1]]},
  {key:'b20', name:'Papan Tulis', desc:'Tulis teks di world', price:15, give:[['b20',1]]},
  {key:'b21', name:'Pintu',       desc:'Bisa diberi nama & dikunci', price:20, give:[['b21',1]]},
  {key:'b22', name:'Kotak Pajang',desc:'Pajang satu item', price:25, give:[['b22',1]]},
  {key:'b40', name:'Dinding Gua x25', desc:'Dinding belakang, bisa dipecah', price:20, give:[['b40',25]]},
  {key:'b41', name:'Platform Kayu x25', desc:'Bisa dilewati dari bawah, dipijak dari atas', price:125, give:[['b41',25]]},
  {key:'b42', name:'Platform Batu x25', desc:'Platform dari batu', price:150, give:[['b42',25]]},
  {key:'bag8', name:'Upgrade Tas +8 slot', desc:'Tambah 8 slot tas', price:'bag', give:[]},
];
const SLOT_NAME = {wings:'Sayap', hat:'Topi', shirt:'Baju', pants:'Celana', tool:'Alat'};
// farmable: paket 10 block + 3 seed. Harga > gems yang didapat dari sekali pecah 10 block (tidak ada untung instan);
// untung datang dari menanam ulang seed-nya.
const FARM_PACKS = [[50,500],[51,900],[52,1300],[53,1700],[54,2000]];
for (const [id, price] of FARM_PACKS){
  const d = BY_ID[id];
  SHOP.push({key:'farm'+id, tab:'farm', name:d.name, price, give:[['b'+id,10],['s'+id,3]],
    desc:'10 block + 3 seed. Dipecah: ' + d.gem[0] + '–' + d.gem[1] + ' gems/block, 30% seed. Tumbuh ' + Math.round(GROW_MS[id]/1000) + ' dtk'});
}
for (const k in WEAR){ const w = WEAR[k];
  SHOP.push({key:k, tab:'wear', name:w.name, desc:(w.desc || SLOT_NAME[w.slot]) + ' · klik di tas untuk pakai', price:w.price, give:[[k,1]]}); }
// block dasar yang bisa dibeli satuan (harga > gems hasil pecah, supaya tidak ada celah untung)
for (const id of [1,2,3,4,5,6,9,10,11,16,17,18]) SHOP.push({key:'b'+id, name:BY_ID[id].name+' x25', desc:'25 block', price:BY_ID[id].price*25, give:[['b'+id,25]]});

// ================= TEKSTUR =================
function rng(seed){ return ()=>{ seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function newCanvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h||w; return c; }
function px(g,x,y,c,w,h){ g.fillStyle=c; g.fillRect(x,y,w||1,h||1); }

// ===== TEXTURE PACK v2 =====
// Gaya ala Growtopia: warna cerah, shading 3 tingkat (highlight kiri-atas, bayangan kanan-bawah),
// detail khas tiap block, dan 4 varian per block supaya tile tidak terlihat berulang.
const TEXVAR = 4;
function shadeHex(hex, amt){
  const n = parseInt(hex.slice(1),16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amt)));
  return '#' + ((f(n>>16)<<16) | (f((n>>8)&255)<<8) | f(n&255)).toString(16).padStart(6,'0');
}
// bevel: highlight 2px kiri-atas, bayangan 2px kanan-bawah (3 tingkat: terang, dasar, gelap)
function bevel(g, P, inset){
  const i = inset || 0, hi = P[2], lo = P[1];
  px(g,i,i,hi,16-2*i,1); px(g,i,i,hi,1,16-2*i);
  px(g,i+1,i+1,shadeHex(P[0],18),14-2*i,1); px(g,i+1,i+1,shadeHex(P[0],18),1,14-2*i);
  px(g,i,15-i,lo,16-2*i,1); px(g,15-i,i,lo,1,16-2*i);
  px(g,i+1,14-i,shadeHex(P[0],-22),14-2*i,1); px(g,14-i,i+1,shadeHex(P[0],-22),1,14-2*i);
}
// batu berbentuk bulat dengan shading sendiri (untuk cobble/bijih)
function pebble(g, x, y, w, h, base){
  px(g,x,y,base,w,h);
  px(g,x,y,shadeHex(base,34),w,1); px(g,x,y,shadeHex(base,22),1,h);
  px(g,x,y+h-1,shadeHex(base,-40),w,1); px(g,x+w-1,y,shadeHex(base,-30),1,h);
}
function gemNugget(g, x, y, c, big){
  const s = big ? 3 : 2;
  px(g,x-1,y-1,'#1a1420',s+2,s+2);
  px(g,x,y,c,s,s); px(g,x,y,shadeHex(c,70),1,1);
  if (big) px(g,x+s-1,y+s-1,shadeHex(c,-50),1,1);
}
function makeTex(id, v){
  v = v || 0;
  const c = newCanvas(16), g = c.getContext('2d'), r = rng(id*7919 + v*104729 + 13), P = PAL[id] || PAL[1];
  const R = n => (r()*n)|0;
  px(g,0,0,P[0],16,16);
  const speck = (n, cols, sz) => { for (let i=0;i<n;i++) px(g,R(16),R(16),cols[R(cols.length)],sz||1,sz||1); };
  const cobble = (base) => {
    px(g,0,0,shadeHex(base,-34),16,16);                         // mortar gelap
    const rows = [[0,5],[5,5],[10,6]];
    for (const [y,h] of rows){ let x = -R(4);
      while (x < 16){ const w = 4 + R(4); pebble(g, Math.max(0,x)+1, y+1, Math.min(w,16-x)-1, h-1, shadeHex(base, R(16)-8)); x += w; } }
  };
  switch(id){
    case 1: {   // tanah: gradasi, gumpalan, kerikil, akar kecil
      for (let y=0;y<16;y++) px(g,0,y,shadeHex(P[0], -y*1.2),16,1);
      for (let i=0;i<6;i++){ const x=R(13), y=R(13); px(g,x,y,P[1],3,2); px(g,x,y,shadeHex(P[1],-15),1,1); px(g,x+1,y+2,P[2],2,1); }
      for (let i=0;i<4;i++){ const x=R(14), y=R(14); px(g,x,y,'#8a8f9a',2,2); px(g,x,y,'#c7ccd6',1,1); px(g,x+1,y+1,'#555a66',1,1); }
      if (v % 2) { const x = 2 + R(10); px(g,x,0,'#6e4a24',1,3); px(g,x+1,3,'#6e4a24',1,2); }
      speck(14,[P[1],P[2],shadeHex(P[0],-30)]);
      bevel(g,P); break; }
    case 2: cobble(P[0]); speck(4,[P[2]]); break;
    case 42: cobble(P[0]); break;
    case 12: case 13: case 14: {    // bijih: batu + nugget berkilau
      cobble('#8893a6');
      const gc = P[2], spots = [[3+R(2),3+R(2),1],[9+R(3),2+R(2),0],[5+R(3),9+R(2),1],[11+R(2),10+R(2),0],[2+R(2),12,0]];
      for (const [x,y,big] of spots) gemNugget(g,x,y,gc,big);
      px(g,R(14),R(14),'#ffffff',1,1);                            // kilau
      break; }
    case 3: case 41: {   // kayu papan: urat, sambungan, paku
      const rows = id === 41 ? [[2,5]] : [[0,5],[5,5],[10,6]];
      if (id === 41){ px(g,0,0,'rgba(0,0,0,0)',16,16); g.clearRect(0,0,16,16); }
      for (const [y,h] of rows){
        px(g,0,y,P[0],16,h);
        for (let k=0;k<3;k++) px(g,R(16),y+1+R(Math.max(1,h-2)),shadeHex(P[0],-24),3+R(5),1);   // urat
        px(g,0,y,P[2],16,1); px(g,0,y+h-1,P[1],16,1);
        const j = 3 + R(10); px(g,j,y,P[1],1,h);                   // sambungan papan
        px(g,j-2,y+1,'#3a2a1a',1,1); px(g,j+2,y+h-2,'#3a2a1a',1,1); // paku
      }
      if (id === 41){ px(g,2,7,P[1],2,6); px(g,12,7,P[1],2,6); px(g,2,7,P[2],1,6); px(g,12,7,P[2],1,6); }
      break; }
    case 17: {   // papan gelap
      for (const [y,h] of [[0,8],[8,8]]){
        px(g,0,y,P[0],16,h);
        for (let k=0;k<4;k++) px(g,R(16),y+1+R(h-2),shadeHex(P[0],-14),2+R(6),1);
        px(g,0,y,P[2],16,1); px(g,0,y+h-1,P[1],16,1); const j = 4 + R(8); px(g,j,y,P[1],1,h);
      }
      break; }
    case 4: {    // daun: kelompok daun dengan highlight
      px(g,0,0,P[1],16,16);
      for (let i=0;i<14;i++){ const x=R(14), y=R(14);
        px(g,x,y,P[0],3,3); px(g,x,y,P[2],2,1); px(g,x,y+2,shadeHex(P[1],-10),3,1); }
      speck(5,['#b8f59a']); bevel(g,P); break; }
    case 10: {   // lumut
      cobble('#7b8494');
      for (let x=0;x<16;x++){ const d = 2 + R(4); px(g,x,0,P[2],1,d); px(g,x,d,P[0],1,1); }
      for (let i=0;i<5;i++){ const x=R(14), y=4+R(10); px(g,x,y,P[2],2,1); px(g,x,y+1,P[0],2,1); }
      break; }
    case 5: {    // kaca: bingkai + pantulan diagonal
      px(g,0,0,P[0],16,16);
      px(g,0,0,P[1],16,1); px(g,0,15,P[1],16,1); px(g,0,0,P[1],1,16); px(g,15,0,P[1],1,16);
      px(g,1,1,P[2],14,1); px(g,1,1,P[2],1,14);
      for (let i=0;i<6;i++){ px(g,3+i,10-i,P[2],2,1); }
      for (let i=0;i<3;i++){ px(g,9+i,13-i,'#ffffff',1,1); }
      break; }
    case 6: {    // lampu
      px(g,0,0,P[1],16,16); px(g,2,2,'#c99a3c',12,12);
      px(g,3,3,P[0],10,10); px(g,4,4,'#fff3a0',8,8); px(g,5,4,'#ffffff',3,2);
      px(g,2,7,P[1],12,1); px(g,7,2,P[1],1,12);
      bevel(g,['#c99a3c','#5e3f18','#ffe9a0']); break; }
    case 7: {    // bedrock
      px(g,0,0,P[1],16,16);
      for (let i=0;i<8;i++){ const x=R(13), y=R(13), w=2+R(3), h=2+R(3); pebble(g,x,y,w,h,shadeHex(P[0],R(12))); }
      break; }
    case 9: {    // bata
      px(g,0,0,'#d9c3ae',16,16);
      for (let row=0;row<4;row++){ const off = (row%2) ? 4 : 0;
        for (let b=-1;b<3;b++){ const x = b*8 + off + 1, y = row*4 + 1, base = shadeHex(P[0], R(18)-9);
          if (x > 15 || x + 7 < 0) continue;
          px(g,Math.max(0,x),y,base,Math.min(7,16-Math.max(0,x)),3);
          px(g,Math.max(0,x),y,shadeHex(base,30),Math.min(7,16-Math.max(0,x)),1);
          px(g,Math.max(0,x),y+2,shadeHex(base,-30),Math.min(7,16-Math.max(0,x)),1); } }
      break; }
    case 11: {   // kristal
      px(g,0,0,'#3a1f63',16,16);
      for (const [x,b,tx,ty] of [[3,15,4,3],[8,15,8,1],[12,15,13,5]]){
        g.fillStyle = P[0]; g.beginPath(); g.moveTo(x-3,b); g.lineTo(tx,ty); g.lineTo(x+3,b); g.closePath(); g.fill();
        g.fillStyle = P[2]; g.beginPath(); g.moveTo(x-1,b); g.lineTo(tx,ty); g.lineTo(x,b); g.closePath(); g.fill();
        px(g,tx,ty+1,'#ffffff',1,2);
      }
      break; }
    case 16: {   // pasir: butiran + gelombang
      for (let y=0;y<16;y++) px(g,0,y,shadeHex(P[0], -y),16,1);
      speck(60,[P[1],P[2],shadeHex(P[0],-14)]);
      for (let k=0;k<3;k++){ const y = 3 + k*5 + R(2); for (let x=0;x<16;x++) if ((x + k*3) % 6 < 3) px(g,x,y,P[2],1,1); }
      bevel(g,P); break; }
    case 18: {   // salju
      px(g,0,0,P[0],16,16); speck(30,[P[2],'#eef6ff']);
      for (let i=0;i<4;i++){ const x=R(14), y=R(14); px(g,x,y,'#b4c4d8',2,1); }
      bevel(g,P); break; }
    case 15: {   // lava padat: retakan menyala
      px(g,0,0,'#5a1a08',16,16);
      for (let i=0;i<7;i++){ const x=R(13), y=R(13); pebble(g,x,y,3+R(3),2+R(3),'#7a2a10'); }
      for (let k=0;k<4;k++){ let x = R(16), y = R(16);
        for (let st=0;st<7;st++){ px(g,x,y,P[0],1,1); px(g,x,y,st%2?P[2]:P[0],1,1); x += R(3)-1; y += 1; if (y > 15) break; } }
      speck(6,['#ffe9a0']);
      break; }
    case 20: {   // papan tulis
      px(g,7,10,P[1],2,6); px(g,0,0,'rgba(0,0,0,0)',1,1);
      px(g,1,1,P[1],14,10); px(g,2,2,P[2],12,8); px(g,2,2,'#fffaf0',12,1);
      for (let y=4;y<9;y+=2) px(g,3+R(2),y,'#8a7b5c',7+R(3),1);
      break; }
    case 21: {   // pintu
      px(g,0,0,P[1],16,16); px(g,2,1,P[0],12,15);
      px(g,2,1,P[2],12,1); px(g,2,1,P[2],1,15);
      px(g,4,3,shadeHex(P[0],-18),8,5); px(g,4,9,shadeHex(P[0],-18),8,5);
      px(g,4,3,shadeHex(P[0],20),8,1); px(g,4,9,shadeHex(P[0],20),8,1);
      px(g,11,8,'#ffd23d',2,2); px(g,11,8,'#fff8c8',1,1);
      break; }
    case 22: {   // kotak pajang
      px(g,0,0,P[1],16,16); px(g,1,1,P[0],14,14); px(g,3,3,'#141824',10,10);
      px(g,3,3,'#5a6680',10,1); px(g,4,4,'#ffffff22',3,3);
      bevel(g,P); break; }
    case 23: {   // pintu utama
      px(g,0,0,'#1a1420',16,16); px(g,2,0,P[1],12,16); px(g,3,1,P[0],10,15);
      px(g,3,1,P[2],10,1); px(g,4,3,shadeHex(P[0],-18),8,5); px(g,4,10,shadeHex(P[0],-18),8,5);
      px(g,10,9,'#ffd23d',2,2);
      break; }
    case 30: case 31: case 32: case 33: {   // lock: badan + gembok
      px(g,0,0,P[1],16,16); px(g,1,1,P[0],14,14); bevel(g,P,1);
      px(g,5,2,P[1],6,6); px(g,6,3,'#00000000',4,4); g.clearRect(6,3,4,4); px(g,6,3,P[0],4,4); px(g,7,4,P[1],2,4);
      px(g,4,7,P[1],8,7); px(g,5,8,P[2],6,5); px(g,7,9,P[1],2,3);
      if (id === 30){ for (const [x,y] of [[2,2],[13,2],[2,13],[13,13]]) px(g,x,y,'#ffffff',1,1); }
      if (id === 33){ px(g,3,3,P[2],1,1); px(g,12,3,P[2],1,1); }
      break; }
    case 50: {   // semak permata: daun rimbun + permata kecil
      px(g,0,0,P[1],16,16);
      for (let i=0;i<14;i++){ const x=R(14), y=R(14); px(g,x,y,P[0],3,3); px(g,x,y,P[2],2,1); }
      for (const [x,y] of [[3,4],[10,3],[6,10],[12,11]]){ px(g,x-1,y-1,'#17121c',4,4); px(g,x,y,'#5ee0f0',2,2); px(g,x,y,'#ffffff',1,1); }
      bevel(g,P); break; }
    case 51: {   // jamur kristal
      px(g,0,0,'#2a2440',16,16);
      for (const [x,b,h] of [[4,15,9],[10,15,12],[13,15,6]]){
        px(g,x-1,b-h,P[1],3,h); px(g,x,b-h,P[2],1,h);
        px(g,x-3,b-h-3,'#17121c',7,4); px(g,x-2,b-h-2,P[0],5,2); px(g,x-1,b-h-2,P[2],2,1); }
      speck(5,['#b8e8ff']); break; }
    case 52: {   // batu bara api
      px(g,0,0,P[0],16,16);
      for (let i=0;i<7;i++){ const x=R(13), y=R(13); pebble(g,x,y,3+R(3),2+R(3),shadeHex(P[0],R(20))); }
      for (let k=0;k<5;k++){ const x=R(14), y=R(14); px(g,x,y,'#ff7a2a',2,1); px(g,x,y,'#ffd45e',1,1); }
      break; }
    case 53: {   // lentera emas
      px(g,0,0,'#3a2a18',16,16); px(g,4,1,P[1],8,2); px(g,3,3,P[1],10,11); px(g,4,4,P[0],8,9);
      px(g,5,5,'#fff3a0',6,7); px(g,6,6,'#ffffff',2,3); px(g,3,8,P[1],10,1); px(g,7,14,P[1],2,2);
      break; }
    case 54: {   // bunga pelangi
      px(g,0,0,'#2f8a3a',16,16);
      for (let i=0;i<8;i++){ const x=R(14), y=R(14); px(g,x,y,'#3fa84a',3,2); }
      const cols = ['#ff5a5a','#ffb03a','#ffe85a','#5ad87a','#5aa8ff','#b07ce8'];
      for (let k=0;k<6;k++){ const x = 1 + (k%3)*5 + R(2), y = 1 + ((k/3)|0)*7 + R(2);
        px(g,x,y+1,cols[k],3,1); px(g,x+1,y,cols[k],1,3); px(g,x+1,y+1,'#fff6c8',1,1); }
      break; }
    case 40: {   // dinding gua
      cobble('#5a4a3a'); px(g,0,0,'#00000044',16,16);
      break; }
  }
  return c;
}
// 4 varian tiap block, dipilih per tile dari hash posisi supaya tidak berulang
const TEXV = {};
for (const id in BY_ID) if (+id && +id !== 8){ TEXV[+id] = []; for (let v=0; v<TEXVAR; v++) TEXV[+id].push(makeTex(+id, v)); }
const TEX = {}; for (const id in TEXV) TEX[id] = TEXV[id][0];
function tileHash(x,y){ let h = (x*73856093) ^ (y*19349663); h = (h ^ (h >>> 13)) * 1274126177; return (h >>> 0) % TEXVAR; }
function texAt(id, x, y){ const v = TEXV[id]; return v ? v[tileHash(x,y)] : TEX[id]; }

// rumput ala Growtopia: bilah tebal, ujung terang, bayangan di bawah
const GRASSV = [0,1,2,3].map(v => { const c=newCanvas(16), g=c.getContext('2d'), r=rng(77+v*31);
  for (let x=0;x<16;x++){
    const d = 3 + (r()<.4?1:0) + (r()<.2?2:0);
    px(g,x,0,'#3f9a2c',1,d+1); px(g,x,0,'#6fd34a',1,d); px(g,x,0,'#a8f07a',1,1); px(g,x,d+1,'#2a6a1c',1,1);
  }
  for (let i=0;i<2;i++){ const x = (r()*13)|0; px(g,x,0,'#c9ff9a',1,1); }
  if (r() < .5){ const x = 2 + ((r()*11)|0); px(g,x,0,'#ff6a8a',2,1); px(g,x,1,'#ffd23d',1,1); }   // bunga kecil
  return c; });
const GRASS = GRASSV[0];
const SNOWCAP = (()=>{ const c=newCanvas(16), g=c.getContext('2d'), r=rng(91);
  for (let x=0;x<16;x++){ const d=2+(r()<.4?2:0); px(g,x,0,'#ffffff',1,d); px(g,x,d,'#c7ced9'); } return c; })();
