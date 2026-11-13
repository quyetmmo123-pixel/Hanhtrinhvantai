param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

& (Join-Path $PSScriptRoot 'start-local.ps1')

Start-Sleep -Seconds 2

$apiPidFile = Join-Path $projectRoot '.tools\api.pid'
$webPidFile = Join-Path $projectRoot '.tools\web.pid'

if ((Test-Path -LiteralPath $apiPidFile) -and (Test-Path -LiteralPath $webPidFile)) {
  $apiPid = [int](Get-Content -LiteralPath $apiPidFile -Raw).Trim()
  $webPid = [int](Get-Content -LiteralPath $webPidFile -Raw).Trim()
  Wait-Process -Id @($apiPid, $webPid)
} else {
  while ($true) { Start-Sleep -Seconds 60 }
}

