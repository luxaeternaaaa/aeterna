@echo off
setlocal

cd /d "%~dp0\.."
set "ROOT=%CD%"
set "OUT_DIR=%ROOT%\installer\out"

if exist "%OUT_DIR%" rmdir /s /q "%OUT_DIR%"
mkdir "%OUT_DIR%" || goto :fail

echo [1/8] Writing build metadata...
python installer\write_build_metadata.py || goto :fail

echo [2/8] Refreshing local ML metadata...
python -m ml.train_latency || goto :fail

echo [3/9] Installing backend build dependencies...
python -m pip install -r backend\requirements.txt pyinstaller || goto :fail

echo [4/9] Installing frontend dependencies...
cd app
call npm ci || call npm install || goto :fail

echo [5/9] Building frontend assets...
call npm run build || goto :fail

echo [6/9] Building bundled backend service...
python ..\core\build_backend.py || goto :fail

echo [7/9] Building bundled Rust sidecar...
python ..\core\build_sidecar.py || goto :fail

echo [8/9] Building Windows NSIS installer...
call npx tauri build --bundles nsis || goto :fail

echo [9/9] Copying release artifacts...
cd /d "%ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$root='%ROOT%';" ^
  "$out='%OUT_DIR%';" ^
  "$installer = Get-ChildItem -Path (Join-Path $root 'app\src-tauri\target\release\bundle\nsis') -Filter '*setup.exe' | Select-Object -First 1;" ^
  "if (-not $installer) { throw 'NSIS installer not found.' };" ^
  "Copy-Item $installer.FullName (Join-Path $out 'Aeterna-setup.exe') -Force;" ^
  "$exeCandidates = @(" ^
    "(Join-Path $root 'app\src-tauri\target\release\Aeterna.exe')," ^
    "(Join-Path $root 'app\src-tauri\target\release\aeterna.exe')" ^
  ");" ^
  "$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1;" ^
  "if (-not $exe) { throw 'Release executable not found.' };" ^
  "Copy-Item $exe (Join-Path $out 'Aeterna.exe') -Force;"
if errorlevel 1 goto :fail

echo Build completed successfully.
echo Output directory: %OUT_DIR%
exit /b 0

:fail
echo Build failed.
exit /b 1
