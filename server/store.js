// TileGrow server: penyimpanan file (akun, world, ekonomi pemain)
'use strict';
const fs = require('fs');
const path = require('path');
const {DATA, econ, D} = require('./config');

for (const d of [DATA, path.join(DATA, 'players'), path.join(DATA, 'worlds')]) fs.mkdirSync(d, {recursive: true});

function readJSON(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e){ return fallback; } }
function writeJSON(file, obj){ const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
const ACC_FILE = path.join(DATA, 'accounts.json');
const accounts = readJSON(ACC_FILE, {});              // lower -> {name, salt, hash, flag, created}
const saveAccounts = () => writeJSON(ACC_FILE, accounts);
const playerFile = u => path.join(DATA, 'players', u.toLowerCase() + '.json');
const worldFile = n => path.join(DATA, 'worlds', n + '.json');

const worlds = new Map();                            // nama -> {data, timer, drops: Map}
function validWorldName(n){ return typeof n === 'string' && /^[A-Z0-9]{1,16}$/.test(n); }
function loadWorld(name){
  if (worlds.has(name)) return worlds.get(name);
  const data = readJSON(worldFile(name), null);
  if (!data) return null;
  const w = {name, data, timer: null, drops: new Map()};
  worlds.set(name, w); return w;
}
function scheduleWorldSave(w){
  if (w.timer) return;
  w.timer = setTimeout(()=>{ w.timer = null; writeJSON(worldFile(w.name), w.data); }, 1500);
}
function flushAll(){ for (const w of worlds.values()) if (w.timer){ clearTimeout(w.timer); w.timer = null; writeJSON(worldFile(w.name), w.data); } }
function worldOwner(data){ for (const [, m] of data.meta) if (m && m.lock && m.lock.type === 'world') return m.lock.owner; return null; }

// ---------- ekonomi per pemain (dipegang server) ----------
const econs = new Map();                              // lower -> {bag, bagSlots, gems, prog}
const econTimers = new Map();
function econOf(user){
  const k = String(user || '').toLowerCase();
  if (econs.has(k)) return econs.get(k);
  const f = readJSON(playerFile(user), null);
  let E;
  if (f && f.econ && Array.isArray(f.econ.bag)) E = f.econ;
  else {
    E = econ.newEcon();
    // pindahan dari v1.2 (dulu browser yang menyimpan): progres level/quest dipakai, tas & gems dibatasi supaya tidak bisa dicurangi
    if (f && f.v === 10 && f.prog && typeof f.prog === 'object' && Number.isInteger(f.prog.level)){
      E.prog = Object.assign(E.prog, {level: Math.min(f.prog.level, 30), xp: 0, bestiary: Array.isArray(f.prog.bestiary) ? f.prog.bestiary.slice(0, 50) : []});
      if (Array.isArray(f.bag)) for (const sl of f.bag){
        const ok = sl && econ.isKey(sl.key) && Number.isInteger(sl.n) && sl.n > 0;
        if (ok && !E.bag.some(x => x.key === sl.key) && E.bag.length < E.bagSlots) E.bag.push({key: sl.key, n: Math.min(sl.n, D.STACK)});
      }
      if (Number.isInteger(f.gems)) E.gems = Math.max(0, Math.min(f.gems, 5000));
      if (Number.isInteger(f.bagSlots)) E.bagSlots = Math.max(16, Math.min(64, f.bagSlots));
      console.log('[econ] migrasi save v1.2', user);
    }
  }
  econs.set(k, E); return E;
}
function saveEcon(user){
  const k = String(user).toLowerCase();
  if (econTimers.has(k)) return;
  econTimers.set(k, setTimeout(() => { econTimers.delete(k); writePlayer(user); }, 1000));
}
function writePlayer(user){
  const k = String(user).toLowerCase(), E = econs.get(k); if (!E) return;
  const f = readJSON(playerFile(user), {}) || {};
  f.econ = E; f.v = 13;
  writeJSON(playerFile(user), f);
}
function flushEcons(){ for (const [k, t] of econTimers){ clearTimeout(t); econTimers.delete(k); const a = accounts[k]; if (a) writePlayer(a.name); } }
// kirim keadaan ekonomi terbaru ke pemain + pesan (naik level, quest selesai, dll)
function pushEcon(c, extra){
  const E = econOf(c.user);
  c.send({t: 'econ', bag: E.bag, bagSlots: E.bagSlots, gems: E.gems, prog: E.prog, msgs: [...econ.out.splice(0), ...(extra || [])]});
}

module.exports = {readJSON, writeJSON, ACC_FILE, accounts, saveAccounts, playerFile, worldFile, worlds, validWorldName, loadWorld,
  scheduleWorldSave, flushAll, worldOwner, econs, econOf, saveEcon, writePlayer, flushEcons, pushEcon};
