// TileGrow v1.3 — mode online (server LAN). Mode offline tetap memakai kode lama (localStorage).
// Online: server memegang world, tas, gems, XP, quest. Browser mengirim maksud ('act': pukul/pasang/tanam/atur),
// server membalas perubahan tile ('ops') + keadaan tas ('econ'). Drop item dibagi semua pemain di world.
// Ditambah: role (@ ungu = Moderator, @ oranye = Developer), command staff, teman, report, trade.
const net = {
  mode: 'offline',            // 'offline' | 'online'
  ws: null, myId: 0, addr: '', waiters: [],
  players: new Map(),         // id -> pemain lain {name, flag, s, rx, ry, fake, bubble}
  worldList: [], player: null,
  dirty: new Set(), pending: new Map(),
  sendT: 0, lastSent: '', joining: null,
  role: 'player', display: '', staff: {noclip: false, zoom: false, invis: false}, frozen: false,
  friends: [], freqs: [], trade: null, tradeReq: null
};
const ROLE_COLOR = {mod: '#c07cff', dev: '#ff9a2e', owner: '#ff9a2e'};
function roleColor(role){ return ROLE_COLOR[role] || null; }
// kirim maksud aksi ke server (pukul / pasang / tanam)
function netAct(a, i, key){ netSend({t: 'act', a, i, key}); }
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
  net.player = r.player; net.econ = r.econ; net.role = r.role || 'player'; net.display = r.display || r.user;
  return null;
}
// muat data pemain dari server (atau buat baru)
function netLoadPlayer(){
  genWorld();                                   // world latar sementara (diganti saat join)
  const d = net.player || {}, E = net.econ;
  // v1.3: tas, gems, XP, quest datang dari server
  if (E){ bag = E.bag; bagSlots = E.bagSlots; gems = E.gems; prog = E.prog; }
  selKey = d.selKey || FIST; hot = d.hot || []; if (!hot.length || !hot[0]) initHotbar();
  worn = Object.assign({wings:null,hat:null,shirt:null,pants:null,tool:null}, d.worn || {}); invRows = d.invRows || 0;
  Object.assign(settings, d.settings || {}); if (d.zoom) zoom = d.zoom;
  playerName = account; respawn();
  inGame = false; worlds = {};
  lobbyHistory = d.lobbyHistory || [];
  chat.length = 0;
  return d.controls;
}
// browser hanya menyimpan pengaturan tampilan; tas/gems/XP disimpan server
function netSavePlayer(){
  if (!online() || !account) return;
  netSend({t: 'save', data: {selKey, hot, zoom: net.staff.zoom ? net.zoomBefore || zoom : zoom, settings, worn, invRows, controls: controlMode, lobbyHistory}});
}
// keadaan ekonomi dari server: ganti tas/gems/progres, tampilkan pesan (naik level, quest, dll)
function applyEcon(m){
  const prevGems = gems, prevLevel = prog ? prog.level : 0;
  bag = m.bag; bagSlots = m.bagSlots; gems = m.gems; prog = m.prog;
  if (!bag.some(s => s.key === selKey)) selKey = hot[0] && bag.some(s => s.key === hot[0]) ? hot[0] : FIST;
  hot = hot.map((h, i) => i === 0 ? (h && bag.some(s => s.key === h) ? h : FIST) : (h && bag.some(s => s.key === h) ? h : null));
  for (const sl of Object.keys(worn)) if (worn[sl] && !bag.some(s => s.key === worn[sl])) worn[sl] = null;
  for (const s of bag) if (!hot.includes(s.key) && s.key !== FIST && s.key !== WRENCH && itemDef(s.key).kind !== 'wear'){ const e = hot.findIndex((h, i) => i > 0 && !h); if (e > 0) hot[e] = s.key; }
  for (const [k, t] of m.msgs || []){
    if (k === 'toast') toast(t); else say(k === 'pick' ? 'pick' : k, t);
    if (k === 'level'){ burst(pl.x + pl.w/2, pl.y, '#ffe27a', 24); sfx('level'); }
  }
  if (gems > prevGems) sfx('gem');
  refreshUI();
}

// ---------- world online ----------
function netRequestWorlds(){ netSend({t: 'worlds'}); }
function netJoin(name){ net.joining = name; netSend({t: 'join', name}); }
function netLeave(){ netSend({t: 'leave'}); net.players.clear(); }
function netEnterWorld(name, data, drops){
  storeCurrentWorld();
  worldName = name; restoreWorld(data); worlds = {[name]: data};
  for (const d of drops || []) addServerDrop(d, true);
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
      return netSend({t: 'join', name: m.name});           // v1.3: world baru dibuat server
    }
    case 'world': {
      net.myId = m.you;
      netEnterWorld(m.name, m.data, m.drops);
      for (const p of m.players || []) addRemote(p.id, p.name, p.flag, p.state, p.role, p.display);
      if (m.players && m.players.length) say('sys', 'Di world ini: ' + m.players.map(p => p.name).join(', ') + '.');
      return;
    }
    case 'you': net.myId = m.id; return;
    case 'pjoin': addRemote(m.id, m.name, m.flag, m.state || null, m.role, m.display); if (!m.quiet) say('sys', (m.display || m.name) + ' masuk ke world.'); return;
    case 'pleave': { const r = net.players.get(m.id); if (r){ net.players.delete(m.id); if (!m.quiet) say('sys', r.display + ' keluar dari world.'); } if (net.trade && r && net.trade.with === r.name) closeTradeUI(); return; }
    case 'prole': { const r = net.players.get(m.id); if (r){ r.role = m.role; r.display = m.display; } return; }
    case 'pos': { const r = net.players.get(m.id); if (r) setRemoteState(r, m.s); return; }
    case 'ops':
      applyOps(m.from, m.ops || []);
      if (m.denied){ if (m.why) toast(m.why); sfx('deny'); }
      return;
    case 'chat': {
      const r = net.players.get(m.id);
      chat.push({kind: 'me', text: (m.display || m.name) + ': ' + m.text, t: Date.now(), role: m.role}); if (chat.length > 120) chat.shift(); renderChat();
      if (r) r.bubble = {text: m.text, t0: Date.now(), until: Date.now() + 2500 + m.text.length*90};
      return;
    }
    case 'err': $('lbErr') && ($('lbErr').textContent = m.text); toast(m.text); net.joining = null; return;
    case 'kicked': netKickReason = m.reason; return;
    case 'left': return;
    // ----- v1.3 -----
    case 'econ': return applyEcon(m);
    case 'dropAdd': return addServerDrop(m.d);
    case 'dropDel': { const k = items.findIndex(it => it.sid === m.id); if (k >= 0){ if (m.by === net.myId) sfx(items[k].key === 'gem' ? 'gem' : 'pick'); items.splice(k, 1); } return; }
    case 'dropSet': { const it = items.find(it => it.sid === m.id); if (it) it.n = m.n; return; }
    case 'note': if (m.once){ net.notes = net.notes || new Set(); if (net.notes.has(m.once)) return; net.notes.add(m.once); } toast(m.text); say('sys', m.text); return;
    case 'staff': say('staff', m.text); return;
    case 'role': net.role = m.role; net.display = m.display; toast('Role kamu sekarang: ' + ({mod:'Moderator', dev:'Developer', owner:'Owner'}[m.role] || 'Player')); refreshUI(); return;
    case 'staffFx': return applyStaffFx(m);
    case 'frozen': net.frozen = m.on; toast(m.on ? 'Kamu dibekukan oleh ' + m.by + '.' : 'Kamu bisa bergerak lagi.'); return;
    case 'tp': if (m.x !== null && m.x !== undefined){ pl.x = m.x; pl.y = m.y; pl.px = m.x; pl.py = m.y; pl.vx = pl.vy = 0; } return;
    case 'friends': net.friends = m.friends || []; net.freqs = m.requests || []; if (!$('friendsM').classList.contains('hidden')) renderFriends(); refreshUI(); return;
    case 'friendReq': toast((m.display || m.from) + ' ingin berteman. Buka tab Teman.'); say('sys', (m.display || m.from) + ' mengirim permintaan teman.'); return;
    case 'profile': return showPlayerProfile(m);
    case 'tradeReq': net.tradeReq = {from: m.from, display: m.display, t: Date.now()}; return showTradeRequest(m);
    case 'trade': net.trade = m; return renderTrade();
    case 'tradeEnd': { const why = m.why; closeTradeUI(); if (why !== 'ok') toast(why); return; }
  }
}

// ---------- pemain lain ----------
const WEAR_SLOTS = ['wings','hat','shirt','pants','tool'];
function cleanWorn(w){ const o = {wings:null,hat:null,shirt:null,pants:null,tool:null}; if (w) for (const s of WEAR_SLOTS) if (WEAR[w[s]] && WEAR[w[s]].slot === s) o[s] = w[s]; return o; }
function cleanHeld(k){
  if (k === FIST || k === WRENCH) return k;
  const mt = /^([bs])(\d+)$/.exec(k || ''); return mt && BY_ID[+mt[2]] && TEX[+mt[2]] ? k : FIST;
}
function addRemote(id, name, flag, s, role, display){
  const r = {id, name, flag: FLAG_DEF[flag] ? flag : 'ID', s: null, rx: 0, ry: 0, bubble: null, role: role || 'player', display: display || name,
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
let HELD_OVERRIDE = null, NAME_OVERRIDE = null;
const WRENCH_HOLD = () => online() && bag && selected().key === WRENCH;
// kotak ikon kunci inggris di samping nama pemain lain (koordinat world)
function wrenchIconBox(r){ ctx.font = 'bold 9px system-ui'; const w = ctx.measureText(r.display).width; return {x: r.rx + 13 + 6 + w/2 + 4, y: r.ry - 16, w: 13, h: 13}; }
function drawWrenchTag(b){
  ctx.fillStyle = OL; ctx.beginPath(); ctx.roundRect(b.x - 1.5, b.y - 1.5, b.w + 3, b.h + 3, 4); ctx.fill();
  ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 3); ctx.fill();
  drawWrench(ctx, b.x + b.w/2, b.y + b.h/2, .42);
}
// klik di layar: cek apakah mengenai ikon kunci inggris pemain lain
function remoteWrenchHit(wx, wy){
  for (const r of net.players.values()) if (r.wbox && wx >= r.wbox.x - 3 && wx <= r.wbox.x + r.wbox.w + 3 && wy >= r.wbox.y - 3 && wy <= r.wbox.y + r.wbox.h + 3) return r;
  return null;
}
function drawRemotePlayers(){
  if (!net.players.size) return;
  const saved = {pl, worn, bubble, playerFlag, playerName, guest};
  try {
    for (const r of net.players.values()){
      if (!r.s) continue;
      pl = r.fake; worn = r.worn; bubble = r.bubble; playerFlag = r.flag; playerName = r.name; guest = false;
      HELD_OVERRIDE = {key: r.held, n: 1}; NAME_OVERRIDE = {text: r.display, color: roleColor(r.role)};
      drawPlayer(r.rx, r.ry);
      // ikon kunci inggris di samping nama saat kita memegang Kunci Inggris: klik = menu pemain (trade, teman, report)
      if (WRENCH_HOLD()){ const b = wrenchIconBox(r); drawWrenchTag(b); r.wbox = b; } else r.wbox = null;
    }
  } finally {
    ({pl, worn, bubble, playerFlag, playerName, guest} = saved); HELD_OVERRIDE = null; NAME_OVERRIDE = null;
  }
}
// ---------- drop dari server ----------
function addServerDrop(d, silent){
  if (items.some(it => it.sid === d.id)) return;
  items.push({sid: d.id, x: d.x, y: d.y, vy: silent ? 0 : -120 - Math.random()*90, vx: silent ? 0 : (Math.random()-.5)*60, key: d.key, n: d.n, lock: Date.now() + Math.max(250, d.lock - Date.now())});
}
// ---------- efek khusus staff ----------
function applyStaffFx(m){
  if ('noclip' in m) net.staff.noclip = m.noclip;
  if ('invis' in m) net.staff.invis = m.invis;
  if ('zoom' in m){
    net.staff.zoom = m.zoom;
    if (m.zoom){ net.zoomBefore = zoom; zoom = 0; setZoom(fullWorldZoom()); } else { const z = net.zoomBefore || ZOOM_MIN; zoom = 0; setZoom(z); }
  }
  refreshUI();
}
// zoom yang memperlihatkan seluruh world (100x60 tile) di layar
function fullWorldZoom(){ return Math.min(VW / (COLS*TS), VH / (ROWS*TS)); }
function staffZoomMin(){ return online() && net.staff.zoom ? fullWorldZoom() : ZOOM_MIN; }

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
