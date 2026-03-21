# Patch script
$path = Join-Path $PSScriptRoot "strip-preview.html"
Get-Content $path -Raw | Out-Null
