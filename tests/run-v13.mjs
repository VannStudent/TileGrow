// Menjalankan server (data kosong, mode tes) lalu tes v1.3, dengan stdin server bisa ditulis oleh tes (perintah console).
//   node tests/run-v13.mjs            -> tes ekonomi, trade, teman, report, role
//   node tests/run-v13.mjs security   -> tes keamanan
import {spawn} from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = fs.mkdtempSync(path.join(process.env.TG_TMP || os.tmpdir(), 'tg13-'));
const PORT = 8096 + Math.floor(Math.random() * 200);
const srv = spawn(process.execPath, [path.join(root, 'server/server.js')], {env: {...process.env, TILEGROW_TEST: '1', TILEGROW_CONSOLE: '1', HOST: process.env.TG_HOST || '127.0.0.1', PORT: String(PORT), DATA_DIR: data}, stdio: ['pipe', 'pipe', 'pipe']});
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
await new Promise(r => setTimeout(r, 900));
globalThis.__serverStdin = srv.stdin;
process.env.TPORT = String(PORT);
const origExit = process.exit;
process.exit = code => {
  srv.kill();
  if (process.env.SHOW_LOG || code) console.log('\n--- log server ---\n' + log.split('\n').slice(-40).join('\n'));
  try { fs.rmSync(data, {recursive: true, force: true}); } catch(e){}
  origExit(code);
};
await import({security: './server-security.test.mjs', admin: './admin-panel.test.mjs'}[process.argv[2]] || './v13-economy-social.test.mjs');
