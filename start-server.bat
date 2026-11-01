@echo off
title TileGrow Server
cd /d "%~dp0"
set "NGROK_URL=https://squeegee-fifth-obliged.ngrok-free.dev"

REM Sekaligus menyalakan ngrok (gratis) supaya teman bisa main dari WiFi/kuota berbeda.
where ngrok >nul 2>nul
if errorlevel 1 (
  echo [ngrok] belum terpasang - server tetap jalan, tapi hanya untuk satu WiFi.
  goto server
)
tasklist /fi "imagename eq ngrok.exe" 2>nul | find /i "ngrok.exe" >nul
if not errorlevel 1 (
  echo [ngrok] sudah jalan - tidak dibuka lagi.
  goto server
)
start "TileGrow ngrok" /min ngrok http 8080 --url=%NGROK_URL%
echo [ngrok] dinyalakan di jendela kecil "TileGrow ngrok" ^(jangan ditutup^).

:server
echo [online] Alamat untuk teman / APK: %NGROK_URL%
echo.
node server\server.js
echo.
echo Server berhenti. Jendela "TileGrow ngrok" boleh ditutup juga.
pause
