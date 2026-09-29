$ErrorActionPreference = 'Stop'
$mappe = $PSScriptRoot
$importer = Join-Path $mappe 'import_youtube_charts.py'
$wrapper = Join-Path $mappe 'Import-Sange.ps1'
$linkFil = Join-Path $mappe 'kun-full-mix.txt'

if (-not (Test-Path -LiteralPath $importer -PathType Leaf) -or -not (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
    throw 'Læg Lav-Manglende-Instrumenter.ps1, Import-Sange.ps1 og import_youtube_charts.py i samme mappe.'
}
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python launcheren py blev ikke fundet. Prøv: py --version'
}
if (-not $env:SUPABASE_URL) {
    $env:SUPABASE_URL = Read-Host 'Indsæt din Supabase projekt URL'
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    $hemmelig = Read-Host 'Indsæt din Supabase secret/service role key (vises ikke)' -AsSecureString
    $env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $hemmelig).Password
    Remove-Variable hemmelig
}

Write-Host 'Finder sange med kun Full mix i BeatForge...'
& py $importer --export-mix-only $linkFil
if ($LASTEXITCODE -ne 0) {
    throw 'Eksporten fejlede. Ingen sange blev behandlet.'
}
$links = @(Get-Content -LiteralPath $linkFil | Where-Object { $_.Trim() })
if ($links.Count -eq 0) {
    Write-Host 'Ingen sange med kun Full mix. Ingen Demucs behandling nødvendig.'
    return
}
Write-Host "Fandt $($links.Count) sange. Links ligger i $linkFil"
& $wrapper -Instrumenter stems -LinkFil $linkFil
