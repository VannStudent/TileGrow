@echo off
title TileGrow Online (server + ngrok)
cd /d "%~dp0"
REM Main jarak jauh (beda WiFi), gratis: server TileGrow + tunnel ngrok paket gratis.
REM Alamat untuk teman / APK: https://squeegee-fifth-obliged.ngrok-free.dev
where ngrok >nul 2>nul || (echo ngrok belum terpasang. Install dari Microsoft Store: "ngrok", lalu jalankan: ngrok config add-authtoken TOKEN_KAMU & pause & exit /b 1)
start "TileGrow Server" cmd /k "node server\server.js"
timeout /t 2 /nobreak >nul
echo.
echo  Server jalan di jendela "TileGrow Server".
echo  Teman membuka APK TileGrow (atau browser): https://squeegee-fifth-obliged.ngrok-free.dev
echo  Biarkan dua jendela ini terbuka selama main. Tutup untuk berhenti.
echo.
ngrok http 8080 --url=https://squeegee-fifth-obliged.ngrok-free.dev
pause
