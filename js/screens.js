// TileGrow v0.8 — layar sebelum main: Judul → Akun Tiles (login/daftar) → Lobby (isi nama world, riwayat, world milikku)
// Akun disimpan lokal di browser (localStorage). Password tidak disimpan: yang disimpan hanya hash SHA-256 dari salt + password.
// Tiap akun punya save sendiri (world, tas, gems, level). Struktur ini bisa dipindah ke server nanti.

const ACC_KEY = 'tilegrow-accounts-v1';     // { username: {salt, hash, created, controls} }
let account = null;                          // username yang sedang login
let inGame = false;
let lobbyHistory = [];                       // world yang baru dikunjungi (per akun)

function accounts(){ try { return JSON.parse(localStorage.getItem(ACC_KEY) || '{}'); } catch(e){ return {}; } }
function saveAccounts(a){ localStorage.setItem(ACC_KEY, JSON.stringify(a)); }
function saveKeyFor(user){ return SAVE_KEY + ':' + user.toLowerCase(); }

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function randSalt(){ const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join(''); }
// bendera di samping nama (dipilih saat login, bisa diganti di layar login berikutnya)
// bendera digambar sendiri (emoji bendera tidak tampil di Windows). Spesifikasi: h = garis horizontal, v = garis vertikal,
// c = lingkaran [warna, x, y, r] di atas latar
const FLAG_DEF = {
  ID:{n:'Indonesia', h:['#e8262f','#ffffff']},          MY:{n:'Malaysia', h:['#cc1f2f','#fff','#cc1f2f','#fff','#cc1f2f','#fff'], box:'#1a2a7a', c:['#ffd21f',.22,.27,.12]},
  SG:{n:'Singapura', h:['#e01f2f','#ffffff'], c:['#ffffff',.2,.25,.12]}, PH:{n:'Filipina', h:['#1a3a9a','#d8202f'], tri:'#ffffff'},
  TH:{n:'Thailand', h:['#c8202f','#fff','#232a6a','#232a6a','#fff','#c8202f']}, VN:{n:'Vietnam', h:['#d8202f'], c:['#ffd21f',.5,.5,.2]},
  JP:{n:'Jepang', h:['#ffffff'], c:['#c8202f',.5,.5,.26]}, KR:{n:'Korea', h:['#ffffff'], c:['#c8202f',.5,.5,.2]},
  CN:{n:'Tiongkok', h:['#d8202f'], c:['#ffd21f',.22,.3,.12]}, IN:{n:'India', h:['#ff9a33','#ffffff','#1a8a3a'], c:['#1a2a7a',.5,.5,.1]},
  US:{n:'Amerika', h:['#b8202f','#fff','#b8202f','#fff','#b8202f','#fff','#b8202f'], box:'#2a3a7a'},
  GB:{n:'Inggris', h:['#1a2a7a'], cross:['#ffffff','#c8202f']}, DE:{n:'Jerman', h:['#1a1a1a','#d8202f','#ffcf1f']},
  FR:{n:'Prancis', v:['#1a3a9a','#ffffff','#d8202f']}, IT:{n:'Italia', v:['#1a8a3a','#ffffff','#d8202f']},
  BR:{n:'Brasil', h:['#1a9a3a'], dia:'#ffd21f', c:['#1a3a8a',.5,.5,.18]}, AU:{n:'Australia', h:['#1a2a7a'], c:['#ffffff',.75,.6,.08]},
  SA:{n:'Arab Saudi', h:['#1a7a3a']}, TR:{n:'Turki', h:['#d8202f'], c:['#ffffff',.38,.5,.2]}, NL:{n:'Belanda', h:['#c8202f','#ffffff','#1a3a8a']}
};
const FLAGS = Object.keys(FLAG_DEF);
const _flagCache = {};
function flagImg(code){
  if (_flagCache[code]) return _flagCache[code];
  const d = FLAG_DEF[code] || FLAG_DEF.ID, W = 24, H = 16, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (d.v) d.v.forEach((c,i) => { g.fillStyle = c; g.fillRect(Math.floor(i*W/d.v.length), 0, Math.ceil(W/d.v.length), H); });
  else d.h.forEach((c,i) => { g.fillStyle = c; g.fillRect(0, Math.floor(i*H/d.h.length), W, Math.ceil(H/d.h.length)); });
  if (d.box){ g.fillStyle = d.box; g.fillRect(0, 0, W*.45, H*.55); }
  if (d.tri){ g.fillStyle = d.tri; g.beginPath(); g.moveTo(0,0); g.lineTo(W*.45, H/2); g.lineTo(0,H); g.fill(); }
  if (d.dia){ g.fillStyle = d.dia; g.beginPath(); g.moveTo(W/2,2); g.lineTo(W-3,H/2); g.lineTo(W/2,H-2); g.lineTo(3,H/2); g.fill(); }
  if (d.cross){ g.fillStyle = d.cross[0]; g.fillRect(W/2-3,0,6,H); g.fillRect(0,H/2-3,W,6); g.fillStyle = d.cross[1]; g.fillRect(W/2-1.5,0,3,H); g.fillRect(0,H/2-1.5,W,3); }
  if (d.c){ g.fillStyle = d.c[0]; g.beginPath(); g.arc(d.c[1]*W, d.c[2]*H, d.c[3]*H*1.4, 0, Math.PI*2); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.strokeRect(.5,.5,W-1,H-1);
  return _flagCache[code] = cv;
}
function flagHTML(code, h){ return '<img class="flagimg" src="' + flagImg(code).toDataURL() + '" title="' + (FLAG_DEF[code] || FLAG_DEF.ID).n + '" style="height:' + (h||14) + 'px">'; }
let pickedFlag = FLAGS[0];
function renderFlagPicker(boxId){
  const box = $(boxId); if (!box) return;
  box.innerHTML = FLAGS.map(f => '<button type="button" class="flag' + (f === pickedFlag ? ' on' : '') + '" data-f="' + f + '" title="' + FLAG_DEF[f].n + '">' + flagHTML(f, 16) + '</button>').join('');
  box.querySelectorAll('.flag').forEach(b => b.onclick = ()=>{ pickedFlag = b.dataset.f; renderFlagPicker(boxId); });
}
function validUser(u){ return /^[A-Za-z0-9]{3,16}$/.test(u); }   // tanpa spasi/simbol

async function createAccount(user, pass, pass2){
  user = (user || '').trim();
  if (!validUser(user)) return 'Username 3–16 karakter, hanya huruf dan angka (tanpa spasi atau simbol).';
  if ((pass || '').length < 6) return 'Password minimal 6 karakter.';
  if (pass !== pass2) return 'Konfirmasi password tidak sama.';
  const acc = accounts(), key = user.toLowerCase();
  if (Object.keys(acc).some(k => k.toLowerCase() === key)) return 'Username sudah dipakai.';
  const salt = randSalt();
  acc[user] = {salt, hash: await sha256(salt + ':' + pass), created: Date.now(), controls: null, flag: pickedFlag};
  saveAccounts(acc);
  return null;
}
async function login(user, pass){
  user = (user || '').trim();
  const acc = accounts(), name = Object.keys(acc).find(k => k.toLowerCase() === user.toLowerCase());
  if (!name) return 'Akun tidak ditemukan.';
  const a = acc[name];
  if (await sha256(a.salt + ':' + (pass || '')) !== a.hash) return 'Password salah.';
  account = name;
  if (pickedFlag && a.flag !== pickedFlag){ a.flag = pickedFlag; saveAccounts(acc); }
  playerFlag = FLAG_DEF[a.flag] ? a.flag : FLAGS[0];
  return null;
}
function logout(){
  if (inGame) save();
  if (online()){ netSend({t: 'logout'}); netDisconnect(); }
  account = null; inGame = false; net.mode = 'offline';
  showScreen('title');
}

// ---------- layar ----------
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== 'scr-' + id));
  document.getElementById('stage').classList.toggle('menuMode', id !== 'game');
  if (id === 'lobby') renderLobby();
  if (id === 'login' || id === 'register'){ const on = online();
    document.querySelectorAll('.modeNote').forEach(e => e.textContent = on ? 'Online di server ' + net.addr + '. Akun disimpan di server ini (password di-hash).' : 'Mode offline: akun disimpan di browser perangkat ini. Password tidak disimpan, hanya hash-nya.'); }
  if (id === 'login'){ $('lgErr').textContent = ''; renderFlagPicker('lgFlags'); setTimeout(()=> $('lgUser').focus(), 30); }
  if (id === 'register'){ $('rgErr').textContent = ''; renderFlagPicker('rgFlags'); setTimeout(()=> $('rgUser').focus(), 30); }
  if (id === 'game') requestAnimationFrame(placeTL), setTimeout(placeTL, 50);
}
// world lobby ala Growtopia: pesan sistem di atas, kolom nama world, tombol world (riwayat ungu, milikku hijau, lainnya abu),
// tombol Kembali & Masuk World di bawah
let lobbyFilter = 'semua';
function renderLobby(){
  $('lbUser').textContent = account + (online() ? ' · online di ' + net.addr : ' · offline'); $('lbFlag').innerHTML = flagHTML(playerFlag, 16);
  let all, ownedSet, lockedBy, countOf_ = () => 0;
  if (online()){
    all = net.worldList.map(w => w.name);
    const info = Object.fromEntries(net.worldList.map(w => [w.name, w]));
    ownedSet = new Set(net.worldList.filter(w => w.owner === account).map(w => w.name));
    lockedBy = n => info[n] ? info[n].owner : null;
    countOf_ = n => info[n] ? info[n].players : 0;
  } else {
    storeCurrentWorld();
    all = worldList();
    ownedSet = new Set(all.filter(n => worlds[n] && worlds[n].meta.some(([,m]) => m && m.lock && m.lock.type === 'world' && m.lock.owner === playerName)));
    lockedBy = n => { const w = worlds[n]; if (!w) return null; const e = w.meta.find(([,m]) => m && m.lock && m.lock.type === 'world'); return e ? e[1].lock.owner : null; };
  }
  let list;
  if (lobbyFilter === 'riwayat') list = lobbyHistory.slice();
  else if (lobbyFilter === 'milikku') list = [...ownedSet];
  else list = [...new Set([...lobbyHistory, ...all])];
  document.querySelectorAll('#scr-lobby .lbtab').forEach(x => x.classList.toggle('on', x.dataset.f === lobbyFilter));
  $('lbFilterName').textContent = {semua:'Semua World', riwayat:'Riwayat', milikku:'World Milikku'}[lobbyFilter];
  const btn = n => {
    const cls = ownedSet.has(n) ? 'own' : lobbyHistory.includes(n) ? 'hist' : 'other';
    const lk = lockedBy(n);
    return '<button class="wbtn ' + cls + '" data-w="' + esc(n) + '" title="' + (lk ? 'Dikunci oleh ' + esc(lk) : 'Belum dikunci') + '">' +
      (ownedSet.has(n) ? '🔒 ' : '') + esc(n) + (countOf_(n) ? ' <small>(' + countOf_(n) + ' 👤)</small>' : '') + '</button>';
  };
  $('lbWorlds').innerHTML = list.length ? list.map(btn).join('')
    : '<span class="empty">' + (lobbyFilter === 'milikku' ? 'Belum ada world yang kamu kunci dengan World Lock.' : 'Belum ada. Ketik nama world lalu Masuk World.') + '</span>';
  document.querySelectorAll('#lbWorlds .wbtn').forEach(x => x.onclick = ()=>{ $('lbWorld').value = x.dataset.w; $('lbWorld').focus(); updateEnterLabel(); });
  const online_n = online() ? net.worldList.reduce((a, w) => a + w.players, 0) : 0;
  $('lbMsg').innerHTML = '<span class="s">[S]</span> Mau ke mana, <b style="color:#7be37a">' + esc(account) + '</b>? ' +
    (online() ? '(' + all.length + ' world di server, ' + online_n + ' pemain sedang main)' : '(' + all.length + ' world di akun ini)');
  updateEnterLabel();
  setTimeout(()=> $('lbWorld').focus(), 30);
}
function updateEnterLabel(){
  const v = normWorldName($('lbWorld').value);
  const exists = online() ? net.worldList.some(w => w.name === v) : !!worlds[v];
  $('lbHint').textContent = !v ? 'Ketik nama world, lalu tekan Masuk World.' : exists ? 'Tekan Masuk World untuk masuk ke ' + v + '.' : 'World ' + v + ' belum ada. Tekan Buat World untuk membuatnya.';
  $('lbEnter').textContent = v && !exists ? 'Buat World' : 'Masuk World';
}
function pushHistory(n){
  lobbyHistory = [n, ...lobbyHistory.filter(x => x !== n)].slice(0, 8);
}
function joinWorld(){
  const raw = $('lbWorld').value;
  if (!raw.trim()){ $('lbErr').textContent = 'Isi nama world dulu.'; return; }
  if (!validWorldName(raw)){ $('lbErr').textContent = WORLD_RULE; return; }
  const n = normWorldName(raw);
  $('lbErr').textContent = '';
  if (online()){ $('lbHint').textContent = 'Menghubungkan ke world ' + n + '...'; return netJoin(n); }
  if (!inGame || n !== worldName) gotoWorld(n);
  pushHistory(n); inGame = true;
  showScreen('game'); refreshUI(); save();
}
// tombol "Keluar ke lobby" dari dalam game
function exitToLobby(){ save(); closeModals(); if (online()){ netLeave(); inGame = false; netRequestWorlds(); } showScreen('lobby'); }

function bindScreens(){
  $('lgUser').addEventListener('input', ()=>{ if (online()) return; const a = accounts(), k = Object.keys(a).find(n => n.toLowerCase() === $('lgUser').value.trim().toLowerCase());
    if (k && a[k].flag){ pickedFlag = a[k].flag; renderFlagPicker('lgFlags'); } });
  $('tPlay').onclick = ()=>{ net.mode = 'offline'; account ? showScreen('lobby') : showScreen('login'); };
  $('tOnline').onclick = ()=>{ $('svAddr').value = defaultServerAddr(); $('svErr').textContent = ''; showScreen('server'); };
  $('svBack').onclick = ()=> showScreen('title');
  $('svForm').onsubmit = async e => {
    e.preventDefault(); $('svErr').textContent = 'Menghubungkan...';
    try { await netConnect($('svAddr').value); $('svErr').textContent = ''; account = null; showScreen('login'); }
    catch(err){ $('svErr').textContent = err.message; }
  };
  $('tOptions').onclick = ()=>{ renderMenu(); openModal('menu'); };
  $('lgBack').onclick = $('rgBack').onclick = ()=> showScreen('title');
  $('lgToReg').onclick = ()=> showScreen('register');
  $('rgToLogin').onclick = ()=> showScreen('login');
  $('lgForm').onsubmit = async e => {
    e.preventDefault();
    if (online()){
      $('lgErr').textContent = 'Masuk...';
      const err = await netAuth('login', $('lgUser').value, $('lgPass').value);
      if (err) return $('lgErr').textContent = err;
      $('lgPass').value = ''; $('lgErr').textContent = '';
      const ctl = netLoadPlayer(); netRequestWorlds();
      if (!ctl) return openControlPicker(true);
      setControlMode(ctl); return showScreen('lobby');
    }
    const err = await login($('lgUser').value, $('lgPass').value);
    if (err) return $('lgErr').textContent = err;
    $('lgPass').value = '';
    loadAccountSave();
    if (!accounts()[account].controls) return openControlPicker(true);
    showScreen('lobby');
  };
  $('rgForm').onsubmit = async e => {
    e.preventDefault();
    if (online()){
      $('rgErr').textContent = 'Membuat akun...';
      const err = await netAuth('register', $('rgUser').value, $('rgPass').value, $('rgPass2').value);
      if (err) return $('rgErr').textContent = err;
      $('rgPass').value = $('rgPass2').value = ''; $('rgErr').textContent = '';
      netLoadPlayer(); netRequestWorlds(); netSavePlayer();
      return openControlPicker(true);
    }
    const err = await createAccount($('rgUser').value, $('rgPass').value, $('rgPass2').value);
    if (err) return $('rgErr').textContent = err;
    await login($('rgUser').value, $('rgPass').value);
    $('rgPass').value = $('rgPass2').value = '';
    loadAccountSave(true);
    openControlPicker(true);
  };
  $('lbForm').onsubmit = e => { e.preventDefault(); joinWorld(); };
  $('lbEnter').onclick = ()=> joinWorld();
  $('lbBack').onclick = ()=> logout();
  $('lbWorld').addEventListener('input', ()=>{ $('lbErr').textContent = ''; updateEnterLabel(); });
  document.querySelectorAll('#scr-lobby .lbtab').forEach(x => x.onclick = ()=>{ lobbyFilter = x.dataset.f; renderLobby(); });
  setInterval(()=>{ if (online() && !inGame && !document.getElementById('scr-lobby').classList.contains('hidden')) netRequestWorlds(); }, 4000);
}
// muat save milik akun; akun baru dapat dunia baru dengan nama = username
function loadAccountSave(fresh){
  const ok = !fresh && load();
  if (!ok){ genWorld(); playerName = account; rollQuests(); respawn(); }   // akun baru: nama = username (bisa diganti)
  inGame = false;
  lobbyHistory = (prog && prog.lobbyHistory) || [];
}
