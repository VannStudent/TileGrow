// TileGrow LAN server v1.3 — tanpa paket npm (Node >= 18).
// - HTTP: menyajikan game (tilegrow.html + js/) supaya HP/laptop di WiFi yang sama cukup buka http://IP-PC:PORT
// - WebSocket (/ws): akun, daftar world, world bersama, sinkron block, posisi pemain, chat
// - Data disimpan di server/data: accounts.json, players/<user>.json, worlds/<NAMA>.json, staff-log.jsonl, reports.json,
//   ipbans.json, trade-log.jsonl
// v1.3: server MEMEGANG tas, gems, XP, quest (server/econ.js memakai aturan dari js/data.js + js/world.js).
//   Pasang block mengambil item dari tas di server, pecah block menghasilkan drop di server, drop & pickup dibagi semua pemain.
//   Ditambah role (owner/dev/mod), command staff, teman, report, dan trade aman (server/social.js).// v1.8.1: dipecah per bagian — config.js, store.js, validate.js, ws.js, auth.js, tiles.js, machines.js, chatcmd.js.
//   File ini tinggal: daftar pemain online, modul sosial/berita/panel, router pesan, HTTP, dan start/stop.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const {createSocial, RANK} = require('./social');
const {createNews} = require('./news');
const {PORT, VERSION, HOST, ROOT, DATA, N, TEST, econ, D, TS} = require('./config');
const store = require('./store');
const {readJSON, writeJSON, accounts, saveAccounts, playerFile, worldFile, worlds, validWorldName, loadWorld, flushAll, worldOwner,
  econs, econOf, saveEcon, flushEcons, pushEcon} = store;
const {validWorldData, isStr, newWorldData, cleanWorld, cleanWornS} = require('./validate');
const {wsFrame, wsControl, clientIp, Client, acceptKey} = require('./ws');

const isLocalIp = ip => ip === '127.0.0.1' || ip === '::1' || Object.values(os.networkInterfaces()).some(l => (l || []).some(a => a.address === ip));

// ---------- pemain online ----------
const clients = new Set();
function listWorlds(){
  const names = new Set(fs.readdirSync(path.join(DATA, 'worlds')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)));
  for (const n of worlds.keys()) names.add(n);
  return [...names].filter(validWorldName).sort().map(n => {
    const w = loadWorld(n);
    return {name: n, owner: w ? worldOwner(w.data) : null, players: [...clients].filter(c => c.world === n).length};
  });
}
function inWorld(name){ return [...clients].filter(c => c.world === name); }
function broadcast(world, obj, except){ const f = wsFrame(JSON.stringify(obj)); for (const c of clients) if (c.world === world && c !== except && c.alive) try { c.sock.write(f); } catch(e){} }
function findOnline(name){ const k = String(name || '').toLowerCase(); for (const c of clients) if (c.user && c.user.toLowerCase() === k) return c; return null; }
// pemain invisible (dev /invis) tidak dikirim ke pemain biasa
const visibleTo = (o, viewer) => !o.invis || social.rankOf(viewer.user) >= RANK.mod;
function playerInfo(o){ return {id: o.id, name: o.user, display: social.display(o.user), role: social.roleOf(o.user), flag: o.flag, state: o.state}; }
function leaveWorld(c){
  if (!c.world) return;
  social.onLeave(c);
  const w = c.world; c.world = null; c.state = null;
  for (const o of clients) if (o.world === w && o !== c && visibleTo(c, o)) o.send({t: 'pleave', id: c.id, name: c.user});
}
function enterWorld(c, w){
  leaveWorld(c);
  c.world = w.name; c.state = null; c.lastPos = null;
  const players = inWorld(w.name).filter(o => o !== c && visibleTo(o, c)).map(playerInfo);
  c.send({t: 'world', name: w.name, you: c.id, data: w.data, players, drops: [...w.drops.values()]});
  for (const o of clients) if (o.world === w.name && o !== c && visibleTo(c, o)) o.send({t: 'pjoin', ...playerInfo(c)});
}
function refreshVisibility(c){
  if (!c.world) return;
  for (const o of clients) if (o.world === c.world && o !== c && social.rankOf(o.user) < RANK.mod)
    o.send(c.invis ? {t: 'pleave', id: c.id, name: c.user, quiet: true} : {t: 'pjoin', ...playerInfo(c), quiet: true});
}
function kickClient(o, reason){ o.send({t: 'kicked', reason}); leaveWorld(o); o.user = null; setTimeout(() => o.close(), 50); }

// ---------- modul aksi (dibuat dengan konteks bersama; social/news diisi setelah dibuat di bawah) ----------
const ctx = {...store, clients, inWorld, broadcast, findOnline, visibleTo, kickClient, isLocalIp};
Object.assign(ctx, require('./tiles')(ctx));
Object.assign(ctx, require('./machines')(ctx));
Object.assign(ctx, require('./chatcmd')(ctx));
Object.assign(ctx, require('./auth')(ctx));
const {spawnDropS, checkMove, handleAct, handleChess, handleVend, emoteCmd, broadcastCmd, privateMsg, handleAuth} = ctx;

// ---------- modul sosial ----------
const social = createSocial({
  DATA, accounts, saveAccounts, clients, findOnline, kickClient, econ, econOf, saveEcon, pushEcon, isLocalIp, refreshVisibility,
  worlds, scheduleWorldSave: store.scheduleWorldSave, playerFile, econs,   // v1.9: ganti nama / hapus akun
  roleChanged(name){ const c = findOnline(name); if (!c) return; c.send({t: 'role', role: social.roleOf(name), display: social.display(name)});
    if (social.rankOf(name) < RANK.mod){ c.noclip = c.fullzoom = c.invis = false; c.send({t: 'staffFx', noclip: false, zoom: false, invis: false}); }
    if (c.world) broadcast(c.world, {t: 'prole', id: c.id, role: social.roleOf(name), display: social.display(name)}, c); },
  teleport(c, world, st){
    const w = worlds.get(world) || loadWorld(world); if (!w) return;
    if (c.world !== world) enterWorld(c, w);
    c.lastPos = null; c.send({t: 'tp', x: st ? st.x : null, y: st ? st.y : null});
  },
  shutdown: () => shutdown()
});
// v1.6: Kabar TileGrow (file server/news.txt di folder data; diedit dengan Notepad atau dari game oleh Developer)
const news = createNews({file: path.join(DATA, 'news.txt'), onChange: () => {
  const n = news.get();
  for (const o of clients) if (o.user) o.send({t: 'news', ...n, canEdit: social.rankOf(o.user) >= RANK.dev});
}});
const admin = require('./admin.js').createAdmin({social, port: PORT});
ctx.social = social; ctx.news = news;

// ---------- pesan ----------
function handle(c, m){
  const t = m && m.t;
  if (t === 'hello') return c.send({t: 'hi', server: os.hostname(), v: 13});
  if (t === 'register' || t === 'login'){
    if (c.authBusy) return;                           // satu proses login sekaligus per koneksi
    c.authBusy = true;
    return handleAuth(c, m, t).catch(e => { console.error('auth error', e); c.send({t: 'auth', ok: false, err: 'Server error.'}); }).finally(() => { c.authBusy = false; });
  }
  if (!c.user) return c.send({t: 'err', text: 'Belum login.'});

  switch (t){
    case 'worlds': return c.send({t: 'worlds', list: listWorlds()});
    case 'join': {
      const name = String(m.name || '').toUpperCase();
      if (!validWorldName(name)) return c.send({t: 'err', text: 'Nama world hanya huruf dan angka, maks 16.'});
      let w = loadWorld(name);
      if (!w){
        // v1.3: world baru dibuat server. (Mode tes: klien boleh mengirim world sendiri supaya tes bisa menyusun kasus.)
        if (TEST && m.world && validWorldData(m.world)) w = {name, data: cleanWorld(m.world, c.user), timer: null, drops: new Map()};
        else w = {name, data: newWorldData(), timer: null, drops: new Map()};
        worlds.set(name, w); writeJSON(worldFile(name), w.data);
        console.log('[world] dibuat', name, 'oleh', c.user);
      }
      return enterWorld(c, w);
    }
    case 'create': return handle(c, {...m, t: 'join'});   // klien lama
    case 'leave': leaveWorld(c); return c.send({t: 'left'});
    case 'act': return handleAct(c, m);
    case 'vend': return handleVend(c, m);
    case 'chess': return handleChess(c, m);
    case 'ops': return c.send({t: 'err', text: 'Versi game lama. Muat ulang halaman (Ctrl+F5).'});
    case 'pos': {
      if (!c.world || !m.s || typeof m.s !== 'object') return;
      const w = worlds.get(c.world); if (!w) return;
      const s = m.s, num = v => typeof v === 'number' && isFinite(v) ? v : 0;
      const st = {x: num(s.x), y: num(s.y), vx: num(s.vx), vy: num(s.vy), f: s.f < 0 ? -1 : 1, g: !!s.g, sw: num(s.sw), sa: num(s.sa),
                 fl: num(s.fl), dead: num(s.dead), an: num(s.an), held: typeof s.held === 'string' ? s.held.slice(0, 24) : 'fist',
                 worn: cleanWornS(s.worn)};
      // pakaian hanya boleh yang benar-benar ada di tas
      const E = econOf(c.user);
      for (const k of Object.keys(st.worn)) if (!E.bag.some(x => x.key === st.worn[k])) delete st.worn[k];
      if (!checkMove(c, w, st)){
        c.send({t: 'tp', x: c.lastPos ? c.lastPos.x : w.data.spawn.x * TS + 3, y: c.lastPos ? c.lastPos.y : w.data.spawn.y * TS + 2, fix: true});
        return;
      }
      c.state = st; c.lastPos = {x: st.x, y: st.y, t: Date.now()};
      for (const o of clients) if (o.world === c.world && o !== c && visibleTo(c, o)) o.send({t: 'pos', id: c.id, s: c.state});
      return;
    }
    case 'pickup': {
      // ambil drop: harus dekat (2 tile) dan sudah lewat masa tunggu
      const w = worlds.get(c.world); if (!w || !c.state || c.frozen) return;
      const dr = w.drops.get(m.id); if (!dr) return;
      if (Date.now() < dr.lock || (dr.owner === c.user && Date.now() < dr.t + 1500)) return;
      if (Math.hypot(c.state.x + 13 - dr.x, c.state.y + 15 - dr.y) > TS * 2.2) return;
      const E = econOf(c.user);
      const got = econ.run(E, g => g.addItem(dr.key, dr.n));
      if (!got){ return c.send({t: 'note', text: 'Tas penuh atau stack sudah 200.', once: 'full' + dr.id}); }
      dr.n -= got;
      if (dr.n <= 0){ w.drops.delete(dr.id); broadcast(w.name, {t: 'dropDel', id: dr.id, by: c.id}); }
      else broadcast(w.name, {t: 'dropSet', id: dr.id, n: dr.n});
      saveEcon(c.user); return pushEcon(c);
    }
    case 'drop': case 'trash': {
      const w = worlds.get(c.world); if (!w || !c.state || c.frozen) return;
      const key = String(m.key || ''), n = m.n | 0;
      if (!econ.isKey(key) || key === D.FIST || key === D.WRENCH || n < 1) return;
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user);
      const k = econ.run(E, g => g.takeItem(key, n)); if (!k) return;
      if (t === 'drop'){
        const f = c.state.f || 1;
        spawnDropS(w, c.state.x + 13 + f * TS * 1.2, c.state.y + 6, key, k, 1500, c.user);
        econ.out.push(['act', 'Kamu men-drop ' + k + ' ' + D.itemDef(key).name + '.']);
      } else econ.out.push(['act', k + ' ' + D.itemDef(key).name + ' dibuang.']);
      saveEcon(c.user); return pushEcon(c);
    }
    case 'buy': {
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user), err = econ.buy(E, String(m.key || ''));
      if (err){ econ.out.length = 0; return c.send({t: 'note', text: err}); }
      saveEcon(c.user); return pushEcon(c);
    }
    case 'newsGet': return c.send({t: 'news', ...news.get(), canEdit: social.rankOf(c.user) >= RANK.dev, open: true});
    case 'newsSet': {
      // v1.6: hanya Developer/Owner yang boleh mengubah Kabar TileGrow
      if (social.rankOf(c.user) < RANK.dev) return c.send({t: 'note', text: 'Hanya Developer yang bisa mengedit berita.'});
      const t = String(m.text || '');
      if (t.length > news.MAX) return c.send({t: 'note', text: 'Berita terlalu panjang (maks ' + news.MAX + ' huruf).'});
      news.set(t); social.staffLog(c.user, 'news', null, {len: t.length});
      return c.send({t: 'note', text: 'Berita disimpan & dikirim ke semua pemain.'});
    }
    case 'lockConvert': {
      // v1.4: 100 World Lock <-> 1 Crystal Lock
      if (social.inTrade(c.user)) return c.send({t: 'note', text: 'Selesaikan trade dulu.'});
      const E = econOf(c.user), key = m.key === 'b34' ? 'b34' : 'b30';
      const err = econ.run(E, g => g.convertLocks(key));
      if (err){ econ.out.length = 0; return c.send({t: 'note', text: err}); }
      saveEcon(c.user); return pushEcon(c);
    }
    case 'claim': {
      const E = econOf(c.user), i = m.i | 0;
      econ.run(E, g => g.claimQuest(i)); saveEcon(c.user); return pushEcon(c);
    }
    case 'stat': {
      // statistik tanpa hadiah item/gems yang dihitung browser (lompat, pakai wearable, mati)
      const E = econOf(c.user);
      if (m.k === 'jump' && (c.jumps = (c.jumps || 0) + 1) && Date.now() - (c.jumpT || 0) > 150){ c.jumpT = Date.now(); econ.run(E, g => g.questEvent('jump', null, 1)); }
      else if (m.k === 'wear') econ.run(E, g => g.questEvent('wear', null, 1));
      else if (m.k === 'death') econ.run(E, g => { E.prog.stats.deaths = (E.prog.stats.deaths || 0) + 1; });
      else return;
      saveEcon(c.user); if (econ.out.length) pushEcon(c); return;
    }
    case 'chat': {
      if (!c.world) return;
      // v1.6: command boleh lebih panjang (/broadcast 120 huruf + nama command); chat biasa tetap 120
      const raw = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim(), text = raw.slice(0, raw[0] === '/' ? 160 : 120);
      if (!text) return;
      if (text[0] === '/'){
        if (TEST && /^\/testgive /.test(text)){ const [, k, n] = text.split(' '); econ.run(econOf(c.user), g => k === 'gem' ? g.addGems(+n) : g.addItem(k, +n)); return pushEcon(c); }
        if (privateMsg(c, text)) return;
        if (broadcastCmd(c, text)) return;
        if (emoteCmd(c, text)) return;
        if (social.command(c, text)) return;
        return c.send({t: 'note', text: 'Perintah tidak dikenal: ' + text.split(' ')[0]});
      }
      const mu = social.muteInfo(accounts[c.user.toLowerCase()]);
      if (mu) return c.send({t: 'note', text: 'Kamu di-mute sampai ' + new Date(mu.until).toLocaleTimeString('id-ID') + '.'});
      for (const o of clients) if (o.world === c.world && o !== c && visibleTo(c, o)) o.send({t: 'chat', id: c.id, name: c.user, display: social.display(c.user), role: social.roleOf(c.user), text});
      return;
    }
    // ----- teman / report / trade -----
    case 'friendReq': return social.friendReq(c, m.name);
    case 'friendAccept': return social.friendAccept(c, m.name);
    case 'friendDecline': return social.friendDecline(c, m.name);
    case 'friendRemove': return social.friendRemove(c, m.name);
    case 'friends': return c.send({t: 'friends', ...social.friendList(c.user)});
    case 'report': return social.report(c, m.name, m.reason, m.note);
    case 'tradeReq': return social.tradeRequest(c, m.name);
    case 'tradeAccept': return social.tradeAccept(c, m.name);
    case 'tradeDecline': return social.tradeDecline(c, m.name);
    case 'tradeOffer': return social.tradeOffer(c, m.items, m.gems);
    case 'tradeOk': return social.tradeOk(c, m.v);
    case 'tradeConfirm': return social.tradeConfirm(c);
    case 'tradeCancel': return social.tradeCancel(c);
    case 'profile': {
      const a = accounts[String(m.name || '').toLowerCase()]; if (!a) return;
      const E = econOf(a.name), o = findOnline(a.name);
      return c.send({t: 'profile', name: a.name, display: social.display(a.name), role: social.roleOf(a.name), flag: a.flag, level: E.prog.level,
                     online: !!o, world: o ? o.world : null, created: a.created, friend: (accounts[c.user.toLowerCase()].friends || []).includes(a.name)});
    }
    case 'save': {
      // v1.3: browser hanya menyimpan pengaturan tampilan (hotbar, zoom, kontrol). Tas/gems/XP disimpan server.
      if (!m.data || typeof m.data !== 'object') return;
      const d = m.data, f = readJSON(playerFile(c.user), {}) || {};
      const cl = {selKey: isStr(d.selKey, 24) ? d.selKey : 'fist', hot: Array.isArray(d.hot) ? d.hot.slice(0, 4).map(k => isStr(k, 24) ? k : null) : [],
                  zoom: typeof d.zoom === 'number' ? d.zoom : 1.25, settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
                  worn: cleanWornS(d.worn), invRows: d.invRows | 0, controls: ['kbm','touch','pad'].includes(d.controls) ? d.controls : null,
                  lobbyHistory: Array.isArray(d.lobbyHistory) ? d.lobbyHistory.filter(validWorldName).slice(0, 8) : []};
      if (JSON.stringify(cl).length > 20000) return;
      f.client = cl; if (!f.econ && econs.has(c.user.toLowerCase())) f.econ = econOf(c.user);
      f.v = 13; writeJSON(playerFile(c.user), f);
      return;
    }
    case 'logout': leaveWorld(c); c.user = null; return c.send({t: 'loggedOut'});
  }
}

// ---------- HTTP: sajikan game ----------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8'};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch(e){ res.writeHead(400); return res.end('Bad request'); }
  if (admin.handle(req, res, p)) return;                    // panel role: hanya dari PC server (localhost)
  if (p === '/' || p === '/index.html') p = '/tilegrow.html';
  if (!/^\/(tilegrow\.html|js\/[a-z0-9_-]+\.js)$/i.test(p)){ res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    res.end(buf);
  });
});
server.on('upgrade', (req, sock) => {
  if ((req.url || '').split('?')[0] !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket') return sock.destroy();
  const key = req.headers['sec-websocket-key']; if (!key) return sock.destroy();
  const accept = acceptKey(key);
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  clients.add(new Client(sock, clientIp(req, sock), {onMessage: handle, onClose: c => { leaveWorld(c); clients.delete(c); }}));
});
// ping tiap 20 dtk supaya koneksi mati terdeteksi
setInterval(()=>{ for (const c of clients) try { c.sock.write(wsControl(9)); } catch(e){} }, 20000);

server.on('error', e => {
  if (e.code === 'EADDRINUSE'){
    console.error('');
    console.error('  GAGAL: port ' + PORT + ' sudah dipakai program lain.');
    console.error('  Biasanya ini jendela server TileGrow LAMA yang masih terbuka.');
    console.error('  Tutup semua jendela hitam "TileGrow Server" yang lain, lalu jalankan start-server.bat lagi.');
    console.error('  (Atau pakai port lain: buka cmd di folder ini, ketik  set PORT=8081 && node server\\server.js )');
    console.error('');
  } else console.error('Server gagal jalan: ' + e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log('TileGrow server jalan di port ' + PORT);
  console.log('  Di PC ini      : http://localhost:' + PORT);
  if (HOST === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) console.log('  Di WiFi/LAN    : http://' + a.address + ':' + PORT);
  console.log('Data disimpan di ' + DATA + '. Tekan Ctrl+C untuk berhenti.');
  console.log('Ketik "help" di jendela ini untuk perintah server (misalnya: role NAMA dev).');
  console.log('Panel role (hanya dari PC ini): ' + admin.url + '   <- atau klik dua kali Panel-Role.bat');
  console.log('Versi server: ' + VERSION);
});
function shutdown(){ console.log('\nMenyimpan world & pemain...'); flushAll(); flushEcons(); process.exit(0); }
// console server: atur role dari jendela server (ketik help)
if (process.stdin.isTTY || process.env.TILEGROW_CONSOLE === '1'){
  const rl = readline.createInterface({input: process.stdin});
  rl.on('line', line => { try { social.consoleCmd(line); } catch(e){ console.error(e.message); } });
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
// jaring pengaman: error tak terduga dicatat dan world disimpan, server tidak ikut mati
process.on('uncaughtException', e => { console.error('uncaught', e); try { flushAll(); flushEcons(); } catch(_){} });
