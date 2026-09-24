"""Turn a Demucs stem into the same five-lane notes used by BeatForge.

Shared by the local importer and the optional /analyze-all backend endpoint.
"""

import hashlib
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d


STEMS = {
    "vocals": "vocals.wav",
    "drums": "drums.wav",
    "bass": "bass.wav",
    "melody": "other.wav",
}


def analyze_stem(path: Path, instrument: str):
    """Analyze one of the four original Demucs stems, keeping audio timestamps."""
    y, sr = sf.read(path, always_2d=True, dtype="float32")
    y = y.mean(axis=1)
    duration = len(y) / sr
    peak = np.percentile(np.abs(y), 99.5) or 1.0
    y = np.clip(y / peak, -1, 1)
    hop, win = 512, 2048
    if len(y) < win:
        return [], duration
    frames = 1 + (len(y) - win) // hop
    rms, flux = np.empty(frames, np.float32), np.empty(frames, np.float32)
    prev = None
    window = np.hanning(win).astype(np.float32)
    for i in range(frames):
        x = y[i * hop:i * hop + win] * window
        rms[i] = np.sqrt(np.mean(x * x) + 1e-10)
        mag = np.abs(np.fft.rfft(x))
        flux[i] = 0 if prev is None else np.maximum(0, mag - prev).sum() / (mag.sum() + 1e-8)
        prev = mag
    rms = gaussian_filter1d(rms, 1.0)
    flux = gaussian_filter1d(flux, 1.0)
    radius = max(8, int(sr / hop * 2.0))
    local = np.empty_like(rms)
    for i in range(frames):
        local[i] = np.median(rms[max(0, i - radius):min(frames, i + radius + 1)])
    activity = rms / (local + np.percentile(rms, 20) + 1e-5)
    score = flux * (0.55 + 0.45 * np.clip(activity, 0, 3))
    base = np.percentile(score, {"vocals": 72, "drums": 62, "bass": 70, "melody": 70}[instrument])
    min_gap = {"vocals": .20, "drums": .12, "bass": .20, "melody": .18}[instrument]
    candidates, last = [], -99
    quiet = np.percentile(rms, 18)
    for i in range(2, frames - 2):
        t = i * hop / sr
        local_score = np.median(score[max(0, i - radius):min(frames, i + radius + 1)])
        threshold = max(base * .38, local_score * 1.45)
        if score[i] > threshold and score[i] >= score[i - 1] and score[i] >= score[i + 1] and t - last >= min_gap and rms[i] > quiet:
            candidates.append((i, t))
            last = t
    seed = int(hashlib.sha1((path.name + instrument).encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    notes, prev_lane = [], -1
    for idx, (fi, t) in enumerate(candidates[:1600]):
        length = 0.0
        if instrument != "drums":
            floor = max(np.percentile(rms, 25), rms[fi] * .24)
            j, max_frames = fi + 1, int(4.0 * sr / hop)
            while j < frames and j - fi < max_frames and rms[j] > floor:
                if j > fi + int(.28 * sr / hop) and score[j] > max(base * .7, score[fi] * .8):
                    break
                j += 1
            raw = (j - fi) * hop / sr
            if raw >= .48:
                length = min(raw, 3.5)
        choices = [lane for lane in range(5) if lane != prev_lane]
        lane = int(rng.choice(choices))
        prev_lane = lane
        notes.append({"id": idx, "time": round(float(t), 4), "lane": lane, "duration": round(float(length), 4)})
    return notes, duration
