# Enable the admin import button

The button is shown to accounts whose `profiles.is_admin` is true. The five
submitted URLs are prefilled. The importer uses the same instant chart analysis
approach as the game's audio upload and does not separate vocals.

1. Deploy `backend/` as a **separate Railway service** with its Dockerfile.
   Keep the web frontend deployed on Vercel.
2. Set these variables on the Railway backend:
   `SUPABASE_URL` (the Supabase project URL), `SUPABASE_SERVICE_ROLE_KEY`
   (paste a new `sb_secret_` key here; server only), and `BEATFORGE_FRONTEND_ORIGINS` (the exact frontend origin,
   for example `https://your-domain.example`, with no trailing slash).
3. Set `NEXT_PUBLIC_BEATFORGE_BACKEND_URL` in Vercel to the Railway service's
   public HTTPS origin, without a trailing slash, and redeploy the frontend.
4. Sign in as an admin, click **IMPORT SONGS**, review the five prefilled links,
   and click **IMPORT SONGS** in the dialog. Leave the page open to watch
   progress. The server continues processing if the dialog is closed, but
jobs are kept only in memory and can be lost if the service restarts.

## If YouTube requires sign in

The backend optionally reads `YOUTUBE_COOKIES_BASE64` from Railway for both
metadata and audio download. Export a Netscape `cookies.txt` from a signed in
browser using yt-dlp on your own computer. In PowerShell:

```powershell
python -m yt_dlp --cookies-from-browser chrome --cookies youtube-cookies.txt --skip-download "https://www.youtube.com/watch?v=TAZkHYyio-M"
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\youtube-cookies.txt))) | Set-Clipboard
```

Add a private `YOUTUBE_COOKIES_BASE64` variable to the Railway backend service,
paste the clipboard contents as its value, and deploy the pending changes.
Never add the cookies file or encoded value to GitHub, Vercel, or the frontend.
Delete the local file after copying it. If YouTube expires or rejects the
session, export and replace the value. Sign in may still be blocked on a
server even with cookies; only import recordings you may download and analyze.

Never put the service role key in Vercel's `NEXT_PUBLIC_` variables or send it
in chat. Both the backend route and the admin button check the account's
`profiles.is_admin` status. If the server is not configured, the dialog shows
an error instead of starting an import. The finished charts appear in the
community song list after it is refreshed.
