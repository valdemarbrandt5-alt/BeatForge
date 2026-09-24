# Enable the admin import button

The button is shown to accounts whose `profiles.is_admin` is true. The five
submitted URLs are prefilled. The importer runs on the Python backend because
separating vocals is too heavy for the web frontend.

1. Deploy `backend/` as a **separate Railway service** with its Dockerfile.
   Keep the web frontend deployed on Vercel. The importer can take several
   minutes per song and needs enough memory for Demucs.
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

Never put the service role key in Vercel's `NEXT_PUBLIC_` variables or send it
in chat. Both the backend route and the admin button check the account's
`profiles.is_admin` status. If the server is not configured, the dialog shows
an error instead of starting an import. The finished charts appear in the
community song list after it is refreshed.
