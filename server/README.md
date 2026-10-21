# TileGrow LAN server (v1.4)

Jalankan di PC host (butuh Node.js 18+, tanpa npm install):

    node server/server.js        (atau klik dua kali start-server.bat)

Jendela server menampilkan alamat, misalnya `http://192.168.1.10:8080`.
Perangkat lain di WiFi yang sama cukup buka alamat itu di browser, lalu pilih **Main Online**.

- Port lain: `set PORT=9000` sebelum menjalankan.
- Data: `server/data/`
  - `accounts.json`: hash scrypt + salt (bukan password), role, ban/mute, teman
  - `players/*.json`: tas, gems, XP, quest (dipegang server)
  - `worlds/*.json`
  - `staff-log.jsonl`, `trade-log.jsonl`, `reports.json`, `ipbans.json`
- Windows Firewall akan bertanya saat pertama kali: izinkan untuk **Private network** saja.

## Yang dipegang server (v1.3)
- Tas, gems, XP, quest, dan pembelian dihitung di server. Browser hanya mengirim maksud (pukul, pasang, tanam, beli, drop).
- Drop item dibagi ke semua pemain di world. Yang mengambil duluan (menurut server) yang dapat.
- Lock dihormati. Pintu Utama dan Dasar tidak bisa dihapus. Block dan data yang tidak dikenal ditolak.
- Gerakan dicek: teleport jauh dan masuk ke block padat dikembalikan.
- Login salah 5x = diblokir 60 detik.
- v1.4: hasil Dadu/Roulette diacak server. Gabung/pecah Crystal Lock dihitung server.
  Vending Machine (stok, harga, kas gems, pembelian) seluruhnya di server, dan meta mesin tidak bisa diedit langsung dari browser.

## Role
Role diberikan oleh pemilik server, dengan salah satu dari dua cara:

1. **Panel Role** (lebih mudah): buka **http://localhost:8080/admin** di browser PC server. Alamatnya juga tampil di jendela server.
   - Isinya daftar semua akun beserta status online dan pilihan Player, Moderator, atau Developer.
   - Panel hanya bisa dibuka dari PC server sendiri. Dari HP atau laptop lain di WiFi, alamat itu menjawab "Not found".
   - Halaman panel membawa token acak yang berganti setiap server dijalankan, supaya website lain tidak bisa diam-diam mengubah role.
   - Perubahan dicatat di `staff-log.jsonl` sebagai ADMIN-PANEL.
2. **Jendela server**:

       role NAMA dev      (Developer: nama @ oranye)
       role NAMA mod      (Moderator: nama @ ungu)
       role NAMA player   (cabut role)
       help               (daftar perintah server)

Developer juga bisa mengangkat dan mencabut Moderator dari dalam game dengan `/setrole NAMA mod`.
Staff hanya bisa menindak pemain dengan role yang lebih rendah. Semua aksi staff dicatat di `staff-log.jsonl`.

| Perintah (ketik `/staffhelp` di game) | Moderator | Developer |
|---|---|---|
| `/mute`, `/unmute`, `/freeze`, `/unfreeze`, `/kick` | ya | ya |
| `/ban NAMA 1d [alasan]` | maks 7 hari | termasuk permanen |
| `/unban` | ban miliknya sendiri | semua |
| `/noclip`, `/zoom` (lihat satu world), `/tp`, `/summon`, `/reports` | ya | ya |
| `/ipban`, `/unipban`, `/invis`, `/setrole` | - | ya |
| `/give item NAMA ITEM [JUMLAH]`, `/give gems NAMA JUMLAH`, `/items KATA` | - | ya |

Untuk player biasa, perintah staff dijawab "Perintah tidak dikenal".
IP ban tidak bisa mengenai PC server sendiri. Di WiFi rumah IP bisa berubah (DHCP), jadi gunakan IP ban seperlunya.

## Sosial
- Pegang **Kunci Inggris**, lalu klik ikon kunci inggris di samping nama pemain lain. Menu yang muncul: Trade, Tambah Teman, Report.
- **Trade**:
  1. Kedua pemain menekan Setuju. Kalau ada yang mengubah tawaran, status Setuju kedua pihak batal.
  2. Muncul ringkasan, lalu kedua pemain menekan Konfirmasi (aktif setelah 3 detik).
  3. Server menukar barang sekaligus, dan setiap trade dicatat di `trade-log.jsonl`.
- **Teman**: Menu, lalu Teman. Daftarnya menunjukkan status online dan world tempat teman berada, dengan tombol Susul.

## Tes
    node tests/run-v13.mjs            ekonomi, trade, teman, report, role (49 kasus)
    node tests/run-v13.mjs security   keamanan (33 kasus)
Kedua perintah menjalankan server sendiri dengan data kosong di port acak.
