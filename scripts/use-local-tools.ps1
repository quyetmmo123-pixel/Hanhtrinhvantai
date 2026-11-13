$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeBin = Join-Path $projectRoot '.tools/node-v24.21.0-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $nodeBin 'node.exe'))) { throw 'Node.js portable is missing.' }
if (-not (Test-Path -LiteralPath 'T:\')) { subst T: $projectRoot | Out-Null }
$pgBin = 'T:\.tools\postgres\pgsql\bin'
if (-not (Test-Path -LiteralPath (Join-Path $pgBin 'psql.exe'))) { throw 'PostgreSQL portable is missing.' }
$env:PATH = $nodeBin + ';' + $pgBin + ';' + $env:PATH
$env:PRISMA_SCHEMA_ENGINE_BINARY = 'T:\node_modules\@prisma\engines\schema-engine-windows.exe'
Write-Output 'Node.js, npm and PostgreSQL commands are available in this PowerShell session.'
