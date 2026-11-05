@echo off
title Cartoon Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org then run this again.
  echo You can still open index.html directly, without automatic lip sync.
  pause
  exit /b 1
)
start "" http://localhost:5173
node server.js
pause
