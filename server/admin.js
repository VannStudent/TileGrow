// TileGrow — panel admin pemilik server (v1.3.1)
// Buka di PC server: http://localhost:PORT/admin
// Keamanan:
//  - hanya melayani koneksi dari PC ini sendiri (127.0.0.1 / ::1); perangkat lain di WiFi mendapat 404 seperti halaman tidak ada
//  - Host harus localhost/127.0.0.1 (mencegah DNS rebinding)
//  - aksi wajib membawa token acak yang dibuat ulang tiap server dijalankan, lewat header khusus,
//    jadi website lain yang terbuka di browser PC ini tidak bisa diam-diam mengubah role (CSRF)
'use strict';
const crypto = require('crypto');

function createAdmin({social, port}){
  const TOKEN = crypto.randomBytes(24).toString('hex');
  const isLoopback = req => { const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''); return ip === '127.0.0.1' || ip === '::1'; };
  const hostOk = req => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host || ''));
  const send = (res, code, type, body) => { res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer'}); res.end(body); };
  const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

  // return true kalau request ini milik panel admin (sudah dijawab)
  function handle(req, res, p){
    if (p !== '/admin' && !p.startsWith('/admin/')) return false;
    if (!isLoopback(req) || !hostOk(req)){ send(res, 404, 'text/plain', 'Not found'); return true; }
    if (p === '/admin' && req.method === 'GET'){ send(res, 200, 'text/html; charset=utf-8', page(TOKEN)); return true; }
    if (req.headers['x-tilegrow-admin'] !== TOKEN){ json(res, 403, {err: 'Token salah. Muat ulang halaman admin.'}); return true; }
    if (p === '/admin/api/accounts' && req.method === 'GET'){ json(res, 200, {accounts: social.listAccounts()}); return true; }
    if (p === '/admin/api/role' && req.method === 'POST'){
      let body = '';
      req.on('data', d => { body += d; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        let m; try { m = JSON.parse(body); } catch(e){ return json(res, 400, {err: 'Data rusak.'}); }
        const r = social.setRole(String(m.name || ''), String(m.role || ''), 'ADMIN-PANEL');
        if (r.ok) console.log('[admin] ' + r.text);
        json(res, r.ok ? 200 : 400, r);
      });
      return true;
    }
    json(res, 404, {err: 'Tidak ada.'}); return true;
  }
  return {handle, url: 'http://localhost:' + port + '/admin'};
}

function page(token){
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TileGrow · Panel Role</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#141c2c;color:#e8f0ff}
  .wrap{max-width:720px;margin:0 auto;padding:20px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#9fb3d1;font-size:13px;margin:0 0 16px}
  .bar{display:flex;gap:8px;margin-bottom:10px}
  input,select,button{font:inherit;border-radius:8px;border:2px solid #2c4a6e;background:#0e1626;color:#e8f0ff;padding:7px 10px}
  input{flex:1} button{cursor:pointer;background:#2f6fd6;border-color:#1d3f7a;font-weight:700} button:hover{filter:brightness(1.1)}
  table{width:100%;border-collapse:collapse;background:#0e1626;border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #22324c;font-size:14px} th{background:#1a2740;color:#9fb3d1;font-weight:700}
  .dev{color:#ff9a2e;font-weight:800} .mod{color:#c07cff;font-weight:800} .player{color:#e8f0ff}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#55607a;margin-right:6px} .dot.on{background:#3fe07a}
  #msg{min-height:20px;margin:8px 0;font-size:14px} .ok{color:#7be37a} .err{color:#ff8080}
  .note{color:#9fb3d1;font-size:12px;margin-top:14px;line-height:1.5}
</style></head><body><div class="wrap">
<h1>Panel Role TileGrow</h1>
<p class="sub">Hanya bisa dibuka dari PC server ini. Developer = nama <span class="dev">@oranye</span>, Moderator = nama <span class="mod">@ungu</span>.</p>
<div class="bar"><input id="q" placeholder="Cari nama pemain..." autocomplete="off"><button id="reload" type="button">Muat ulang</button></div>
<div id="msg"></div>
<table><thead><tr><th>Pemain</th><th>Status</th><th>Role</th><th></th></tr></thead><tbody id="list"><tr><td colspan="4">Memuat...</td></tr></tbody></table>
<p class="note">Perubahan langsung berlaku: pemain yang sedang online melihat namanya berubah tanpa login ulang. Semua perubahan dicatat di server/data/staff-log.jsonl sebagai ADMIN-PANEL.<br>
Developer bisa ban permanen, IP ban, dan mengangkat Moderator. Berikan hanya ke orang yang benar-benar kamu percaya.</p>
</div>
<script>
const TOKEN = ${JSON.stringify(token)}, NAMES = {dev: 'Developer', mod: 'Moderator', player: 'Player'};
let all = [];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, body){
  const r = await fetch('/admin/api/' + path, {method: body ? 'POST' : 'GET', headers: {'X-TileGrow-Admin': TOKEN, 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => ({err: 'Server tidak menjawab.'})); if (!r.ok) throw new Error(j.err || 'Gagal'); return j;
}
function msg(t, ok){ $('msg').textContent = t; $('msg').className = ok ? 'ok' : 'err'; }
function render(){
  const q = $('q').value.trim().toLowerCase(), rows = all.filter(a => a.name.toLowerCase().includes(q));
  $('list').innerHTML = rows.length ? rows.map(a => '<tr><td class="' + a.role + '">' + (a.role === 'player' ? '' : '@') + esc(a.name) + '</td>' +
    '<td><span class="dot' + (a.online ? ' on' : '') + '"></span>' + (a.online ? 'Online' : 'Offline') + '</td>' +
    '<td><select data-n="' + esc(a.name) + '">' + ['player','mod','dev'].map(r => '<option value="' + r + '"' + (r === a.role ? ' selected' : '') + '>' + NAMES[r] + '</option>').join('') + '</select></td>' +
    '<td><button type="button" data-save="' + esc(a.name) + '">Simpan</button></td></tr>').join('')
    : '<tr><td colspan="4">' + (all.length ? 'Tidak ada yang cocok.' : 'Belum ada akun. Pemain harus daftar dulu di game.') + '</td></tr>';
  document.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const name = b.dataset.save, role = document.querySelector('select[data-n="' + CSS.escape(name) + '"]').value, cur = all.find(a => a.name === name).role;
    if (role === cur) return msg(name + ' sudah ' + NAMES[role] + '.', true);
    if (role === 'dev' && !confirm('Jadikan ' + name + ' Developer? Developer bisa ban permanen dan IP ban.')) return;
    try { const r = await api('role', {name, role}); msg(r.text, true); load(); } catch(e){ msg(e.message, false); }
  });
}
async function load(){ try { all = (await api('accounts')).accounts; render(); } catch(e){ msg(e.message, false); } }
// refresh otomatis status online, tapi jangan menimpa pilihan role yang belum disimpan
const pending = () => [...document.querySelectorAll('select[data-n]')].some(s => { const a = all.find(x => x.name === s.dataset.n); return a && s.value !== a.role; }) || (document.activeElement && document.activeElement.tagName === 'SELECT');
$('q').oninput = render; $('reload').onclick = load; load(); setInterval(() => { if (!pending()) load(); }, 10000);
</script></body></html>`;
}
module.exports = {createAdmin};
