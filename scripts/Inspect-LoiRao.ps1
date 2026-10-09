# Script kiểm tra cơ bản; KHÔNG tự sửa code hay thay đổi dữ liệu.
[CmdletBinding()]
param([string]$TargetPath = 'D:\freetime\LoiRao-FloodMap')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $TargetPath 'package.json'))) { throw "Khong tim thay $TargetPath" }
Push-Location $TargetPath
try {
  foreach ($task in @('typecheck', 'lint', 'test', 'build')) {
    Write-Host "Checking $task" -ForegroundColor Cyan
    & npm.cmd run $task
    if ($LASTEXITCODE -ne 0) { throw "Failed at $task (exit=$LASTEXITCODE)" }
  }
  Write-Host 'All checks passed' -ForegroundColor Green
} finally { Pop-Location }
