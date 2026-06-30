param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$distRoot = Join-Path $root "dist"
$packageRoot = Join-Path $distRoot "nexxsensi-adb-bridge"
$bridgeSource = Join-Path $root "bridge"
$bridgeTarget = Join-Path $packageRoot "bridge"

if (Test-Path $packageRoot) {
    Remove-Item $packageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $bridgeTarget | Out-Null

$excludedNames = @("data", "tools")
Get-ChildItem $bridgeSource -Force |
    Where-Object { $excludedNames -notcontains $_.Name } |
    ForEach-Object {
        Copy-Item $_.FullName -Destination $bridgeTarget -Recurse -Force
    }

@"
{
  "name": "nexxsensi-adb-bridge",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "bridge": "node bridge/server.mjs"
  }
}
"@ | Set-Content -Encoding ASCII (Join-Path $packageRoot "package.json")

@"
{
  "name": "Nexxsensi ADB Bridge",
  "version": "1.0.0",
  "configuration": "$Configuration",
  "entrypoint": "bridge/server.mjs",
  "requiresNode": ">=20",
  "createdAt": "$(Get-Date -Format o)"
}
"@ | Set-Content -Encoding ASCII (Join-Path $packageRoot "bridge-manifest.json")

@"
@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 24 LTS ou superior.
  pause
  exit /b 1
)
node bridge/server.mjs
"@ | Set-Content -Encoding ASCII (Join-Path $packageRoot "start-bridge.cmd")

@"
# Nexxsensi ADB Bridge Portable

Este pacote roda o companion desktop usado pelo Nexxsensi Mobile Optimizer.

## Iniciar

1. Execute `start-bridge.cmd`.
2. Abra `http://localhost:4545` no PC.
3. Digite o codigo de pareamento no app mobile.
4. Se o ADB nao existir, use o botao de instalar Platform Tools no app.

## Dados locais

O bridge cria `bridge/data/` em tempo de execucao para token, snapshots e reversoes.
O Android Platform Tools, quando instalado pelo app, fica em `bridge/tools/`.

Essas pastas nao fazem parte do pacote inicial.
"@ | Set-Content -Encoding ASCII (Join-Path $packageRoot "README-BRIDGE.md")

Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath (Join-Path $distRoot "nexxsensi-adb-bridge.zip") -Force

Write-Host "Bridge portable package created:"
Write-Host $packageRoot
Write-Host (Join-Path $distRoot "nexxsensi-adb-bridge.zip")
