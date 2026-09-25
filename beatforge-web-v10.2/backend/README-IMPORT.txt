# Importér nye sange til BeatForge fra Windows

Gem `Import-Sange.ps1`, `sange.txt` og denne vejledning i din eksisterende
`C:\Users\valde\Downloads\BeatForgeImport` mappe. Behold også de tre Python
filer, du allerede har brugt: `import_youtube_charts.py`, `instant_chart.py`
og `stem_chart.py`.

## Hver gang du vil tilføje sange

1. Åbn `sange.txt` i Notesblok. Erstat eksempellinjerne med dine nye
   YouTube Music sanglinks, ét link pr. linje. Gem filen. Linjer, der
   starter med `#`, bliver ignoreret.
2. Åbn PowerShell og skriv:

   ```powershell
   cd "$HOME\Downloads\BeatForgeImport"
   .\Import-Sange.ps1
   ```

3. Hvis PowerShell beder om din Supabase URL, admin bruger UUID eller secret
   key, skal du indsætte dem dér. Secret key vises ikke på skærmen og gemmes
   ikke i filerne. Har du allerede sat variablerne i dette PowerShell vindue,
   bliver du ikke spurgt igen.
4. Vent på `Finished: ... processed, ... failed`. Genindlæs BeatForge siden,
   når scriptet er færdigt. Sangene gemmes direkte i BeatForges Supabase
   database, så du behøver hverken at uploade en fil på hjemmesiden eller
   at genudgive Vercel eller Railway.

Scriptet laver som standard **Full mix, Vocals, Drums, Bass og Melody** på
lokalt på din computer. Det kan tage flere minutter per sang. Findes et
instrument allerede, springes det over. Fejler en sang, kan du køre samme
kommando igen: eksisterende instrumenter bevares, og de manglende forsøges
igen.

## Andre kommandoer

Se sangtitlerne uden at importere:

```powershell
.\Import-Sange.ps1 -DryRun
```

Importer kun Full mix, uden Demucs:

```powershell
.\Import-Sange.ps1 -Instrumenter mix
```

Tilføj kun de fire adskilte instrumenter til sange, der allerede findes:

```powershell
.\Import-Sange.ps1 -Instrumenter stems
```

Hvis din PowerShell blokerer `.ps1` filer, kan du køre Python kommandoen
direkte fra samme mappe uden at ændre computerens sikkerhedsindstillinger:

```powershell
$env:SUPABASE_URL = Read-Host 'Supabase projekt URL'
$env:BEATFORGE_ADMIN_USER_ID = Read-Host 'Admin bruger UUID'
$secret = Read-Host 'Supabase secret key' -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\youtube-cookies.txt))) | ForEach-Object { $env:YOUTUBE_COOKIES_BASE64 = $_ }
py .\import_youtube_charts.py .\sange.txt --instruments all
```

Spring linjen med `youtube-cookies.txt` over, hvis du ikke har filen eller
allerede har sat `YOUTUBE_COOKIES_BASE64` i dette PowerShell vindue. Har du
allerede sat Supabase variablerne i vinduet, kan du også springe de første
fire linjer over og kun køre `py ...` linjen. Skriv `py -m pip install
yt-dlp numpy scipy soundfile demucs`, hvis Python melder at en pakke mangler.

Hvis YouTube beder dig logge ind, kan du lægge en frisk Netscape
`youtube-cookies.txt` i samme mappe. Scriptet læser den automatisk,
men uploader ikke selve filen til BeatForge. Del aldrig den fil eller
din Supabase secret key. Brug kun optagelser, som du har ret til at hente
og analysere.
