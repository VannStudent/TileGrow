// Cek sebelum rilis (v1.11). Jalankan:  node tests/release-check.mjs
//   Tambahan:  --fast  (lewati 4 suite tes, hanya cek cepat)   --server DIR  (folder salinan server, default ../TileGrow-Server)
// Lulus = exit 0. Gagal = exit 1 dengan daftar masalah.
// Mencegah bug yang pernah lolos: skrip di halaman yang error (panel macet "Memuat"), nomor versi tidak naik,
// salinan TileGrow-Server ketinggalan file, server tidak bisa start, file server bocor lewat HTTP.
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), fast = args.includes('--fast');
const srvDir = path.resolve(root, args.includes('--server') ? args[args.indexOf('--server') + 1] : '../TileGrow-Server');
const tmpBase = process.env.TG_TMP || path.join(root, '.agent', 'tools', 'tmp');
fs.mkdirSync(tmpBase, {recursive: true});
const problems = [];
let nOk = 0;
const ok = (name, cond, why) => { if (cond){ nOk++; console.log('  ok   ' + name); } else { problems.push(name + (why ? ' — ' + why : '')); console.log('  GAGAL ' + name + (why ? ' — ' + why : '')); } };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 1. sintaks semua file JS ----------
console.log('\n[1] Sintaks file JavaScript');
const jsFiles = [...fs.readdirSync(path.join(root, 'js')).map(f => 'js/' + f), ...fs.readdirSync(path.join(root, 'server')).map(f => 'server/' + f)].filter(f => f.endsWith('.js'));
let bad = [];
for (const f of jsFiles){ const r = spawnSync(process.execPath, ['--check', path.join(root, f)], {encoding: 'utf8'}); if (r.status) bad.push(f + ': ' + (r.stderr.split('\n').find(l => /Error/.test(l)) || '').trim()); }
ok(jsFiles.length + ' file js/ & server/ lolos node --check', !bad.length, bad.join('; '));

// skrip di dalam HTML (halaman game) harus bisa dibaca browser
const parseInline = (html, where) => {
  const errs = [], re = /<script>([\s\S]*?)<\/script>/g; let m, k = 0;
  while ((m = re.exec(html))){ k++; try { new Function(m[1]); } catch(e){ errs.push(where + ' skrip #' + k + ': ' + e.message); } }
  return {errs, k};
};
const html = read('tilegrow.html');
let pi = parseInline(html, 'tilegrow.html');
ok('skrip di dalam tilegrow.html (' + pi.k + ') bisa dibaca browser', !pi.errs.length, pi.errs.join('; '));

// semua <script src> ada filenya
const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const missing = srcs.filter(s => !fs.existsSync(path.join(root, s)));
ok('semua ' + srcs.length + ' <script src> ada filenya', !missing.length, missing.join(', '));

// ---------- 2. nomor versi ----------
console.log('\n[2] Nomor versi');
const vCfg = (read('server/config.js').match(/const VERSION = '([^']+)'/) || [])[1];
const vHtml = (html.match(/<div class="tVer">([^<]+)<\/div>/) || [])[1];
ok('versi server (config.js) = versi halaman (tilegrow.html): ' + vCfg + ' / ' + vHtml, vCfg && vCfg === vHtml);
const stray = jsFiles.filter(f => f.startsWith('server/') && f !== 'server/config.js' && /const VERSION = '/.test(read(f)));
ok('VERSION hanya ditulis di server/config.js', !stray.length, stray.join(', '));
// versi harus lebih baru dari commit terakhir yang dirilis (kalau ada perubahan kode sejak itu)
const git = (...a) => spawnSync('git', ['-C', root, ...a], {encoding: 'utf8'}).stdout || '';
const headCfg = (git('show', 'HEAD:server/config.js').match(/const VERSION = '([^']+)'/) || [])[1];
const changed = git('diff', '--name-only', 'HEAD').split('\n').filter(f => /^(js\/|server\/|tilegrow\.html)/.test(f));
if (changed.length) ok('ada ' + changed.length + ' file kode berubah sejak commit terakhir -> versi sudah dinaikkan (' + headCfg + ' -> ' + vCfg + ')', headCfg !== vCfg, 'naikkan VERSION di server/config.js dan .tVer di tilegrow.html');
else ok('tidak ada perubahan kode sejak commit terakhir (cek versi dilewati)', true);

// ---------- 3. server start sungguhan + HTTP ----------
console.log('\n[3] Server bisa start & aman');
const data = fs.mkdtempSync(path.join(tmpBase, 'tgrc-'));
const PORT = 8300 + Math.floor(Math.random() * 300);
const srv = spawn(process.execPath, [path.join(root, 'server/server.js')], {env: {...process.env, TILEGROW_TEST: '', HOST: '127.0.0.1', PORT: String(PORT), DATA_DIR: data}, stdio: ['ignore', 'pipe', 'pipe']});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const L = 'http://127.0.0.1:' + PORT;
let up = false; for (let k = 0; k < 40 && !up; k++){ await sleep(150); try { up = (await fetch(L + '/')).ok; } catch {} }
try {
  ok('server start dan halaman game terbuka', up, log.split('\n').slice(-5).join(' | '));
  if (up){
    const page = await (await fetch(L + '/')).text();
    ok('halaman dari server memuat versi ' + vCfg, page.includes('>' + vCfg + '<'));
    for (const f of ['js/data.js', 'js/chess.js', 'js/pixchar.js']) ok('file ' + f + ' bisa diunduh', (await fetch(L + '/' + f)).status === 200);
    for (const f of ['/server/server.js', '/server/config.js', '/server/data/accounts.json', '/../package.json', '/.git/config', '/.agent/PROJECT_MEMORY.md'])
      ok('file rahasia ' + f + ' TIDAK bisa diunduh', (await fetch(L + f)).status !== 200);
    const adm = await fetch(L + '/admin');
    ok('panel role terbuka dari PC ini', adm.status === 200);
    if (adm.status === 200){ const r = parseInline(await adm.text(), 'panel'); ok('skrip panel role bisa dibaca browser', !r.errs.length, r.errs.join('; ')); }
    ok('panel role lewat tunnel (ngrok) = 404', (await fetch(L + '/admin', {headers: {'X-Forwarded-For': '1.2.3.4'}})).status === 404);
    // WebSocket: server melaporkan versi yang sama
    const v = await new Promise(res => { try { const w = new WebSocket('ws://127.0.0.1:' + PORT + '/ws'); const t = setTimeout(() => { try { w.close(); } catch {} res(null); }, 3000);
      w.onmessage = e => { const m = JSON.parse(e.data); if (m.version || m.t === 'hello'){ clearTimeout(t); w.close(); res(m.version || null); } }; w.onerror = () => { clearTimeout(t); res(null); }; } catch { res(null); } });
    if (v !== null) ok('WebSocket: server melapor versi ' + v, v === vCfg);
  }
  ok('tidak ada error di log server', !/(Error|TypeError|ReferenceError)/.test(log), log.split('\n').filter(l => /Error/.test(l)).slice(0, 3).join(' | '));
} finally { srv.kill(); await sleep(200); try { fs.rmSync(data, {recursive: true, force: true}); } catch {} }

// ---------- 4. salinan TileGrow-Server sama dengan repo ----------
console.log('\n[4] Salinan ' + srvDir);
if (!fs.existsSync(srvDir)) ok('folder TileGrow-Server ada', false, srvDir + ' tidak ditemukan (pakai --server DIR)');
else {
  const want = ['tilegrow.html', ...jsFiles];
  const norm = b => b.toString('utf8').replace(/\r\n/g, '\n');   // beda CRLF/LF (git di Windows) bukan beda isi
  const diff = [], miss = [];
  for (const f of want){ const p = path.join(srvDir, f); if (!fs.existsSync(p)) miss.push(f); else if (norm(fs.readFileSync(p)) !== norm(fs.readFileSync(path.join(root, f)))) diff.push(f); }
  ok('semua ' + want.length + ' file ada di salinan server', !miss.length, 'belum disalin: ' + miss.join(', '));
  ok('isi salinan server sama persis dengan repo', !diff.length, 'beda: ' + diff.join(', '));
}

// ---------- 5. suite tes ----------
if (!fast){
  console.log('\n[5] Tes otomatis (beberapa menit)');
  for (const s of ['', 'security', 'admin', 'v14', 'world']){
    const r = spawnSync(process.execPath, [path.join(root, 'tests/run-v13.mjs'), ...(s ? [s] : [])], {encoding: 'utf8', env: {...process.env, TG_TMP: tmpBase}, timeout: 300000, stdio: ['ignore', 'pipe', 'pipe']});
    const out = (r.stdout || '') + (r.stderr || ''), sum = (out.match(/(\d+) lulus, (\d+) gagal/) || []);
    const fails = out.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 5).join(' | ');
    ok('tes ' + (s || 'ekonomi/sosial') + ': ' + (sum[0] || 'tidak selesai'), sum[2] === '0' && r.status === 0, fails || out.slice(-200));
  }
} else console.log('\n[5] Tes otomatis dilewati (--fast)');

console.log('\n' + (problems.length ? 'BELUM SIAP RILIS: ' + problems.length + ' masalah, ' + nOk + ' cek lulus.\n- ' + problems.join('\n- ') : 'SIAP RILIS: ' + nOk + ' cek lulus.'));
process.exit(problems.length ? 1 : 0);
