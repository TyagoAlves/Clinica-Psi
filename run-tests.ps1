$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\tyago\Downloads\clinica-react\clinica-react'
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\tyago\AppData\Local\ms-playwright'
Write-Host ('== ' + (Get-Location).Path)
node ./node_modules/@playwright/test/cli.js test @args --reporter=line
exit $LASTEXITCODE
