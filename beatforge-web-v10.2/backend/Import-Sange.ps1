param(
    [ValidateSet('all', 'mix', 'stems')]
    [string]$Instrumenter = 'all',
    [string]$LinkFil = 'sange.txt',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$mappe = $PSScriptRoot
$importer = Join-Path $mappe 'import_youtube_charts.py'
$linkSti = if ([IO.Path]::IsPathRooted($LinkFil)) { $LinkFil } else { Join-Path $mappe $LinkFil }

if (-not (Test-Path -LiteralPath $importer -PathType Leaf)) {
    throw 'import_youtube_charts.py mangler. Læg den i samme mappe som Import-Sange.ps1.'
}
if (-not (Test-Path -LiteralPath $linkSti -PathType Leaf)) {
    throw "Linkfilen findes ikke: $linkSti"
}
$links = @(Get-Content -LiteralPath $linkSti | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') })
if ($links.Count -eq 0) {
    throw "Indsæt mindst ét YouTube sanglink i $linkSti, ét link pr. linje."
}

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python launcheren py blev ikke fundet. Åbn en ny PowerShell og prøv: py --version'
}

if (-not $DryRun) {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        throw 'ffmpeg blev ikke fundet. Sørg for at ffmpeg virker i denne PowerShell: ffmpeg -version'
    }
    if (-not $env:SUPABASE_URL) {
        $env:SUPABASE_URL = Read-Host 'Indsæt din Supabase projekt URL'
    }
    if (-not $env:BEATFORGE_ADMIN_USER_ID) {
        $env:BEATFORGE_ADMIN_USER_ID = Read-Host 'Indsæt din admin bruger UUID fra Supabase'
    }
    if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
        $hemmelig = Read-Host 'Indsæt din Supabase secret/service role key (vises ikke)' -AsSecureString
        $env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $hemmelig).Password
        Remove-Variable hemmelig
    }
}
if (-not $env:YOUTUBE_COOKIES_BASE64) {
    $cookieSti = Join-Path $mappe 'youtube-cookies.txt'
    if (Test-Path -LiteralPath $cookieSti -PathType Leaf) {
        $env:YOUTUBE_COOKIES_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($cookieSti))
        Write-Host 'Bruger youtube-cookies.txt fra samme mappe.'
    }
}

$valg = @($importer, $linkSti)
if ($DryRun) {
    $valg += '--dry-run'
} else {
    $valg += @('--instruments', $Instrumenter)
}

Write-Host "Starter import af $($links.Count) links med instrumenter: $Instrumenter"
& py @valg
if ($LASTEXITCODE -ne 0) {
    throw "Importen sluttede med fejl (kode $LASTEXITCODE). Se beskederne ovenfor. Kør den igen for at prøve de fejlede sange."
}
Write-Host 'Færdig. Opdater BeatForge i browseren for at se sangene.'
