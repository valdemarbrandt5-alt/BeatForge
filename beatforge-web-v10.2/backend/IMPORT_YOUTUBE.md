# Batch import for BeatForge admins

This is a local admin command, not a public upload endpoint. It downloads each
recording temporarily, generates a chart with the same instant analysis approach
used by the game, saves only the notes and YouTube link to Supabase, and removes the
temporary audio after each song. Use recordings you are permitted to
download and analyze. YouTube's developer policies do not permit downloading
YouTube audiovisual content through the API without prior approval.

1. Install Python dependencies with `pip install -r backend/requirements.txt`
   and install `ffmpeg` so it is available on your PATH.
2. Create `links.txt` with one individual YouTube video URL per line. Duplicate
   links and blank or commented lines are ignored.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the new `sb_secret_` key
   or a legacy service role JWT), and
   `BEATFORGE_ADMIN_USER_ID` in your local environment. Get the admin user ID
   from Supabase Authentication. Keep the service role key private and never
   put it into the browser or a committed file.
4. From `backend/`, run
   `python import_youtube_charts.py links.txt --dry-run` to preview metadata,
   followed by `python import_youtube_charts.py links.txt` to import.

Existing video IDs are skipped. Each failure is reported without stopping
the other imports. You can rerun the same list after fixing a failed entry.
Generated artist and song titles come from video metadata; review them in the
BeatForge admin editor afterwards. The import does not require Demucs or a
Hugging Face token.
