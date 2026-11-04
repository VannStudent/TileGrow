// TileGrow v1.13 — otoritas world: owner & admin (daftar akses World Lock) bisa pull, kick, dan ban pemain
// dari world mereka sendiri. Staff server (Moderator ke atas) kebal: tidak bisa ditarik, di-kick, atau di-ban.
// Ban world berlaku 1 jam, hanya untuk world itu, tersimpan di data world (data.wbans).
'use strict';
const BAN_MS = 60 * 60e3;                       // v1.13: ban world selalu 1 jam
const MAX_BANS = 200;                           // batas daftar ban per world

module.exports = function createWorldMod(ctx){
  const {clients, worlds, scheduleWorldSave, findOnline, kickClient, TS, econLog} = ctx;
  const low = s => String(s || '').toLowerCase();

  // ---------- otoritas ----------
  // owner = pemilik World Lock. admin = nama di daftar akses World Lock (tak terbatas jumlahnya).
  function worldLock(w){ if (!w || !w.data) return null;
    for (const [, m] of w.data.meta) if (m && m.lock && m.lock.type === 'world') return m.lock; return null; }
  function authOf(w, user){
    const L = worldLock(w); if (!L) return null;
    if (low(L.owner) === low(user)) return 'owner';
    if ((L.access || []).some(n => low(n) === low(user))) return 'admin';
    return null;
  }
  // staff server kebal (Moderator, Developer, Owner server)
  const immune = user => ctx.social.rankOf(user) >= ctx.social.RANK.mod;

  // ---------- daftar ban world ----------
  function bans(w){ if (!Array.isArray(w.data.wbans)) w.data.wbans = []; return w.data.wbans; }
  function cleanBans(w){ const now = Date.now(), b = bans(w).filter(x => x && x.until > now);
    if (b.length !== bans(w).length){ w.data.wbans = b; scheduleWorldSave(w); } return b; }
  function banInfo(w, user){ return cleanBans(w).find(x => low(x.name) === low(user)) || null; }
  function addBan(w, user, by){
    const b = cleanBans(w).filter(x => low(x.name) !== low(user));
    b.push({name: user, by, until: Date.now() + BAN_MS});
    w.data.wbans = b.slice(-MAX_BANS); scheduleWorldSave(w);
  }
  function unban(w, user){ const b = cleanBans(w), n = b.filter(x => low(x.name) !== low(user));
    if (n.length === b.length) return false; w.data.wbans = n; scheduleWorldSave(w); return true; }

  // ---------- aksi ----------
  // m = {t:'wmod', op:'pull'|'kick'|'ban'|'unban', name}
  function handle(c, m){
    const note = text => c.send({t: 'note', text});
    if (!c.world) return;
    const w = worlds.get(c.world); if (!w) return;
    const my = authOf(w, c.user);
    if (!my) return note('Hanya owner atau admin world ini yang bisa melakukan itu.');
    const op = String(m.op || ''), name = String(m.name || '').slice(0, 16);
    if (!name) return note('Pilih pemainnya dulu.');
    if (low(name) === low(c.user)) return note('Tidak bisa dipakai ke diri sendiri.');

    if (op === 'unban'){
      if (my !== 'owner') return note('Hanya owner world yang bisa membatalkan ban.');
      return note(unban(w, name) ? name + ' tidak di-ban lagi dari world ini.' : name + ' tidak sedang di-ban.');
    }
    if (!['pull', 'kick', 'ban'].includes(op)) return;

    const ta = authOf(w, name);
    if (ta === 'owner') return note('Owner world tidak bisa ditarik, di-kick, atau di-ban.');
    if (ta === 'admin' && my !== 'owner') return note('Admin tidak bisa menindak admin lain. Hanya owner world yang bisa.');
    if (immune(name)) return note(ctx.social.display(name) + ' adalah staff server dan tidak bisa ditindak.');

    const tc = findOnline(name);
    const inHere = tc && tc.world === c.world;
    const byTxt = ' oleh ' + ctx.social.display(c.user) + ' (' + (my === 'owner' ? 'owner' : 'admin') + ' world ' + w.name + ')';

    if (op === 'pull'){
      if (!inHere) return note(name + ' tidak ada di world ini.');
      if (!c.state) return note('Posisimu belum siap. Bergerak dulu sedikit.');
      tc.lastPos = null;
      tc.send({t: 'tp', x: c.state.x, y: c.state.y, fix: true});
      tc.send({t: 'note', text: 'Kamu ditarik' + byTxt + '.'});
      econLog('wmod', {world: w.name, op, by: c.user, target: name});
      return note(name + ' ditarik ke posisimu.');
    }
    if (op === 'ban') addBan(w, name, c.user);
    if (inHere){
      tc.send({t: 'note', text: (op === 'ban' ? 'Kamu di-ban 1 jam dari world ' + w.name : 'Kamu dikeluarkan dari world ' + w.name) + byTxt + '.'});
      ctx.leaveWorld(tc); tc.send({t: 'left', reason: op === 'ban' ? 'wban' : 'wkick'});
    } else if (op === 'kick') return note(name + ' tidak ada di world ini.');
    econLog('wmod', {world: w.name, op, by: c.user, target: name});
    return note(op === 'ban' ? name + ' di-ban 1 jam dari world ini.' : name + ' dikeluarkan dari world ini.');
  }

  // dipanggil sebelum masuk world: pemain yang di-ban ditolak (kecuali staff & owner/admin world)
  function joinDenied(c, w){
    if (immune(c.user) || authOf(w, c.user)) return null;
    const b = banInfo(w, c.user); if (!b) return null;
    const min = Math.max(1, Math.ceil((b.until - Date.now()) / 60e3));
    return 'Kamu di-ban dari world ' + w.name + '. Sisa ' + min + ' menit.';
  }
  // daftar untuk UI: siapa saja yang bisa ditindak + status ban
  function info(c){
    const w = c.world && worlds.get(c.world); if (!w) return {auth: null};
    return {auth: authOf(w, c.user), bans: cleanBans(w).map(b => ({name: b.name, min: Math.ceil((b.until - Date.now()) / 60e3)}))};
  }
  return {wmod: {handle, joinDenied, info, authOf, banInfo, unban, BAN_MS}};
};
