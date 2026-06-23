@echo off
REM ============================================
REM LifeSync - one-time setup (Windows)
REM ============================================
REM Double-click this once on a fresh PC, then use start.bat.
title LifeSync setup
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org then try again.
  pause
  exit /b 1
)
node scripts/setup.mjs
echo.
echo Setup finished. You can now double-click start.bat to run LifeSync.
pause >nul
