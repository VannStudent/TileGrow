// Tes keamanan server TileGrow v1.3 (protokol 'act': server yang mengubah world & tas).
// Pengganti tes v1.0.1: aturan yang sama (lock, pintu utama, data rusak, pakaian palsu, brute force) diuji lewat jalur baru,
// ditambah: pesan 'ops' lama ditolak, file server tidak bisa diunduh, item yang tidak dimiliki tidak bisa dipakai.
//   node tests/run-v13.mjs security
const PORT = process.env.TPORT || 8095, U = 'ws://127.0.0.1:' + PORT + '/ws', H = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const open = () => new Promise(r => { const w = new WebSocket(U); w.q = []; w.onmessage = e => w.q.push(JSON.parse(e.data)); w.onopen = () => r(w); });
const wait = (w, t, ms = 2500, pred) => new Promise(res => { const s = Date.now(); const i = setInterval(() => {
  const k = w.q.findIndex(m => m.t === t && (!pred || pred(m))); if (k >= 0){ clearInterval(i); res(w.q.splice(k, 1)[0]); } else if (Date.now() - s > ms){ clearInterval(i); res(null); } }, 10); });
const S = (w, o) => w.send(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const drain = w => { w.q.length = 0; };
const COLS = 100, N = 6000, at = (x, y) => y * COLS + x;
const posAt = (w, tx, ty) => S(w, {t: 'pos', s: {x: tx * 32 + 3, y: ty * 32 + 2, vx: 0, vy: 0, f: 1, g: true, held: 'fist', worn: {}}});
const tileAfter = async (w, i, ms = 900) => { await sleep(ms); const o = w.q.filter(m => m.t === 'ops').flatMap(m => m.ops).filter(o => o[0] === i); return o.length ? o[o.length - 1] : null; };
const hitN = async (w, i, n) => { for (let k = 0; k < n; k++){ S(w, {t: 'act', a: 'hit', i}); await sleep(140); } };

// 1. HTTP
let r = await fetch(H + '/%E0%A4%A'); ok('URL rusak -> 400', r.status === 400, r.status);
r = await fetch(H + '/'); ok('server masih hidup', r.status === 200);
r = await fetch(H + '/server/data/accounts.json'); ok('file data tidak bisa diunduh', r.status === 404);
r = await fetch(H + '/server/server.js'); ok('kode server tidak bisa diunduh', r.status === 404);

const a = await open(), b = await open();
S(a, {t: 'register', user: 'alice1', pass: 'secret12', flag: 'ID'}); ok('register A', (await wait(a, 'auth')).ok);
S(b, {t: 'register', user: 'bob1', pass: 'secret12', flag: 'MY'}); ok('register B', (await wait(b, 'auth')).ok);
const fgArr = Array(N).fill(0); for (let i = 3000; i < N; i++) fgArr[i] = 1; fgArr[2950] = 23; fgArr[3050] = 7; for (let i = 5900; i < N; i++) fgArr[i] = 7;
S(a, {t: 'join', name: 'TEST', world: {fg: fgArr, bgw: Array(N).fill(0), trees: [], meta: [], spawn: {x: 50, y: 29}}}); await wait(a, 'world');
posAt(a, 50, 29); await sleep(60);
// 2. pesan 'ops' lama (dulu bisa menulis world mentah) ditolak
drain(a); S(a, {t: 'ops', ops: [[3100, 0, 0, null, null]]}); const er = await wait(a, 'err'); ok("pesan 'ops' lama ditolak", er && /Versi game lama/.test(er.text));
// 3. A beli + pasang World Lock
S(a, {t: 'chat', text: '/testgive gem 1000'}); await sleep(100); S(a, {t: 'buy', key: 'b30'}); await sleep(150);
drain(a); S(a, {t: 'act', a: 'place', i: at(51, 29), key: 'b30'}); let o = await tileAfter(a, at(51, 29));
ok('A pasang World Lock', o && o[1] === 30 && o[3] && o[3].lock.owner === 'alice1');
S(b, {t: 'join', name: 'TEST'}); await wait(b, 'world'); await wait(a, 'pjoin'); posAt(b, 52, 29); await sleep(60);
// 4. tamu pecah block di WL
drain(b); drain(a); await hitN(b, at(52, 30), 3); o = await tileAfter(b, at(52, 30));
ok('tamu pecah block di WL ditolak', o && o[1] === 1, JSON.stringify(o));
ok('A tidak menerima perubahan dari tamu', !a.q.some(m => m.t === 'ops' && m.ops.some(x => x[0] === at(52, 30) && x[1] === 0)));
// 5. tamu ubah WL lewat dialog wrench
drain(b); S(b, {t: 'act', a: 'meta', i: at(51, 29), meta: {lock: {type: 'world', owner: 'bob1', access: [], public: true, ignoreAir: false, tiles: null}}});
o = await tileAfter(b, at(51, 29)); ok('ambil alih WL ditolak', o && o[3].lock.owner === 'alice1' && !o[3].lock.public);
// 6. tamu pukul WL
drain(b); await hitN(b, at(51, 29), 6); o = await tileAfter(b, at(51, 29)); ok('tamu tidak bisa pecah WL', o && o[1] === 30);
// 7. pemilik boleh pecah
drain(a); drain(b); await hitN(a, at(49, 30), 3); o = await tileAfter(b, at(49, 30)); ok('pemilik boleh pecah, pemain lain melihat', o && o[1] === 0);
// 8. A beri akses ke bob1
drain(a); S(a, {t: 'act', a: 'meta', i: at(51, 29), meta: {lock: {type: 'world', owner: 'alice1', access: ['bob1'], public: false, ignoreAir: false, tiles: null}}});
o = await tileAfter(a, at(51, 29)); ok('pemilik ubah daftar akses', o && o[3].lock.access.includes('bob1'));
drain(b); await hitN(b, at(53, 30), 3); o = await tileAfter(b, at(53, 30)); ok('B dengan akses boleh pecah', o && o[1] === 0);
// 9. pintu utama & dasar
drain(a); await hitN(a, at(50, 29), 6); await hitN(a, at(50, 30), 6); await sleep(300);
ok('pintu utama & dasar dilindungi', !a.q.some(m => m.t === 'ops' && m.ops.some(x => (x[0] === at(50, 29) || x[0] === at(50, 30)) && x[1] === 0)));
// 10. meta rusak, block terlarang, item yang tidak dimiliki
S(a, {t: 'buy', key: 'b20'}); await sleep(150);
drain(a); S(a, {t: 'act', a: 'place', i: at(48, 29), key: 'b20'}); await tileAfter(a, at(48, 29), 300);
drain(a); S(a, {t: 'act', a: 'meta', i: at(48, 29), meta: {sign: {text: 123}}}); o = await tileAfter(a, at(48, 29));
ok('meta rusak ditolak', o && o[3] && o[3].sign && o[3].sign.text === '');
drain(a); S(a, {t: 'act', a: 'meta', i: at(48, 29), meta: {sign: {text: '<img src=x onerror=alert(1)>'}}}); o = await tileAfter(a, at(48, 29));
ok('teks papan disimpan sebagai teks', o && o[3].sign.text === '<img src=x onerror=alert(1)>');
drain(a); S(a, {t: 'act', a: 'place', i: at(47, 29), key: 'b99'}); S(a, {t: 'act', a: 'place', i: at(47, 29), key: 'b7'}); S(a, {t: 'act', a: 'place', i: at(47, 29), key: 'b23'});
o = await tileAfter(a, at(47, 29), 500); ok('block tak dikenal / dasar / pintu utama tidak bisa dipasang', !o || o[1] === 0);
drain(a); S(a, {t: 'act', a: 'place', i: at(47, 29), key: 'b11'}); o = await tileAfter(a, at(47, 29), 500);
ok('item yang tidak ada di tas tidak bisa dipasang', !o || o[1] === 0);
// 11. pohon (tile 47,29: dalam jangkauan, tanah di bawahnya)
drain(a); S(a, {t: 'act', a: 'seed', i: at(47, 29), key: 's14'}); o = await tileAfter(a, at(47, 29), 400); ok('seed yang tidak dimiliki ditolak', !o || o[1] === 0);
drain(a); S(a, {t: 'act', a: 'seed', i: at(47, 29), key: 's1'}); o = await tileAfter(a, at(47, 29));
ok('tanam seed yang dimiliki', o && o[1] === 8 && o[4].kind === 1);
drain(a); await hitN(a, at(47, 29), 1); o = await tileAfter(a, at(47, 29), 400); ok('pohon belum matang tidak bisa dipanen', !o || o[1] === 8);
// 12. pakaian palsu dibuang dari state
drain(b); S(a, {t: 'pos', s: {x: 50 * 32 + 3, y: 29 * 32 + 2, worn: {hat: 'h_cowboy', evil: {a: 1}, wings: {x: 1}}}}); const pb = await wait(b, 'pos');
ok('pakaian yang tidak dimiliki / rusak dibuang', pb && JSON.stringify(pb.s.worn) === '{}', JSON.stringify(pb && pb.s.worn));
// 13. small lock milik B, A tak bisa pecah
const c = await open(); S(c, {t: 'login', user: 'bob1', pass: 'secret12'}); ok('login B kedua', (await wait(c, 'auth')).ok); ok('koneksi B lama di-kick', !!(await wait(b, 'kicked')));
S(c, {t: 'join', name: 'FREE', world: {fg: fgArr, bgw: Array(N).fill(0), trees: [], meta: [], spawn: {x: 50, y: 29}}}); await wait(c, 'world'); posAt(c, 50, 29); await sleep(60);
S(c, {t: 'chat', text: '/testgive gem 500'}); await sleep(100); S(c, {t: 'buy', key: 'b31'}); await sleep(150);
drain(c); S(c, {t: 'act', a: 'place', i: at(52, 29), key: 'b31'}); o = await tileAfter(c, at(52, 29));
ok('B pasang small lock (tile diklaim server)', o && o[1] === 31 && o[3].lock.tiles.length === 10);
S(a, {t: 'join', name: 'FREE'}); await wait(a, 'world'); posAt(a, 50, 29); await sleep(60);
const locked = o[3].lock.tiles.find(t => t >= 3000), free = at(47, 31);
drain(a); await hitN(a, locked, 3); await hitN(a, free, 3); await sleep(300);
const lockedHit = a.q.some(m => m.t === 'ops' && m.ops.some(x => x[0] === locked && x[1] === 0)), freeHit = a.q.some(m => m.t === 'ops' && m.ops.some(x => x[0] === free && x[1] === 0));
ok('A: tile ter-lock ditolak, tile bebas boleh', !lockedHit && freeHit, 'locked=' + lockedHit + ' free=' + freeHit);
S(a, {t: 'chat', text: '/testgive b30 1'}); await sleep(100);
drain(a); S(a, {t: 'act', a: 'place', i: at(49, 29), key: 'b30'}); o = await tileAfter(a, at(49, 29), 500);
ok('A pasang WL di world yang ada lock B ditolak', !o || o[1] === 0);
drain(a); S(a, {t: 'join', name: 'BARU'}); const nw = await wait(a, 'world'); ok('world baru tanpa data klien dibuat server', nw && nw.data.fg.includes(23));
// 14. brute force
const d = await open(); let blocked = false;
for (let i = 0; i < 7; i++){ S(d, {t: 'login', user: 'alice1', pass: 'wrong' + i}); const x = await wait(d, 'auth'); if (x && /Terlalu banyak/.test(x.err)) blocked = true; }
ok('brute force diblokir setelah 5 gagal', blocked);
S(d, {t: 'login', user: 'alice1', pass: 'secret12'}); const x = await wait(d, 'auth'); ok('password benar pun ditahan selama blokir', x && !x.ok);
const t0 = Date.now(); const e = await open(); S(e, {t: 'hello'}); const hi = await wait(e, 'hi'); ok('hello dijawab cepat', hi && Date.now() - t0 < 500, (Date.now() - t0) + 'ms');
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
