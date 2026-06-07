#!/usr/bin/env pwsh
# ISAAC - setup dev Windows (PowerShell 7+).
# Bootstrap idempotent du monorepo + build/link du binaire `isaac`.
#
# Usage:
#   ./scripts/setup.ps1                # deps + build CLI + link global `isaac` (defaut)
#   ./scripts/setup.ps1 -Ext           # + build extension VS Code (protos + compile)
#   ./scripts/setup.ps1 -All           # CLI + extension
#   ./scripts/setup.ps1 -DepsOnly      # install deps uniquement
#   ./scripts/setup.ps1 -NoLink        # build CLI sans `npm link` global
#
# macOS / Linux : utiliser ./setup.sh (racine du repo).
[CmdletBinding()]
param(
  [switch]$Ext,
  [switch]$All,
  [switch]$DepsOnly,
  [switch]$NoLink
)
$ErrorActionPreference = 'Stop'

function Write-Info($m) { Write-Host "» $m" -ForegroundColor Blue }
function Write-Ok($m)   { Write-Host "OK $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "!! $m" -ForegroundColor Yellow }
function Die($m)        { Write-Host "x $m" -ForegroundColor Red; exit 1 }

$DoExt = $Ext -or $All
$DoCli = $true
$DoLink = -not $NoLink

# --- racine repo ---
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Info "Plateforme : Windows ($([System.Environment]::OSVersion.Version))"

# --- check node ---
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die "node introuvable. Installe Node 22 LTS (https://nodejs.org ou nvm-windows)." }
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 20) { Die "Node $(node -v) trop ancien - requis : 20-24 (.nvmrc = lts/*)." }
elseif ($nodeMajor -ge 25) { Write-Warn2 "Node $(node -v) non supporte (cli engines: <25). Utilise 20-24." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die "npm introuvable." }
Write-Ok "node $(node -v) / npm $(npm -v)"

# --- prerequis natifs Windows ---
Write-Warn2 "Natifs (better-sqlite3) : requiert les Visual Studio Build Tools (C++) + Python. En cas d'echec node-gyp, installe-les."

# --- 1. dependances (root+cli via workspaces, + webview-ui) ---
Write-Info "Installation des dependances (npm run install:all)..."
npm run install:all
if ($LASTEXITCODE -ne 0) { Die "install:all a echoue." }
Write-Ok "Dependances installees (root + cli + webview-ui)."

if ($DepsOnly) { Write-Ok "Termine (-DepsOnly)."; exit 0 }

# --- 2. protobufs (requis avant tout build) ---
Write-Info "Generation des protobufs (npm run protos)..."
npm run protos
if ($LASTEXITCODE -ne 0) { Die "protos a echoue." }
Write-Ok "Protos generes (src/generated/, src/shared/proto/)."

# --- 3. CLI ---
if ($DoCli) {
  Write-Info "Build du CLI (npm run cli:build)..."
  npm run cli:build
  if ($LASTEXITCODE -ne 0) { Die "cli:build a echoue." }
  Write-Ok "CLI builde (cli/dist/cli.mjs)."
  if ($DoLink) {
    Write-Info "Link global du binaire isaac (npm run cli:link)..."
    npm run cli:link
    if (Get-Command isaac -ErrorAction SilentlyContinue) { Write-Ok "isaac disponible : $((Get-Command isaac).Source)" }
    else { Write-Warn2 "isaac pas dans le PATH - ajoute le bin de 'npm prefix -g' au PATH utilisateur." }
  }
}

# --- 4. extension VS Code ---
if ($DoExt) {
  Write-Info "Build de l'extension VS Code (npm run compile)..."
  npm run compile
  if ($LASTEXITCODE -ne 0) { Die "compile a echoue." }
  Write-Ok "Extension compilee (dist/extension.js). Lance via F5 dans VS Code."
}

Write-Host ""
Write-Ok "Setup termine."
if ($DoCli -and $DoLink) { Write-Host "  -> essaie : isaac --help" }
if ($DoExt) { Write-Host "  -> extension : ouvre le repo dans VS Code puis F5" }
