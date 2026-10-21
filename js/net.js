// TileGrow v1.0 — mode online (server LAN). Mode offline tetap memakai kode lama (localStorage).
// Online: akun & save pemain di server, world dibagi bersama, perubahan tile dikirim sebagai op [idx, fg, bg, meta, tree],
// posisi pemain 15x/detik, chat + balon chat. Server v1.0 masih percaya laporan browser (anti-cheat di v1.1).
const net = {
  mode: 'offline',            // 'offline' | 'online'
  ws: null, myId: 0, addr: '', waiters: [],
  players: new Map(),         // id -> pemain lain {name, flag, s, rx, ry, fake, bubble}
  worldList: [], player: null,
  dirty: new Set(), pending: new Map(),
  sendT: 0, lastSent: '', joining: null
};
function online(){ return net.mode === 'online' && net.ws && net.ws.readyState === 1; }
function defaultServerAddr(){
  if (location.protocol.startsWith('http')) return location.host;
  return localStorage.getItem('tilegrow-server') || 'localhost:8080';
}

// ---------- koneksi ----------
function netConnect(addr){
  return new Promise((resolve, reject) => {
    if (net.ws){ try { net.ws.onclose = null; net.ws.close(); } catch(e){} }
    addr = String(addr || '').trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!addr) return reject(new Error('Alamat server kosong.'));
    let ws;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + addr + '/ws'); } catch(e){ return reject(new Error('Alamat server tidak valid.')); }
    const to = setTimeout(()=>{ try { ws.close(); } catch(e){} reject(new Error('Server tidak menjawab. Cek alamat dan pastikan server jalan.')); }, 5000);
    ws.onopen = ()=>{ clearTimeout(to); net.ws = ws; net.addr = addr; net.mode = 'online'; localStorage.setItem('tilegrow-server', addr); resolve(); };
    ws.onerror = ()=>{};
    ws.onclose = ()=>{ clearTimeout(to); if (net.ws === ws) netLost(); else reject(new Error('Tidak bisa terhubung ke ' + addr + '.')); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch(err){ return; } netOnMessage(m); };
  });
}
function netSend(obj){ if (online()) net.ws.send(JSON.stringify(obj)); }
// tunggu satu jenis pesan dari server (dipakai untuk login/daftar)
function netWait(types, ms){
  return new Promise((resolve, reject) => {
    const w = {types: [].concat(types), resolve, t: setTimeout(()=>{ net.waiters = net.waiters.filter(x => x !== w); reject(new Error('Server tidak menjawab.')); }, ms || 6000)};
    net.waiters.push(w);
  });
}
let netKickReason = '';
function netLost(){
  const wasOnline = net.mode === 'online';
  net.ws = null; net.players.clear();
  if (!wasOnline) return;
  net.mode = 'offline';
  if (account){ account = null; inGame = false; showScreen('title'); toast(netKickReason || 'Koneksi ke server terputus.'); }
  netKickReason = '';
}
function netDisconnect(){ if (net.ws){ const ws = net.ws; net.ws = null; ws.onclose = null; try { ws.close(); } catch(e){} } net.mode = 'offline'; net.players.clear(); }

// ---------- akun online ----------
async function netAuth(kind, user, pass, pass2){
  user = (user || '').trim();
  if (!validUser(user)) return 'Username 3–16 karakter, hanya huruf dan angka (tanpa spasi atau simbol).';
  if (kind === 'register'){
    if ((pass || '').length < 6) return 'Password minimal 6 karakter.';
    if (pass !== pass2) return 'Konfirmasi password tidak sama.';
  }
  netSend({t: kind, user, pass, flag: pickedFlag});
  let r; try { r = await netWait('auth'); } catch(e){ return e.message; }
  if (!r.ok) return r.err;
  account = r.user; playerFlag = FLAG_DEF[r.flag] ? r.flag : FLAGS[0];
  net.player = r.player;
  return null;
}
// muat data pemain dari server (atau buat baru)
function netLoadPlayer(){
  genWorld();                                   // isi awal: tas, gems, progres (world latar diganti saat join)
  const d = net.player;
  if (d && d.v === 10){
    bag = d.bag; bagSlots = d.bagSlots; gems = d.gems; prog = d.prog; selKey = d.selKey || FIST; hot = d.hot || []; if (!hot.length) initHotbar();
    worn = Object.assign({wings:null,hat:null,shirt:null,pants:null,tool:null}, d.worn || {}); invRows = d.invRows || 0;
    Object.assign(settings, d.settings || {}); if (d.zoom) zoom = d.zoom;
  }
  playerName = account; rollQuests(); respawn();
  inGame = false; worlds = {};
  lobbyHistory = (prog && prog.lobbyHistory) || [];
  return d && d.controls;
}
function netSavePlayer(){
  if (!online() || !account || !prog) return;
  prog.lobbyHistory = lobbyHistory;
  netSend({t: 'save', data: {v: 10, bag, bagSlots, gems, selKey, hot, zoom, prog, settings, worn, invRows, controls: controlMode}});
}

// ---------- world online ----------
function netRequestWorlds(){ netSend({t: 'worlds'}); }
function netJoin(name){ net.joining = name; netSend({t: 'join', name}); }
function netLeave(){ netSend({t: 'leave'}); net.players.clear(); }
function netEnterWorld(name, data){
  storeCurrentWorld();
  worldName = name; restoreWorld(data); worlds = {[name]: data};
  net.players.clear(); net.dirty.clear(); net.pending.clear();
  respawn(); pushHistory(name); inGame = true; net.joining = null;
  chat.length = 0; say('sys', 'Masuk ke world ' + name + ' (online).');
  closeModals(); showScreen('game'); refreshUI(); netSavePlayer();
}

// tile berubah di sini: catat, dikirim di akhir frame
function netTouch(i){ if (online() && inGame) net.dirty.add(i); }
function tileOp(i){
  let m = meta.get(i) || null, tr = trees.get(i) || null;
  if (m) m = JSON.parse(JSON.stringify(m));
  return [i, fg[i], bgw[i], m, tr ? {...tr} : null];
}
function netFlush(){
  if (!net.dirty.size) return;
  const ops = [...net.dirty].map(tileOp); net.dirty.clear();
  for (const [i] of ops) net.pending.set(i, (net.pending.get(i) || 0) + 1);
  netSend({t: 'ops', ops});
}
function applyOps(from, ops){
  let lockChange = false;
  for (const [i, f, b, m, tr] of ops){
    if (from === net.myId){
      const p = (net.pending.get(i) || 1) - 1;
      if (p > 0){ net.pending.set(i, p); continue; }       // masih ada perubahan kita yang lebih baru untuk tile ini
      net.pending.delete(i);
    } else if (net.pending.get(i)) continue;                // perubahan kita akan tiba di server setelah ini
    const before = fg[i];
    if ((m && m.lock) || (meta.get(i) && meta.get(i).lock)) lockChange = true;
    fg[i] = f; bgw[i] = b;
    if (m) meta.set(i, m); else meta.delete(i);
    if (tr) trees.set(i, tr); else trees.delete(i);
    dmg.delete('f' + i); dmg.delete('g' + i);
    if (from !== net.myId && before !== f){ const x = i % COLS, y = (i / COLS) | 0; puff(x, y, f || before || 1, 6); }
  }
  if (lockChange) markLocksDirty();
}

// ---------- pesan dari server ----------
function netOnMessage(m){
  for (const w of net.waiters) if (w.types.includes(m.t)){ clearTimeout(w.t); net.waiters = net.waiters.filter(x => x !== w); w.resolve(m); return; }
  switch (m.t){
    case 'hi': return;
    case 'worlds': net.worldList = m.list || []; if (!document.getElementById('scr-lobby').classList.contains('hidden')) renderLobby(); return;
    case 'needWorld': {                                    // world belum ada di server: buat di sini, kirim ke server
      if (net.joining !== m.name) return;
      genTerrain(); return netSend({t: 'create', name: m.name, world: snapshotWorld()});
    }
    case 'world': {
      net.myId = m.you;
      netEnterWorld(m.name, m.data);
      for (const p of m.players || []) addRemote(p.id, p.name, p.flag, p.state);
      if (m.players && m.players.length) say('sys', 'Di world ini: ' + m.players.map(p => p.name).join(', ') + '.');
      return;
    }
    case 'you': net.myId = m.id; return;
    case 'pjoin': addRemote(m.id, m.name, m.flag, null); say('sys', m.name + ' masuk ke world.'); return;
    case 'pleave': { const r = net.players.get(m.id); if (r){ net.players.delete(m.id); say('sys', r.name + ' keluar dari world.'); } return; }
    case 'pos': { const r = net.players.get(m.id); if (r) setRemoteState(r, m.s); return; }
    case 'ops':
      applyOps(m.from, m.ops || []);
      if (m.denied && m.from === net.myId){ toast('Perubahan ditolak server (area dikunci / tidak valid).'); sfx('deny'); }
      return;
    case 'chat': {
      const r = net.players.get(m.id);
      say('me', m.name + ': ' + m.text);
      if (r) r.bubble = {text: m.text, t0: Date.now(), until: Date.now() + 2500 + m.text.length*90};
      return;
    }
    case 'err': $('lbErr') && ($('lbErr').textContent = m.text); toast(m.text); net.joining = null; return;
    case 'kicked': netKickReason = m.reason; return;
    case 'left': return;
  }
}

// ---------- pemain lain ----------
const WEAR_SLOTS = ['wings','hat','shirt','pants','tool'];
function cleanWorn(w){ const o = {wings:null,hat:null,shirt:null,pants:null,tool:null}; if (w) for (const s of WEAR_SLOTS) if (WEAR[w[s]] && WEAR[w[s]].slot === s) o[s] = w[s]; return o; }
function cleanHeld(k){
  if (k === FIST || k === WRENCH) return k;
  const mt = /^([bs])(\d+)$/.exec(k || ''); return mt && BY_ID[+mt[2]] && TEX[+mt[2]] ? k : FIST;
}
function addRemote(id, name, flag, s){
  const r = {id, name, flag: FLAG_DEF[flag] ? flag : 'ID', s: null, rx: 0, ry: 0, bubble: null,
    fake: {x:0, y:0, vx:0, vy:0, w:26, h:30, face:1, onGround:true, step:0, swing:0, swingAng:0, land:0, flap:0, hurt:0, dead:0, angel:0}};
  net.players.set(id, r);
  if (s) setRemoteState(r, s);
  return r;
}
function setRemoteState(r, s){
  const first = !r.s;
  r.s = s; r.worn = cleanWorn(s.worn); r.held = cleanHeld(s.held);
  if (first){ r.rx = s.x; r.ry = s.y; }
  const f = r.fake; f.vx = s.vx; f.vy = s.vy; f.face = s.f; f.onGround = s.g; f.swingAng = s.sa; f.flap = s.fl; f.dead = s.dead; f.angel = s.an;
  if (s.sw > f.swing) f.swing = s.sw;
}
// dipanggil tiap frame: gerak halus menuju posisi terakhir + animasi langkah
function updateRemotes(dt){
  for (const r of net.players.values()){
    if (!r.s) continue;
    const k = Math.min(1, dt * 14);
    r.rx += (r.s.x + r.s.vx*0.05 - r.rx) * k; r.ry += (r.s.y - r.ry) * k;
    if (Math.abs(r.s.x - r.rx) > TS*4 || Math.abs(r.s.y - r.ry) > TS*4){ r.rx = r.s.x; r.ry = r.s.y; }   // teleport/respawn
    const f = r.fake; f.x = r.rx; f.y = r.ry;
    if (f.onGround && Math.abs(f.vx) > 20) f.step += Math.abs(f.vx) * dt * .055; else f.step *= Math.pow(.8, dt*60);
    if (f.swing > 0) f.swing = Math.max(0, f.swing - dt);
    if (f.flap > 0) f.flap = Math.max(0, f.flap - dt);
  }
}
let HELD_OVERRIDE = null;
function drawRemotePlayers(){
  if (!net.players.size) return;
  const saved = {pl, worn, bubble, playerFlag, playerName, guest};
  try {
    for (const r of net.players.values()){
      if (!r.s) continue;
      pl = r.fake; worn = r.worn; bubble = r.bubble; playerFlag = r.flag; playerName = r.name; guest = false;
      HELD_OVERRIDE = {key: r.held, n: 1};
      drawPlayer(r.rx, r.ry);
    }
  } finally {
    ({pl, worn, bubble, playerFlag, playerName, guest} = saved); HELD_OVERRIDE = null;
  }
}
// kirim posisi kita ~15x/detik (lebih jarang kalau diam)
function netTick(dt){
  if (!online() || !inGame) return;
  updateRemotes(dt);
  netFlush();
  net.sendT += dt;
  if (net.sendT < 1/15) return;
  const s = {x: Math.round(pl.x*10)/10, y: Math.round(pl.y*10)/10, vx: Math.round(pl.vx), vy: Math.round(pl.vy), f: pl.face, g: pl.onGround,
    sw: Math.round(pl.swing*100)/100, sa: Math.round(pl.swingAng*100)/100, fl: Math.round(pl.flap*100)/100, dead: Math.round(pl.dead*10)/10,
    an: Math.round(pl.angel*10)/10, held: selected().key, worn};
  const key = JSON.stringify(s);
  if (key === net.lastSent && net.sendT < 1) return;
  net.sendT = 0; net.lastSent = key;
  netSend({t: 'pos', s});
}
setInterval(()=>{ if (online() && account) netSavePlayer(); }, 5000);
