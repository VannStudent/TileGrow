// TileGrow v1.3 — UI sosial (mode online): menu pemain dari ikon kunci inggris, teman, report, trade.
// Semua keputusan (barang pindah, teman, laporan) diproses server; file ini hanya menampilkan & mengirim pilihan.

// ---------- menu pemain (klik ikon kunci inggris di samping nama) ----------
let menuTarget = null;
function openPlayerMenu(r){
  menuTarget = r;
  $('pmName').textContent = r.display; $('pmName').style.color = roleColor(r.role) || '';
  $('pmSub').textContent = ({mod: 'Moderator', dev: 'Developer', owner: 'Owner'}[r.role] || 'Player') + ' · memuat profil...';
  $('pmFlag').innerHTML = flagHTML(r.flag, 16);
  const isFriend = net.friends.some(f => f.name === r.name);
  $('pmFriend').textContent = isFriend ? 'Sudah berteman' : net.freqs.includes(r.name) ? 'Terima permintaan teman' : 'Tambah Teman';
  $('pmFriend').disabled = isFriend;
  $('pmTrade').disabled = !!net.trade;
  netSend({t: 'profile', name: r.name});
  openModal('playerM');
}
function showPlayerProfile(m){
  if (!menuTarget || menuTarget.name !== m.name) return;
  $('pmSub').textContent = ({mod: 'Moderator', dev: 'Developer', owner: 'Owner'}[m.role] || 'Player') + ' · Level ' + m.level +
    ' · bergabung ' + new Date(m.created).toLocaleDateString('id-ID');
  if (m.friend){ $('pmFriend').textContent = 'Sudah berteman'; $('pmFriend').disabled = true; }
}

// ---------- teman ----------
function renderFriends(){
  const box = $('frList');
  const req = net.freqs.map(n => '<div class="quest"><div class="qt"><b>' + esc(n) + '</b><span>ingin berteman denganmu</span></div>' +
    '<button class="btn primary" data-acc="' + esc(n) + '">Terima</button><button class="btn" data-dec="' + esc(n) + '">Tolak</button></div>').join('');
  const fr = net.friends.slice().sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)).map(f =>
    '<div class="quest"><div class="qt"><b><span class="dot ' + (f.online ? 'on' : '') + '"></span>' + esc(f.display) + '</b><span>' +
    (f.online ? (f.world ? 'Online di world <b>' + esc(f.world) + '</b>' : 'Online di lobby') : 'Offline') + '</span></div>' +
    (f.online && f.world && f.world !== worldName ? '<button class="btn primary" data-go="' + esc(f.world) + '">Susul</button>' : '') +
    '<button class="btn" data-rm="' + esc(f.name) + '" title="Hapus teman">✕</button></div>').join('');
  box.innerHTML = (req ? '<label>Permintaan teman</label>' + req : '') + '<label>Teman (' + net.friends.length + ')</label>' +
    (fr || '<p class="note">Belum ada teman. Pegang Kunci Inggris, klik ikonnya di samping nama pemain, lalu pilih Tambah Teman. Atau ketik namanya di atas.</p>');
  box.querySelectorAll('[data-acc]').forEach(b => b.onclick = ()=> netSend({t: 'friendAccept', name: b.dataset.acc}));
  box.querySelectorAll('[data-dec]').forEach(b => b.onclick = ()=> netSend({t: 'friendDecline', name: b.dataset.dec}));
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = ()=>{ if (confirm('Hapus ' + b.dataset.rm + ' dari daftar teman?')) netSend({t: 'friendRemove', name: b.dataset.rm}); });
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = ()=>{ closeModals(); gotoWorld(b.dataset.go); });
}
function openFriends(){ if (!online()) return toast('Teman hanya ada di mode online.'); netSend({t: 'friends'}); renderFriends(); openModal('friendsM'); }

// ---------- report ----------
function openReport(r){
  $('rpName').textContent = r.display; $('rpNote').value = '';
  document.querySelectorAll('#reportM .rr').forEach((b, i) => b.classList.toggle('on', i === 0));
  openModal('reportM');
}

// ---------- trade ----------
// tawaran: maksimal 12 jenis barang + gems. Ubah tawaran = Setuju kedua pihak batal (diatur server).
let tradeDraft = {items: [], gems: 0};
function showTradeRequest(m){
  $('trqName').textContent = m.display || m.from;
  openModal('tradeReqM');
  clearTimeout(showTradeRequest.t); showTradeRequest.t = setTimeout(()=>{ if (!$('tradeReqM').classList.contains('hidden')) closeModals(); }, 30000);
}
function renderTrade(){
  const T = net.trade; if (!T) return;
  if ($('tradeM').classList.contains('hidden')){ tradeDraft = {items: T.mine.items.map(x => x.slice()), gems: T.mine.gems}; openModal('tradeM'); }
  $('trWith').textContent = T.withDisplay;
  const list = (o, mine) => (o.items.length || o.gems ? '' : '<p class="note">Belum ada tawaran.</p>') +
    o.items.map(([k, n]) => '<div class="tri"' + (mine ? ' data-k="' + esc(k) + '" title="Klik untuk mengurangi"' : '') + '><img src="' + icon(k) + '"><span>' + esc(itemDef(k).name) + '</span><b>×' + n + '</b></div>').join('') +
    (o.gems ? '<div class="tri"><img src="' + icon('gem') + '"><span>Gems</span><b>' + o.gems.toLocaleString('id-ID') + '</b></div>' : '');
  $('trMine').innerHTML = list(T.mine, true); $('trTheirs').innerHTML = list(T.theirs, false);
  $('trMine').querySelectorAll('[data-k]').forEach(el => el.onclick = ()=>{ const it = tradeDraft.items.find(x => x[0] === el.dataset.k); if (!it) return; it[1]--; if (it[1] <= 0) tradeDraft.items = tradeDraft.items.filter(x => x !== it); sendOffer(); });
  // pilihan barang dari tas
  const bagBox = $('trBag');
  bagBox.innerHTML = bag.filter(s => s.key !== FIST).map(s => {
    const used = (tradeDraft.items.find(x => x[0] === s.key) || [0, 0])[1];
    return '<div class="cell' + (used >= s.n ? ' empty' : '') + '" data-k="' + esc(s.key) + '" title="' + esc(itemDef(s.key).name) + ' (klik: +1, shift+klik: semua)">' + cellHTML({key: s.key, n: s.n - used}) + '</div>';
  }).join('');
  bagBox.querySelectorAll('[data-k]').forEach(el => el.onclick = e => {
    const k = el.dataset.k, s = bag.find(x => x.key === k); if (!s) return;
    let it = tradeDraft.items.find(x => x[0] === k);
    if (!it){ if (tradeDraft.items.length >= 12) return toast('Maksimal 12 jenis barang.'); it = [k, 0]; tradeDraft.items.push(it); }
    it[1] = Math.min(s.n, e.shiftKey ? s.n : it[1] + 1); sendOffer();
  });
  if (document.activeElement !== $('trGems')) $('trGems').value = T.mine.gems || '';
  // status
  const st = (ok, conf) => conf ? '<b class="ok">✓ Konfirmasi</b>' : ok ? '<b class="ok">✓ Setuju</b>' : '<span>Belum setuju</span>';
  $('trStMine').innerHTML = st(T.ok.me, T.conf.me); $('trStTheirs').innerHTML = st(T.ok.them, T.conf.them);
  const confirm = T.stage === 'confirm';
  $('trOk').style.display = confirm ? 'none' : ''; $('trOk').textContent = T.ok.me ? 'Batal Setuju' : 'Setuju';
  $('trConfirmBox').style.display = confirm ? '' : 'none';
  $('trOffer').style.display = confirm ? 'none' : '';
  if (confirm){
    const sum = o => o.items.map(([k, n]) => n + '× ' + itemDef(k).name).concat(o.gems ? [o.gems.toLocaleString('id-ID') + ' gems'] : []).join(', ') || 'tidak ada';
    $('trSummary').innerHTML = 'Kamu memberi: <b>' + esc(sum(T.mine)) + '</b><br>Kamu menerima: <b>' + esc(sum(T.theirs)) + '</b>';
    // tombol konfirmasi aktif setelah 3 detik (supaya tidak asal klik)
    const btn = $('trConfirm');
    if (!T.conf.me && btn.dataset.stage !== String(T.id) + JSON.stringify([T.mine, T.theirs])){
      btn.dataset.stage = String(T.id) + JSON.stringify([T.mine, T.theirs]); btn.disabled = true; let n = 3;
      btn.textContent = 'Konfirmasi (' + n + ')'; clearInterval(btn._t);
      btn._t = setInterval(()=>{ n--; if (n <= 0){ clearInterval(btn._t); btn.disabled = false; btn.textContent = 'Konfirmasi Trade'; } else btn.textContent = 'Konfirmasi (' + n + ')'; }, 1000);
    }
    if (T.conf.me){ btn.disabled = true; btn.textContent = 'Menunggu ' + T.with + '...'; }
  }
}
function sendOffer(){ netSend({t: 'tradeOffer', items: tradeDraft.items, gems: tradeDraft.gems}); }
function closeTradeUI(){ net.trade = null; tradeDraft = {items: [], gems: 0}; if (!$('tradeM').classList.contains('hidden')) closeModals(); }

function bindSocial(){
  $('pmTrade').onclick = ()=>{ if (!menuTarget) return; netSend({t: 'tradeReq', name: menuTarget.name}); closeModals(); };
  $('pmFriend').onclick = ()=>{ if (!menuTarget) return; netSend({t: net.freqs.includes(menuTarget.name) ? 'friendAccept' : 'friendReq', name: menuTarget.name}); closeModals(); };
  $('pmReport').onclick = ()=>{ if (!menuTarget) return; openReport(menuTarget); };
  document.querySelectorAll('#reportM .rr').forEach(b => b.onclick = ()=>{ document.querySelectorAll('#reportM .rr').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
  $('rpSend').onclick = ()=>{
    const reason = (document.querySelector('#reportM .rr.on') || {}).dataset.r || 'lainnya';
    netSend({t: 'report', name: menuTarget.name, reason, note: $('rpNote').value.trim()}); closeModals();
  };
  $('frAdd').onclick = ()=>{ const n = $('frIn').value.trim(); if (!n) return; netSend({t: 'friendReq', name: n}); $('frIn').value = ''; };
  $('frIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('frAdd').click(); });
  $('mFriends').onclick = openFriends;
  $('trqAccept').onclick = ()=>{ if (net.tradeReq) netSend({t: 'tradeAccept', name: net.tradeReq.from}); net.tradeReq = null; closeModals(); };
  $('trqDecline').onclick = ()=>{ if (net.tradeReq) netSend({t: 'tradeDecline', name: net.tradeReq.from}); net.tradeReq = null; closeModals(); };
  $('trOk').onclick = ()=> netSend({t: 'tradeOk', v: !net.trade.ok.me});
  $('trConfirm').onclick = ()=> netSend({t: 'tradeConfirm'});
  $('trCancel').onclick = ()=>{ netSend({t: 'tradeCancel'}); closeTradeUI(); };
  $('trGems').oninput = ()=>{ tradeDraft.gems = Math.max(0, Math.min(gems, parseInt($('trGems').value) || 0)); clearTimeout(bindSocial.t); bindSocial.t = setTimeout(sendOffer, 350); };
  // menutup jendela trade (Esc / klik luar) = batal trade
  const origClose = closeModals;
  closeModals = function(){ if (net.trade && !$('tradeM').classList.contains('hidden')){ netSend({t: 'tradeCancel'}); net.trade = null; } origClose(); };
}
