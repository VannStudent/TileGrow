'use strict';
// TileGrow v1.6 — Kabar TileGrow: berita/event yang muncul sebagai popup saat masuk lobby (seperti koran di game sandbox).
// Sumber: file teks server/news.txt (bisa diedit dengan Notepad) ATAU editor di dalam game untuk role Developer.
// Format teks sederhana (lihat news.txt):
//   # Judul besar            -> judul berita
//   ## Subjudul / tanggal    -> baris tanggal / judul bagian (merah)
//   ! Peringatan              -> baris peringatan dengan ikon papan
//   - poin                    -> butir daftar
//   teks biasa                -> paragraf. {kuning}, [ungu], *tebal*
const fs = require('fs'), path = require('path');
const MAX = 6000;
const DEFAULT = `## Selamat datang di TileGrow!
Tulis berita, update, dan event di sini. Developer bisa mengedit lewat tombol *Edit Berita* di lobby, atau buka file [server/news.txt] dengan Notepad.
- Ketik /help di chat untuk daftar perintah.
- Pakai /broadcast untuk mengumumkan sesuatu ke semua pemain (bayar gems).
! Jangan pernah membagikan password akunmu ke siapa pun.
`;
function createNews({file, onChange}){
  let text = DEFAULT, ver = 0, mtime = 0;
  const load = () => {
    try {
      const st = fs.statSync(file);
      if (st.mtimeMs === mtime) return false;
      mtime = st.mtimeMs; text = String(fs.readFileSync(file, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').slice(0, MAX); ver = Math.round(st.mtimeMs);
      return true;
    } catch(e){
      if (e.code === 'ENOENT'){ try { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, DEFAULT.replace(/\n/g, '\r\n')); } catch(_){} mtime = 0; text = DEFAULT; ver = 1; }
      return false;
    }
  };
  load();
  // berubah lewat Notepad -> otomatis dikirim ulang (cek tiap 3 dtk, murah)
  const timer = setInterval(() => { if (load() && onChange) onChange(); }, 3000); if (timer.unref) timer.unref();
  return {
    get: () => ({text, ver}),
    set(t){
      t = String(t || '').replace(/\r\n/g, '\n').slice(0, MAX);
      fs.writeFileSync(file, t.replace(/\n/g, '\r\n')); text = t;
      try { mtime = fs.statSync(file).mtimeMs; } catch(e){}
      ver = Math.round(mtime || Date.now()); if (onChange) onChange(); return ver;
    },
    MAX
  };
}
module.exports = {createNews, DEFAULT};
