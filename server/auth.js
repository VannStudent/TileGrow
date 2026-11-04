// TileGrow server: daftar & login (scrypt + salt, batas percobaan)
'use strict';
const crypto = require('crypto');
const {RANK} = require('./social');
const {TEST, REG_MAX} = require('./config');
const {readJSON, playerFile, accounts, saveAccounts, econOf} = require('./store');

// ---------- password: scrypt + salt (password asli tidak pernah disimpan) ----------
function safeEq(a, b){ const A = Buffer.from(a, 'hex'), B = Buffer.from(b, 'hex'); return A.length === B.length && crypto.timingSafeEqual(A, B); }
const FLAGS = new Set(['ID','MY','SG','PH','TH','VN','JP','KR','CN','IN','US','GB','DE','FR','IT','BR','AU','SA','TR','NL']);

module.exports = function createAuth(ctx){
  const {clients, kickClient, findOnline} = ctx;
// ---------- batas percobaan login (anti tebak password) ----------
// 5 gagal dalam 60 dtk (per IP atau per username) = diblokir 60 dtk. Akun baru maks 35 per IP per jam
// (banyak pemain bisa berbagi satu IP: satu WiFi, atau kuota HP yang IP-nya dipakai bersama).
const FAIL_MAX = 5, FAIL_WINDOW = 60000, FAIL_BLOCK = 60000, REG_WINDOW = 3600000;
const fails = new Map(), regs = new Map();
function blockedFor(key){ const f = fails.get(key); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(key){
  const now = Date.now(), f = fails.get(key) || {n: 0, t: now, until: 0};
  if (now - f.t > FAIL_WINDOW){ f.n = 0; f.t = now; }
  if (++f.n >= FAIL_MAX){ f.until = now + FAIL_BLOCK; f.n = 0; f.t = now; }
  fails.set(key, f);
}
setInterval(()=>{ const now = Date.now();
  for (const [k, f] of fails) if (f.until < now && now - f.t > FAIL_WINDOW) fails.delete(k);
  for (const [k, r] of regs) if (now - r.t > REG_WINDOW) regs.delete(k); }, 60000).unref();
// scrypt async: login tidak lagi membekukan server untuk pemain lain
const scryptAsync = (pass, salt) => new Promise((res, rej) => crypto.scrypt(String(pass), salt, 32, (e, k) => e ? rej(e) : res(k.toString('hex'))));


async function handleAuth(c, m, t){
  const user = String(m.user || '').trim(), pass = String(m.pass || '');
  if (!/^[A-Za-z0-9]{3,16}$/.test(user)) return c.send({t: 'auth', ok: false, err: 'Username 3–16 karakter, hanya huruf dan angka.'});
  if (pass.length > 200) return c.send({t: 'auth', ok: false, err: 'Password terlalu panjang.'});
  const key = user.toLowerCase(), flag = FLAGS.has(m.flag) ? m.flag : null;
  const wait = Math.max(blockedFor('ip:' + c.ip), blockedFor('u:' + key));
  if (wait) return c.send({t: 'auth', ok: false, err: 'Terlalu banyak percobaan gagal. Coba lagi dalam ' + wait + ' detik.'});
  const ipb = ctx.social.loginBlock('', c.ip); if (ipb) return c.send({t: 'auth', ok: false, err: ipb});
  if (t === 'register'){
    if (pass.length < 6) return c.send({t: 'auth', ok: false, err: 'Password minimal 6 karakter.'});
    if (accounts[key]) return c.send({t: 'auth', ok: false, err: 'Username sudah dipakai di server ini.'});
    const r = regs.get(c.ip) || {n: 0, t: Date.now()};
    // batas akun baru per IP per jam. Dari PC server sendiri tidak dibatasi (buat tes), dan bisa diatur: set REG_MAX=200
    if (r.n >= REG_MAX && !TEST && !ctx.isLocalIp(c.ip))
      return c.send({t: 'auth', ok: false, err: 'Terlalu banyak akun baru dari perangkat ini. Coba lagi nanti.'});
    const salt = crypto.randomBytes(16).toString('hex'), hash = await scryptAsync(pass, salt);
    if (accounts[key]) return c.send({t: 'auth', ok: false, err: 'Username sudah dipakai di server ini.'});
    accounts[key] = {name: user, salt, hash, flag: flag || 'ID', created: Date.now()};
    saveAccounts(); r.n++; regs.set(c.ip, r);
  }
  const a = accounts[key];
  if (!a){ noteFail('ip:' + c.ip); return c.send({t: 'auth', ok: false, err: 'Akun tidak ditemukan di server ini.'}); }
  if (t === 'login' && !safeEq(await scryptAsync(pass, a.salt), a.hash)){
    noteFail('ip:' + c.ip); noteFail('u:' + key);
    return c.send({t: 'auth', ok: false, err: 'Password salah.'});
  }
  if (!c.alive) return;
  const banned = ctx.social.loginBlock(a.name, c.ip); if (banned) return c.send({t: 'auth', ok: false, err: banned});
  fails.delete('u:' + key);
  // satu akun hanya boleh login di satu perangkat
  for (const o of clients) if (o !== c && o.user && o.user.toLowerCase() === key) kickClient(o, 'Akun ini baru saja login di perangkat lain.');
  if (flag && flag !== a.flag) a.flag = flag;
  a.lastIp = c.ip; a.lastSeen = Date.now(); saveAccounts();
  c.user = a.name; c.flag = a.flag;
  const f = readJSON(playerFile(a.name), null) || {};
  const E = econOf(a.name);
  c.send({t: 'auth', ok: true, user: a.name, flag: a.flag, role: ctx.social.roleOf(a.name), display: ctx.social.display(a.name),
          player: f.client || null, econ: {bag: E.bag, bagSlots: E.bagSlots, gems: E.gems, prog: E.prog}, isNew: t === 'register'});
  c.send({t: 'friends', ...ctx.social.friendList(a.name)});
  c.send({t: 'news', ...ctx.news.get(), canEdit: ctx.social.rankOf(a.name) >= RANK.dev});
  for (const fr of ctx.social.friendList(a.name).friends){ const fc = findOnline(fr.name); if (fc) ctx.social.pushFriends(fr.name); }
}
  return {handleAuth};
};
