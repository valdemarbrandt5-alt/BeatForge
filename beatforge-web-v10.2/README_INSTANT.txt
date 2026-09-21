BeatForge v0.14 - Instant Generator

- Browser-only song analysis. No Demucs/Python/Railway required for chart generation.
- Uses adaptive transient/onset detection, rhythm estimation, gentle beat snapping, hold detection, and independent lane placement.
- Keeps 3/4/5 lanes, Easy/Medium/Hard/Expert, hold gameplay, scoring, x5 Gold Mode, progress bar, results and keybinds.
- Instrument selector removed for now because instant analysis does not perform stem separation.
- The backend folder is kept only as an archive; the frontend does not call it.

Deploy: push this project to GitHub/Vercel as before. NEXT_PUBLIC_BEATFORGE_API_URL is no longer required.
