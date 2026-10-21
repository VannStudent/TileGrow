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
// game tetap jalan
r = await fetch(L + '/'); ok('game tetap tersaji', r.status === 200);
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
