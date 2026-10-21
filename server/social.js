'use strict';
// TileGrow v1.3 — fitur sosial & moderasi di server:
//   role (owner/dev/mod/player), command khusus staff, log aksi staff, ban/mute/freeze/ipban,
//   teman (permintaan + terima), report, trade aman (server yang menukar barang).
const fs = require('fs'), path = require('path');

const RANK = {player: 0, mod: 1, dev: 2, owner: 3};
const ROLE_NAME = {player: 'Player', mod: 'Moderator', dev: 'Developer', owner: 'Owner'};
const MOD_BAN_MAX_MS = 7 * 24 * 3600 * 1000;

function parseDur(s){
  // 10m, 2h, 3d, perm
  if (!s) return null;
  if (/^(perm|permanen|forever)$/i.test(s)) return Infinity;
  const m = /^(\d{1,4})([mhd])$/i.exec(s); if (!m) return null;
  return +m[1] * {m: 60e3, h: 3600e3, d: 86400e3}[m[2].toLowerCase()];
}
const fmtDur = ms => ms === Infinity ? 'permanen' : ms >= 86400e3 ? Math.round(ms / 86400e3) + ' hari' : ms >= 3600e3 ? Math.round(ms / 3600e3) + ' jam' : Math.max(1, Math.round(ms / 60e3)) + ' menit';

function createSocial(S){
  // S: {DATA, accounts, saveAccounts, clients, findOnline, sendTo, broadcastWorld, kickClient, econ, saveEcon, playerOf, log}
  const LOG_FILE = path.join(S.DATA, 'staff-log.jsonl');
  const REP_FILE = path.join(S.DATA, 'reports.json');
  const BAN_FILE = path.join(S.DATA, 'ipbans.json');
  const TRADE_LOG = path.join(S.DATA, 'trade-log.jsonl');
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){ return d; } };
  const write = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); };
  const reports = read(REP_FILE, []);
  const ipbans = read(BAN_FILE, {});          // ip -> {by, until, reason, user}
  const append = (f, o) => fs.appendFile(f, JSON.stringify({t: Date.now(), ...o}) + '\n', () => {});
  const staffLog = (by, action, target, extra) => { append(LOG_FILE, {by, action, target, ...extra}); console.log('[staff]', by, action, target || '', extra ? JSON.stringify(extra) : ''); };

  const acc = name => S.accounts[String(name || '').toLowerCase()];
  const roleOf = name => { const a = acc(name); return a && RANK[a.role] ? a.role : 'player'; };
  const rankOf = name => RANK[roleOf(name)] || 0;
  // tampilan nama: moderator/developer berawalan "@"
  const display = name => (rankOf(name) >= RANK.mod ? '@' : '') + name;

  // ---------- status hukuman ----------
  function banInfo(a){ return a && a.ban && (a.ban.until === null || a.ban.until > Date.now()) ? a.ban : null; }
  function muteInfo(a){ return a && a.mute && a.mute.until > Date.now() ? a.mute : null; }
  function ipBanned(ip){ const b = ipbans[ip]; if (!b) return null; if (b.until !== null && b.until <= Date.now()){ delete ipbans[ip]; write(BAN_FILE, ipbans); return null; } return b; }
  function loginBlock(name, ip){
    const b = ipBanned(ip); if (b) return 'Perangkat ini diblokir dari server' + (b.until ? ' sampai ' + new Date(b.until).toLocaleString('id-ID') : '') + '.';
    const a = acc(name), ab = banInfo(a);
    if (ab) return 'Akun ini di-ban' + (ab.until ? ' sampai ' + new Date(ab.until).toLocaleString('id-ID') : ' permanen') + '. Alasan: ' + (ab.reason || '-');
    return null;
  }

  // ---------- teman ----------
  function friendsOf(a){ a.friends = a.friends || []; a.freq = a.freq || []; return a; }
  function friendList(name){
    const a = friendsOf(acc(name));
    return {friends: a.friends.map(n => { const c = S.findOnline(n); return {name: n, display: display(n), online: !!c, world: c ? c.world : null}; }),
            requests: a.freq.slice()};
  }
  function pushFriends(name){ const c = S.findOnline(name); if (c) c.send({t: 'friends', ...friendList(name)}); }
  function friendReq(c, target){
    const tk = String(target || '').toLowerCase(), ta = S.accounts[tk];
    if (!ta) return c.send({t: 'note', text: 'Pemain ' + target + ' tidak ditemukan.'});
    const me = friendsOf(acc(c.user)), them = friendsOf(ta);
    if (ta.name === c.user) return c.send({t: 'note', text: 'Tidak bisa berteman dengan diri sendiri.'});
    if (me.friends.includes(ta.name)) return c.send({t: 'note', text: ta.name + ' sudah jadi temanmu.'});
    if (me.freq.includes(ta.name)) return friendAccept(c, ta.name);                  // dia sudah minta duluan: langsung jadi teman
    if (them.freq.includes(c.user)) return c.send({t: 'note', text: 'Permintaan sudah dikirim ke ' + ta.name + '.'});
    if (them.freq.length >= 50) return c.send({t: 'note', text: ta.name + ' sedang punya terlalu banyak permintaan.'});
    them.freq.push(c.user); S.saveAccounts();
    c.send({t: 'note', text: 'Permintaan teman dikirim ke ' + ta.name + '.'});
    const tc = S.findOnline(ta.name); if (tc) tc.send({t: 'friendReq', from: c.user, display: display(c.user)});
    pushFriends(ta.name);
  }
  function friendAccept(c, from){
    const me = friendsOf(acc(c.user)), fa = acc(from); if (!fa) return;
    if (!me.freq.includes(fa.name)) return;
    me.freq = me.freq.filter(n => n !== fa.name); friendsOf(fa);
    if (me.friends.length >= 200) return c.send({t: 'note', text: 'Daftar teman penuh (200).'});
    if (!me.friends.includes(fa.name)) me.friends.push(fa.name);
    if (!fa.friends.includes(c.user)) fa.friends.push(c.user);
    fa.freq = fa.freq.filter(n => n !== c.user);
    S.saveAccounts(); pushFriends(c.user); pushFriends(fa.name);
    const fc = S.findOnline(fa.name); if (fc) fc.send({t: 'note', text: c.user + ' menerima permintaan temanmu.'});
  }
  function friendDecline(c, from){ const me = friendsOf(acc(c.user)); me.freq = me.freq.filter(n => n.toLowerCase() !== String(from).toLowerCase()); S.saveAccounts(); pushFriends(c.user); }
  function friendRemove(c, name){
    const me = friendsOf(acc(c.user)), o = acc(name); if (!o) return;
    me.friends = me.friends.filter(n => n !== o.name); friendsOf(o).friends = o.friends.filter(n => n !== c.user);
    S.saveAccounts(); pushFriends(c.user); pushFriends(o.name);
  }

  // ---------- report ----------
  const REASONS = ['cheat', 'kasar', 'scam', 'griefing', 'lainnya'];
  const lastReport = new Map();
  function report(c, target, reason, note){
    const ta = acc(target); if (!ta) return c.send({t: 'note', text: 'Pemain tidak ditemukan.'});
    if (ta.name === c.user) return;
    if (!REASONS.includes(reason)) reason = 'lainnya';
    const k = c.user + '>' + ta.name, last = lastReport.get(k) || 0;
    if (Date.now() - last < 10 * 60e3) return c.send({t: 'note', text: 'Kamu sudah melaporkan ' + ta.name + ' baru-baru ini.'});
    lastReport.set(k, Date.now());
    const r = {id: (reports.length ? reports[reports.length - 1].id : 0) + 1, t: Date.now(), from: c.user, target: ta.name, reason,
               note: String(note || '').replace(/[\u0000-\u001f]/g, '').slice(0, 200), world: c.world, open: true};
    reports.push(r); if (reports.length > 1000) reports.splice(0, reports.length - 1000); write(REP_FILE, reports);
    c.send({t: 'note', text: 'Laporan terkirim. Terima kasih, moderator akan memeriksa.'});
    for (const o of S.clients) if (o.user && rankOf(o.user) >= RANK.mod) o.send({t: 'staff', text: '[REPORT #' + r.id + '] ' + c.user + ' melaporkan ' + ta.name + ' (' + reason + ')' + (r.note ? ': ' + r.note : '')});
  }

  // ---------- trade ----------
  // alur: request -> accept -> kedua pihak mengisi tawaran -> keduanya "Setuju" -> keduanya "Konfirmasi" -> server menukar.
  // Setiap perubahan tawaran membatalkan Setuju & Konfirmasi kedua pihak (anti tukar diam-diam).
  const trades = new Map();            // id -> {id, a, b, offer:{[user]:{items:[[k,n]], gems}}, ok:{}, conf:{}, t}
  const tradeOf = new Map();           // user -> trade id
  const tradeReq = new Map();          // target user -> {from, t}
  let nextTrade = 1;
  const TRADE_TIMEOUT = 5 * 60e3;
  function tradeView(T, forUser){
    const other = T.a === forUser ? T.b : T.a;
    return {t: 'trade', id: T.id, with: other, withDisplay: display(other), mine: T.offer[forUser], theirs: T.offer[other],
            ok: {me: !!T.ok[forUser], them: !!T.ok[other]}, conf: {me: !!T.conf[forUser], them: !!T.conf[other]}, stage: T.ok[T.a] && T.ok[T.b] ? 'confirm' : 'offer'};
  }
  function pushTrade(T){ for (const u of [T.a, T.b]){ const c = S.findOnline(u); if (c) c.send(tradeView(T, u)); } }
  function endTrade(T, why){
    trades.delete(T.id); tradeOf.delete(T.a); tradeOf.delete(T.b);
    for (const u of [T.a, T.b]){ const c = S.findOnline(u); if (c) c.send({t: 'tradeEnd', id: T.id, why}); }
  }
  function tradeRequest(c, target){
    const tc = S.findOnline(target);
    if (!tc || !tc.user) return c.send({t: 'note', text: 'Pemain itu sedang tidak online.'});
    if (tc.user === c.user) return;
    if (tc.world !== c.world) return c.send({t: 'note', text: 'Trade hanya bisa dengan pemain di world yang sama.'});
    if (tradeOf.has(c.user)) return c.send({t: 'note', text: 'Kamu sedang dalam trade lain.'});
    if (tradeOf.has(tc.user)) return c.send({t: 'note', text: tc.user + ' sedang trade dengan orang lain.'});
    if (c.frozen) return;
    tradeReq.set(tc.user, {from: c.user, t: Date.now()});
    tc.send({t: 'tradeReq', from: c.user, display: display(c.user)});
    c.send({t: 'note', text: 'Permintaan trade dikirim ke ' + tc.user + '.'});
  }
  function tradeAccept(c, from){
    const r = tradeReq.get(c.user);
    if (!r || r.from.toLowerCase() !== String(from).toLowerCase() || Date.now() - r.t > 60e3) return c.send({t: 'note', text: 'Permintaan trade sudah kedaluwarsa.'});
    tradeReq.delete(c.user);
    const oc = S.findOnline(r.from);
    if (!oc || oc.world !== c.world) return c.send({t: 'note', text: r.from + ' sudah tidak di world ini.'});
    if (tradeOf.has(c.user) || tradeOf.has(oc.user)) return c.send({t: 'note', text: 'Salah satu pemain sedang trade lain.'});
    const T = {id: nextTrade++, a: oc.user, b: c.user, offer: {[oc.user]: {items: [], gems: 0}, [c.user]: {items: [], gems: 0}}, ok: {}, conf: {}, t: Date.now()};
    trades.set(T.id, T); tradeOf.set(T.a, T.id); tradeOf.set(T.b, T.id);
    pushTrade(T);
  }
  function tradeDecline(c, from){ const r = tradeReq.get(c.user); if (r){ tradeReq.delete(c.user); const oc = S.findOnline(r.from); if (oc) oc.send({t: 'note', text: c.user + ' menolak trade.'}); } }
  function myTrade(c){ const id = tradeOf.get(c.user); return id ? trades.get(id) : null; }
  function tradeOffer(c, items, gemsN){
    const T = myTrade(c); if (!T) return;
    const E = S.econOf(c.user); if (!E) return;
    // tawaran harus benar-benar ada di tas (dicek lagi saat menukar)
    const clean = [], seen = new Set();
    if (!Array.isArray(items) || items.length > 12) return c.send({t: 'note', text: 'Maksimal 12 jenis barang per trade.'});
    for (const it of items){
      if (!Array.isArray(it)) continue;
      const [k, n] = it;
      if (!S.econ.isKey(k) || k === S.econ.D.FIST || seen.has(k) || !Number.isInteger(n) || n < 1) continue;
      const have = (E.bag.find(s => s.key === k) || {n: 0}).n;
      if (have < n) return c.send({t: 'note', text: 'Barangmu tidak cukup: ' + S.econ.D.itemDef(k).name + '.'});
      seen.add(k); clean.push([k, n]);
    }
    const g = Number.isInteger(gemsN) && gemsN > 0 ? gemsN : 0;
    if (g > E.gems) return c.send({t: 'note', text: 'Gems tidak cukup.'});
    T.offer[c.user] = {items: clean, gems: g}; T.ok = {}; T.conf = {}; T.t = Date.now();
    pushTrade(T);
  }
  function tradeOk(c, v){ const T = myTrade(c); if (!T) return; T.ok[c.user] = !!v; if (!v) T.conf = {}; pushTrade(T); }
  function tradeConfirm(c){
    const T = myTrade(c); if (!T || !(T.ok[T.a] && T.ok[T.b])) return;
    T.conf[c.user] = true; pushTrade(T);
    if (T.conf[T.a] && T.conf[T.b]) execTrade(T);
  }
  function execTrade(T){
    const A = S.econOf(T.a), B = S.econOf(T.b), oa = T.offer[T.a], ob = T.offer[T.b];
    const ca = S.findOnline(T.a), cb = S.findOnline(T.b);
    if (!A || !B || !ca || !cb || ca.world !== cb.world) return endTrade(T, 'Trade batal: salah satu pemain keluar.');
    // 1) cek ulang semua barang masih ada  2) cek muat di tas penerima  3) baru tukar (semua atau tidak sama sekali)
    const has = (E, o) => E.gems >= o.gems && o.items.every(([k, n]) => (E.bag.find(s => s.key === k) || {n: 0}).n >= n);
    if (!has(A, oa) || !has(B, ob)) return endTrade(T, 'Trade batal: barang di tawaran sudah tidak ada.');
    const fa = S.econ.fits(A, ob.items, oa.items), fb = S.econ.fits(B, oa.items, ob.items);
    if (fa) return endTrade(T, 'Trade batal: tas ' + T.a + ' tidak muat (' + fa + ')');
    if (fb) return endTrade(T, 'Trade batal: tas ' + T.b + ' tidak muat (' + fb + ')');
    const before = JSON.stringify([A, B]);
    try {
      S.econ.run(A, g => { for (const [k, n] of oa.items) g.takeItem(k, n); g.addGems(-oa.gems); });
      S.econ.run(B, g => { for (const [k, n] of ob.items) g.takeItem(k, n); g.addGems(-ob.gems); });
      S.econ.run(A, g => { for (const [k, n] of ob.items) g.addItem(k, n); g.addGems(ob.gems); });
      S.econ.run(B, g => { for (const [k, n] of oa.items) g.addItem(k, n); g.addGems(oa.gems); });
    } catch(e){
      const [a0, b0] = JSON.parse(before); Object.assign(A, a0); Object.assign(B, b0);
      console.error('trade error', e); return endTrade(T, 'Trade batal: kesalahan server.');
    }
    S.saveEcon(T.a); S.saveEcon(T.b);
    append(TRADE_LOG, {a: T.a, b: T.b, gave: {[T.a]: oa, [T.b]: ob}});
    S.pushEcon(ca, [['act', 'Trade dengan ' + T.b + ' berhasil.']]); S.pushEcon(cb, [['act', 'Trade dengan ' + T.a + ' berhasil.']]);
    endTrade(T, 'ok');
  }
  function tradeCancel(c){ const T = myTrade(c); if (T) endTrade(T, c.user + ' membatalkan trade.'); }
  setInterval(() => { const now = Date.now(); for (const T of trades.values()) if (now - T.t > TRADE_TIMEOUT) endTrade(T, 'Trade batal: tidak ada aktivitas 5 menit.');
    for (const [u, r] of tradeReq) if (now - r.t > 60e3) tradeReq.delete(u); }, 15e3).unref();
  function onLeave(c){ const T = c.user && myTrade(c); if (T) endTrade(T, c.user + ' keluar dari world.'); if (c.user) tradeReq.delete(c.user); }

  // ---------- command staff ----------
  const HELP = {
    mod: '/mute NAMA DURASI [alasan] · /unmute NAMA · /freeze NAMA · /unfreeze NAMA · /kick NAMA [alasan] · /ban NAMA DURASI(maks 7d) [alasan] · /unban NAMA (ban buatanmu) · /noclip · /zoom · /tp NAMA · /summon NAMA · /reports · /close ID · /who',
    dev: ' · /ipban NAMA [DURASI] [alasan] · /unipban NAMA · /ban NAMA perm · /unban semua · /setrole NAMA mod|player · /invis'
  };
  // target harus online untuk mute/freeze/kick/tp/summon; ban/mute juga bisa offline (lewat akun)
  function canTouch(by, target){
    if (by.toLowerCase() === String(target).toLowerCase()) return 'Tidak bisa ke diri sendiri.';
    if (rankOf(target) >= rankOf(by)) return 'Tidak bisa menindak ' + ROLE_NAME[roleOf(target)] + ' (setara atau lebih tinggi).';
    return null;
  }
  function command(c, line){
    const parts = line.slice(1).trim().split(/\s+/), cmd = (parts.shift() || '').toLowerCase();
    const r = rankOf(c.user);
    const say = text => c.send({t: 'staff', text});
    const STAFF = ['mute','unmute','freeze','unfreeze','kick','ban','unban','noclip','zoom','tp','summon','reports','close','ipban','unipban','setrole','invis','staffhelp','role'];
    if (!STAFF.includes(cmd)) return false;
    if (r < RANK.mod) { c.send({t: 'note', text: 'Perintah tidak dikenal: /' + cmd}); return true; }   // player biasa: seolah command tidak ada
    const devOnly = ['ipban','unipban','setrole','invis'];
    if (devOnly.includes(cmd) && r < RANK.dev){ say('Perintah ini khusus Developer.'); return true; }
    const name = parts[0], ta = name ? acc(name) : null;
    const needTarget = () => { if (!name || !ta){ say('Pemain ' + (name || '?') + ' tidak ditemukan.'); return false; } const e = canTouch(c.user, ta.name); if (e){ say(e); return false; } return true; };
    const reason = (from) => parts.slice(from).join(' ').slice(0, 120) || '-';
    switch (cmd){
      case 'staffhelp': say(HELP.mod + (r >= RANK.dev ? HELP.dev : '')); return true;
      case 'role': say('Role kamu: ' + ROLE_NAME[roleOf(c.user)]); return true;
      case 'noclip': c.noclip = !c.noclip; c.send({t: 'staffFx', noclip: c.noclip}); say('Noclip ' + (c.noclip ? 'aktif' : 'mati') + '.'); staffLog(c.user, 'noclip', null, {on: c.noclip}); return true;
      case 'zoom': c.fullzoom = !c.fullzoom; c.send({t: 'staffFx', zoom: c.fullzoom}); say('Zoom satu world ' + (c.fullzoom ? 'aktif' : 'mati') + '.'); return true;
      case 'invis': c.invis = !c.invis; c.send({t: 'staffFx', invis: c.invis}); say('Invisible ' + (c.invis ? 'aktif: pemain lain tidak melihatmu.' : 'mati.')); S.refreshVisibility(c); staffLog(c.user, 'invis', null, {on: c.invis}); return true;
      case 'mute': {
        if (!needTarget()) return true;
        const d = parseDur(parts[1]); if (!d || d === Infinity){ say('Pakai: /mute NAMA 10m|2h|1d [alasan]'); return true; }
        ta.mute = {by: c.user, until: Date.now() + d, reason: reason(2)}; S.saveAccounts();
        const tc = S.findOnline(ta.name); if (tc) tc.send({t: 'note', text: 'Kamu di-mute selama ' + fmtDur(d) + '. Alasan: ' + ta.mute.reason});
        staffLog(c.user, 'mute', ta.name, {dur: fmtDur(d), reason: ta.mute.reason}); say(ta.name + ' di-mute ' + fmtDur(d) + '.'); return true;
      }
      case 'unmute': if (!needTarget()) return true; delete ta.mute; S.saveAccounts(); staffLog(c.user, 'unmute', ta.name); say(ta.name + ' tidak di-mute lagi.'); return true;
      case 'freeze': case 'unfreeze': {
        if (!needTarget()) return true;
        const tc = S.findOnline(ta.name); if (!tc){ say(ta.name + ' tidak online.'); return true; }
        tc.frozen = cmd === 'freeze'; tc.send({t: 'frozen', on: tc.frozen, by: display(c.user)});
        staffLog(c.user, cmd, ta.name); say(ta.name + (tc.frozen ? ' dibekukan.' : ' bisa bergerak lagi.')); return true;
      }
      case 'kick': {
        if (!needTarget()) return true;
        const tc = S.findOnline(ta.name); if (!tc){ say(ta.name + ' tidak online.'); return true; }
        staffLog(c.user, 'kick', ta.name, {reason: reason(1)}); S.kickClient(tc, 'Kamu di-kick oleh ' + display(c.user) + '. Alasan: ' + reason(1)); say(ta.name + ' di-kick.'); return true;
      }
      case 'ban': {
        if (!needTarget()) return true;
        let d = parseDur(parts[1]); if (!d){ say('Pakai: /ban NAMA 1h|3d|7d' + (r >= RANK.dev ? '|perm' : '') + ' [alasan]'); return true; }
        if (r < RANK.dev && d > MOD_BAN_MAX_MS){ say('Moderator hanya bisa ban maksimal 7 hari.'); return true; }
        ta.ban = {by: c.user, byRank: r, until: d === Infinity ? null : Date.now() + d, reason: reason(2)}; S.saveAccounts();
        staffLog(c.user, 'ban', ta.name, {dur: fmtDur(d), reason: ta.ban.reason});
        const tc = S.findOnline(ta.name); if (tc) S.kickClient(tc, 'Kamu di-ban ' + fmtDur(d) + ' oleh ' + display(c.user) + '. Alasan: ' + ta.ban.reason);
        say(ta.name + ' di-ban ' + fmtDur(d) + '.'); return true;
      }
      case 'unban': {
        if (!name || !ta){ say('Pemain tidak ditemukan.'); return true; }
        if (!ta.ban){ say(ta.name + ' tidak sedang di-ban.'); return true; }
        if (r < RANK.dev && ta.ban.by !== c.user){ say('Moderator hanya bisa membatalkan ban yang dia buat sendiri.'); return true; }
        delete ta.ban; S.saveAccounts(); staffLog(c.user, 'unban', ta.name); say(ta.name + ' tidak di-ban lagi.'); return true;
      }
      case 'ipban': {
        if (!needTarget()) return true;
        const d = parts[1] ? parseDur(parts[1]) : Infinity;
        const ip = (S.findOnline(ta.name) || {}).ip || ta.lastIp;
        if (!ip){ say('IP ' + ta.name + ' belum diketahui.'); return true; }
        if (S.isLocalIp(ip)){ say('IP ' + ip + ' adalah PC server sendiri. Tidak di-ban (pakai /ban).'); return true; }
        ipbans[ip] = {by: c.user, user: ta.name, until: d === Infinity || !d ? null : Date.now() + d, reason: reason(d && parts[1] && parseDur(parts[1]) ? 2 : 1)}; write(BAN_FILE, ipbans);
        ta.ban = {by: c.user, byRank: r, until: ipbans[ip].until, reason: ipbans[ip].reason}; S.saveAccounts();      // IP ban selalu bersama ban akun
        staffLog(c.user, 'ipban', ta.name, {ip, dur: fmtDur(d || Infinity)});
        for (const o of [...S.clients]) if (o.ip === ip) S.kickClient(o, 'Perangkat ini diblokir oleh ' + display(c.user) + '.');
        say(ta.name + ' + IP ' + ip + ' diblokir ' + fmtDur(d || Infinity) + '.'); return true;
      }
      case 'unipban': {
        if (!name || !ta){ say('Pemain tidak ditemukan.'); return true; }
        let n = 0; for (const ip in ipbans) if (ipbans[ip].user === ta.name){ delete ipbans[ip]; n++; }
        write(BAN_FILE, ipbans); delete ta.ban; S.saveAccounts(); staffLog(c.user, 'unipban', ta.name, {n}); say('IP ban ' + ta.name + ' dicabut (' + n + ').'); return true;
      }
      case 'setrole': {
        if (!name || !ta){ say('Pemain tidak ditemukan.'); return true; }
        const role = (parts[1] || '').toLowerCase();
        if (!['mod', 'player'].includes(role)){ say('Developer hanya bisa memberi role mod atau player. Role dev diatur dari jendela server.'); return true; }
        if (rankOf(ta.name) >= RANK.dev){ say('Tidak bisa mengubah role Developer/Owner dari game.'); return true; }
        ta.role = role === 'player' ? undefined : role; S.saveAccounts(); S.roleChanged(ta.name);
        staffLog(c.user, 'setrole', ta.name, {role}); say(ta.name + ' sekarang ' + ROLE_NAME[role === 'player' ? 'player' : role] + '.'); return true;
      }
      case 'tp': case 'summon': {
        if (!name || !ta){ say('Pemain tidak ditemukan.'); return true; }
        const tc = S.findOnline(ta.name); if (!tc || !tc.world){ say(ta.name + ' tidak sedang di world mana pun.'); return true; }
        if (cmd === 'summon' && canTouch(c.user, ta.name)){ say(canTouch(c.user, ta.name)); return true; }
        if (cmd === 'tp') S.teleport(c, tc.world, tc.state); else S.teleport(tc, c.world, c.state);
        staffLog(c.user, cmd, ta.name); return true;
      }
      case 'reports': {
        const open = reports.filter(x => x.open).slice(-10);
        say(open.length ? open.map(x => '#' + x.id + ' ' + x.from + ' → ' + x.target + ' (' + x.reason + ')' + (x.note ? ': ' + x.note : '') + ' [' + (x.world || '-') + ']').join(' | ') : 'Tidak ada laporan terbuka.');
        return true;
      }
      case 'close': { const x = reports.find(x => x.id === +name); if (!x){ say('Laporan tidak ditemukan.'); return true; } x.open = false; x.closedBy = c.user; write(REP_FILE, reports); staffLog(c.user, 'closeReport', x.target, {id: x.id}); say('Laporan #' + x.id + ' ditutup.'); return true; }
    }
    return true;
  }

  // ---------- set role oleh pemilik server (console & panel admin localhost) ----------
  function setRole(name, val, by){
    const a = acc(name); if (!a) return {ok: false, err: 'Akun ' + name + ' tidak ditemukan.'};
    if (!['dev', 'mod', 'player'].includes(val)) return {ok: false, err: 'Role harus dev, mod, atau player.'};
    a.role = val === 'player' ? undefined : val; S.saveAccounts(); S.roleChanged(a.name); staffLog(by, 'setrole', a.name, {role: val});
    return {ok: true, text: a.name + ' sekarang ' + ROLE_NAME[val] + '.'};
  }
  function listAccounts(){
    return Object.values(S.accounts).map(a => ({name: a.name, role: a.role || 'player', online: !!S.findOnline(a.name), created: a.created || null}))
      .sort((x, y) => (RANK[y.role] - RANK[x.role]) || x.name.localeCompare(y.name));
  }

  // ---------- console server (owner) ----------
  function consoleCmd(line){
    const [cmd, name, val] = line.trim().split(/\s+/);
    if (!cmd) return;
    if (cmd === 'help') return console.log('Perintah server: role NAMA dev|mod|player · roles · unban NAMA · unipban NAMA · ipbans · kick NAMA · say PESAN · stop');
    if (cmd === 'roles'){ const list = Object.values(S.accounts).filter(a => a.role).map(a => a.name + '=' + a.role); return console.log(list.length ? list.join(', ') : 'Belum ada staff.'); }
    if (cmd === 'ipbans') return console.log(JSON.stringify(ipbans));
    if (cmd === 'say'){ const t = line.trim().slice(4); for (const c of S.clients) if (c.user) c.send({t: 'staff', text: '[SERVER] ' + t}); return; }
    if (cmd === 'stop') return S.shutdown();
    const a = acc(name); if (!a) return console.log('Akun ' + name + ' tidak ditemukan.');
    if (cmd === 'role'){
      const r = setRole(a.name, val, 'SERVER');
      return console.log(r.ok ? r.text : r.err);
    }
    if (cmd === 'unban'){ delete a.ban; S.saveAccounts(); staffLog('SERVER', 'unban', a.name); return console.log(a.name + ' tidak di-ban lagi.'); }
    if (cmd === 'unipban'){ for (const ip in ipbans) if (ipbans[ip].user === a.name) delete ipbans[ip]; write(BAN_FILE, ipbans); delete a.ban; S.saveAccounts(); return console.log('IP ban ' + a.name + ' dicabut.'); }
    if (cmd === 'kick'){ const c = S.findOnline(a.name); if (c) S.kickClient(c, 'Kamu di-kick oleh server.'); return console.log(c ? 'Di-kick.' : 'Tidak online.'); }
    console.log('Perintah tidak dikenal. Ketik help.');
  }

  return {RANK, ROLE_NAME, roleOf, rankOf, display, muteInfo, loginBlock, friendList, friendReq, friendAccept, friendDecline, friendRemove,
          report, tradeRequest, tradeAccept, tradeDecline, tradeOffer, tradeOk, tradeConfirm, tradeCancel, onLeave, inTrade: u => tradeOf.has(u),
          command, consoleCmd, setRole, listAccounts, pushFriends, staffLog, REASONS};
}
module.exports = {createSocial, RANK};
