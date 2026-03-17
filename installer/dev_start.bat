@echo off
setlocal

cd /d "%~dp0\..\app"
call npm run desktop:dev
