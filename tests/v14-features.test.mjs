// Tes otomatis TileGrow v1.4: give item/gems (Developer), Crystal Lock, Dadu/Roulette dari server, gems farmable, harga World Lock.
// Jalankan: node tests/run-v13.mjs v14
const PORT = process.env.TPORT || 8096, U = 'ws://127.0.0.1:' + PORT + '/ws';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const open = () => new Promise(r => { const w = new WebSocket(U); w.q = []; w.onmessage = e => w.q.push(JSON.parse(e.data)); w.onopen = () => r(w); });
const wait = (w, t, ms = 2500, pred) => new Promise(res => { const s = Date.now(); const i = setInterval(() => {
  const k = w.q.findIndex(m => m.t === t && (!pred || pred(m))); if (k >= 0){ clearInterval(i); res(w.q.splice(k, 1)[0]); } else if (Date.now() - s > ms){ clearInterval(i); res(null); } }, 10); });
const S = (w, o) => w.send(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastEcon = async (w, ms = 700) => { let e = null, x; while ((x = await wait(w, 'econ', ms))) e = x; return e; };
const drain = w => { w.q.length = 0; };
const cnt = (e, k) => { const s = e && e.bag.find(s => s.key === k); return s ? s.n : 0; };
const consoleCmd = line => globalThis.__serverStdin.write(line + '\n');
const staffMsg = async (w, ms = 900) => { const m = await wait(w, 'staff', ms); return m ? m.text : (await wait(w, 'note', 300) || {}).text || ''; };

const N = 6000, COLS = 100, fgArr = Array(N).fill(0);
for (let i = 3000; i < N; i++) fgArr[i] = 1; for (let i = 5800; i < N; i++) fgArr[i] = 7; fgArr[2950] = 23; fgArr[3050] = 7;
const world = {fg: fgArr, bgw: Array(N).fill(0), trees: [], meta: [], spawn: {x: 50, y: 29}};
const at = (x, y) => y * COLS + x;
const posAt = (w, tx, ty) => S(w, {t: 'pos', s: {x: tx * 32 + 3, y: ty * 32 + 2, vx: 0, vy: 0, f: 1, g: true, held: 'fist', worn: {}}});
const reg = async (name) => { const w = await open(); S(w, {t: 'register', user: name, pass: 'secret12', flag: 'ID'}); const a = await wait(w, 'auth'); return [w, a]; };

const [dev] = await reg('devi'); const [mod] = await reg('modo'); const [p1] = await reg('pemain');
consoleCmd('role devi dev'); consoleCmd('role modo mod'); await sleep(400); drain(dev); drain(mod);
for (const w of [dev, mod, p1]){ S(w, {t: 'join', name: 'V14', world}); await wait(w, 'world'); }
posAt(dev, 50, 29); posAt(p1, 49, 29); await sleep(150); drain(dev); drain(mod); drain(p1);

// ---------- 1. /give (khusus Developer) ----------
S(dev, {t: 'chat', text: '/give gems pemain 5000'}); let t = await staffMsg(dev);
let e = await lastEcon(p1); ok('/give gems: pemain menerima 5000 gems', e && e.gems === 5050, 'gems ' + (e && e.gems) + ' · ' + t);
ok('/give gems: pemain dapat pesan', e && e.msgs.some(m => /memberimu 5\.000 gems/.test(m[1])));
S(dev, {t: 'chat', text: '/give item pemain b30 3'}); t = await staffMsg(dev); e = await lastEcon(p1);
ok('/give item dengan kode (b30 x3)', cnt(e, 'b30') === 3, t);
S(dev, {t: 'chat', text: '/give item pemain Devil Wings'}); t = await staffMsg(dev); e = await lastEcon(p1);
ok('/give item dengan nama (Devil Wings)', cnt(e, 'w_devil') === 1, t);
S(dev, {t: 'chat', text: '/give item pemain Roda Roulette 2'}); t = await staffMsg(dev); e = await lastEcon(p1);
ok('/give item nama + jumlah (Roda Roulette 2)', cnt(e, 'b61') === 2, t);
S(dev, {t: 'chat', text: '/give item pemain barangpalsu 1'}); t = await staffMsg(dev);
ok('/give item tidak dikenal ditolak', /tidak ditemukan/.test(t), t);
S(dev, {t: 'chat', text: '/give gems pemain 99999999'}); t = await staffMsg(dev);
ok('/give gems di atas batas ditolak', /1–1\.000\.000/.test(t), t);
S(dev, {t: 'chat', text: '/give gems hantu 10'}); t = await staffMsg(dev);
ok('/give ke akun yang tidak ada ditolak', /tidak ditemukan/.test(t), t);
S(dev, {t: 'chat', text: '/give item devi b2 7'}); t = await staffMsg(dev); e = await lastEcon(dev);
ok('Developer boleh give ke diri sendiri', cnt(e, 'b2') === 17, t);
drain(mod); S(mod, {t: 'chat', text: '/give gems modo 1000'}); t = await staffMsg(mod);
ok('Moderator tidak bisa /give', /khusus Developer/.test(t), t);
drain(p1); S(p1, {t: 'chat', text: '/give gems pemain 1000'}); let nt = await wait(p1, 'note', 800);
ok('Player biasa: /give "tidak dikenal"', nt && /tidak dikenal/.test(nt.text), nt && nt.text);
e = await lastEcon(p1, 300); ok('Player tidak dapat gems dari /give sendiri', !e || e.gems === 5050);
S(dev, {t: 'chat', text: '/items lock'}); t = await staffMsg(dev);
ok('/items mencari kode item', /b30 = World Lock/.test(t) && /b34 = Crystal Lock/.test(t), t.slice(0, 120));

// ---------- 2. harga World Lock + Crystal Lock ----------
drain(p1); S(p1, {t: 'buy', key: 'b30'}); e = await lastEcon(p1);
ok('World Lock seharga 1.800 gems', e && e.gems === 5050 - 1800 && cnt(e, 'b30') === 4, 'gems ' + (e && e.gems));
S(p1, {t: 'lockConvert', key: 'b30'}); nt = await wait(p1, 'note', 800);
ok('Gabung < 100 World Lock ditolak', nt && /Butuh 100 World Lock/.test(nt.text), nt && nt.text);
S(dev, {t: 'chat', text: '/give item pemain b30 96'}); await staffMsg(dev); await lastEcon(p1);
S(p1, {t: 'lockConvert', key: 'b30'}); e = await lastEcon(p1);
ok('100 World Lock → 1 Crystal Lock', e && cnt(e, 'b30') === 0 && cnt(e, 'b34') === 1, 'wl ' + cnt(e, 'b30') + ' cl ' + cnt(e, 'b34'));
S(p1, {t: 'lockConvert', key: 'b34'}); e = await lastEcon(p1);
ok('1 Crystal Lock → 100 World Lock', e && cnt(e, 'b30') === 100 && cnt(e, 'b34') === 0);
S(p1, {t: 'lockConvert', key: 'b30'}); e = await lastEcon(p1);
// Crystal Lock bisa dipasang sebagai lock world
drain(p1); S(p1, {t: 'act', a: 'place', i: at(48, 29), key: 'b34'}); let op = await wait(p1, 'ops', 900, m => m.ops && m.ops.some(o => o[0] === at(48, 29)));
const o = op && op.ops.find(o => o[0] === at(48, 29));
ok('Crystal Lock bisa dipasang & mengunci world', o && o[1] === 34 && o[3] && o[3].lock && o[3].lock.type === 'world' && o[3].lock.owner === 'pemain', JSON.stringify(o && o[3]));
drain(dev); S(dev, {t: 'act', a: 'place', i: at(51, 29), key: 'b2'}); let dn = await wait(dev, 'ops', 900, m => m.denied);
ok('World dengan Crystal Lock: orang lain tidak bisa membangun', !!dn);

// ---------- 3. Dadu & Roulette: hasil dari server, terlihat semua pemain ----------
S(dev, {t: 'chat', text: '/give item pemain b60 1'}); await staffMsg(dev); await lastEcon(p1);
drain(p1); S(p1, {t: 'act', a: 'place', i: at(47, 29), key: 'b60'}); await lastEcon(p1);
drain(p1); drain(dev);
S(dev, {t: 'act', a: 'hit', i: at(47, 29)});            // dev TIDAK punya akses (world dikunci pemain) — melempar dadu tetap boleh
const r1 = await wait(dev, 'roll', 900), r1b = await wait(p1, 'roll', 900);
ok('Dadu: siapa pun boleh melempar, semua pemain melihat hasil yang sama', r1 && r1b && r1.v === r1b.v && r1.kind === 'dice' && r1.v >= 1 && r1.v <= 6, JSON.stringify(r1));
S(dev, {t: 'act', a: 'hit', i: at(47, 29)}); dn = await wait(dev, 'ops', 900, m => m.denied);
ok('Pukul lagi saat masih berputar = merusak (tanpa akses ditolak)', !!dn && !(await wait(dev, 'roll', 200)));
const vals = new Set(); let maxR = 0;
for (let k = 0; k < 4; k++){ await sleep(1450); S(p1, {t: 'act', a: 'hit', i: at(47, 29)}); const r = await wait(p1, 'roll', 900); if (r){ vals.add(r.v); maxR = Math.max(maxR, r.v); } }
ok('Dadu bisa dilempar lagi setelah 1,4 detik (hasil 1–6)', vals.size >= 1 && maxR <= 6, [...vals].join(','));
S(dev, {t: 'chat', text: '/give item pemain b61 1'}); await staffMsg(dev); await lastEcon(p1);
S(p1, {t: 'act', a: 'place', i: at(46, 29), key: 'b61'}); await lastEcon(p1); drain(p1);
S(p1, {t: 'act', a: 'hit', i: at(46, 29)}); const rr = await wait(p1, 'roll', 900);
ok('Roulette: hasil 0–36 dari server', rr && rr.kind === 'roulette' && rr.v >= 0 && rr.v <= 36, JSON.stringify(rr));
ok('Hasil roll menyebut nama pelempar', rr && rr.by === 'pemain');
// pemilik: pukul cepat berkali-kali = pecah, Dadu kembali ke tas
for (let k = 0; k < 6; k++){ S(p1, {t: 'act', a: 'hit', i: at(47, 29)}); await sleep(140); }
op = await wait(p1, 'ops', 900, m => m.ops && m.ops.some(o => o[0] === at(47, 29) && o[1] === 0));
ok('Pemilik bisa memecah Dadu (pukul beruntun)', !!op);

// ---------- 4. gems farmable 50–1000 ----------
const farmTest = async (id, lo, hi) => {
  S(dev, {t: 'chat', text: '/give item devi b' + id + ' 1'}); await staffMsg(dev); await lastEcon(dev);
  S(dev, {t: 'join', name: 'FARM' + id, world}); await wait(dev, 'world'); posAt(dev, 50, 29); await sleep(120); drain(dev);
  S(dev, {t: 'act', a: 'place', i: at(51, 29), key: 'b' + id}); await lastEcon(dev); drain(dev);
  for (let k = 0; k < 9; k++){ S(dev, {t: 'act', a: 'hit', i: at(51, 29)}); await sleep(140); }
  let g = 0, x; while ((x = await wait(dev, 'dropAdd', 500))) if (x.d.key === 'gem') g += x.d.n;
  return g;
};
const g50 = await farmTest(50, 50, 150), g54 = await farmTest(54, 500, 1000);
ok('Semak Permata dipecah: 50–150 gems', g50 >= 50 && g50 <= 150, g50 + ' gems');
ok('Bunga Pelangi dipecah: 500–1000 gems', g54 >= 500 && g54 <= 1000, g54 + ' gems');


// ---------- 5. Vending Machine ----------
for (const w of [dev, p1]){ S(w, {t: 'join', name: 'PASAR14', world}); await wait(w, 'world'); }
posAt(p1, 50, 29); posAt(dev, 49, 29); await sleep(150);
S(dev, {t: 'chat', text: '/give item pemain b62 1'}); await staffMsg(dev);
S(dev, {t: 'chat', text: '/give item pemain b9 30'}); await staffMsg(dev); await lastEcon(p1);
S(dev, {t: 'chat', text: '/give gems devi 2000'}); await staffMsg(dev); let ed = await lastEcon(dev); const devG0 = ed.gems;
const VI = at(51, 29);
drain(p1); S(p1, {t: 'act', a: 'place', i: VI, key: 'b62'}); await lastEcon(p1);
op = await wait(p1, 'ops', 900, m => m.ops && m.ops.some(o => o[0] === VI)) || {ops: []};
const vm0 = (op.ops.find(o => o[0] === VI) || [])[3];
ok('Vending Machine terpasang, pemilik tercatat', vm0 && vm0.vend && vm0.vend.owner === 'pemain' && vm0.vend.n === 0, JSON.stringify(vm0));
const vend = (w, o) => S(w, {t: 'vend', i: VI, ...o});
const vstate = async w => { const m = await wait(w, 'ops', 900, m => m.ops && m.ops.some(o => o[0] === VI)); return m && (m.denied ? {denied: m.why || 'ditolak'} : m.ops.find(o => o[0] === VI)[3].vend); };
drain(p1); vend(p1, {op: 'stock', key: 'b9', n: 20}); let vs = await vstate(p1); e = await lastEcon(p1);
ok('Pemilik isi stok 20 (tas berkurang)', vs && vs.key === 'b9' && vs.n === 20 && cnt(e, 'b9') === 10, JSON.stringify(vs));
drain(p1); vend(p1, {op: 'price', price: 30}); vs = await vstate(p1);
ok('Pemilik pasang harga 30', vs && vs.price === 30);
drain(dev); vend(dev, {op: 'price', price: 1}); vs = await vstate(dev);
ok('Orang lain tidak bisa ubah harga', vs && vs.denied && /Hanya pemilik/.test(vs.denied), JSON.stringify(vs));
drain(dev); vend(dev, {op: 'take'}); vs = await vstate(dev);
ok('Orang lain tidak bisa ambil stok', vs && vs.denied);
drain(dev); vend(dev, {op: 'buy', n: 5, key: 'b9', price: 30}); vs = await vstate(dev); ed = await lastEcon(dev);
ok('Pembeli beli 5: gems -150, item masuk', vs && vs.n === 15 && vs.earned === 150 && ed.gems === devG0 - 150 && cnt(ed, 'b9') === 5, JSON.stringify(vs) + ' gems ' + (ed && ed.gems));
nt = await wait(p1, 'note', 900); ok('Penjual dapat notifikasi pembelian', nt && /membeli 5/.test(nt.text), nt && nt.text);
drain(dev); vend(dev, {op: 'buy', n: 1, key: 'b9', price: 1}); vs = await vstate(dev);
ok('Beli dengan harga palsu ditolak', vs && vs.denied && /diganti/.test(vs.denied));
drain(dev); vend(dev, {op: 'buy', n: 99, key: 'b9', price: 30}); vs = await vstate(dev);
ok('Beli melebihi stok ditolak', vs && vs.denied);
drain(dev); vend(dev, {op: 'buy', n: 2.5, key: 'b9', price: 30}); vs = await vstate(dev);
ok('Jumlah pecahan ditolak', vs && vs.denied);
drain(dev); vend(dev, {op: 'buy', n: -3, key: 'b9', price: 30}); vs = await vstate(dev);
ok('Jumlah negatif ditolak', vs && vs.denied);
S(dev, {t: 'chat', text: '/give gems devi 1'}); await staffMsg(dev); ed = await lastEcon(dev);
// habiskan gems dev supaya tidak cukup: harga 30 x 15 = 450, gems dev masih banyak -> pasang harga tinggi
drain(p1); vend(p1, {op: 'price', price: 100000}); await vstate(p1);
drain(dev); vend(dev, {op: 'buy', n: 15, key: 'b9', price: 100000}); vs = await vstate(dev);
ok('Gems tidak cukup ditolak', vs && vs.denied && /tidak cukup/.test(vs.denied), JSON.stringify(vs));
drain(dev); S(dev, {t: 'act', a: 'meta', i: VI, meta: {vend: {owner: 'devi', key: 'b9', n: 200, price: 1, earned: 99999}}}); vs = await vstate(dev);
ok('Edit meta mesin langsung ditolak (anti curang)', vs && vs.denied);
drain(dev); S(dev, {t: 'act', a: 'hit', i: VI}); vs = await vstate(dev);
ok('Mesin berisi tidak bisa dipecah orang lain', vs && vs.denied);
drain(p1); vend(p1, {op: 'collect'}); vs = await vstate(p1); e = await lastEcon(p1); const pg = e.gems;
ok('Pemilik ambil kas 150 gems', vs && vs.earned === 0 && e.msgs.some(x => /150 gems hasil/.test(x[1])), 'gems ' + pg);
drain(p1); vend(p1, {op: 'take'}); vs = await vstate(p1); e = await lastEcon(p1);
ok('Pemilik ambil sisa stok 15', vs && vs.n === 0 && vs.key === null && cnt(e, 'b9') === 25, JSON.stringify(vs) + ' b9=' + cnt(e, 'b9'));
drain(p1); vend(p1, {op: 'stock', key: 'w_devil', n: 5}); vs = await vstate(p1);
ok('Isi stok melebihi yang dimiliki ditolak', vs && vs.denied);
drain(p1); for (let k = 0; k < 7; k++){ S(p1, {t: 'act', a: 'hit', i: VI}); await sleep(140); }
op = await wait(p1, 'ops', 900, m => !m.denied && m.ops && m.ops.some(o => o[0] === VI && o[1] === 0));
const vd = await wait(p1, 'dropAdd', 900, m => m.d.key === 'b62');
ok('Mesin kosong bisa dipecah pemilik & mesinnya jatuh sebagai drop', !!op && !!vd);
// ---------- v1.5: House Entrance ----------
// world V14 dikunci 'pemain' (Crystal Lock). 'pemain' memasang entrance di (53,29); 'devi' (tanpa akses) tidak bisa masuk
S(dev, {t: 'join', name: 'V14', world}); await wait(dev, 'world'); S(p1, {t: 'join', name: 'V14', world}); await wait(p1, 'world');
drain(p1); S(p1, {t: 'buy', key: 'b24'}); e = await lastEcon(p1);
ok('House Entrance bisa dibeli di toko', cnt(e, 'b24') === 1);
posAt(p1, 55, 29); posAt(dev, 56, 29); await sleep(250);
drain(p1); S(p1, {t: 'act', a: 'place', i: at(53, 29), key: 'b24'});
op = await wait(p1, 'ops', 900, m => m.ops && m.ops.some(o => o[0] === at(53, 29)));
ok('House Entrance bisa dipasang pemilik lock', op && !op.denied && op.ops.find(o => o[0] === at(53, 29))[1] === 24, JSON.stringify(op));
drain(p1); posAt(p1, 54, 29); await sleep(150); posAt(p1, 53, 29); let tp = await wait(p1, 'tp', 600);
ok('Pemilik lock bisa masuk ke tile House Entrance', !tp, JSON.stringify(tp));
posAt(p1, 52, 29); await sleep(150); tp = await wait(p1, 'tp', 400);
ok('Pemilik lock bisa lewat ke sisi lain', !tp, JSON.stringify(tp));
drain(dev); posAt(dev, 55, 29); await sleep(150); posAt(dev, 54, 29); await sleep(150); posAt(dev, 53, 29); tp = await wait(dev, 'tp', 800);
ok('Pemain tanpa akses tertahan (server menolak posisi di dalam entrance)', tp && tp.fix, JSON.stringify(tp));
// beri 'devi' akses di Crystal Lock (48,29) -> sekarang boleh lewat
const LI = at(48, 29), lk = (await (async () => { drain(p1); S(p1, {t: 'join', name: 'V14', world}); const wm = await wait(p1, 'world'); return wm; })());
const lockMeta = lk && new Map(lk.data ? lk.data.meta : lk.meta || []).get(LI);
if (lockMeta){ lockMeta.lock.access = ['devi']; S(p1, {t: 'act', a: 'meta', i: LI, meta: lockMeta}); await sleep(300); }
posAt(p1, 55, 29); await sleep(150);
drain(dev); posAt(dev, 55, 29); await sleep(150); posAt(dev, 54, 29); await sleep(150); posAt(dev, 53, 29); tp = await wait(dev, 'tp', 700);
ok('Setelah diberi akses lock, pemain itu bisa lewat House Entrance', !!lockMeta && !tp, (lockMeta ? '' : 'meta lock tidak ditemukan ') + JSON.stringify(tp));
// ---------- v1.5: pesan pribadi /msg, /r, /ignore ----------
const [q1] = await reg('pmsatu'); const [q2] = await reg('pmdua');
S(q1, {t: 'join', name: 'PMA', world}); await wait(q1, 'world'); S(q2, {t: 'join', name: 'PMB', world}); await wait(q2, 'world');   // world berbeda
drain(q1); drain(q2); S(q1, {t: 'chat', text: '/msg pmdua halo rahasia'});
let pmIn = await wait(q2, 'pm', 800), pmOut = await wait(q1, 'pm', 800);
ok('/msg sampai ke pemain di world lain', pmIn && pmIn.dir === 'from' && pmIn.name === 'pmsatu' && pmIn.text === 'halo rahasia', JSON.stringify(pmIn));
ok('/msg: pengirim dapat salinan "ke"', pmOut && pmOut.dir === 'to' && pmOut.name === 'pmdua');
drain(q1); drain(dev); S(q2, {t: 'chat', text: '/r balasan'});
pmIn = await wait(q1, 'pm', 800);
ok('/r membalas ke pengirim terakhir', pmIn && pmIn.name === 'pmdua' && pmIn.text === 'balasan');
ok('/msg tidak bocor ke pemain lain', !(await wait(dev, 'pm', 300)));
drain(q1); S(q1, {t: 'chat', text: '/msg tidakada halo'}); let nn = await wait(q1, 'note', 600);
ok('/msg ke pemain offline/tidak ada -> pesan "tidak online"', nn && /tidak online/.test(nn.text));
ok('/msg ditolak tidak ikut memunculkan "Perintah tidak dikenal"', !(await wait(q1, 'note', 400, m => /tidak dikenal/.test(m.text))));
drain(q2); S(q2, {t: 'chat', text: '/ignore pmsatu'}); nn = await wait(q2, 'note', 600);
ok('/ignore NAMA berhasil', nn && /mengabaikan pmsatu/.test(nn.text));
drain(q1); drain(q2); S(q1, {t: 'chat', text: '/msg pmdua kamu dengar?'});
pmOut = await wait(q1, 'pm', 600); pmIn = await wait(q2, 'pm', 500);
ok('Pesan dari pemain yang di-ignore tidak sampai (pengirim tetap lihat terkirim)', pmOut && !pmIn);
drain(q2); S(q2, {t: 'chat', text: '/ignore pmsatu'}); await wait(q2, 'note', 600);
drain(q2); S(q1, {t: 'chat', text: '/msg pmdua sekarang?'}); pmIn = await wait(q2, 'pm', 700);
ok('/ignore lagi = membuka blokir, pesan sampai lagi', pmIn && pmIn.text === 'sekarang?');
drain(q1); for (let k = 0; k < 8; k++) S(q1, {t: 'chat', text: '/msg pmdua spam' + k}); await sleep(400);
nn = await wait(q1, 'note', 600, m => /Terlalu cepat/.test(m.text));
ok('/msg dibatasi (anti-spam)', !!nn);
// ---------- v1.6: /broadcast ----------
const [b1] = await reg('bcsatu'); const [b2] = await reg('bcdua');
S(b1, {t: 'join', name: 'BCA', world}); await wait(b1, 'world'); S(b2, {t: 'join', name: 'BCB', world}); await wait(b2, 'world');
drain(b1); S(b1, {t: 'chat', text: '/broadcast halo semua'}); nn = await wait(b1, 'note', 700);
ok('/broadcast ditolak kalau gems kurang', nn && /Gems tidak cukup/.test(nn.text) && /1\.000/.test(nn.text), nn && nn.text);
S(b1, {t: 'chat', text: '/testgive gem 9000'}); await lastEcon(b1);
drain(b1); drain(b2); drain(dev);
S(b1, {t: 'chat', text: '/broadcast jual World Lock murah di BCA'});
let bc2 = await wait(b2, 'bcast', 900), bcD = await wait(dev, 'bcast', 900), eB = await lastEcon(b1);
ok('/broadcast sampai ke pemain di world lain', bc2 && bc2.name === 'bcsatu' && bc2.text === 'jual World Lock murah di BCA' && bc2.world === 'BCA', JSON.stringify(bc2));
ok('/broadcast sampai ke semua pemain online', !!bcD);
ok('/broadcast memotong 1000 gems', eB && eB.gems === 8050, eB && eB.gems);
drain(b1); S(b1, {t: 'chat', text: '/broadcast lagi'}); nn = await wait(b1, 'note', 700);
ok('/broadcast ada jeda per pemain', nn && /Tunggu \d+ detik/.test(nn.text), nn && nn.text);
S(b2, {t: 'chat', text: '/testgive gem 9000'}); await lastEcon(b2);
drain(b2); S(b2, {t: 'chat', text: '/broadcast'}); nn = await wait(b2, 'note', 700);
ok('/broadcast tanpa pesan menampilkan harga sekarang (naik jadi 2.000)', nn && /2\.000/.test(nn.text), nn && nn.text);
drain(b2); S(b2, {t: 'chat', text: '/broadcast pesan kedua'}); eB = await lastEcon(b2);
ok('Harga broadcast naik +1000 bila ada broadcast lain dalam 10 menit', eB && eB.gems === 7050, eB && eB.gems);
drain(b2); S(b2, {t: 'chat', text: '/broadcast ' + 'x'.repeat(130)}); nn = await wait(b2, 'note', 700);
ok('/broadcast maks 120 huruf', nn && /120/.test(nn.text), nn && nn.text);

// ---------- v1.6: Kabar TileGrow (berita) ----------
drain(p1); S(p1, {t: 'newsGet'}); let nw = await wait(p1, 'news', 700);
ok('Berita bisa diminta pemain', nw && typeof nw.text === 'string' && nw.text.length > 0 && nw.canEdit === false);
drain(p1); S(p1, {t: 'newsSet', text: '# hack'}); nn = await wait(p1, 'note', 700);
ok('Pemain biasa tidak bisa mengedit berita', nn && /Hanya Developer/.test(nn.text));
drain(p1); drain(dev); S(dev, {t: 'newsSet', text: '# Event Panen\n## 3 Nov: Panen Raya\nDrop {gems} x2 di world [START].\n! Jangan scam.'});
nw = await wait(p1, 'news', 4000);
ok('Developer mengedit berita -> terkirim ke semua pemain', nw && /Panen Raya/.test(nw.text), JSON.stringify(nw));
// ---------- v1.7: emote ----------
const [e1] = await reg('emsatu'); const [e2] = await reg('emdua'); const [e3] = await reg('emtiga');
for (const w of [e1, e2]){ S(w, {t: 'join', name: 'EMO', world}); await wait(w, 'world'); }
S(e3, {t: 'join', name: 'EMOLAIN', world}); await wait(e3, 'world');
drain(e1); drain(e2); drain(e3); S(e1, {t: 'chat', text: '/wave'});
let em1 = await wait(e1, 'emote', 700), em2 = await wait(e2, 'emote', 700), em3 = await wait(e3, 'emote', 300);
ok('/wave sampai ke diri sendiri & pemain di world yang sama', em1 && em1.e === 'wave' && em2 && em2.e === 'wave' && em2.id === em1.id);
ok('emote tidak bocor ke world lain', !em3);
drain(e2); S(e1, {t: 'chat', text: '/joget'}); em2 = await wait(e2, 'emote', 700);
ok('alias Indonesia /joget = dance', em2 && em2.e === 'dance');
for (const x of ['cry', 'laugh', 'angry']) S(e1, {t: 'chat', text: '/' + x});
await sleep(150); drain(e1); S(e1, {t: 'chat', text: '/love'}); nn = await wait(e1, 'note', 700);
ok('emote dibatasi 5 per 10 detik', nn && /Terlalu cepat/.test(nn.text), nn && nn.text);
drain(e1); S(e1, {t: 'chat', text: '/emotes'}); nn = await wait(e1, 'note', 700);
ok('/emotes menampilkan daftar', nn && /\/wave/.test(nn.text) && /\/sleep/.test(nn.text));

// ---------- v1.7: Papan Catur ----------
const [c1] = await reg('catursatu'); const [c2] = await reg('caturdua'); const [c3] = await reg('caturtiga');
const CW = 'CATUR', ci = at(52, 28);
for (const w of [c1, c2, c3]){ S(w, {t: 'join', name: CW, world}); await wait(w, 'world'); }
posAt(c1, 51, 29); posAt(c2, 53, 29); posAt(c3, 50, 29); await sleep(150);
S(c1, {t: 'chat', text: '/testgive gem 250'}); await lastEcon(c1);
S(c1, {t: 'buy', key: 'b63'}); let ec = await lastEcon(c1);
ok('Papan Catur dijual di toko seharga 200 gems', ec && cnt(ec, 'b63') === 1 && ec.gems === 100, 'gems ' + (ec && ec.gems));
drain(c1); S(c1, {t: 'act', a: 'place', i: ci, key: 'b63'}); let opsC = await wait(c1, 'ops', 900);
const tbl = () => { const o = opsC && opsC.ops.find(o => o[0] === ci); return o && o[3] && o[3].chess; };
ok('Papan Catur terpasang dengan meja kosong', tbl() && tbl().w === null && tbl().g.b.startsWith('rnbqkbnr'), JSON.stringify(opsC && opsC.ops[0]).slice(0, 120));
const act = async (w, op, a = {}) => { drain(w); drain(c3); S(w, {t: 'chess', i: ci, op, ...a}); const o = await wait(c3, 'ops', 900, m => m.ops.some(x => x[0] === ci)); if (o) opsC = o; const n = await wait(w, 'note', 150); return n ? n.text : null; };
const sq = s => (8 - +s[1]) * 8 + 'abcdefgh'.indexOf(s[0]);
await act(c1, 'sit', {side: 'w'}); await act(c2, 'sit', {side: 'b'});
ok('Dua pemain duduk (putih & hitam)', tbl() && tbl().w === 'catursatu' && tbl().b === 'caturdua');
let r = await act(c3, 'sit', {side: 'w'});
ok('Kursi terisi tidak bisa direbut', /sudah dipakai/.test(r || ''), r);
r = await act(c2, 'move', {from: sq('e7'), to: sq('e5')});
ok('Hitam tidak boleh jalan duluan', /Bukan giliranmu/.test(r || ''), r);
r = await act(c1, 'move', {from: sq('e2'), to: sq('e5')});
ok('Langkah tidak sah ditolak server', /tidak sah/.test(r || ''), r);
r = await act(c3, 'move', {from: sq('e2'), to: sq('e4')});
ok('Penonton tidak bisa melangkah', /tidak duduk/.test(r || ''), r);
// skakmat cepat (fool's mate): 1. f3 e5 2. g4 Qh4#
for (const [w, f, t2] of [[c1, 'f2', 'f3'], [c2, 'e7', 'e5'], [c1, 'g2', 'g4'], [c2, 'd8', 'h4']]) await act(w, 'move', {from: sq(f), to: sq(t2)});
ok('Skakmat terdeteksi server (hitam menang)', tbl() && /Skakmat/.test(tbl().res || '') && /Hitam/.test(tbl().res), tbl() && tbl().res);
ok('Log langkah tercatat', tbl() && tbl().log.length === 4, tbl() && tbl().log.join(' '));
r = await act(c1, 'move', {from: sq('e2'), to: sq('e4')});
ok('Setelah selesai tidak bisa melangkah', /sudah selesai/.test(r || ''), r);
await act(c1, 'reset');
ok('Main lagi mengulang papan', tbl() && !tbl().res && tbl().log.length === 0 && tbl().g.b.startsWith('rnbqkbnr'));
// lawan bot
await act(c2, 'leave');
r = await act(c1, 'bot', {level: 2});
ok('Mulai lawan bot (Sedang)', tbl() && tbl().bot === 2 && tbl().b === null, r);
drain(c3); S(c1, {t: 'chess', i: ci, op: 'move', from: sq('e2'), to: sq('e4')});
let botOps = null; for (let k = 0; k < 6 && !(botOps && botOps.ops.find(o => o[0] === ci)[3].chess.log.length === 2); k++){ const o = await wait(c3, 'ops', 1500, m => m.ops.some(x => x[0] === ci)); if (o) botOps = o; }
const bt = botOps && botOps.ops.find(o => o[0] === ci)[3].chess;
ok('Bot membalas langkah (giliran kembali ke putih)', bt && bt.log.length === 2 && bt.g.t === 'w', bt && bt.log.join(' '));
// pecah papan saat main bot = ditolak
drain(c1); S(c1, {t: 'act', a: 'hit', i: ci}); let dnC = await wait(c1, "ops", 700, m => m.denied);
ok("Papan tidak bisa dipecah saat permainan berjalan", dnC && /sedang berjalan/.test(dnC.why || ""), dnC && dnC.why);
// meta palsu ditolak
drain(c1); S(c1, {t: 'act', a: 'meta', i: ci, meta: {chess: {w: "catursatu", b: null, bot: 0, g: {b: "K".repeat(64)}, last: null, res: null, log: []}}}); dnC = await wait(c1, 'ops', 700, m => m.denied);
ok("Meta catur palsu dari klien ditolak", !!dnC);
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
