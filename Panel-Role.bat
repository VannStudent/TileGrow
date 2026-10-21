@echo off
title TileGrow Panel Role
set P=%PORT%
if "%P%"=="" set P=8080
echo Membuka Panel Role di http://localhost:%P%/admin
echo Kalau halaman tidak terbuka: pastikan start-server.bat sedang jalan dan jendelanya TIDAK menampilkan GAGAL.
start "" "http://localhost:%P%/admin"
timeout /t 6 >nul
