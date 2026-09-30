"""Server-side equivalent of the instant vocal-focused generator in page.tsx."""

import math
from bisect import bisect_left, bisect_right
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter


def generate_instant_chart(path: Path):
    mix, sr = sf.read(path, dtype="float32", always_2d=True)
    duration = len(mix) / sr
    mono = mix.mean(axis=1)
    del mix

    hp_rc = 1 / (2 * math.pi * 110)
    lp_rc = 1 / (2 * math.pi * 4200)
    hp_a = hp_rc / (hp_rc + 1 / sr)
    lp_a = (1 / sr) / (lp_rc + 1 / sr)
    high = lfilter([hp_a, -hp_a], [1, -hp_a], mono).astype(np.float32)
    del mono
    vocal = lfilter([lp_a], [1, -(1 - lp_a)], high).astype(np.float32)
    del high

    hop, win = 512, 2048
    frames = max(1, (len(vocal) - win) // hop)
    if len(vocal) < win:
        return [], duration
    rms = np.zeros(frames, dtype=np.float32)
    zcr = np.zeros(frames, dtype=np.float32)
    rough = np.zeros(frames, dtype=np.float32)
    for f in range(frames):
        sampled = vocal[f * hop:f * hop + win:2]
        previous = np.r_[sampled[0], sampled[:-1]]
        rms[f] = np.sqrt(np.mean(sampled * sampled))
        rough[f] = np.mean(np.abs(sampled - previous))
        zcr[f] = np.mean((sampled >= 0) != (previous >= 0))
    del vocal

    env = np.convolve(rms, [1, 2, 3, 2, 1], mode="same") / np.convolve(np.ones(frames), [1, 2, 3, 2, 1], mode="same")
    max_env = float(np.max(env))
    novelty = np.zeros(frames, dtype=np.float32)
    for i in range(3, frames - 3):
        rise = max(0, env[i] - env[i - 2])
        sustain = (env[i + 2] + env[i + 3]) * .5
        noisy = max(0, rough[i] / max(.00001, env[i]) - 2.8)
        shape = max(.15, min(1.25, sustain / max(.00001, env[i]) * 1.15)) / (1 + noisy * .22)
        texture_rise = max(0, rough[i] - rough[i - 2]) * 1.6
        novelty[i] = max(rise, texture_rise) * shape
    max_novelty = float(np.max(novelty))

    candidates = []
    last = -1
    for i in range(5, frames - 5):
        local = novelty[max(0, i - 34):min(frames, i + 34)]
        mean = float(local.mean())
        dev = float(np.mean(np.abs(local - mean)))
        floor = max(max_novelty * .012, mean + dev * .75)
        refined = max(range(max(2, i - 2), min(frames - 2, i + 2) + 1), key=lambda q: env[q] - env[q - 2])
        t = (refined * hop + win / 2) / sr
        if (t > .22 and t - last > .08 and env[i] / max(.00001, max_env) > .014
                and env[i + 3] > env[i] * .30 and .004 < zcr[i] < .34
                and novelty[i] > floor and novelty[i] >= novelty[i - 1] and novelty[i] >= novelty[i + 1]):
            candidates.append((t, float(novelty[i] / max(.00001, max_novelty)), i))
            last = t

    peaks = []
    for candidate in candidates:
        if peaks and candidate[0] - peaks[-1][0] < .11:
            if candidate[1] > peaks[-1][1]:
                peaks[-1] = candidate
        else:
            peaks.append(candidate)

    histogram = {}
    for i in range(1, len(peaks)):
        for back in range(1, min(i, 3) + 1):
            distance = peaks[i][0] - peaks[i - back][0]
            while distance < .30:
                distance *= 2
            while distance > .85:
                distance /= 2
            if .30 <= distance <= .85:
                bin_ = round(distance / .01)
                histogram[bin_] = histogram.get(bin_, 0) + peaks[i][1]
    beat = max(histogram, key=histogram.get) * .01 if histogram else .5
    origin = peaks[0][0] if peaks else 0

    peaks = [peak for peak in peaks if peak[1] >= .02]
    # Mixed audio cannot prove which instrument holds a note.
    shaped = [(index, 0.0) for index in range(len(peaks))]
    notes = []
    prev_lane = prev_prev = -1
    for idx, note_duration in shaped:
        peak_time, strength, frame = peaks[idx]
        step = beat / 2
        grid = origin + round((peak_time - origin) / step) * step
        t = grid if abs(grid - peak_time) < .035 else peak_time
        choices = [lane for lane in range(5) if lane != prev_lane or idx % 6 == 0]
        seed = (frame * 1103515245 + idx * 12345) & 0xffffffff
        lane = choices[seed % len(choices)]
        if lane == prev_prev and len(choices) > 1:
            lane = choices[(seed + 2) % len(choices)]

        notes.append({"id": len(notes), "time": max(.02, t), "lane": lane, "duration": note_duration})
        prev_prev, prev_lane = prev_lane, lane

    if len(notes) < 8 and not any(note["duration"] for note in notes):
        notes = [{"id": i, "time": .9 + i * .72, "lane": (i * 3) % 5, "duration": 0}
                 for i in range(max(10, int(duration * 1.25)))]
    return notes[:1600], duration


def compose_full_mix(charts):
    """Build one playable chart from the analyzed instrument charts."""
    instruments = ("vocals", "melody", "drums", "bass")
    available = {name: charts[name] for name in instruments if name in charts}
    if not available:
        return [], 0.0
    duration = max(item[1] for item in available.values())
    events = [(note["time"], name, note) for name, (notes, _) in available.items()
              for note in notes if 0 <= note["time"] < duration]
    events.sort(key=lambda event: event[0])
    lead_times = sorted(time for time, name, _ in events if name in ("vocals", "melody"))
    priority = {"vocals": 4, "melody": 3, "drums": 2, "bass": 1}
    # A local lead gives the chart continuity, but drums may fill pauses in it.
    selected = []
    for time, name, note in events:
        lead_nearby = bisect_left(lead_times, time - .22) < bisect_right(lead_times, time + .22)
        if name in ("drums", "bass") and lead_nearby:
            continue
        selected.append((time, name, note))
    # Highest priority attack wins local clashes; a sliding density limit
    # prevents short, busy arrangements from becoming impossible to play.
    accepted = []
    for event in sorted(selected, key=lambda item: (-priority[item[1]], item[0])):
        time = event[0]
        if any(abs(other[0] - time) < .105 for other in accepted):
            continue
        if sum(abs(other[0] - time) < .5 for other in accepted) >= 5:
            continue
        accepted.append(event)
    accepted.sort(key=lambda item: item[0])
    result, last_lane = [], -1
    lane_free_at = [0.0] * 5
    for index, (time, name, note) in enumerate(accepted[:3200]):
        preferred = (int(note["lane"]) + {"vocals": 0, "melody": 1, "drums": 2, "bass": 3}[name]) % 5
        free = [lane for lane in range(5) if lane_free_at[lane] <= time]
        choices = [lane for lane in free if lane != last_lane] or free
        lane = (min(choices, key=lambda candidate: (candidate - preferred) % 5)
                if choices else min(range(5), key=lambda candidate: lane_free_at[candidate]))
        if not free:
            held = next((prior for prior in reversed(result) if prior["lane"] == lane
                         and prior["time"] + prior["duration"] > time), None)
            if held is not None:
                held["duration"] = max(0.0, time - held["time"])
        result.append({"id": index, "time": time, "lane": lane, "duration": 0.0})
        lane_free_at[lane] = time
        last_lane = lane
    return result, duration
