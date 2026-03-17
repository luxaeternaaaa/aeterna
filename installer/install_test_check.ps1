param(
  [string]$InstallRoot = "",
  [string]$ShortcutName = "Aeterna"
)

$ErrorActionPreference = "Stop"

function Resolve-ShortcutTarget {
  param([string]$Path)

  $shell = New-Object -ComObject WScript.Shell
  return $shell.CreateShortcut($Path).TargetPath
}

$roots = @()
if ($InstallRoot) {
  $roots += $InstallRoot
}
$roots += @(
  (Join-Path $env:LOCALAPPDATA "Aeterna"),
  (Join-Path $env:LOCALAPPDATA "Programs\Aeterna")
)
$exeCandidates = foreach ($root in $roots | Select-Object -Unique) {
  Join-Path $root "Aeterna.exe"
  Join-Path $root "aeterna.exe"
}
$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exePath) {
  throw "Installed executable not found under expected roots: $($roots -join ', ')"
}

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "$ShortcutName.lnk"
$startMenuRoot = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startMenuShortcut = Get-ChildItem -Path $startMenuRoot -Recurse -Filter "$ShortcutName.lnk" -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path $desktopShortcut)) {
  throw "Desktop shortcut not found: $desktopShortcut"
}

if (-not $startMenuShortcut) {
  throw "Start Menu shortcut not found for $ShortcutName"
}

$desktopTarget = Resolve-ShortcutTarget -Path $desktopShortcut
$startTarget = Resolve-ShortcutTarget -Path $startMenuShortcut

if ($desktopTarget -notlike "*Aeterna*.exe") {
  throw "Desktop shortcut does not point to an Aeterna executable: $desktopTarget"
}

if ($startTarget -notlike "*Aeterna*.exe") {
  throw "Start Menu shortcut does not point to an Aeterna executable: $startTarget"
}

[pscustomobject]@{
  ExePath = $exePath
  DesktopShortcut = $desktopShortcut
  StartMenuShortcut = $startMenuShortcut
  DesktopTarget = $desktopTarget
  StartMenuTarget = $startTarget
  SearchReady = $true
}
