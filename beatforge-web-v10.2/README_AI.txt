BeatForge v0.12.1

FIXES
- Instrument buttons now re-run backend analysis for the selected Demucs stem.
- Status line shows the exact stem used: vocals.wav, drums.wav, bass.wav, or other.wav.
- Note movement is rendered from interpolated audio time every animation frame (60 FPS target).
- Note state no longer creates a new notes array every frame when nothing changed.
- python server.py now starts Uvicorn directly.

START BACKEND
1. Open Anaconda Prompt
2. conda activate beatforge
3. cd <project>\\backend
4. python -m pip install -r requirements.txt
5. python server.py

START FRONTEND
1. Open another terminal in the project root
2. npm.cmd install
3. npm.cmd run dev
4. Open http://localhost:3000

IMPORTANT
After a song is uploaded, clicking Vocals / Drums / Bass / Melody will analyze that selected stem again. Wait for ANALYZING to finish before pressing Play.
