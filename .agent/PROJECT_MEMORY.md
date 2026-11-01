# TileGrow — PROJECT_MEMORY
Update terakhir: 2026-10-22 WIB (v1.4)

## Apa ini
Game sandbox 2D di browser terinspirasi Growtopia (aset & nama sendiri, bukan GTPS). Repo utama: github VannStudent/TileGrow (remote `git@github-tilegrow:VannStudent/TileGrow.git`), folder ~/TileGrow. Versi lama di ~/hermes-first-task (berhenti di v1.0).
Mode offline (localStorage, GitHub Pages) + mode online LAN (`node server/server.js`, Node 18+, tanpa npm).

## Struktur
- tilegrow.html (UI + CSS), js/{data,world,game,render,ui,screens,controls,net,social,main}.js
- server/server.js (HTTP+WebSocket, world, auth scrypt, protokol act), server/econ.js (aturan ekonomi dari data.js+world.js via vm), server/social.js (role, staff command, teman, report, trade)
- tests/run-v13.mjs (49 kasus), `security` (33), `admin` (11/12), `v14` (45); masing-masing menjalankan server sendiri dengan data kosong.

## Status v1.3
Selesai & dites otomatis: server pegang tas/gems/XP/quest/beli/drop; drop bersama; trade 2 tahap (Setuju→Konfirmasi 3 dtk, atomik, log); teman; report; role dev(@oranye)/mod(@ungu) dari console server; command staff (mod ban maks 7 hari, ipban/invis/setrole khusus dev); noclip; zoom satu world; freeze; menu pemain lewat ikon kunci inggris.

## v1.3.1
Panel Role di /admin (server/admin.js): hanya loopback + Host localhost, token per sesi, setRole dipakai bersama console. Dist: dist/TileGrow-v1.3.1.zip (server + Panel-Role.bat + TUTORIAL.txt + HTML offline) dan dist/tilegrow-v1.3.1-offline.html. Pelajaran: di PC user sering masih jalan server lama di port 8080; cek baris 'Versi server' di jendela server.

## v1.4
Lobby baru (kartu world, cari, saran). Rarity (data.js RARITY/rarityOf) + tombol Info di tas. World Lock 1.800. Crystal Lock id 34 = 100 WL (klik 2x di tas, server `lockConvert`). Farmable 50–1000 gems per jenis. Dev: /give item|gems, /items. Dadu id 60 / Roulette id 61 (diacak server, broadcast `roll`). Nama hijau muda #b8ffb0 untuk pemain di daftar akses WL. Vending Machine id 62 (meta `vend:{owner,key,n,price,earned}`, server `handleVend` pesan `vend` op stock/price/take/collect/buy; edit meta langsung ditolak).
Tes: `run-v13.mjs v14` (45 kasus) + lama 49/33/admin 11.
Keputusan user 2026-10-22: monster gua + quest slay, pedang, fishing rod/water/bait **tidak dikerjakan** ("sisanya gausah").
Lingkungan: di git-bash `node` = alias winpty, gagal di background ("stdin is not a tty"); pakai `node.exe`.

## Online jarak jauh + APK (2026-11-01)
Syarat user: semuanya gratis. Ngrok gratis, domain tetap `squeegee-fifth-obliged.ngrok-free.dev` (authtoken sudah ada di config ngrok MSIX). `Main-Online.bat` = server 8080 + ngrok. Server: `clientIp` (X-Forwarded-For hanya dari loopback); Panel Role menolak request dengan header forwarded. APK: `android/` + `bash android/build-apk.sh` → dist/TileGrow-v1.4.apk; keystore ~/.tilegrow/ (jangan hilang). JDK17: C:/Program Files/Microsoft/jdk-17.0.21.21-hotspot; SDK: %LOCALAPPDATA%/Android/Sdk (android-35, build-tools 35.0.0). Belum dites di HP sungguhan.

## Belum / TODO
- Tes di dua perangkat sungguhan / HP; dimainkan manusia.
- Migrasi save v1.2 → v1.3 belum dites dengan data nyata.

## Cara tes
`TG_TMP=<scratch> node tests/run-v13.mjs` dan `... security`. Tes browser 2 pemain: halaman dengan 2 iframe ke server (lihat scratch mp_helpers.js), karena tab harness sering reset ke about:blank.

## Rollback
Tag `snapshot-v1.2-pre-trade` (di GitHub) + ZIP ~/backups/TileGrow-snapshot-v1.2-pre-trade.zip.
