// Tes panel admin role (v1.3.1). Dijalankan oleh: node tests/run-v13.mjs admin
import os from 'node:os';
const PORT = process.env.TPORT, L = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// akun uji lewat websocket
const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'); const q = []; ws.onmessage = e => q.push(JSON.parse(e.data));
await new Promise(r => ws.onopen = r); ws.send(JSON.stringify({t: 'register', user: 'Budi', pass: 'rahasia1', flag: 'ID'})); await sleep(500);

let r = await fetch(L + '/admin'); const html = await r.text();
ok('panel terbuka dari localhost', r.status === 200 && html.includes('Panel Role'));
const token = (html.match(/const TOKEN = "([0-9a-f]+)"/) || [])[1]; ok('token ada di halaman', !!token);
r = await fetch(L + '/admin/api/accounts'); ok('API tanpa token ditolak', r.status === 403);
r = await fetch(L + '/admin/api/accounts', {headers: {'X-TileGrow-Admin': 'salah'}}); ok('API token salah ditolak', r.status === 403);
r = await fetch(L + '/admin/api/accounts', {headers: {'X-TileGrow-Admin': token}}); const j = await r.json();
ok('daftar akun', r.status === 200 && j.accounts.some(a => a.name === 'Budi' && a.role === 'player' && a.online));
r = await fetch(L + '/admin/api/role', {method: 'POST', headers: {'X-TileGrow-Admin': token}, body: JSON.stringify({name: 'Budi', role: 'dev'})});
const rr = await r.json(); ok('set Developer', r.status === 200 && rr.ok, rr.text);
await sleep(200); const rm = q.find(m => m.t === 'role'); ok('pemain online langsung jadi @Budi', rm && rm.role === 'dev' && rm.display === '@Budi');
r = await fetch(L + '/admin/api/role', {method: 'POST', headers: {'X-TileGrow-Admin': token}, body: JSON.stringify({name: 'Budi', role: 'owner'})});
ok('role tidak valid ditolak', r.status === 400);
r = await fetch(L + '/admin/api/role', {method: 'POST', headers: {'X-TileGrow-Admin': token}, body: JSON.stringify({name: 'Hantu', role: 'mod'})});
ok('akun tidak ada ditolak', r.status === 400);
// Host palsu (DNS rebinding)
const http = await import('node:http');
const raw = (host, ip) => new Promise(res => { const rq = http.request({host: ip, port: PORT, path: '/admin', headers: {Host: host}}, x => { x.resume(); res(x.statusCode); }); rq.on('error', e => res('ERR ' + e.code)); rq.end(); });
ok('Host palsu ditolak', await raw('jahat.example:' + PORT, '127.0.0.1') === 404);
// dari IP LAN (bukan loopback)
const lan = Object.values(os.networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal);
if (lan && process.env.LAN_TEST){ const st = await raw(lan.address + ':' + PORT, lan.address); ok('dari IP LAN ' + lan.address + ' ditolak (404)', st === 404, String(st)); }
else console.log('SKIP tes IP LAN (server tes hanya dengar 127.0.0.1)');

// ---------- v1.9: ganti nama & hapus akun ----------
const H = {'X-TileGrow-Admin': token};
const post = (p, b) => fetch(L + '/admin/api/' + p, {method: 'POST', headers: H, body: JSON.stringify(b)}).then(async x => ({s: x.status, j: await x.json()}));
const acct = async () => (await (await fetch(L + '/admin/api/accounts', {headers: H})).json()).accounts.map(a => a.name);
const client = async (user) => {
  const w = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'), qq = []; w.onmessage = e => qq.push(JSON.parse(e.data));
  await new Promise(r => w.onopen = r);
  w.send(JSON.stringify({t: 'register', user, pass: 'rahasia1', flag: 'ID'})); await sleep(400);
  if (!qq.some(m => m.t === 'auth' && m.ok)){ w.send(JSON.stringify({t: 'login', user, pass: 'rahasia1'})); await sleep(400); }
  return {w, q: qq, send: o => w.send(JSON.stringify(o))};
};
const lastWorld = q => [...q].reverse().find(m => m.t === 'world');
const metaOf = (d, i) => (new Map(d.meta)).get(i);
// Rina punya World Lock di world RINAW, Vending Machine, dan Sari sebagai teman
const rina = await client('Rina'), sari = await client('Sari');
rina.send({t: 'friendReq', name: 'Sari'}); await sleep(200); sari.send({t: 'friendAccept', name: 'Rina'}); await sleep(200);
rina.send({t: 'join', name: 'RINAW'}); await sleep(500);
const wd = lastWorld(rina.q).data, sp = wd.spawn, base = sp.y * 100 + sp.x;
rina.send({t: 'pos', s: {x: sp.x * 32 + 3, y: sp.y * 32 + 2, vx: 0, vy: 0, f: 1, g: true}}); await sleep(150);
rina.send({t: 'chat', text: '/testgive b30 1'}); rina.send({t: 'chat', text: '/testgive b62 1'}); await sleep(250);
const iL = base + 1, iV = base + 2;
rina.send({t: 'act', a: 'place', i: iL, key: 'b30'}); await sleep(250);
rina.send({t: 'act', a: 'place', i: iV, key: 'b62'}); await sleep(250);
let q2 = await post('rename', {name: 'Rina', to: 'Sari'}); ok('rename ke nama yang dipakai ditolak', q2.s === 400 && /sudah dipakai/.test(q2.j.err), q2.j.err);
q2 = await post('rename', {name: 'Rina', to: 'a b'}); ok('rename nama tidak valid ditolak', q2.s === 400);
q2 = await post('rename', {name: 'Rina', to: 'RinaBaru'}); ok('rename berhasil', q2.s === 200 && q2.j.ok, q2.j.text || q2.j.err);
await sleep(300);
ok('pemain online dikeluarkan saat rename', rina.q.some(m => m.t === 'kicked' && /RinaBaru/.test(m.reason)));
let names = await acct(); ok('daftar akun: nama lama hilang, nama baru ada', !names.includes('Rina') && names.includes('RinaBaru'));
// login dengan nama baru: tas ikut pindah, world lock & vending milik nama baru
const rb = await client('RinaBaru');
ok('login mengirim daftar teman & berita', rb.q.some(m => m.t === 'friends') && rb.q.some(m => m.t === 'news'));
ok('login nama baru berhasil', rb.q.some(m => m.t === 'auth' && m.ok && m.user === 'RinaBaru'));
const au = rb.q.find(m => m.t === 'auth' && m.ok);
ok('tas & gems ikut pindah', au && au.econ && Array.isArray(au.econ.bag) && au.econ.bag.length > 0);
const fr = rb.q.find(m => m.t === 'friends'); ok('teman ikut (Sari)', fr && fr.friends.some(f => f.name === 'Sari'));
sari.send({t: 'friends'}); await sleep(200);
const frS = [...sari.q].reverse().find(m => m.t === 'friends'); ok('di daftar Sari namanya ikut berubah', frS && frS.friends.some(f => f.name === 'RinaBaru') && !frS.friends.some(f => f.name === 'Rina'));
rb.send({t: 'join', name: 'RINAW'}); await sleep(500);
let d2 = lastWorld(rb.q).data;
ok('World Lock pindah ke nama baru', metaOf(d2, iL) && metaOf(d2, iL).lock && metaOf(d2, iL).lock.owner === 'RinaBaru');
ok('Vending Machine pindah ke nama baru', metaOf(d2, iV) && metaOf(d2, iV).vend && metaOf(d2, iV).vend.owner === 'RinaBaru');
const oldLogin = await client('Rina');
ok('nama lama sudah bisa didaftarkan orang lain (akun baru, kosong)', oldLogin.q.some(m => m.t === 'auth' && m.ok && m.isNew));
oldLogin.w.close();
// hapus akun
q2 = await post('delete', {name: 'RinaBaru', confirm: 'rinabaru'}); ok('hapus tanpa konfirmasi tepat ditolak', q2.s === 400 && /Konfirmasi/.test(q2.j.err));
names = await acct(); ok('akun masih ada setelah konfirmasi salah', names.includes('RinaBaru'));
sari.send({t: 'join', name: 'RINAW'}); await sleep(400);
q2 = await post('delete', {name: 'RinaBaru', confirm: 'RinaBaru'}); ok('hapus akun berhasil', q2.s === 200 && q2.j.ok, q2.j.text || q2.j.err);
await sleep(300);
ok('pemain online dikeluarkan saat dihapus', rb.q.some(m => m.t === 'kicked' && /dihapus/.test(m.reason)));
names = await acct(); ok('akun hilang dari daftar', !names.includes('RinaBaru'));
const opsS = sari.q.filter(m => m.t === 'ops').flatMap(m => m.ops);
ok('pemain lain di world langsung melihat lock & vending hilang', opsS.some(o => o[0] === iL && o[1] === 0) && opsS.some(o => o[0] === iV && o[1] === 0));
sari.send({t: 'friends'}); await sleep(200);
const frS2 = [...sari.q].reverse().find(m => m.t === 'friends'); ok('dicoret dari daftar teman Sari', frS2 && !frS2.friends.some(f => f.name === 'RinaBaru'));
sari.send({t: 'leave'}); await sleep(100); sari.send({t: 'join', name: 'RINAW'}); await sleep(400);
d2 = lastWorld(sari.q).data;
ok('world tersimpan: lock & vending sudah tidak ada', d2.fg[iL] === 0 && d2.fg[iV] === 0 && !metaOf(d2, iL) && !metaOf(d2, iV));
const relog = await client('RinaBaru');
ok('akun terhapus tidak bisa login (jadi daftar baru)', relog.q.some(m => m.t === 'auth' && m.ok && m.isNew));
q2 = await post('delete', {name: 'Hantu', confirm: 'Hantu'}); ok('hapus akun yang tidak ada ditolak', q2.s === 400);
r = await fetch(L + '/admin/api/delete', {method: 'POST', headers: {'X-TileGrow-Admin': 'salah'}, body: JSON.stringify({name: 'Sari', confirm: 'Sari'})});
ok('hapus tanpa token ditolak', r.status === 403);
names = await acct(); ok('Sari tidak ikut terhapus', names.includes('Sari'));
const ng = await (await fetch(L + '/admin/api/delete', {method: 'POST', headers: {...H, 'X-Forwarded-For': '1.2.3.4'}, body: '{}'})).status;
ok('hapus lewat tunnel (ngrok) = 404', ng === 404);
for (const x of [rina, sari, rb, relog]) try { x.w.close(); } catch(e){}
// game tetap jalan
r = await fetch(L + '/'); ok('game tetap tersaji', r.status === 200);
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
