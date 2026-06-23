@echo off
REM ============================================
REM LifeSync - double-click launcher (Windows)
REM ============================================
REM First time on this PC? Run setup.bat once.
REM Then just double-click this file to start everything.
title LifeSync
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org then try again.
  pause
  exit /b 1
)
node scripts/launch.mjs
echo.
echo LifeSync has stopped. Press any key to close.
pause >nul
