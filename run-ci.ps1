$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\tyago\Downloads\clinica-react\clinica-react'
$falhou = $false

Write-Host '== typecheck'
node ./node_modules/typescript/bin/tsc -b
if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host 'TYPECHECK_FALHOU' }

Write-Host '== lint'
node ./node_modules/oxlint/bin/oxlint src
if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host 'LINT_FALHOU' }

Write-Host '== build'
node ./node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host 'BUILD_FALHOU' }

if ($falhou) { Write-Host 'CI_FALHOU'; exit 1 }
Write-Host 'CI_OK'
exit 0
