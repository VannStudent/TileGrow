'use strict';
// TileGrow v1.4 — ekonomi di server. Data item, toko, resep, drop rate, quest, goals, dan level diambil langsung dari
// js/data.js + js/world.js (dijalankan di sandbox vm), jadi aturannya sama persis dengan di browser.
// Server memegang tas, gems, XP, quest; browser hanya menampilkan hasilnya.
const vm = require('vm'), fs = require('fs'), path = require('path');

function stub(){ return new Proxy(function(){}, {get: (t, k) => k === Symbol.toPrimitive ? (() => 0) : (k === 'width' || k === 'height') ? 16 : stub(), apply: () => stub(), set: () => true}); }

function loadEcon(root){
  const out = [];
  const canvas = () => ({width: 16, height: 16, getContext: () => stub(), toDataURL: () => ''});
  const document = {createElement: canvas, getElementById: () => ({width: 1280, height: 720, getContext: () => stub()})};
  const ctx = vm.createContext({document, Math, Date, JSON, Object, Array, Map, Set, Number, String, Boolean, Uint8Array, Infinity, NaN,
    isFinite, parseInt, parseFloat, console, setTimeout: () => 0, clearTimeout: () => {},
    toast: t => out.push(['toast', String(t)]), refreshUI(){}, renderChat(){}, burst(){}, sfx(){}, puff(){}, netTouch(){}, netQev(){},
    online: () => false, __out: out});
  const src = ['js/data.js', 'js/world.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n');
  vm.runInContext(src, ctx, {filename: 'shared(data.js+world.js)'});
  vm.runInContext(`
    say = (k, t) => __out.push([k, String(t)]);
    notePickup = (k, n) => __out.push(['pick', '+' + n + ' ' + itemDef(k).name]);
    pl = {x: 0, y: 0, w: 26, h: 30};
    var __load = s => { bag = s.bag; bagSlots = s.bagSlots; gems = s.gems; prog = s.prog; hot = [FIST]; selKey = FIST;
                        worn = {wings: null, hat: null, shirt: null, pants: null, tool: null}; };
    var __dump = () => ({bag, bagSlots, gems, prog});
    var __newEcon = () => { genWorld(); rollQuests(); return __dump(); };
    var __gen = () => { genTerrain(); return {fg: Array.from(fg), bgw: Array.from(bgw), trees: Array.from(trees.entries()),
                                               meta: Array.from(meta.entries()), spawn: {x: spawn.x, y: spawn.y}}; };
  `, ctx);
  const D = vm.runInContext(`({SHOP, BY_ID, RECIPES, GROW_MS, SEEDABLE, DROP_BLOCK, DROP_SEED, DROP_SEED_BG, GEM_FROM_BLOCK,
    GEM_FROM_TREE, WEAR, STACK, FIST, WRENCH, REACH, TS, COLS, ROWS, itemDef, recipe, xpNeeded})`, ctx);
  const G = vm.runInContext(`({addItem, takeItem, countOf, canAdd, questEvent, addXP, stat, claimQuest, rollQuests,
    discoverRecipe, bagUpgradeCost, checkGoals, convertLocks, addGems: d => { gems += d; }})`, ctx);
  const R = Math.random;

  // jalankan fungsi ekonomi untuk satu pemain. Hasil: nilai fungsi; pesan untuk pemain ada di econ.out
  function run(E, f){ out.length = 0; ctx.__load(E); try { return f(G); } finally { Object.assign(E, ctx.__dump()); } }
  function newEcon(){ out.length = 0; const e = ctx.__newEcon(); out.length = 0; return JSON.parse(JSON.stringify(e)); }
  function genWorldData(){ return ctx.__gen(); }

  const isKey = k => typeof k === 'string' && (k === D.FIST || k === D.WRENCH || !!D.WEAR[k] || (/^[bs]\d{1,3}$/.test(k) && !!D.BY_ID[+k.slice(1)] && +k.slice(1) !== 0));
  // drop saat block dipecah (sama dengan hitTile() di game.js)
  function rollBreak(id, isBg){
    const d = D.BY_ID[id], drops = [];
    if (isBg){
      if (R() < D.DROP_SEED_BG) drops.push(['s1', 1]);
      if (R() < D.DROP_BLOCK) drops.push(['b' + id, 1]);
      return {drops, xp: d.xp || 1, bg: true, ore: false};
    }
    if (d.lock || d.wrench) drops.push(['b' + id, 1]);           // lock, papan, pintu, kotak pajang selalu kembali
    else {
      if (R() < D.DROP_BLOCK) drops.push(['b' + id, 1]);
      if (D.SEEDABLE.includes(id) && R() < D.DROP_SEED) drops.push(['s' + id, 1]);
    }
    let ore = false;
    if (d.gem){ drops.push(['gem', d.gem[0] + (R() * (d.gem[1] - d.gem[0] + 1) | 0)]); ore = !d.farm; }
    else if (R() < D.GEM_FROM_BLOCK) drops.push(['gem', 1]);
    return {drops, xp: d.xp || 1, bg: false, ore};
  }
  // panen pohon (sama dengan punch() di game.js)
  function rollHarvest(kind){
    const drops = [['b' + kind, 1 + (R() * 3 | 0)]];
    if (R() < .5) drops.push(['s' + kind, 1]);
    drops.push(['gem', D.GEM_FROM_TREE[0] + (R() * (D.GEM_FROM_TREE[1] - D.GEM_FROM_TREE[0] + 1) | 0)]);
    return {drops, xp: 3 + (D.BY_ID[kind].xp || 1) * 2};
  }
  // muat semua barang ke tas? (dipakai toko & trade). items: [[key, n], ...]
  function fits(E, items, removed){
    const sim = E.bag.map(s => ({...s}));
    for (const [k, n] of removed || []){ const s = sim.find(s => s.key === k); if (s){ s.n -= n; if (s.n <= 0) sim.splice(sim.indexOf(s), 1); } }
    for (const [k, n] of items){
      const s = sim.find(s => s.key === k);
      if (s){ if (s.n + n > D.STACK) return 'Stack ' + D.itemDef(k).name + ' akan lewat ' + D.STACK + '.'; s.n += n; }
      else { if (sim.length >= E.bagSlots) return 'Tas penuh.'; sim.push({key: k, n}); }
    }
    return null;
  }
  // beli di toko (sama dengan buy() di ui.js)
  function buy(E, key){
    const it = D.SHOP.find(s => s.key === key); if (!it) return 'Barang tidak ada.';
    return run(E, g => {
      const price = it.price === 'bag' ? g.bagUpgradeCost() : it.price;
      if (E.gems < price) return 'Gems tidak cukup.';
      if (it.key === 'bag8'){ if (E.bagSlots >= 64) return 'Tas sudah maksimal.'; g.addGems(-price); vm.runInContext('bagSlots += 8', ctx); out.push(['act', 'Tas sekarang ' + (E.bagSlots + 8) + ' slot.']); return null; }
      const err = fits(E, it.give); if (err) return err;
      g.addGems(-price);
      g.questEvent('buy', null, 1);
      for (const [k, n] of it.give) g.addItem(k, n);
      out.push(['act', 'Kamu membeli ' + it.name + ' seharga ' + price.toLocaleString('id-ID') + ' gems.']);
      return null;
    });
  }
  const solid = id => !!(D.BY_ID[id] && D.BY_ID[id].solid);
  return {D, G, out, run, newEcon, genWorldData, isKey, rollBreak, rollHarvest, fits, buy, solid};
}
module.exports = {loadEcon};
