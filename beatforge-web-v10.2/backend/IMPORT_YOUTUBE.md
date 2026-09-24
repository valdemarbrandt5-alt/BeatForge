# Batch import for BeatForge admins

This local admin command generates BeatForge charts and stores notes and a
YouTube link in Supabase. Audio and separated tracks are deleted after each song.
Use recordings you are permitted to download and analyze.

## Set up

1. Run [`../supabase/chart_instruments.sql`](../supabase/chart_instruments.sql)
   in the Supabase SQL Editor **before** deploying the new frontend or running
   this importer. Existing charts automatically become `mix` charts.
2. Install Python dependencies (`yt-dlp`, `numpy`, `scipy`, `soundfile`) and
   make `ffmpeg` available on PATH. For instrument charts also install Demucs:
   `py -m pip install demucs`. The first run downloads the `htdemucs` model to
   the local computer; separation can take several minutes per song.
3. Keep `import_youtube_charts.py`, `instant_chart.py` and `stem_chart.py`
   together in one directory. Create `links.txt` there with one individual
   YouTube URL per line. Duplicate URLs and blank or commented lines are ignored.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_` key or a
   legacy service role JWT), and `BEATFORGE_ADMIN_USER_ID` in your local
   environment. Get the admin UUID from Supabase Authentication. Keep the key
   private and never put it into a browser or committed file.
5. In that directory, run the commands below. Reuse your local
   `YOUTUBE_COOKIES_BASE64` setting if YouTube requests authentication.

```powershell
py .\import_youtube_charts.py .\links.txt --dry-run
py .\import_youtube_charts.py .\links.txt --instruments all
```

`--instruments all` generates any missing full mix, vocals, drums, bass and
melody charts. `--instruments stems` adds only the four stems, including to a
song that already has a mix chart. Omitting this option uses the fast full mix
generator and does not need Demucs. Each song/instrument combination already
present is skipped independently. Rerun the same list to retry failures; the
script does not replace existing charts or scores. BeatForge's browser,
Community, profile, invitations, Ranked and Battle Royale use the same chart
IDs. The hosted admin importer still creates full mix charts; Demucs runs on
the local machine.

To apply an improved stem analyzer to songs that were already imported, run:

```powershell
py .\import_youtube_charts.py .\links.txt --instruments stems --refresh-stems
```

This downloads and separates each listed song again. It updates existing
instrument charts belonging to your admin account, adds missing stems and
leaves full mix charts and other people's charts untouched. Chart IDs, likes
and scores remain in place. Existing scores were earned against the previous
note pattern, so compare new scores only with plays made after the refresh.
The change becomes visible on BeatForge once each updated song is saved; reload
the page before playing it again. The command needs the updated local
`stem_chart.py`; a Railway redeploy is not needed for local imports.
