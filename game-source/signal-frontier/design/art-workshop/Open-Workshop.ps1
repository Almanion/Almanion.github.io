$ErrorActionPreference = 'Stop'
try {
    $artRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
    $artNode = (Get-Command node -ErrorAction Stop).Source
    $artService = Join-Path $artRoot 'tools/signal-art-workshop.js'
    $artResult = & $artNode $artService --start 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($artResult -join "`n") }
    $artUrl = ($artResult | Where-Object { "$_" -match '^http://127\.0\.0\.1:\d+$' } | Select-Object -Last 1).ToString()
    if (-not $artUrl) { throw 'Не удалось получить адрес мастерской.' }
    Start-Process -FilePath $artUrl
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Мастерская Signal Frontier') | Out-Null
}
