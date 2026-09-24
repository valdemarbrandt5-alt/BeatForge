"""Local admin import: python import_youtube_charts.py links.txt [--dry-run].

Requires yt-dlp, ffmpeg, demucs and the packages in requirements.txt.
Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and BEATFORGE_ADMIN_USER_ID locally.
Only use for recordings that you have permission to download and analyze.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_video_id(value: str) -> str:
    parsed = urllib.parse.urlparse(value.strip())
    host = (parsed.hostname or "").lower()
    if host in ("youtu.be", "www.youtu.be"):
        video_id = parsed.path.strip("/")
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        if parsed.path == "/watch":
            video_id = urllib.parse.parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/embed/")):
            video_id = parsed.path.split("/")[2]
        else:
            video_id = ""
    else:
        video_id = ""
    if not VIDEO_ID.fullmatch(video_id):
        raise ValueError("Expected an individual YouTube video link")
    return video_id


def read_links(path: Path) -> list[str]:
    ids = []
    seen = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            video_id = parse_video_id(line)
        except ValueError as exc:
            raise ValueError(f"Line {line_number}: {exc}") from exc
        if video_id not in seen:
            seen.add(video_id)
            ids.append(video_id)
    return ids


def request_json(base: str, key: str, route: str, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"apikey": key, "Content-Type": "application/json", "Prefer": "return=minimal"}
    # New sb_secret keys are API keys, not JWTs. Sending them as a Bearer token
    # makes Supabase reject the request with Invalid JWT. Legacy service_role
    # keys are JWTs and still need the Authorization header.
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(
        base.rstrip("/") + "/rest/v1/" + route,
        data=data,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase {exc.code}: {message}") from exc


def youtube_metadata(url: str) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "--no-playlist", "--skip-download",
         "--dump-single-json", url], capture_output=True, text=True, timeout=90,
    )
    if proc.returncode:
        raise RuntimeError("Could not read video metadata: " + proc.stderr[-400:])
    return json.loads(proc.stdout)


def download_audio(url: str, directory: Path) -> Path:
    proc = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "--no-playlist", "--no-progress",
         "-f", "bestaudio", "-x", "--audio-format", "wav",
         "-o", str(directory / "song.%(ext)s"), url],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode or not (directory / "song.wav").is_file():
        raise RuntimeError("Audio download failed: " + proc.stderr[-400:])
    return directory / "song.wav"


def generate_chart(audio: Path, directory: Path):
    from server import analyze_stem

    output = directory / "separated"
    proc = subprocess.run(
        [sys.executable, "-m", "demucs", "-n", "htdemucs", "--out", str(output), str(audio)],
        capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode:
        raise RuntimeError("Chart analysis failed: " + proc.stderr[-400:])
    stem = output / "htdemucs" / "song" / "vocals.wav"
    if not stem.is_file():
        raise RuntimeError("Vocal stem missing")
    notes, duration = analyze_stem(stem, "vocals")
    if len(notes) < 4:
        raise RuntimeError("Too few notes generated; skipped")
    return notes, duration


def main():
    parser = argparse.ArgumentParser(description="Import YouTube links as BeatForge charts")
    parser.add_argument("links", type=Path, help="Text file containing one link per line")
    parser.add_argument("--dry-run", action="store_true", help="Show metadata without downloading or saving")
    args = parser.parse_args()
    ids = read_links(args.links)
    if not ids:
        parser.error("No links found")
    base = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    admin_id = os.environ.get("BEATFORGE_ADMIN_USER_ID", "")
    if not args.dry_run:
        if not all((base, key, admin_id)):
            parser.error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and BEATFORGE_ADMIN_USER_ID")
        try:
            admin_id = str(uuid.UUID(admin_id))
        except ValueError:
            parser.error("BEATFORGE_ADMIN_USER_ID must be a valid UUID")
        query = "profiles?select=id&is_admin=eq.true&id=eq." + admin_id
        if not request_json(base, key, query):
            parser.error("The specified account is not an admin")
        if not shutil.which("ffmpeg"):
            parser.error("ffmpeg is required to extract audio")

    failed = 0
    for index, video_id in enumerate(ids, 1):
        url = "https://www.youtube.com/watch?v=" + video_id
        try:
            if not args.dry_run:
                # Include alternate YouTube URLs with the same video id.
                query = "charts?select=id&youtube_url=ilike." + urllib.parse.quote("*" + video_id + "*", safe="") + "&limit=1"
                if request_json(base, key, query):
                    print(f"[{index}/{len(ids)}] Already exists: {url}", flush=True)
                    continue
            metadata = youtube_metadata(url)
            title = (metadata.get("track") or metadata.get("title") or video_id).strip()
            artist = (metadata.get("artist") or metadata.get("creator") or metadata.get("uploader") or "Unknown artist").strip()
            if args.dry_run:
                print(f"[{index}/{len(ids)}] {artist} - {title} ({url})", flush=True)
                continue
            print(f"[{index}/{len(ids)}] Generating {artist} - {title}", flush=True)
            with tempfile.TemporaryDirectory(prefix="beatforge_import_") as temp:
                directory = Path(temp)
                audio = download_audio(url, directory)
                notes, duration = generate_chart(audio, directory)
                request_json(base, key, "charts", "POST", {
                    "user_id": admin_id, "title": title, "artist": artist,
                    "youtube_url": url, "difficulty": "Medium", "lane_count": 5,
                    "duration": duration, "notes": notes,
                })
            print(f"  Saved {len(notes)} notes", flush=True)
        except (RuntimeError, subprocess.TimeoutExpired, urllib.error.URLError, ValueError) as exc:
            failed += 1
            print(f"  Failed {url}: {exc}", file=sys.stderr, flush=True)
    print(f"Finished: {len(ids) - failed} processed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
