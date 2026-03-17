@echo off
setlocal

echo Aeterna development launcher
echo This script is for local development only. Installed users should launch Aeterna from the Start Menu or Desktop shortcut.

set "ROOT=%~dp0"
set "CARGO_BIN=%USERPROFILE%\.cargo\bin"
set "VCVARS=C:\Progra~2\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%VCVARS%" (
  echo Missing Visual Studio Build Tools environment script:
  echo %VCVARS%
  exit /b 1
)

set "PATH=%CARGO_BIN%;%PATH%"

cd /d "%ROOT%app"
call "%VCVARS%"
call npm.cmd run desktop:dev
