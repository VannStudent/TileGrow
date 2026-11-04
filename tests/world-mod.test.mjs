// Tes otomatis TileGrow v1.13: otoritas world (owner & admin World Lock bisa tarik, kick, ban 1 jam; staff server kebal).
// Jalankan: node tests/run-v13.mjs world
const PORT = process.env.TPORT || 8096, U = 'ws://127.0.0.1:' + PORT + '/ws';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const open = () => new Promise(r => { const w = new WebSocket(U); w.q = []; w.onmessage = e => w.q.push(JSON.parse(e.data)); w.onopen = () => r(w); });
const wait = (w, t, ms = 2500, pred) => new Promise(res => { const s = Date.now(); const i = setInterval(() => {
  const k = w.q.findIndex(m => m.t === t && (!pred || pred(m))); if (k >= 0){ clearInterval(i); res(w.q.splice(k, 1)[0]); } else if (Date.now() - s > ms){ clearInterval(i); res(null); } }, 10); });
const S = (w, o) => w.send(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const drain = w => { w.q.length = 0; };
const consoleCmd = line => globalThis.__serverStdin.write(line + '\n');
const N = 6000, COLS = 100, fgArr = Array(N).fill(0);
for (let i = 3000; i < N; i++) fgArr[i] = 1; for (let i = 5800; i < N; i++) fgArr[i] = 7; fgArr[2950] = 23; fgArr[3050] = 7;
const world = {fg: fgArr, bgw: Array(N).fill(0), trees: [], meta: [], spawn: {x: 50, y: 29}};
const at = (x, y) => y * COLS + x;
const posAt = (w, tx, ty) => S(w, {t: 'pos', s: {x: tx * 32 + 3, y: ty * 32 + 2, vx: 0, vy: 0, f: 1, g: true, held: 'fist', worn: {}}});
const reg = async name => { const w = await open(); S(w, {t: 'register', user: name, pass: 'secret12', flag: 'ID'}); await wait(w, 'auth'); return w; };
const note = async (w, re, ms = 900) => { const m = await wait(w, 'note', ms, x => !re || re.test(x.text)); return m ? m.text : ''; };
const join = async (w, name = 'WMOD') => { drain(w); S(w, {t: 'join', name, world}); const s0 = Date.now();
  while (Date.now() - s0 < 2500){ const m = w.q.find(x => x.t === 'world' || x.t === 'left'); if (m) return m.t; await sleep(10); } return null; };

const own = await reg('pemilik'), adm = await reg('adminku'), adm2 = await reg('adminDua'), tamu = await reg('tamu'), modo = await reg('modku'), tamu2 = await reg('tamuDua');
consoleCmd('role modku mod'); await sleep(400);
for (const w of [own, adm, adm2, tamu, modo, tamu2]) await join(w);
posAt(own, 50, 29); for (const [w, x] of [[adm, 48], [adm2, 47], [tamu, 52], [modo, 53], [tamu2, 46]]) posAt(w, x, 29); await sleep(200);

// sebelum ada World Lock: tidak ada yang punya otoritas
drain(own); S(own, {t: 'wmod', op: 'kick', name: 'tamu'});
ok('tanpa World Lock: tidak ada otoritas', /Hanya owner atau admin/.test(await note(own)));

// owner pasang World Lock + daftar akses (admin). Akses tak terbatas (dulu maks 50).
S(own, {t: 'chat', text: '/testgive b30 1'}); await sleep(150);
S(own, {t: 'act', a: 'place', i: at(51, 29), key: 'b30'}); await sleep(400);
const many = Array.from({length: 70}, (_, k) => 'Teman' + k);
S(own, {t: 'act', a: 'meta', i: at(51, 29), meta: {lock: {type: 'world', owner: 'pemilik', access: ['adminku', 'adminDua', ...many], public: false, ignoreAir: false, tiles: null}}});
await sleep(500);
drain(own); S(own, {t: 'wmodInfo'}); const inf = await wait(own, 'wmodInfo');
ok('pemasang World Lock = owner', inf && inf.auth === 'owner', JSON.stringify(inf));
drain(adm); S(adm, {t: 'wmodInfo'}); const ia = await wait(adm, 'wmodInfo');
ok('pemain di daftar akses = admin', ia && ia.auth === 'admin', JSON.stringify(ia));
drain(tamu); S(tamu, {t: 'wmodInfo'}); const it = await wait(tamu, 'wmodInfo');
ok('tamu bukan admin', it && !it.auth);
// daftar akses > 50 tersimpan (admin tak terbatas)
drain(own); S(own, {t: 'join', name: 'WMOD'}); const wjoin = await wait(own, 'world'); posAt(own, 50, 29); await sleep(150);
const L = wjoin && wjoin.data.meta.map(e => e[1]).map(m => m && m.lock).find(l => l && l.type === 'world');
ok('daftar admin tidak dibatasi 50 (72 nama tersimpan)', !!L && L.access.length === 72, L ? L.access.length : 'lock tidak ada');
posAt(tamu, 52, 29); await sleep(150);

// tamu tidak bisa menindak
drain(tamu); S(tamu, {t: 'wmod', op: 'kick', name: 'adminku'});
ok('tamu tidak bisa kick', /Hanya owner atau admin/.test(await note(tamu)));

// pull: admin menarik tamu ke posisinya
drain(tamu); drain(adm); posAt(adm, 40, 29); await sleep(200); S(adm, {t: 'wmod', op: 'pull', name: 'tamu'});
const tp = await wait(tamu, 'tp');
ok('admin menarik (pull) tamu ke posisinya', tp && tp.x === 40 * 32 + 3 && tp.y === 29 * 32 + 2, JSON.stringify(tp));
ok('tamu diberi tahu siapa yang menarik', /ditarik oleh adminku \(admin world WMOD\)/.test(await note(tamu)));
// pemain yang ditarik boleh bergerak dari posisi baru (server tidak mengembalikannya)
drain(tamu); posAt(tamu, 40, 29); await sleep(80); posAt(tamu, 41, 29); const back = await wait(tamu, 'tp', 500);
ok('setelah ditarik, gerak dari posisi baru diterima server', !back, JSON.stringify(back));

// staff server & owner kebal
drain(own); S(own, {t: 'wmod', op: 'ban', name: 'modku'});
ok('Moderator tidak bisa di-ban owner world', /staff server/.test(await note(own)));
drain(adm); S(adm, {t: 'wmod', op: 'pull', name: 'modku'});
ok('Moderator tidak bisa ditarik admin world', /staff server/.test(await note(adm)));
drain(adm); S(adm, {t: 'wmod', op: 'kick', name: 'pemilik'});
ok('owner world tidak bisa di-kick admin', /Owner world tidak bisa/.test(await note(adm)));
drain(adm); S(adm, {t: 'wmod', op: 'kick', name: 'adminDua'});
ok('admin tidak bisa kick admin lain', /Admin tidak bisa menindak admin lain/.test(await note(adm)));
drain(own); S(own, {t: 'wmod', op: 'kick', name: 'pemilik'});
ok('tidak bisa ke diri sendiri', /diri sendiri/.test(await note(own)));

// kick: tamu keluar dari world tapi boleh masuk lagi
drain(tamu); S(adm, {t: 'wmod', op: 'kick', name: 'tamu'});
const lk = await wait(tamu, 'left');
ok('kick: tamu dikeluarkan dari world', lk && lk.reason === 'wkick', JSON.stringify(lk));
ok('kick: tamu masuk lagi diizinkan', (await join(tamu)) === 'world');
posAt(tamu, 52, 29); await sleep(150);

// ban 1 jam: keluar + tidak bisa masuk lagi
drain(tamu); S(own, {t: 'wmod', op: 'ban', name: 'tamu'});
const lb = await wait(tamu, 'left');
ok('ban: tamu dikeluarkan', lb && lb.reason === 'wban');
const rj = await join(tamu);
ok('ban: tamu tidak bisa masuk lagi', rj === 'left', rj);
const msg = (tamu.q.find(m => m.t === 'note') || {}).text || '';
ok('ban: pesan menyebut sisa waktu (sekitar 60 menit)', /Sisa (59|60) menit/.test(msg), msg);
// ban hanya untuk world itu
{ const r2 = await join(tamu, 'LAINNYA'); ok('ban hanya berlaku di world itu (world lain bisa)', r2 === 'world', r2 + ' ' + JSON.stringify(tamu.q.slice(-3)).slice(0, 300)); }
// ban tamu yang offline / di world lain juga bisa (tercatat), kick tidak
drain(own); S(own, {t: 'wmod', op: 'kick', name: 'tamuDua'}); await note(own);
drain(own); S(own, {t: 'wmod', op: 'ban', name: 'tamu'}); 
ok('ban pemain yang tidak ada di world tetap tercatat', /di-ban 1 jam/.test(await note(own)));
drain(own); S(own, {t: 'wmodInfo'}); const ib = await wait(own, 'wmodInfo');
ok('daftar ban terlihat owner', ib && ib.bans.some(b => b.name === 'tamu' && b.min >= 59));
// admin tidak bisa unban, owner bisa
drain(adm); S(adm, {t: 'wmod', op: 'unban', name: 'tamu'});
ok('admin tidak bisa unban', /Hanya owner world/.test(await note(adm)));
drain(own); S(own, {t: 'wmod', op: 'unban', name: 'tamu'});
ok('owner bisa unban', /tidak di-ban lagi/.test(await note(own)));
ok('setelah unban tamu bisa masuk lagi', (await join(tamu)) === 'world');
// staff server kebal juga saat ban sudah ada: moderator tetap bisa masuk (ban tidak bisa dibuat untuknya)
ok('Moderator bisa masuk world', (await join(modo)) === 'world');

console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
