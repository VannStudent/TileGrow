// TileGrow v0.4 — UI: quick bar, ikon kanan, tas, shop, profil/quest/goals, menu, dialog wrench
const $ = id => document.getElementById(id);
let toastT = 0;

function toast(msg){
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(()=> t.classList.remove('show'), 1800);
}
function cellHTML(s){ return '<img src="' + icon(s.key) + '">' + (s.key !== FIST && s.key !== WRENCH && s.n > 1 ? '<span class="n">' + s.n + '</span>' : ''); }

function openModal(id){ document.querySelectorAll('.modal').forEach(m => m.classList.toggle('hidden', m.id !== id)); refreshUI(); }
function closeModals(){ document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
function toggleModal(id){ const m = $(id); if (m.classList.contains('hidden')) openModal(id); else closeModals(); }

function refreshUI(){
  if (!bag || !prog) return;
  // statistik kanan atas
  $('gemv').textContent = gems.toLocaleString('id-ID');
  $('lvv').textContent = prog.level;
  const need = xpNeeded(prog.level);
  $('xpbar').style.width = Math.min(100, prog.xp/need*100) + '%';
  $('xpv').textContent = prog.xp + ' / ' + need + ' XP';
  const lb = $('lvBtn'); if (lb){ lb.style.setProperty('--xp', Math.min(100, Math.round(prog.xp/need*100))); lb.title = 'Level ' + prog.level + ' · ' + prog.xp + ' / ' + need + ' XP'; }
  const qb = prog.quests.filter(q => q.done && !q.claimed).length;
  const qbE = $('qbadge'); if (qbE){ qbE.textContent = qb; qbE.style.display = qb ? '' : 'none'; }
  $('guestTag').style.display = guest ? '' : 'none';

  // ===== inventory ala Growtopia: satu panel di bawah =====
  // atas: quick bar (Tinju/Kunci Inggris + 3 item terakhir), tengah: handle tarik, bawah: grid tas (0..MAX rows)
  const s0 = selected();
  const q = $('quick'); q.innerHTML = '';
  for (let i=0;i<HOT_SIZE;i++){
    const key = hot[i], it = key ? bag.find(b => b.key === key) : null, el = document.createElement('div');
    el.className = 'qs' + (it && key === s0.key ? ' on' : '') + (it ? '' : ' empty');
    el.innerHTML = it ? cellHTML(it) : '';
    if (it) el.title = itemDef(key).name + (i === 0 ? ' (klik 2x: Tinju ↔ Kunci Inggris)' : '');
    el.onclick = ()=>{ if (it) select(key); };
    if (i === 0) el.ondblclick = ()=> toggleFistWrench();
    q.appendChild(el);
  }
  const heldTxt = itemDef(s0.key).name + (s0.n > 1 ? ' × ' + s0.n : '');
  $('held').textContent = heldTxt;
  const tai = $('tActI'); if (tai && tai.dataset.k !== s0.key){ tai.dataset.k = s0.key; tai.src = icon(s0.key); }
  const ht = $('heldTag'); if (ht && ht.dataset.k !== s0.key){ ht.dataset.k = s0.key; ht.textContent = itemDef(s0.key).name; ht.classList.add('show'); clearTimeout(ht._t); ht._t = setTimeout(()=> ht.classList.remove('show'), 1600); }
  $('wname').textContent = worldName;
  $('pname').textContent = online() && net.display ? net.display : who(); if ($('pflag').dataset.f !== playerFlag){ $('pflag').dataset.f = playerFlag; $('pflag').innerHTML = flagHTML(playerFlag, 14); }
  // ikon kunci inggris di samping nama: muncul saat Kunci Inggris dipegang (atau dimiliki), klik = profil
  const holdW = selected().key === WRENCH, hasW = countOf(WRENCH) > 0;
  $('wrenchBtn').style.display = hasW ? '' : 'none';
  $('wrenchBtn').classList.toggle('active', holdW);
  $('wrenchHint').style.display = holdW ? '' : 'none';
  const wl = worldLock(); $('pname').style.color = wl && wl.lock.owner === who() ? '#5dff6a' : '';

  const g = $('grid'); g.innerHTML = '';
  const cols = invCols();
  g.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  const total = Math.max(bagSlots, Math.ceil(bag.length / cols) * cols);
  for (let i=0;i<total;i++){
    const it = bag[i], el = document.createElement('div');
    const isSel = it && it.key === s0.key, w = it && isWorn(it.key);
    el.className = 'cell' + (it ? '' : ' empty') + (isSel ? ' on' : '') + (w ? ' worn' : '') + (i >= bagSlots ? ' locked' : '');
    if (it){
      el.innerHTML = cellHTML(it) + (w ? '<span class="tag">DIPAKAI</span>' : '');
      el.title = itemDef(it.key).name + (itemDef(it.key).kind === 'wear' ? ' (klik: pakai / lepas)' : '');
      el.onclick = ()=> pickFromBag(it.key);
    }
    g.appendChild(el);
  }
  $('cap').textContent = bag.length + '/' + bagSlots;
  const locked = s0.key === FIST || s0.key === WRENCH;
  $('selnm').textContent = itemDef(s0.key).name + (s0.n > 1 ? ' × ' + s0.n : '');
  $('qty').max = s0.n;
  $('bdrop').disabled = locked; $('btrash').disabled = locked;
  applyInvHeight();
  if (!$('shop').classList.contains('hidden')) renderShop();
  if (!$('prof').classList.contains('hidden')) renderProfile();
}

// panel nama selalu tepat di bawah konsol chat (dihitung ulang saat masuk world, resize, kecil/besar)
function placeTL(){ const r = $('chatbox').getBoundingClientRect(); if (r.height > 0) document.documentElement.style.setProperty('--tlTop', Math.round(r.bottom + 8) + 'px'); }
// ---------- dialog drop (konfirmasi) ----------
function askDrop(){
  const s = selected(); if (!s || s.key === FIST || s.key === WRENCH) return toast('Item ini tidak bisa di-drop.');
  const d = itemDef(s.key);
  $('drIcon').src = icon(s.key); $('drName').textContent = d.name;
  $('drMax').textContent = s.n; $('drQty').max = s.n; $('drQty').value = Math.min(s.n, Math.max(1, qtyVal()));
  openModal('dropM'); setTimeout(()=>{ $('drQty').focus(); $('drQty').select(); }, 30);
}
function confirmDrop(){
  const s = selected(); if (!s) return closeModals();
  const n = Math.max(1, Math.min(s.n, parseInt($('drQty').value) || 1));
  closeModals(); dropSelected(n);
}
// ---------- dialog keluar lewat pintu utama ----------
function exitDoorPrompt(){ $('exName').textContent = worldName; openModal('exitM'); }

// ---------- tarik inventory ke atas / bawah ----------
// invRows = jumlah baris tas yang terlihat (0 = hanya quick bar). Bisa ditarik (drag) atau diklik handle-nya.
let invRows = 0;
const CELL = 46, GAP = 5;
function invCols(){ return Math.max(6, Math.min(12, Math.floor((Math.min(innerWidth - 40, 720) - 20) / (CELL + GAP)))); }
function maxInvRows(){ return Math.max(1, Math.ceil(Math.max(bagSlots, bag ? bag.length : 0) / invCols())); }
function rowsMaxOnScreen(){ return Math.max(1, Math.floor((innerHeight * .55 - 90) / (CELL + GAP))); }
function setInvRows(n){
  invRows = Math.max(0, Math.min(n, maxInvRows(), rowsMaxOnScreen()));
  applyInvHeight();
}
function applyInvHeight(){
  const body = $('invBody'); if (!body) return;
  const rowsH = invRows * (CELL + GAP);
  body.style.height = invRows ? (rowsH + 46) + 'px' : '0px';     // +46 untuk baris tombol drop/buang
  $('inv').classList.toggle('open', invRows > 0);
  // chat naik di atas panel kalau layar sempit, supaya tidak menutupi tas
  const invR = $('inv').getBoundingClientRect(), chatW = 230;
  const overlaps = invR.left < 12 + chatW + 8;
  document.documentElement.style.setProperty('--chatBottom', (overlaps ? (invRows ? (invRows*(CELL+GAP) + 46) : 0) + 72 : 72) + 'px');
  $('grip').title = invRows ? 'Tarik ke bawah untuk menutup' : 'Tarik ke atas untuk membuka tas';
}
function bindInvDrag(){
  const grip = $('grip'); let startY = 0, startRows = 0, dragging = false, moved = false;
  const down = e => { dragging = true; moved = false; startY = (e.touches ? e.touches[0] : e).clientY; startRows = invRows; e.preventDefault(); };
  const move = e => {
    if (!dragging) return;
    const y = (e.touches ? e.touches[0] : e).clientY, dy = startY - y;      // ke atas = positif
    if (Math.abs(dy) > 4) moved = true;
    setInvRows(Math.round(startRows + dy / (CELL + GAP)));
  };
  const up = () => {
    if (!dragging) return; dragging = false;
    if (!moved) setInvRows(invRows ? 0 : Math.min(2, maxInvRows()));      // klik = buka 2 baris / tutup
  };
  grip.addEventListener('mousedown', down); grip.addEventListener('touchstart', down, {passive:false});
  addEventListener('mousemove', move); addEventListener('touchmove', move, {passive:false});
  addEventListener('mouseup', up); addEventListener('touchend', up);
  addEventListener('resize', ()=> { setInvRows(invRows); refreshUI(); });
}

// ---------- chat ----------
// konsol ala Growtopia (di atas layar): tab SEMUA / CHAT / SISTEM / AKTIVITAS, tiap baris ada jam
const CHAT_COL = {sys:'#9fd0ff', me:'#ffffff', pick:'#7be37a', level:'#ffd25e', quest:'#ffb3e0', act:'#c9b8ff', staff:'#ff9a2e'};
const CHAT_TAG = {sys:'[S]', me:'', pick:'', level:'', quest:'', act:'', staff:'[STAFF]'};
const CHAT_GROUP = {me:'chat', sys:'sys', level:'sys', quest:'sys', pick:'act', act:'act', staff:'sys'};
let chatFilter = 'all';
function hhmmss(t){ const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2,'0')).join(':'); }
function renderChat(){
  const box = $('chatlog'); if (!box) return;
  document.querySelectorAll('#chatTabs .ctab').forEach(b => b.classList.toggle('on', b.dataset.f === chatFilter));
  const rows = chat.filter(c => chatFilter === 'all' || CHAT_GROUP[c.kind] === chatFilter).slice(-60);
  box.innerHTML = rows.map(c => {
    let txt = esc(c.text);
    // nama di chat: Moderator @ungu, Developer @oranye, pemain biasa hijau
    if (c.kind === 'me'){ const k = txt.indexOf(':'); if (k > 0) txt = '<b style="color:' + ((typeof roleColor === 'function' && roleColor(c.role)) || '#7be37a') + '">' + txt.slice(0,k) + '</b>' + txt.slice(k); }
    return '<div><span class="ts">' + hhmmss(c.t) + '</span> <span style="color:' + (CHAT_COL[c.kind] || '#fff') + '">' + (CHAT_TAG[c.kind] ? CHAT_TAG[c.kind] + ' ' : '') + txt + '</span></div>';
  }).join('') || '<div class="ts">Belum ada pesan.</div>';
  box.scrollTop = box.scrollHeight;
  $('chatbox').classList.add('fresh'); clearTimeout(renderChat.t);
  renderChat.t = setTimeout(()=> $('chatbox').classList.remove('fresh'), 6000);
}
function openChatInput(){ if ($('chatbox').classList.contains('min')){ $('chatbox').classList.remove('min'); renderChat(); placeTL(); } $('chatIn').focus(); }
function toggleHud(){ const on = $('stage').classList.toggle('hudOff'); if (!on) toast('UI ditampilkan lagi.'); }

// ---------- daftar world ----------
function renderWorlds(){
  storeCurrentWorld();
  $('wList').innerHTML = worldList().map(n => '<div class="quest"><div class="qt"><b>' + esc(n) + (n === worldName ? ' (sedang dibuka)' : '') + '</b>' +
    '<span>' + (worlds[n].meta.some(([,m]) => m && m.lock && m.lock.type === 'world') ? 'Dikunci World Lock' : 'Belum dikunci') + '</span></div>' +
    (n === worldName ? '' : '<button class="btn primary" data-w="' + esc(n) + '">Masuk</button>') + '</div>').join('');
  $('wList').querySelectorAll('[data-w]').forEach(b => b.onclick = ()=>{ closeModals(); gotoWorld(b.dataset.w); });
}

// ---------- toko (gaya kartu, terinspirasi Growtopia Store) ----------
// beranda: banner + kartu kategori besar; tiap kategori: grid kartu item berwarna; panel info + tombol Beli/Kembali di bawah
const SHOP_CATS = [
  {id:'paket',  name:'Paket Hemat',     tag:'Mulai dari sini',  color:['#ffcf3a','#e08a12'], icon:'b31'},
  {id:'farm',   name:'Farmable',        tag:'Tanam & panen gems', color:['#5ad87a','#1f8a4a'], icon:'s54'},
  {id:'wear',   name:'Wearables',       tag:'Sayap, baju, topi', color:['#e85aa8','#8a2a7a'], icon:'w_devil'},
  {id:'lock',   name:'Lock & Alat',     tag:'Amankan world-mu',  color:['#7fd8f5','#2d6c8a'], icon:'b30'},
  {id:'khusus', name:'Block Khusus',    tag:'Papan, pintu, platform', color:['#c99159','#73491f'], icon:'b21'},
  {id:'block',  name:'Block Bangunan',  tag:'Isi ulang stok',    color:['#a2abb9','#515a69'], icon:'b9'}
];
let shopTab = 'home', shopSel = null;
function shopPrice(it){ return it.price === 'bag' ? bagUpgradeCost() : it.price; }
function shopItemsOf(cat){
  return SHOP.filter(it => {
    if (cat === 'paket') return ['starter','builder','farmer','bag8'].includes(it.key);
    if (cat === 'lock') return ['b30','b31','b32','b33',WRENCH].includes(it.key);
    if (cat === 'khusus') return ['b20','b21','b22','b40','b41','b42'].includes(it.key);
    if (cat === 'wear') return it.tab === 'wear';
    if (cat === 'farm') return it.tab === 'farm';
    // block bangunan: x25 biasa, tanpa platform & dinding gua (pindah ke Block Khusus)
    return it.name.endsWith('x25') && !['b40','b41','b42'].includes(it.key) && !it.tab;
  });
}
function shopIconOf(it){
  if (it.key === 'starter') return 'b31'; if (it.key === 'builder') return 'b9'; if (it.key === 'farmer') return 's4'; if (it.key === 'bag8') return 'b22';
  return it.give[0] ? it.give[0][0] : 'b1';
}
// item unggulan berganti tiap hari
function dailyFeatured(){
  const pool = SHOP.filter(it => it.tab === 'wear' || it.tab === 'farm');
  const d = new Date(), seed = d.getFullYear()*400 + d.getMonth()*31 + d.getDate();
  return pool[seed % pool.length];
}
function renderShop(){
  $('shopGems').textContent = gems.toLocaleString('id-ID');
  const body = $('shopList'); body.innerHTML = '';
  $('shopBackCat').style.display = shopTab === 'home' ? 'none' : '';
  if (shopTab === 'home'){
    const f = dailyFeatured();
    const banner = document.createElement('div'); banner.className = 'sbanner';
    banner.innerHTML = '<div class="sbt"><span class="hot">HOT HARI INI</span><b>' + esc(f.name) + '</b><span>' + esc(f.desc) + '</span>' +
      '<span class="sp"><img src="' + icon('gem') + '">' + shopPrice(f).toLocaleString('id-ID') + '</span></div><img class="sbi" src="' + icon(shopIconOf(f)) + '">';
    banner.onclick = ()=>{ shopTab = f.tab; shopSel = f; renderShop(); };
    body.appendChild(banner);
    const grid = document.createElement('div'); grid.className = 'scats';
    for (const c of SHOP_CATS){
      const el = document.createElement('button'); el.className = 'scat';
      el.style.background = 'linear-gradient(160deg,' + c.color[0] + ',' + c.color[1] + ')';
      el.innerHTML = '<img src="' + icon(c.icon) + '"><b>' + c.name + '</b><span>' + c.tag + ' · ' + shopItemsOf(c.id).length + ' item</span>';
      el.onclick = ()=>{ shopTab = c.id; shopSel = null; renderShop(); };
      grid.appendChild(el);
    }
    body.appendChild(grid);
    setShopInfo(null);
    return;
  }
  const cat = SHOP_CATS.find(c => c.id === shopTab);
  const head = document.createElement('div'); head.className = 'scathead';
  head.style.background = 'linear-gradient(90deg,' + cat.color[0] + ',' + cat.color[1] + ')';
  head.innerHTML = '<img src="' + icon(cat.icon) + '"><b>' + cat.name + '</b><span>' + cat.tag + '</span>';
  body.appendChild(head);
  const grid = document.createElement('div'); grid.className = 'scards';
  for (const it of shopItemsOf(shopTab)){
    const price = shopPrice(it), maxed = it.key === 'bag8' && bagSlots >= 64, owned = it.tab === 'wear' && countOf(it.key) > 0;
    const el = document.createElement('button');
    el.className = 'scard' + (shopSel === it ? ' on' : '') + (gems < price && !maxed ? ' poor' : '');
    el.style.setProperty('--c1', cat.color[0]); el.style.setProperty('--c2', cat.color[1]);
    el.innerHTML = (owned ? '<span class="own">PUNYA</span>' : '') + '<div class="art"><img src="' + icon(shopIconOf(it)) + '"></div><b>' + esc(it.name) + '</b>' +
      '<span class="pr"><img src="' + icon('gem') + '">' + (maxed ? 'Maks' : price.toLocaleString('id-ID')) + '</span>';
    el.onclick = ()=>{ shopSel = it; renderShop(); };
    el.ondblclick = ()=>{ shopSel = it; buy(it); };
    grid.appendChild(el);
  }
  body.appendChild(grid);
  setShopInfo(shopSel && shopItemsOf(shopTab).includes(shopSel) ? shopSel : null);
}
function setShopInfo(it){
  const info = $('shopInfo'), btn = $('shopBuy');
  if (!it){
    info.innerHTML = 'Selamat datang di <b style="color:#7be37a">Toko TileGrow</b>! Ketuk item untuk lihat detailnya. ' +
      '<span style="color:#fff2a0">TIPS: Farmable menjatuhkan gems tiap dipecah dan seed-nya bisa ditanam ulang.</span>';
    btn.disabled = true; btn.textContent = 'Beli'; return;
  }
  const price = shopPrice(it), maxed = it.key === 'bag8' && bagSlots >= 64;
  info.innerHTML = '<b>' + esc(it.name) + '</b> · <img src="' + icon('gem') + '" style="width:13px;vertical-align:-2px">' + price.toLocaleString('id-ID') + '<br><span>' + esc(it.desc) + '</span>';
  btn.disabled = maxed || gems < price; btn.textContent = maxed ? 'Maks' : gems < price ? 'Gems kurang' : 'Beli';
  btn.onclick = ()=> buy(it);
}
function buy(it){
  const price = shopPrice(it);
  if (gems < price) return toast('Gems tidak cukup.');
  if (online()) return netSend({t: 'buy', key: it.key});          // server yang memotong gems & mengisi tas
  if (it.key === 'bag8'){ if (bagSlots >= 64) return; gems -= price; bagSlots += 8; sfx('buy'); toast('Tas sekarang ' + bagSlots + ' slot.'); return refreshUI(); }
  // cek tas muat semua isi sebelum bayar
  const sim = bag.map(s => ({...s})); let slots = bagSlots;
  for (const [k,n] of it.give){
    const s = sim.find(s => s.key === k);
    if (s){ if (s.n + n > STACK) return toast('Stack ' + itemDef(k).name + ' akan lewat 200.'); s.n += n; }
    else { if (sim.length >= slots) return toast('Tas penuh. Kosongkan slot dulu.'); sim.push({key:k, n}); }
  }
  gems -= price; questEvent('buy', null, 1);
  for (const [k,n] of it.give) addItem(k, n);
  sfx('buy'); toast('Dibeli: ' + it.name); say('act', 'Kamu membeli ' + it.name + ' seharga ' + price.toLocaleString('id-ID') + ' gems.'); refreshUI();
}

// ---------- profil, quest, goals ----------
let profTab = 'level';
function renderProfile(){
  document.querySelectorAll('#prof .tab').forEach(t => t.classList.toggle('on', t.dataset.t === profTab));
  const wl = worldLock();
  $('profName').textContent = who(); $('profName').style.color = wl && wl.lock.owner === who() ? '#5dff6a' : '';
  $('profSub').textContent = 'Level ' + prog.level + ' · world ' + worldName + (account ? ' · akun ' + account : '');
  const body = $('profBody'); const st = prog.stats;
  if (profTab === 'level'){
    const need = xpNeeded(prog.level);
    body.innerHTML = '<div class="lvbig"><div class="ring"><b>' + prog.level + '</b><span>Level</span></div>' +
      '<div class="lvinfo"><div class="xpline"><div style="width:' + (prog.xp/need*100) + '%"></div></div>' +
      '<p>' + prog.xp + ' / ' + need + ' XP ke level ' + (prog.level+1) + '. Bonus naik level: <b>' + levelReward(prog.level+1) + ' gems</b>.</p></div></div>' +
      '<div class="stats">' + [['Block dipecah',st.broken],['Block dipasang',st.placed],['Pohon dipanen',st.harvested],['Splice',st.spliced],['Bijih',st.ores],['Mati',st.deaths]]
        .map(([k,v]) => '<div><span>' + k + '</span><b>' + (v||0).toLocaleString('id-ID') + '</b></div>').join('') + '</div>' +
      '<p class="note">XP didapat dari memecah block (block langka lebih besar), panen, splice, dan quest.</p>';
  } else if (profTab === 'bestiary'){
    const found = new Set(prog.bestiary || []), entries = Object.entries(RECIPES);
    body.innerHTML = '<p class="note">Resep yang sudah kamu splice. Resep yang belum ditemukan tetap misteri. Ditemukan: <b>' +
      entries.filter(([k]) => found.has(k)).length + ' / ' + entries.length + '</b></p>' +
      entries.map(([k, out]) => {
        const [a,b] = k.split('+').map(Number), ok = found.has(k);
        const cell = (key, name) => ok ? '<div class="rc"><img src="' + icon(key) + '"><span>' + name + '</span></div>'
                                       : '<div class="rc mystery"><div class="q">?</div><span>???</span></div>';
        return '<div class="quest recipe' + (ok ? '' : ' locked') + '">' + cell('s'+a, BY_ID[a].name) + '<b class="op">+</b>' + cell('s'+b, BY_ID[b].name) +
          '<b class="op">=</b>' + (ok ? '<div class="rc out"><img src="' + icon('s'+out) + '"><span>' + BY_ID[out].name + '</span></div>'
                                      : '<div class="rc out mystery"><div class="q">?</div><span>???</span></div>') +
          '<span class="rt">' + (ok ? Math.round(GROW_MS[out]/1000) + ' dtk tumbuh' : 'Belum ditemukan') + '</span></div>';
      }).join('');
  } else if (profTab === 'quest'){
    body.innerHTML = '<p class="note">Quest harian berganti tiap hari. Quest "Serahkan" mengambil item dari tas saat diklaim.</p>' +
      prog.quests.map((q,i) => {
        const have = q.type === 'deliver' ? Math.min(q.need, countOf(q.key)) : q.have;
        const ready = q.type === 'deliver' ? have >= q.need : q.done;
        return '<div class="quest' + (q.claimed ? ' claimed' : '') + '"><div class="qt"><b>' + q.text + '</b><span>+' + q.xp + ' XP · +' + q.gems + ' gems</span>' +
          '<div class="xpline small"><div style="width:' + (have/q.need*100) + '%"></div></div><span>' + have + ' / ' + q.need + '</span></div>' +
          '<button class="btn primary" data-q="' + i + '"' + (q.claimed || !ready ? ' disabled' : '') + '>' + (q.claimed ? 'Selesai' : 'Klaim') + '</button></div>';
      }).join('');
    body.querySelectorAll('[data-q]').forEach(b => b.onclick = ()=> online() ? netSend({t: 'claim', i: +b.dataset.q}) : claimQuest(+b.dataset.q));
  } else {
    body.innerHTML = GOALS.map(g => {
      const v = g.stat === 'level' ? prog.level : (st[g.stat] || 0), done = prog.goalsDone[g.id];
      return '<div class="quest' + (done ? ' claimed' : '') + '"><div class="qt"><b>' + (done ? '✓ ' : '') + g.name + '</b><span>' + g.desc + ' · hadiah ' + g.gems + ' gems</span>' +
        '<div class="xpline small"><div style="width:' + Math.min(100, v/g.need*100) + '%"></div></div><span>' + Math.min(v,g.need).toLocaleString('id-ID') + ' / ' + g.need.toLocaleString('id-ID') + '</span></div></div>';
    }).join('');
  }
}

// ---------- dialog wrench ----------
function openDialog(kind, ctxd){
  const m = ctxd.i !== undefined ? meta.get(ctxd.i) : null, box = $('dlgBody');
  let html = '', title = '';
  if (kind === 'sign'){
    title = 'Papan Tulis';
    html = '<label>Teks</label><textarea id="fText" maxlength="120" rows="3">' + esc(m.sign.text) + '</textarea>';
  } else if (kind === 'door'){
    title = 'Pintu';
    html = '<label>Nama pintu</label><input id="fName" maxlength="24" value="' + esc(m.door.name) + '">' +
      '<label class="chk"><input type="checkbox" id="fLocked"' + (m.door.locked ? ' checked' : '') + '> Kunci pintu (hanya yang punya akses lock yang bisa lewat)</label>';
  } else if (kind === 'display'){
    title = 'Kotak Pajang';
    const opts = bag.filter(s => s.key !== FIST && s.key !== WRENCH && !isWorn(s.key));
    html = '<label>Item yang dipajang</label><div class="pickgrid">' +
      '<div class="cell' + (!m.display.key ? ' on' : '') + '" data-k=""><span class="none">Kosong</span></div>' +
      opts.map(s => '<div class="cell' + (m.display.key === s.key ? ' on' : '') + '" data-k="' + esc(s.key) + '" title="' + esc(itemDef(s.key).name) + '"><img src="' + icon(s.key) + '"></div>').join('') +
      '</div><p class="note">Item diambil dari tas. Item lama dikembalikan ke tas.</p>';
  } else if (kind === 'lock'){
    const L = m.lock;
    title = BY_ID[fg[ctxd.i]].name;
    html = '<p class="note">Pemilik: <b>' + esc(L.owner) + '</b>. ' + (L.type === 'world' ? 'Mengunci seluruh world.' : 'Mengklaim <b>' + lockTilesOf(m).length + ' / ' + LOCK_TILES[L.type] + '</b> tile di sekitarnya.') + '</p>' +
      (L.type === 'world' ? '' : '<label class="chk"><input type="checkbox" id="fAir"' + (L.ignoreAir ? ' checked' : '') + '> Ignore empty air (tile udara kosong tidak diklaim)</label>') +
      '<label>Daftar akses (pisahkan dengan koma)</label><input id="fAccess" value="' + esc(L.access.join(', ')) + '" placeholder="contoh: Tamu">' +
      '<label class="chk"><input type="checkbox" id="fPublic"' + (L.public ? ' checked' : '') + '> Publik (semua orang boleh membangun)</label>';
  } else if (kind === 'maindoor'){
    title = 'Pintu Utama';
    const wl = worldLock();
    html = '<p class="note">Tempat kamu muncul dan respawn. ' + (wl ? 'World ini dikunci oleh <b>' + esc(wl.lock.owner) + '</b>.' : 'World ini belum dikunci.') + '</p>';
  }
  $('dlgTitle').textContent = title; box.innerHTML = html;
  $('dlgSave').style.display = kind === 'maindoor' ? 'none' : '';
  if (kind === 'display') box.querySelectorAll('.pickgrid .cell').forEach(c => c.onclick = ()=>{ box.querySelectorAll('.pickgrid .cell').forEach(x=>x.classList.remove('on')); c.classList.add('on'); });
  $('dlgSave').onclick = ()=>{
    if (online() && m){
      // kirim isi dialog ke server; tile baru datang dari server
      const nm = JSON.parse(JSON.stringify(m));
      if (kind === 'sign') nm.sign.text = $('fText').value.trim();
      if (kind === 'door'){ nm.door.name = $('fName').value.trim(); nm.door.locked = $('fLocked').checked; }
      if (kind === 'display') nm.display.key = box.querySelector('.pickgrid .cell.on').dataset.k || null;
      if (kind === 'lock'){ nm.lock.access = $('fAccess').value.split(',').map(s=>s.trim()).filter(Boolean).filter(n => n !== nm.lock.owner);
        nm.lock.public = $('fPublic').checked; if ($('fAir')) nm.lock.ignoreAir = $('fAir').checked; nm.lock.tiles = null; }
      netSend({t: 'act', a: 'meta', i: ctxd.i, meta: nm}); sfx('place'); closeModals(); return toast('Tersimpan.');
    }
    if (kind === 'sign') m.sign.text = $('fText').value.trim();
    if (kind === 'door'){ m.door.name = $('fName').value.trim(); m.door.locked = $('fLocked').checked; }
    if (kind === 'display'){
      const k = box.querySelector('.pickgrid .cell.on').dataset.k || null;
      if (k !== m.display.key){
        if (m.display.key) addItem(m.display.key, 1);
        if (k){ if (!takeItem(k,1)) return toast('Item tidak ada di tas.'); }
        m.display.key = k;
      }
    }
    if (kind === 'lock'){
      m.lock.access = $('fAccess').value.split(',').map(s=>s.trim()).filter(Boolean).filter(n => n !== m.lock.owner);
      m.lock.public = $('fPublic').checked;
      if ($('fAir')){ const v = $('fAir').checked; if (v !== !!m.lock.ignoreAir){ m.lock.ignoreAir = v; reclaimLock(ctxd.i); toast('Lock mengklaim ulang ' + m.lock.tiles.length + ' tile.'); } }
    }
    if (ctxd.i !== undefined) netTouch(ctxd.i);
    sfx('place'); closeModals(); toast('Tersimpan.');
  };
  openModal('dlg');
  const first = box.querySelector('input:not([type=checkbox]),textarea'); if (first) setTimeout(()=>first.focus(), 30);
}
function esc(s){ return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------- menu & pengaturan ----------
function renderMenu(){
  $('mGuest').style.display = online() ? 'none' : '';
  $('wRename').style.display = online() ? 'none' : '';
  $('optSound').checked = settings.sound; $('optShake').checked = settings.shake;
  $('optGrid').checked = settings.showGrid; $('optNames').checked = settings.showNames; $('optTree').checked = settings.treeLabels !== false;
  $('optZoom').min = ZOOM_MIN; $('optZoom').max = ZOOM_MAX; $('optZoom').value = zoom; $('optZoomV').textContent = Math.round(zoom*100) + '%';
}
function bindUI(){
  $('ishop').onclick = ()=>{ shopTab = 'home'; shopSel = null; toggleModal('shop'); };
  $('imenu').onclick = ()=>{ renderMenu(); toggleModal('menu'); };
  document.querySelectorAll('.modal .x').forEach(b => b.onclick = closeModals);
  $('shopBackCat').onclick = ()=>{ shopTab = 'home'; shopSel = null; renderShop(); };
  $('shopBack').onclick = ()=> closeModals();
  document.querySelectorAll('#prof .tab').forEach(t => t.onclick = ()=>{ profTab = t.dataset.t; renderProfile(); });
  $('bdrop').onclick = ()=> askDrop();
  $('btrash').onclick = ()=>{ const cur = selected(); const n = Math.min(qtyVal(), cur.n);
    if (confirm('Buang ' + n + ' ' + itemDef(cur.key).name + '? Item hilang permanen.')) trashSelected(n); };
  bindInvDrag();
  $('drOk').onclick = confirmDrop; $('drMaxBtn').onclick = ()=> $('drQty').value = selected().n;
  $('drQty').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); confirmDrop(); } });
  $('exOk').onclick = ()=> exitToLobby();
  $('wrenchBtn').onclick = ()=>{ profTab = 'level'; openModal('prof'); };
  $('lvBtn').onclick = ()=>{ profTab = 'level'; openModal('prof'); };
  document.querySelectorAll('#chatTabs .ctab').forEach(b => b.onclick = ()=>{ chatFilter = b.dataset.f; renderChat(); });
  // panel nama selalu tepat di bawah konsol chat (tinggi konsol bisa berubah saat dikecilkan)
  $('chatToggle').onclick = ()=>{ $('chatbox').classList.toggle('min'); renderChat(); placeTL(); };
  // HUD ala Growtopia: tab biru di atas = buka/tutup konsol, gelembung = langsung ketik, mata = sembunyikan UI
  $('chatPull').onclick = ()=> $('chatToggle').click();
  $('chatBtn').onclick = ()=>{ if ($('chatbox').classList.contains('min')) $('chatToggle').click(); setTimeout(()=> $('chatIn').focus(), 0); };
  $('eyeBtn').onclick = toggleHud;
  window.addEventListener('resize', placeTL); setTimeout(placeTL, 0);
  $('chatForm').onsubmit = e=>{ e.preventDefault(); const v = $('chatIn').value; $('chatIn').value = ''; playerSay(v); $('chatIn').blur(); };
  $('chatIn').onfocus = ()=> $('chatbox').classList.add('focus');
  $('chatIn').onblur = ()=> $('chatbox').classList.remove('focus');
  $('mWorlds').onclick = ()=>{ renderWorlds(); openModal('worldsM'); };
  $('wGo').onclick = ()=>{ const n = $('wIn').value; $('wIn').value = ''; closeModals(); gotoWorld(n); };
  $('wRename').onclick = ()=>{ const n = prompt('Nama baru untuk world ' + worldName + ':', worldName); if (n){ renameWorld(n); renderWorlds(); } };
  $('zin').onclick = ()=> setZoom(zoom + .25);
  $('zout').onclick = ()=> setZoom(zoom - .25 < ZOOM_MIN && online() && net.staff.zoom ? staffZoomMin() : zoom - .25);
  $('mResume').onclick = closeModals;
  $('mControls').onclick = ()=> openControlPicker(false);
  $('mLobby').onclick = ()=> exitToLobby();
  $('mLogout').onclick = ()=>{ closeModals(); logout(); };
  $('mRespawn').onclick = ()=>{ closeModals(); respawn('Respawn di pintu utama.'); };
  $('mGuest').onclick = ()=>{ guest = !guest; $('mGuest').textContent = guest ? 'Main sebagai Kamu' : 'Main sebagai Tamu (tes lock)'; closeModals(); toast(guest ? 'Mode tamu: kamu tidak punya akses ke area yang dikunci.' : 'Kembali sebagai pemilik.'); refreshUI(); };
  $('mNew').onclick = ()=>{ if (confirm('Buat dunia baru? Dunia, tas, gems, dan level sekarang akan hilang.')){ genWorld(); rollQuests(); respawn(); save(); closeModals(); toast('Dunia baru dibuat.'); refreshUI(); } };
  $('optSound').onchange = e=> settings.sound = e.target.checked;
  $('optShake').onchange = e=> settings.shake = e.target.checked;
  $('optGrid').onchange = e=> settings.showGrid = e.target.checked;
  $('optNames').onchange = e=> settings.showNames = e.target.checked;
  $('optTree').onchange = e=> settings.treeLabels = e.target.checked;
  $('optZoom').oninput = e=>{ setZoom(+e.target.value); $('optZoomV').textContent = Math.round(zoom*100) + '%'; };
}
function qtyVal(){ return Math.max(1, parseInt($('qty').value) || 1); }

// ---------- suara kecil (WebAudio, tanpa file) ----------
let actx = null;
function sfx(kind){
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    const P = {hit:[180,90,.05,'square',.05], break:[240,60,.12,'square',.07], place:[320,420,.06,'triangle',.06], jump:[300,520,.08,'sine',.05], flap:[520,900,.14,'triangle',.06],
      pick:[600,900,.06,'sine',.05], gem:[900,1400,.08,'sine',.05], buy:[500,1000,.15,'triangle',.07], hurt:[200,80,.18,'sawtooth',.06],
      deny:[160,120,.12,'square',.05], level:[400,1200,.4,'triangle',.08]}[kind];
    if (!P) return;
    o.type = P[3]; o.frequency.setValueAtTime(P[0], t); o.frequency.exponentialRampToValueAtTime(P[1], t + P[2]);
    g.gain.setValueAtTime(P[4], t); g.gain.exponentialRampToValueAtTime(.0001, t + P[2]);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + P[2] + .02);
  } catch(e) {}
}
