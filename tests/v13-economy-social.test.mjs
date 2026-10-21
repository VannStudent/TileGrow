// Tes otomatis TileGrow v1.3: ekonomi di server, trade aman, teman, report, role & command staff, cek gerakan.
// Jalankan server dengan data kosong + mode tes:
//   TILEGROW_TEST=1 TILEGROW_CONSOLE=1 HOST=127.0.0.1 PORT=8096 DATA_DIR=<folder kosong> node server/server.js
//   node tests/v13-economy-social.test.mjs
const PORT = process.env.TPORT || 8096, U = 'ws://127.0.0.1:' + PORT + '/ws';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const open = () => new Promise(r => { const w = new WebSocket(U); w.q = []; w.onmessage = e => w.q.push(JSON.parse(e.data)); w.onopen = () => r(w); });
const wait = (w, t, ms = 2500, pred) => new Promise(res => { const s = Date.now(); const i = setInterval(() => {
  const k = w.q.findIndex(m => m.t === t && (!pred || pred(m))); if (k >= 0){ clearInterval(i); res(w.q.splice(k, 1)[0]); } else if (Date.now() - s > ms){ clearInterval(i); res(null); } }, 10); });
const S = (w, o) => w.send(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lastEcon = async (w, ms = 800) => { let e = null, x; while ((x = await wait(w, 'econ', ms))) e = x; return e; };
const drain = w => { w.q.length = 0; };

// world uji: tanah di y>=30, pintu utama di (50,29), bedrock di bawah
const N = 6000, COLS = 100, fgArr = Array(N).fill(0);
for (let i = 3000; i < N; i++) fgArr[i] = 1; for (let i = 5800; i < N; i++) fgArr[i] = 7; fgArr[2950] = 23; fgArr[3050] = 7;
const world = {fg: fgArr, bgw: Array(N).fill(0), trees: [], meta: [], spawn: {x: 50, y: 29}};
const at = (x, y) => y * COLS + x;
const posAt = (w, tx, ty) => S(w, {t: 'pos', s: {x: tx * 32 + 3, y: ty * 32 + 2, vx: 0, vy: 0, f: 1, g: true, held: 'fist', worn: {}}});

const reg = async (name) => { const w = await open(); S(w, {t: 'register', user: name, pass: 'secret12', flag: 'ID'}); const a = await wait(w, 'auth'); return [w, a]; };
const [a, aa] = await reg('alice'); const [b] = await reg('bob'); const [c] = await reg('carol'); const [d] = await reg('dave');
ok('register 4 akun', aa && aa.ok && aa.econ && aa.econ.gems === 50, 'gems awal ' + (aa && aa.econ && aa.econ.gems));
ok('econ awal dikirim server', aa.econ.bag.some(s => s.key === 'b1' && s.n === 10));

// ---------- 1. world baru dibuat server (bukan klien) ----------
S(a, {t: 'join', name: 'GEN'}); const wg = await wait(a, 'world');
ok('world baru dibuat server', wg && wg.data.fg.length === N && wg.data.fg.includes(23), 'pintu utama ada');

// ---------- 2. ekonomi: pasang, pecah, beli ----------
S(a, {t: 'join', name: 'TEST', world}); await wait(a, 'world'); drain(a);
posAt(a, 50, 29); await sleep(80);
S(a, {t: 'act', a: 'place', i: at(51, 29), key: 'b2'}); let ea = await lastEcon(a);
ok('pasang block mengurangi tas di server', ea && ea.bag.find(s => s.key === 'b2').n === 9);
S(a, {t: 'act', a: 'place', i: at(52, 28), key: 'b999'}); ok('pasang item palsu diabaikan', !(await wait(a, 'econ', 400)));
S(a, {t: 'act', a: 'place', i: at(52, 29), key: 'b30'}); let dn = await wait(a, 'ops', 800, m => m.denied);
ok('pasang World Lock tanpa punya ditolak', !!dn);
S(a, {t: 'act', a: 'place', i: at(58, 29), key: 'b3'}); dn = await wait(a, 'ops', 800, m => m.denied);
ok('pasang di luar jangkauan ditolak', dn && /jauh/i.test(dn.why || ''), dn && dn.why);
// pecah tanah 3 pukulan (dengan jeda > 120 ms)
drain(a);
for (let k = 0; k < 3; k++){ S(a, {t: 'act', a: 'hit', i: at(48, 30)}); await sleep(140); }
await sleep(250);
const brk = a.q.filter(m => m.t === 'ops' && m.ops.some(o => o[0] === at(48, 30) && o[1] === 0));
const ecs = a.q.filter(m => m.t === 'econ'); ea = ecs[ecs.length - 1];
ok('pecah block butuh 3 pukulan (server menghitung)', brk.length === 1 && ea && ea.prog.stats.broken === 1, 'broken ' + (ea && ea.prog.stats.broken) + ', ops ' + brk.length);
drain(a);
for (let k = 0; k < 6; k++) S(a, {t: 'act', a: 'hit', i: at(49, 30)});        // spam tanpa jeda
await sleep(300); ok('spam pukul cepat dibatasi', !(a.q.some(m => m.t === 'ops' && m.ops.some(o => o[0] === at(49, 30) && o[1] === 0))));
// beli
S(a, {t: 'buy', key: 'w_devil'}); let nt = await wait(a, 'note'); ok('beli tanpa gems cukup ditolak server', nt && /Gems/.test(nt.text));
S(a, {t: 'chat', text: '/testgive gem 5000'}); await lastEcon(a);
S(a, {t: 'buy', key: 'b30'}); ea = await lastEcon(a);
ok('beli World Lock: gems berkurang 1.800 (v1.4), lock masuk tas', ea && ea.gems === 5050 - 1800 && ea.bag.some(s => s.key === 'b30'), 'gems ' + (ea && ea.gems));

// ---------- 3. drop & pickup dibagi ----------
S(b, {t: 'join', name: 'TEST'}); await wait(b, 'world'); await wait(a, 'pjoin'); posAt(b, 52, 29); await sleep(80); drain(a); drain(b);
S(a, {t: 'drop', key: 'b1', n: 5}); const add = await wait(b, 'dropAdd');
ok('drop terlihat pemain lain', add && add.d.key === 'b1' && add.d.n === 5);
S(b, {t: 'pickup', id: add.d.id}); ok('drop belum bisa diambil sebelum 1,5 dtk', !(await wait(b, 'econ', 300)));
await sleep(1400); S(b, {t: 'pickup', id: add.d.id}); let eb = await lastEcon(b);
ok('bob ambil drop alice', eb && eb.bag.find(s => s.key === 'b1').n === 15);
drain(a); S(a, {t: 'pickup', id: add.d.id}); ok('drop yang sudah diambil tidak bisa diambil lagi', !(await wait(a, 'econ', 400)));

// ---------- 4. trade ----------
drain(a); drain(b);
S(a, {t: 'tradeReq', name: 'bob'}); const tr = await wait(b, 'tradeReq'); ok('permintaan trade sampai', tr && tr.from === 'alice');
S(b, {t: 'tradeAccept', name: 'alice'}); let ta = await wait(a, 'trade'), tb = await wait(b, 'trade');
ok('trade terbuka di kedua pihak', ta && tb && ta.with === 'bob');
S(a, {t: 'tradeOffer', items: [['b30', 1]], gems: 100}); await wait(b, 'trade');
S(b, {t: 'tradeOffer', items: [['b1', 99]], gems: 0}); nt = await wait(b, 'note'); ok('tawaran melebihi isi tas ditolak', nt && /tidak cukup/.test(nt.text));
S(b, {t: 'tradeOffer', items: [['b1', 10]], gems: 0}); await wait(a, 'trade');
S(a, {t: 'tradeOk', v: true}); S(b, {t: 'tradeOk', v: true}); await sleep(150); drain(a); drain(b);
S(a, {t: 'tradeOffer', items: [['b30', 1]], gems: 50}); ta = await wait(a, 'trade');
ok('ubah tawaran membatalkan Setuju kedua pihak', ta && !ta.ok.me && !ta.ok.them);
S(a, {t: 'tradeOk', v: true}); S(b, {t: 'tradeOk', v: true}); await sleep(150);
S(a, {t: 'tradeConfirm'}); await sleep(100);
// alice mencoba membuang lock sebelum bob konfirmasi
S(a, {t: 'drop', key: 'b30', n: 1}); nt = await wait(a, 'note'); ok('drop saat trade ditolak', nt && /trade/.test(nt.text));
S(b, {t: 'tradeConfirm'}); const te = await wait(a, 'tradeEnd'); ea = await lastEcon(a); eb = await lastEcon(b);
ok('trade dieksekusi server', te && te.why === 'ok');
ok('barang & gems berpindah tepat', ea && eb && !ea.bag.some(s => s.key === 'b30') && eb.bag.some(s => s.key === 'b30') && ea.bag.find(s => s.key === 'b1').n === 5 + 10 && eb.gems === 50 + 50,
   'alice b1=' + (ea && (ea.bag.find(s => s.key === 'b1') || {}).n) + ' bob gems=' + (eb && eb.gems));
// trade dengan pemain di world lain ditolak
S(c, {t: 'join', name: 'LAIN'}); await wait(c, 'world'); drain(a);
S(a, {t: 'tradeReq', name: 'carol'}); nt = await wait(a, 'note'); ok('trade beda world ditolak', nt && /world yang sama/.test(nt.text));

// ---------- 5. teman & report ----------
S(a, {t: 'friendReq', name: 'carol'}); const fr = await wait(c, 'friendReq'); ok('permintaan teman sampai (beda world)', fr && fr.from === 'alice');
S(c, {t: 'friendAccept', name: 'alice'}); const fa = await wait(a, 'friends', 1500, m => m.friends.length);
ok('jadi teman + status online & world terlihat', fa && fa.friends[0].name === 'carol' && fa.friends[0].online && fa.friends[0].world === 'LAIN');
await sleep(150); drain(a); S(a, {t: 'report', name: 'bob', reason: 'scam', note: 'tes'}); nt = await wait(a, 'note'); ok('report terkirim', nt && /Laporan terkirim/.test(nt.text));
drain(a); S(a, {t: 'report', name: 'bob', reason: 'scam'}); nt = await wait(a, 'note'); ok('report spam ditahan 10 menit', nt && /baru-baru ini/.test(nt.text));

// ---------- 6. role & command staff ----------
S(b, {t: 'chat', text: '/ban alice 1d'}); nt = await wait(b, 'note'); ok('player biasa tidak bisa /ban (command tersembunyi)', nt && /tidak dikenal/.test(nt.text));
// jadikan alice dev lewat console server (stdin)
process.stdout.write('');
const cons = globalThis.__serverStdin;
if (cons){ cons.write('role alice dev\n'); } else console.log('   (console server tidak tersedia di tes ini; role diberikan lewat file)');
const rl = await wait(a, 'role', 2000); ok('role dev dari console server', rl && rl.role === 'dev' && rl.display === '@alice');
S(a, {t: 'chat', text: '/setrole dave mod'}); let sf = await wait(a, 'staff'); ok('dev mengangkat mod', sf && /Moderator/.test(sf.text));
S(d, {t: 'join', name: 'TEST'}); await wait(d, 'world');
drain(d); S(d, {t: 'chat', text: '/setrole bob mod'}); sf = await wait(d, 'staff'); ok('mod tidak bisa /setrole', sf && /khusus Developer/.test(sf.text));
S(d, {t: 'chat', text: '/ban bob 30d'}); sf = await wait(d, 'staff'); ok('mod: ban > 7 hari ditolak', sf && /maksimal 7 hari/.test(sf.text));
S(d, {t: 'chat', text: '/ban alice 1d'}); sf = await wait(d, 'staff'); ok('mod tidak bisa ban dev', sf && /Tidak bisa menindak/.test(sf.text));
S(d, {t: 'chat', text: '/mute bob 10m spam'}); sf = await wait(d, 'staff'); ok('mod mute bob', sf && /di-mute/.test(sf.text));
drain(a); S(b, {t: 'chat', text: 'halo'}); nt = await wait(b, 'note'); const leak = await wait(a, 'chat', 300);
ok('bob yang di-mute tidak bisa chat', nt && /mute/.test(nt.text) && !leak);
S(d, {t: 'chat', text: '/freeze bob'}); const fz = await wait(b, 'frozen'); ok('freeze sampai ke bob', fz && fz.on);
drain(b); S(b, {t: 'pos', s: {x: 55 * 32, y: 29 * 32 + 2, vx: 0, vy: 0, f: 1, g: true, held: 'fist', worn: {}}}); const tp = await wait(b, 'tp');
ok('bob beku: gerakan dikembalikan server', tp && tp.fix);
S(d, {t: 'chat', text: '/unfreeze bob'}); await wait(b, 'frozen');
S(d, {t: 'chat', text: '/noclip'}); const fx = await wait(d, 'staffFx'); ok('mod bisa /noclip', fx && fx.noclip === true);
S(d, {t: 'chat', text: '/zoom'}); const fz2 = await wait(d, 'staffFx'); ok('mod bisa /zoom satu world', fz2 && fz2.zoom === true);
drain(d); S(d, {t: 'chat', text: '/reports'}); sf = await wait(d, 'staff', 2500, m => /REPORT|→|Tidak ada/.test(m.text) && !/^\[REPORT/.test(m.text)); ok('mod melihat report', sf && /alice → bob/.test(sf.text));
drain(d); S(d, {t: 'chat', text: '/ipban bob'}); sf = await wait(d, 'staff'); ok('ipban khusus dev', sf && /khusus Developer/.test(sf.text));
// display @ dan role terlihat pemain lain
drain(b); S(d, {t: 'chat', text: 'saya moderator'}); const ch = await wait(b, 'chat'); ok('chat mod tampil @dave + role', ch && ch.display === '@dave' && ch.role === 'mod');
// ban oleh mod + login ditolak
S(d, {t: 'chat', text: '/ban bob 1h grief'}); const kk = await wait(b, 'kicked'); ok('bob di-ban & di-kick', kk && /di-ban/.test(kk.reason));
const b2 = await open(); S(b2, {t: 'login', user: 'bob', pass: 'secret12'}); const la = await wait(b2, 'auth'); ok('login bob ditolak saat di-ban', la && !la.ok && /di-ban/.test(la.err));
S(a, {t: 'chat', text: '/unban bob'}); sf = await wait(a, 'staff'); ok('dev unban', sf && /tidak di-ban/.test(sf.text));
// IP ban oleh dev: IP lokal (PC server) dilindungi
S(a, {t: 'chat', text: '/ipban carol'}); sf = await wait(a, 'staff'); ok('ipban IP PC server sendiri dicegah', sf && /PC server sendiri/.test(sf.text));

// ---------- 7. cek gerakan ----------
drain(c); S(c, {t: 'pos', s: {x: 50 * 32, y: 29 * 32, vx: 0, vy: 0, f: 1, g: true, worn: {}}}); await sleep(60);
S(c, {t: 'pos', s: {x: 50 * 32, y: 40 * 32, vx: 0, vy: 0, f: 1, g: true, worn: {}}}); const tpc = await wait(c, 'tp');
ok('masuk ke dalam block padat ditolak', tpc && tpc.fix);
S(c, {t: 'pos', s: {x: 90 * 32, y: 10 * 32, vx: 0, vy: 0, f: 1, g: true, worn: {}}}); const tpc2 = await wait(c, 'tp');
ok('teleport jauh ditolak', tpc2 && tpc2.fix);
S(c, {t: 'pos', s: {x: 50 * 32 + 3, y: 20 * 32, vx: 0, vy: 0, f: 1, g: true, worn: {h: 1, hat: 'h_crown'}}}); await sleep(60);
// pakaian yang tidak dimiliki dibuang dari state
drain(c); S(c, {t: 'join', name: 'TEST'}); const wc = await wait(c, 'world');
ok('pemain lain di world terlihat dengan display', wc && wc.players.some(p => p.display === '@alice' || p.display === '@dave'));

console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
