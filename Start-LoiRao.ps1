#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$TargetPath = 'D:\freetime\LoiRao-FloodMap',
  [switch]$StartDev,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$project = [System.IO.Path]::GetFullPath($TargetPath)
Write-Host "[Loi Rao] Project: $project" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $project 'package.json'))) {
  throw "Khong tim thay package.json tai $project. Giai nen ZIP thanh D:\freetime\LoiRao-FloodMap"
}
foreach ($cmd in @('node', 'npm')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Chua cai $cmd. Hay cai Node.js LTS (kem npm) va mo PowerShell moi."
  }
}
Push-Location $project
try {
  $nodeVersion = (& node --version)
  Write-Host "Node: $nodeVersion"
  $major = [int]($nodeVersion -replace "^v([0-9]+).*", '$1')
  if ($major -lt 22) { throw "Can Node.js 22 tro len, dang dung $nodeVersion" }
  if (-not (Test-Path '.env.local')) {
    Copy-Item '.env.example' '.env.local'
    Write-Host 'Da tao .env.local. Khong ghi API key vao code.' -ForegroundColor Yellow
  }
  if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing npm dependencies...' -ForegroundColor Cyan
    & npm.cmd install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
  }
  if ($CheckOnly) {
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
    & npm.cmd run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
    & npm.cmd run test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
    Write-Host 'Cac buoc kiem tra da hoan tat.' -ForegroundColor Green
  }
  if ($StartDev) {
    Write-Host 'Mo http://localhost:3000 - Ctrl+C de dung.' -ForegroundColor Green
    & npm.cmd run dev
    if ($LASTEXITCODE -ne 0) { throw "next dev failed ($LASTEXITCODE)" }
  } elseif (-not $CheckOnly) {
    Write-Host 'Khoi tao xong. Chay lai voi -StartDev de mo web.' -ForegroundColor Green
  }
} finally { Pop-Location }
