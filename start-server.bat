@echo off
title TileGrow Server
cd /d "%~dp0"
set "NGROK_URL=https://squeegee-fifth-obliged.ngrok-free.dev"

REM Cek dulu: file server ada (ZIP sudah diekstrak) dan Node.js terpasang. Kalau tidak, ngrok tidak dinyalakan.
if not exist "server\server.js" (
  echo [error] File server tidak ditemukan di folder ini:
  echo         %CD%
  echo         Sepertinya start-server.bat dibuka langsung dari dalam ZIP.
  echo         Klik kanan ZIP - Extract All - lalu jalankan start-server.bat dari folder hasil ekstrak.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js belum terpasang. Install dari https://nodejs.org ^(gratis^), lalu jalankan lagi.
  pause
  exit /b 1
)

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
