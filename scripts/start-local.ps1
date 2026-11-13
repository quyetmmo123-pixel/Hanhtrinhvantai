param()
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeExe = Join-Path $projectRoot '.tools/node-v24.21.0-win-x64/node.exe'
$pgBin = 'T:\.tools\postgres\pgsql\bin'
$mailpitExe = Join-Path $projectRoot '.tools/mailpit/mailpit.exe'
$dataDir = 'T:\.data\postgres'

if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Portable Node.js not found in .tools.' }
if (-not (Test-Path -LiteralPath 'T:\')) {
  subst T: $projectRoot | Out-Null
}
if (-not (Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) { throw 'PostgreSQL not found at the T: workspace alias.' }
if (-not (Test-Path -LiteralPath $dataDir)) { throw 'PostgreSQL data directory is missing. Initialize it first.' }

$env:PATH = (Split-Path $nodeExe) + ';' + $pgBin + ';' + $env:PATH
& (Join-Path $pgBin 'pg_isready.exe') -h localhost -p 5432 *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $dataDir -l 'T:\.data\postgres.log' -o '-p 5432' start
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL could not start.' }
}

function Start-ManagedProcess {
  param([string]$PidFile, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory, [string]$Stdout, [string]$Stderr)
  if (Test-Path -LiteralPath $PidFile) {
    $oldPid = [int](Get-Content -LiteralPath $PidFile -Raw)
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { return }
  }
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
  Set-Content -LiteralPath $PidFile -Value $process.Id
}

$toolsDir = Join-Path $projectRoot '.tools'
Start-ManagedProcess -PidFile (Join-Path $toolsDir 'mailpit.pid') -FilePath $mailpitExe -Arguments @('--listen','127.0.0.1:8025','--smtp','127.0.0.1:1025','--database','T:\.data\mailpit.db','--disable-version-check') -WorkingDirectory $projectRoot -Stdout (Join-Path $toolsDir 'mailpit.stdout.log') -Stderr (Join-Path $toolsDir 'mailpit.stderr.log')
Start-ManagedProcess -PidFile (Join-Path $toolsDir 'api.pid') -FilePath $nodeExe -Arguments @('dist/main.js') -WorkingDirectory (Join-Path $projectRoot 'apps/api') -Stdout (Join-Path $toolsDir 'api.stdout.log') -Stderr (Join-Path $toolsDir 'api.stderr.log')
Start-ManagedProcess -PidFile (Join-Path $toolsDir 'web.pid') -FilePath $nodeExe -Arguments @('..\..\node_modules\next\dist\bin\next','start','-p','3000') -WorkingDirectory (Join-Path $projectRoot 'apps/web') -Stdout (Join-Path $toolsDir 'web.stdout.log') -Stderr (Join-Path $toolsDir 'web.stderr.log')

Write-Output 'TMS: http://localhost:3000/login'
Write-Output 'API: http://localhost:4000/api/v1'
Write-Output 'Password reset inbox: http://localhost:8025'
