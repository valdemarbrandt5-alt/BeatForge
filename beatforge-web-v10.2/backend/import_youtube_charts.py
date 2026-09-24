"""Local admin import: python import_youtube_charts.py links.txt [--dry-run].

Requires yt-dlp, ffmpeg and the packages in requirements.txt.
Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and BEATFORGE_ADMIN_USER_ID locally.
Only use for recordings that you have permission to download and analyze.
"""

import argparse
import base64
import binascii
from contextlib import contextmanager
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
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
    with youtube_cookie_args() as cookie_args:
        cookie_status = youtube_cookie_status(cookie_args)
        proc = subprocess.run(
            [sys.executable, "-m", "yt_dlp", *cookie_args, "--no-playlist", "--skip-download",
             "--dump-single-json", url], capture_output=True, text=True, timeout=90,
        )
    if proc.returncode:
        raise RuntimeError(f"Metadata failed ({cookie_status}): " + proc.stderr[-190:])
    return json.loads(proc.stdout)


def download_audio(url: str, directory: Path) -> Path:
    with youtube_cookie_args() as cookie_args:
        cookie_status = youtube_cookie_status(cookie_args)
        proc = subprocess.run(
            [sys.executable, "-m", "yt_dlp", *cookie_args, "--no-playlist", "--no-progress",
             "-f", "bestaudio", "-x", "--audio-format", "wav",
             "-o", str(directory / "song.%(ext)s"), url],
            capture_output=True, text=True, timeout=600,
        )
    if proc.returncode or not (directory / "song.wav").is_file():
        raise RuntimeError(f"Audio failed ({cookie_status}): " + proc.stderr[-190:])
    return directory / "song.wav"


def youtube_cookie_status(cookie_args: list[str]) -> str:
    """Only report counts, never cookie names or values."""
    if not cookie_args:
        return "cookies not configured"
    lines = Path(cookie_args[1]).read_text(encoding="utf-8-sig").splitlines()
    cookies = []
    for line in lines:
        if line.startswith("#HttpOnly_"):
            line = line[len("#HttpOnly_"):]
        elif line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 7 and parts[0].lstrip(".").endswith("youtube.com"):
            cookies.append(parts)
    now = time.time()
    usable = sum(1 for parts in cookies if parts[4] == "0" or (parts[4].isdigit() and int(parts[4]) > now))
    return f"YouTube cookies loaded {len(cookies)}, unexpired {usable}"


@contextmanager
def youtube_cookie_args():
    encoded = os.getenv("YOUTUBE_COOKIES_BASE64", "").strip()
    if not encoded:
        yield []
        return
    try:
        contents = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise RuntimeError("YOUTUBE_COOKIES_BASE64 is not valid base64") from exc
    if not contents.startswith((b"# Netscape HTTP Cookie File", b"# HTTP Cookie File")):
        raise RuntimeError("YouTube cookies must be in Netscape cookies.txt format")
    with tempfile.TemporaryDirectory(prefix="beatforge_cookies_") as directory:
        cookie_path = Path(directory) / "cookies.txt"
        cookie_path.write_bytes(contents)
        cookie_path.chmod(0o600)
        yield ["--cookies", str(cookie_path)]


def generate_chart(audio: Path, directory: Path):
    from instant_chart import generate_instant_chart

    notes, duration = generate_instant_chart(audio)
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
