"""Turn a Demucs stem into the same five-lane notes used by BeatForge.

Shared by the local importer and the optional /analyze-all backend endpoint.
"""

import hashlib
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from sustain import sustain_notes


STEMS = {
    "vocals": "vocals.wav",
    "drums": "drums.wav",
    "bass": "bass.wav",
    "melody": "other.wav",
}


def _leaked_from_companion(y, peak, sr, frame, hop, companions):
    """Reject a shared attack only when another stem clearly owns its waveform."""
    start = frame * hop
    count = min(round(sr * .14), len(y) - start)
    if count < 32:
        return False
    target = y[start:start + count] * peak
    target = target - target.mean()
    target_power = float(np.dot(target, target))
    if target_power < 1e-10:
        return False
    for other in companions:
        other.seek(start)
        sample = other.read(count, dtype="float32", always_2d=True).mean(axis=1)
        if len(sample) != count:
            continue
        sample -= sample.mean()
        other_power = float(np.dot(sample, sample))
        if other_power <= target_power * .64:
            continue
        correlation = abs(float(np.dot(target, sample))) / (np.sqrt(target_power * other_power) + 1e-10)
        if (other_power > target_power * 1.21 and correlation > .62) or correlation > .88:
            return True
    return False


def analyze_stem(path: Path, instrument: str, source_kind: str = ""):
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
    pitches = np.zeros(frames, np.float32)
    prev = None
    window = np.hanning(win).astype(np.float32)
    for i in range(frames):
        x = y[i * hop:i * hop + win] * window
        rms[i] = np.sqrt(np.mean(x * x) + 1e-10)
        mag = np.abs(np.fft.rfft(x))
        flux[i] = 0 if prev is None else np.maximum(0, mag - prev).sum() / (mag.sum() + 1e-8)
        prev = mag
        if instrument != "drums":
            low = max(1, int(55 * win / sr))
            high = min(len(mag) - 1, int(1800 * win / sr))
            peak_bin = low + int(np.argmax(mag[low:high]))
            # Interpolation avoids FFT-bin jumps being mistaken for vocal bends.
            a, b, c = np.log(np.maximum(mag[peak_bin - 1:peak_bin + 2], 1e-10))
            bend = .5 * (a - c) / (a - 2 * b + c) if abs(a - 2 * b + c) > 1e-8 else 0
            pitches[i] = (peak_bin + np.clip(bend, -.5, .5)) * sr / win
    rms = gaussian_filter1d(rms, 1.0)
    flux = gaussian_filter1d(flux, 1.0)
    # Soft piano attacks and fresh vocal syllables can raise the volume without
    # producing a large spectral change. Keep this extra cue on those stems only.
    if instrument in ("vocals", "melody"):
        rise = np.maximum(0, rms - np.roll(rms, 3)) / (rms + 1e-5)
        rise[:3] = 0
        flux = np.maximum(flux, rise * .24)
    radius = max(8, int(sr / hop * 2.0))
    local = np.empty_like(rms)
    for i in range(frames):
        local[i] = np.median(rms[max(0, i - radius):min(frames, i + radius + 1)])
    activity = rms / (local + np.percentile(rms, 20) + 1e-5)
    score = flux * (0.55 + 0.45 * np.clip(activity, 0, 3))
    # Silence can make the percentile zero; a relative floor prevents tiny FFT
    # ripples inside a held tone from turning into many separate taps.
    base = max(np.percentile(score, {"vocals": 72, "drums": 62, "bass": 70, "melody": 70}[instrument]),
               np.max(score) * .004)
    min_gap = .075 if source_kind == "piano" else {"vocals": .14, "drums": .12, "bass": .20, "melody": .13}[instrument]
    candidates, last = [], -99
    quiet = np.percentile(rms, 18)
    for i in range(2, frames - 2):
        # The melodic onset belongs to the center of the FFT window. The
        # other instruments keep their existing timing and thresholds.
        t = (i * hop + (win / 2 if instrument in ("vocals", "melody") else 0)) / sr
        local_score = np.median(score[max(0, i - radius):min(frames, i + radius + 1)])
        if source_kind == "piano":
            threshold = max(base * .18, local_score * 1.12)
        elif instrument in ("vocals", "melody"):
            threshold = max(base * .25, local_score * 1.2)
        else:
            threshold = max(base * .38, local_score * 1.45)
        if (score[i] > threshold and score[i] >= score[i - 1] and score[i] >= score[i + 1]
                and t - last >= min_gap and rms[i] > quiet):
            candidates.append((i, t))
            last = t
    seed = int(hashlib.sha1((path.name + instrument).encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    notes, prev_lane = [], -1
    competing = {"vocals": ("melody", "drums", "bass"), "melody": ("vocals", "drums")}
    with ExitStack() as stack:
        companions = [stack.enter_context(sf.SoundFile(path.with_name(STEMS[name])))
                      for name in competing.get(instrument, ()) if path.with_name(STEMS[name]).is_file()]
        companions = [other for other in companions if other.samplerate == sr and len(other) >= len(y)]
        accepted = [(fi, t) for fi, t in candidates[:3200 if source_kind == "piano" else 1600]
                    if not companions or not _leaked_from_companion(y, peak, sr, fi, hop, companions)]
        # Piano chords and arpeggios ring across subsequent attacks; each
        # detected key strike must remain playable even during that decay.
        shaped = ([(i, 0.0) for i in range(len(accepted))] if instrument == "drums" or source_kind == "piano" else
                  sustain_notes(accepted, rms, hop / sr,
                                {"vocals": .68, "melody": .82, "bass": .86}[instrument], pitches,
                                gap_tolerance=.085 if instrument == "vocals" else .03,
                                split_attacks=instrument != "vocals"))
        for idx, length in shaped:
            fi, t = accepted[idx]
            choices = [lane for lane in range(5) if lane != prev_lane]
            lane = int(rng.choice(choices))
            prev_lane = lane
            notes.append({"id": len(notes), "time": round(float(t), 4), "lane": lane, "duration": round(float(length), 4)})
    return notes, duration


def merge_melody_sources(original: Path, six_directory: Path):
    """Use strong piano/guitar/other attacks without multiplying duplicate hits.

    Four source `other` is retained as a fallback. The six source piano stem
    can leak into other instruments, so each candidate must also pass the
    existing companion rejection in analyze_stem and a local energy check.
    """
    sources = [("original", original)] + [
        (name, six_directory / (name + ".wav"))
        for name in ("piano", "guitar", "other")
        if (six_directory / (name + ".wav")).is_file()
    ]
    original_notes, duration = analyze_stem(original, "melody")
    if len(sources) == 1:
        return original_notes, duration
    candidates = []
    with ExitStack() as stack:
        for name, path in sources:
            sound = stack.enter_context(sf.SoundFile(path))
            if sound.samplerate != sf.info(original).samplerate:
                continue
            notes = original_notes if name == "original" else analyze_stem(path, "melody", source_kind=name)[0]
            values = []
            for note in notes:
                sound.seek(min(len(sound), max(0, round(note["time"] * sound.samplerate))))
                sample = sound.read(round(.10 * sound.samplerate), dtype="float32", always_2d=True)
                values.append(float(np.sqrt(np.mean(sample * sample))) if len(sample) else 0.0)
            typical = float(np.percentile(values, 75)) if values else 0.0
            for note, energy in zip(notes, values):
                if energy < max(typical * (.12 if name == "piano" else .23), 1e-5):
                    continue
                # Specific sources get a modest preference, never a free pass.
                confidence = min(3.0, energy / (typical + 1e-8)) * (1.12 if name in ("piano", "guitar") else 1.0)
                candidates.append((note, confidence, name))
    candidates.sort(key=lambda item: (item[0]["time"], -item[1]))
    # Only collapse coincident hits from different stems. Chaining adjacent
    # groups used to swallow fast notes from the same piano stem.
    distinct = []
    for note, confidence, name in sorted(candidates, key=lambda item: -item[1]):
        if any(other_name != name and abs(note["time"] - other["time"]) < .07
               for other, _, other_name in distinct):
            continue
        distinct.append((note, confidence, name))
    # Cap extreme density per second, retaining the strongest musical attacks.
    buckets = {}
    for note, confidence, _ in distinct:
        buckets.setdefault(int(note["time"]), []).append((note, confidence))
    selected = [note for bucket in buckets.values()
                for note, _ in sorted(bucket, key=lambda item: item[1], reverse=True)[:10]]
    selected.sort(key=lambda note: note["time"])
    return [{**note, "id": index} for index, note in enumerate(selected)], duration
