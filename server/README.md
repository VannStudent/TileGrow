# TileGrow LAN server

Jalankan di PC host (butuh Node.js 18+, tanpa npm install):

    node server/server.js        (atau klik dua kali start-server.bat)

Jendela server menampilkan alamat, misalnya `http://192.168.1.10:8080`.
Perangkat lain di WiFi yang sama cukup buka alamat itu di browser, lalu pilih **Main Online**.

- Port lain: `set PORT=9000` sebelum menjalankan.
- Data: `server/data/` (accounts.json berisi hash scrypt + salt, bukan password; players/*.json; worlds/*.json).
- Windows Firewall akan bertanya saat pertama kali: izinkan untuk **Private network** saja.
- v1.0.1: server mengecek perubahan block: World/Small/Big/Huge Lock dihormati, Pintu Utama & Dasar tidak bisa dihapus,
  block/data tidak dikenal ditolak. Login salah 5x = diblokir 60 detik. Tas & gems masih dipercaya dari browser (anti-cheat di v1.1).
- Tes: `node tests/server-security.test.mjs` (server harus jalan di port 8095 dengan data kosong).
