// TileGrow server: perintah chat pemain (emote, broadcast, pesan pribadi)
'use strict';
module.exports = function createChatCmd(ctx){
  const {clients, visibleTo, accounts, saveAccounts, econOf, saveEcon, pushEcon, findOnline} = ctx;
// v1.7: emote (/wave, /dance, ...): animasi karakter + ikon di atas kepala, dilihat semua pemain di world yang sama.
const EMOTES = new Set(['wave', 'dance', 'cry', 'laugh', 'angry', 'love', 'sleep', 'cheer']);
const EMOTE_ALIAS = {lambai: 'wave', joget: 'dance', nangis: 'cry', ketawa: 'laugh', marah: 'angry', cinta: 'love', tidur: 'sleep', hore: 'cheer'};
function emoteCmd(c, text){
  let cmd = text.slice(1).trim().split(/\s+/)[0].toLowerCase(); cmd = EMOTE_ALIAS[cmd] || cmd;
  if (cmd === 'emotes' || cmd === 'emote'){
    c.send({t: 'note', text: 'Emote: /' + [...EMOTES].join(', /') + '. Bahasa Indonesia juga bisa: /' + Object.keys(EMOTE_ALIAS).join(', /') + '.'});
    return true;
  }
  if (!EMOTES.has(cmd)) return false;
  const now = Date.now(); c.emT = (c.emT || []).filter(t => now - t < 10e3);
  if (c.emT.length >= 5){ c.send({t: 'note', text: 'Terlalu cepat. Tunggu sebentar.'}); return true; }
  c.emT.push(now);
  const msg = {t: 'emote', id: c.id, e: cmd};
  for (const o of clients) if (o.world === c.world && (o === c || visibleTo(c, o))) o.send(msg);
  return true;
}
// v1.6: /broadcast pesan — ke SEMUA pemain online di semua world, bayar gems.
// Harga 1000, naik +1000 untuk setiap broadcast lain dalam 10 menit terakhir (maks 5000). Jeda 2 menit per pemain, maks 120 huruf.
const fmt = n => Number(n).toLocaleString('id-ID');
const BC = {base: 1000, step: 1000, max: 5000, window: 10 * 60e3, cooldown: 2 * 60e3, maxLen: 120};
const bcLog = [];                                       // waktu broadcast (semua pemain)
function bcPrice(now){ while (bcLog.length && now - bcLog[0] > BC.window) bcLog.shift(); return Math.min(BC.max, BC.base + BC.step * bcLog.length); }
function broadcastCmd(c, text){
  const parts = text.slice(1).trim().split(/\s+/), cmd = (parts.shift() || '').toLowerCase();
  if (cmd !== 'broadcast' && cmd !== 'bc') return false;
  const me = accounts[c.user.toLowerCase()]; if (!me) return true;
  const note = t => { c.send({t: 'note', text: t}); return true; };
  const now = Date.now(), price = bcPrice(now);
  const body = parts.join(' ').replace(/[\u0000-\u001f]/g, '').trim();
  if (!body) return note('Pakai: /broadcast pesan (maks ' + BC.maxLen + ' huruf). Harga sekarang: ' + fmt(price) + ' gems. Tampil ke semua pemain online di semua world.');
  if (body.length > BC.maxLen) return note('Broadcast maksimal ' + BC.maxLen + ' huruf (pesanmu ' + body.length + ').');
  const mu = ctx.social.muteInfo(me); if (mu) return note('Kamu di-mute, tidak bisa broadcast.');
  const wait = Math.ceil(((c.lastBc || me.lastBc || 0) + BC.cooldown - now) / 1000);
  if (wait > 0) return note('Tunggu ' + wait + ' detik lagi sebelum broadcast berikutnya.');
  if (ctx.social.inTrade(c.user)) return note('Selesaikan trade dulu.');
  const E = econOf(c.user);
  if (E.gems < price) return note('Gems tidak cukup. Broadcast sekarang ' + fmt(price) + ' gems (kamu punya ' + fmt(E.gems) + ').');
  E.gems -= price; saveEcon(c.user);
  bcLog.push(now); c.lastBc = me.lastBc = now;
  const msg = {t: 'bcast', name: c.user, display: ctx.social.display(c.user), role: ctx.social.roleOf(c.user), world: c.world || '', text: body};
  for (const o of clients) if (o.user) o.send(msg);
  console.log('[broadcast]', c.user, '(' + price + ' gems):', body);
  pushEcon(c, [['act', 'Broadcast terkirim ke semua pemain (-' + fmt(price) + ' gems). Harga berikutnya: ' + fmt(bcPrice(now)) + ' gems.']]);
  return true;
}
// v1.5: pesan pribadi /msg NAMA pesan, /r pesan (balas), /ignore NAMA (toggle), /ignore (daftar)
function privateMsg(c, text){
  const parts = text.slice(1).trim().split(/\s+/), cmd = (parts.shift() || '').toLowerCase();
  if (!['msg', 'pm', 'r', 'ignore', 'unignore'].includes(cmd)) return false;
  const me = accounts[c.user.toLowerCase()]; if (!me) return true;
  const note = t => { c.send({t: 'note', text: t}); return true; };   // selalu true: command sudah ditangani
  if (cmd === 'ignore' || cmd === 'unignore'){
    me.ignore = Array.isArray(me.ignore) ? me.ignore : [];
    if (!parts[0]) return note(me.ignore.length ? 'Kamu mengabaikan: ' + me.ignore.join(', ') + '. /unignore NAMA untuk membuka.' : 'Daftar ignore kosong. Pakai: /ignore NAMA');
    const ta = accounts[parts[0].toLowerCase()]; if (!ta) return note('Pemain ' + parts[0] + ' tidak ditemukan.');
    if (ta.name === me.name) return note('Tidak bisa ignore diri sendiri.');
    const k = me.ignore.indexOf(ta.name), off = cmd === 'unignore' || k >= 0;
    if (off){ if (k >= 0) me.ignore.splice(k, 1); } else { if (me.ignore.length >= 100) return note('Daftar ignore penuh (100).'); me.ignore.push(ta.name); }
    saveAccounts();
    return note(off ? ta.name + ' tidak diabaikan lagi.' : 'Kamu mengabaikan ' + ta.name + '. Pesan pribadinya tidak akan sampai. Ketik /ignore ' + ta.name + ' lagi untuk membuka.');
  }
  let name, body;
  if (cmd === 'r'){ name = c.lastPm; body = parts.join(' '); if (!name) return note('Belum ada pesan pribadi untuk dibalas.'); }
  else { name = parts.shift(); body = parts.join(' '); }
  if (!name || !body) return note(cmd === 'r' ? 'Pakai: /r pesan' : 'Pakai: /msg NAMA pesan');
  const mu = ctx.social.muteInfo(me);
  if (mu) return note('Kamu di-mute sampai ' + new Date(mu.until).toLocaleTimeString('id-ID') + '.');
  const now = Date.now(); c.pmRate = (c.pmRate || []).filter(t => now - t < 10000);
  if (c.pmRate.length >= 6) return note('Terlalu cepat. Tunggu sebentar sebelum kirim pesan pribadi lagi.');
  const o = findOnline(name);
  if (!o || !visibleTo(o, c)) return note('Pemain ' + name + ' sedang tidak online.');
  if (o === c) return note('Tidak bisa mengirim pesan ke diri sendiri.');
  c.pmRate.push(now);
  const ta = accounts[o.user.toLowerCase()] || {};
  // diabaikan penerima: pengirim tetap melihat "terkirim" (supaya tidak ketahuan diblok), pesan tidak dikirim. Staff tidak bisa di-ignore.
  const ignored = Array.isArray(ta.ignore) && ta.ignore.includes(me.name) && ctx.social.rankOf(c.user) < ctx.social.RANK.mod;
  c.send({t: 'pm', dir: 'to', name: o.user, display: ctx.social.display(o.user), text: body});
  if (ignored) return true;
  o.lastPm = c.user;
  o.send({t: 'pm', dir: 'from', name: c.user, display: ctx.social.display(c.user), role: ctx.social.roleOf(c.user), text: body});
  return true;
}
  return {emoteCmd, broadcastCmd, privateMsg};
};
