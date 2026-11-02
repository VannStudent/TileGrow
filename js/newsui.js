'use strict';
// TileGrow v1.6 — tampilan Kabar TileGrow (popup berita/event di lobby), banner /broadcast, dan musik pembuka.
// ---------- Kabar TileGrow ----------
let NEWS = {text: '', ver: 0, canEdit: false};
const NEWS_SEEN = 'tilegrow-news-seen';
function newsEsc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function newsInline(s){
  return newsEsc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\{([^}]+)\}/g, '<span class="nwY">$1</span>').replace(/\[([^\]]+)\]/g, '<span class="nwP">$1</span>');
}
// teks sederhana -> HTML (lihat format di server/news.js)
function newsHTML(t){
  const out = []; let list = null;
  const close = () => { if (list){ out.push('<ul>' + list.join('') + '</ul>'); list = null; } };
  for (const raw of String(t || '').split('\n')){
    const l = raw.trimEnd();
    if (!l.trim()){ close(); continue; }
    if (l.startsWith('## ')){ close(); out.push('<h4>' + newsInline(l.slice(3)) + '</h4>'); }
    else if (l.startsWith('# ')){ close(); out.push('<h3>' + newsInline(l.slice(2)) + '</h3>'); }
    else if (l.startsWith('! ')){ close(); out.push('<p class="nwWarn"><i class="nwSign"></i><b>PERHATIAN:</b> ' + newsInline(l.slice(2)) + '</p>'); }
    else if (/^[-•] /.test(l)){ (list = list || []).push('<li>' + newsInline(l.slice(2)) + '</li>'); }
    else { close(); out.push('<p>' + newsInline(l) + '</p>'); }
  }
  close(); return out.join('') || '<p>Belum ada berita.</p>';
}
function onNews(m){
  NEWS = {text: m.text || '', ver: m.ver || 0, canEdit: !!m.canEdit};
  const ed = $('nwEdit'); if (ed) ed.classList.toggle('hidden', !NEWS.canEdit);
  if ($('newsBox') && !$('newsBox').classList.contains('hidden') && !$('nwEditor').classList.contains('hidden')) return;   // sedang mengedit: jangan timpa
  if ($('nwBody')) $('nwBody').innerHTML = newsHTML(NEWS.text);
  if (m.open) return openNews();
  // tampil otomatis sekali tiap ada versi berita baru, saat pemain di lobby
  let seen = 0; try { seen = +localStorage.getItem(NEWS_SEEN) || 0; } catch(e){}
  if (NEWS.ver && NEWS.ver !== seen && !inGame) setTimeout(openNews, 300);
}
function openNews(){
  $('nwBody').innerHTML = newsHTML(NEWS.text);
  $('nwEditor').classList.add('hidden'); $('nwBody').classList.remove('hidden');
  $('nwEdit').classList.toggle('hidden', !NEWS.canEdit); $('nwSave').classList.add('hidden');
  $('newsBox').classList.remove('hidden');
  try { localStorage.setItem(NEWS_SEEN, String(NEWS.ver)); } catch(e){}
}
function bindNews(){
  $('nwClose').onclick = () => $('newsBox').classList.add('hidden');
  $('newsBox').addEventListener('pointerdown', e => { if (e.target.id === 'newsBox') $('newsBox').classList.add('hidden'); });
  $('lbNews').onclick = () => { if (online()) netSend({t: 'newsGet'}); else { NEWS.text = NEWS.text || OFFLINE_NEWS; openNews(); } };
  $('nwEdit').onclick = () => {
    $('nwText').value = NEWS.text; $('nwEditor').classList.remove('hidden'); $('nwBody').classList.add('hidden');
    $('nwEdit').classList.add('hidden'); $('nwSave').classList.remove('hidden'); nwPreview();
  };
  $('nwText').addEventListener('input', nwPreview);
  $('nwSave').onclick = () => { netSend({t: 'newsSet', text: $('nwText').value}); NEWS.text = $('nwText').value; openNews(); };
}
function nwPreview(){ $('nwPrev').innerHTML = newsHTML($('nwText').value); $('nwCount').textContent = $('nwText').value.length + ' / 6000'; }
const OFFLINE_NEWS = '## Mode offline\nBerita & event tampil saat main *online*. Hubungkan ke server untuk melihat kabar terbaru.';

// ---------- /broadcast ----------
function onBroadcast(m){
  const who = (m.display || m.name) + (m.world ? ' (di ' + m.world + ')' : '');
  say('bc', who + ': ' + m.text);
  const b = $('bcBanner'); if (!b) return;
  b.innerHTML = '<b>📢 ' + newsEsc(who) + '</b> ' + newsEsc(m.text);
  b.classList.remove('hidden'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(onBroadcast.t); onBroadcast.t = setTimeout(() => b.classList.add('hidden'), 9000);
  sfx('level');
}

// ---------- musik pembuka (WebAudio, tanpa file; nada tenang dibuat sendiri) ----------
const MUSIC = {on: false, ctx: null, gain: null, timer: 0, step: 0};
// progresi I–vi–IV–V di C mayor, arpeggio lembut + bass; 84 bpm
const MU_CH = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const MU_MEL = [76, -1, 74, 72, -1, 71, 72, -1,  72, -1, 71, 69, -1, 67, 69, -1,  69, -1, 67, 65, -1, 64, 65, 67,  67, -1, 65, 64, -1, 62, 64, -1];
function muNote(m, t, dur, type, vol, dest){
  const c = MUSIC.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = 440 * Math.pow(2, (m - 69)/12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .03); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .05);
}
function musicTick(){
  const c = MUSIC.ctx; if (!c) return;
  const beat = 60/84/2;                                         // per 1/8
  while (MUSIC.next < c.currentTime + .4){
    const st = MUSIC.step, bar = Math.floor(st / 8) % 4, ch = MU_CH[bar], t = MUSIC.next, k = st % 8;
    if (k === 0) muNote(ch[0] - 24, t, beat*7.5, 'triangle', .16, MUSIC.gain);          // bass
    if (k === 4) muNote(ch[0] - 12, t, beat*3.5, 'triangle', .07, MUSIC.gain);
    muNote(ch[[0, 1, 2, 3, 2, 1, 2, 1][k]], t, beat*2.2, 'sine', .045, MUSIC.gain);    // arpeggio
    const mel = MU_MEL[st % 32]; if (mel > 0) muNote(mel, t, beat*2.6, 'triangle', .05, MUSIC.mel);
    MUSIC.step++; MUSIC.next += beat;
  }
}
function musicStart(){
  if (!settings.music || MUSIC.on) return;
  try {
    MUSIC.ctx = MUSIC.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (MUSIC.ctx.state === 'suspended') MUSIC.ctx.resume();
    const c = MUSIC.ctx;
    MUSIC.gain = c.createGain(); MUSIC.gain.gain.setValueAtTime(0, c.currentTime); MUSIC.gain.gain.linearRampToValueAtTime(.55, c.currentTime + 2.5);
    // gema sederhana: delay + feedback -> suasana santai
    const dl = c.createDelay(); dl.delayTime.value = .36; const fb = c.createGain(); fb.gain.value = .32; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    MUSIC.mel = c.createGain(); MUSIC.mel.connect(MUSIC.gain); MUSIC.mel.connect(dl); dl.connect(lp).connect(fb).connect(dl); lp.connect(MUSIC.gain);
    MUSIC.gain.connect(c.destination);
    MUSIC.step = 0; MUSIC.next = c.currentTime + .1; MUSIC.on = true;
    MUSIC.timer = setInterval(musicTick, 120); musicTick();
  } catch(e){ MUSIC.on = false; }
}
function musicStop(){
  if (!MUSIC.on) return; MUSIC.on = false; clearInterval(MUSIC.timer);
  const c = MUSIC.ctx, g = MUSIC.gain; if (!c || !g) return;
  g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
  setTimeout(() => { try { g.disconnect(); } catch(e){} }, 1400);
}
// browser hanya mengizinkan suara setelah ada sentuhan/klik pertama
function musicArm(){
  const go = () => { if (!inGame) musicStart(); window.removeEventListener('pointerdown', go, true); window.removeEventListener('keydown', go, true); };
  window.addEventListener('pointerdown', go, true); window.addEventListener('keydown', go, true);
  musicStart();
}
