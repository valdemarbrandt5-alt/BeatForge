"""Server-side equivalent of the instant vocal-focused generator in page.tsx."""

import math
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
        novelty[i] = rise * shape
    max_novelty = float(np.max(novelty))

    candidates = []
    last = -1
    for i in range(5, frames - 5):
        local = novelty[max(0, i - 34):min(frames, i + 34)]
        mean = float(local.mean())
        dev = float(np.mean(np.abs(local - mean)))
        floor = max(max_novelty * .018, mean + dev * 1.12)
        refined = max(range(max(2, i - 2), min(frames - 2, i + 2) + 1), key=lambda q: env[q] - env[q - 2])
        t = (refined * hop + win / 2) / sr
        if (t > .22 and t - last > .115 and env[i] / max(.00001, max_env) > .018
                and env[i + 3] > env[i] * .30 and .004 < zcr[i] < .34
                and novelty[i] > floor and novelty[i] >= novelty[i - 1] and novelty[i] >= novelty[i + 1]):
            candidates.append((t, float(novelty[i] / max(.00001, max_novelty)), i))
            last = t

    peaks = []
    for candidate in candidates:
        if peaks and candidate[0] - peaks[-1][0] < .18:
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

    notes = []
    prev_lane = prev_prev = -1
    for idx, (peak_time, strength, frame) in enumerate(peaks):
        if strength < .035:
            continue
        step = beat / 2
        grid = origin + round((peak_time - origin) / step) * step
        t = grid if abs(grid - peak_time) < .035 else peak_time
        choices = [lane for lane in range(5) if lane != prev_lane or idx % 6 == 0]
        seed = (frame * 1103515245 + idx * 12345) & 0xffffffff
        lane = choices[seed % len(choices)]
        if lane == prev_prev and len(choices) > 1:
            lane = choices[(seed + 2) % len(choices)]

        base = env[frame]
        soft_floor = max(max_env * .0065, base * .20)
        k = frame + 1
        last_voiced = frame
        quiet_frames = 0
        next_attack = peaks[idx + 1][2] if idx + 1 < len(peaks) else frames
        while k < frames and (k - frame) * hop / sr < 4.5:
            if env[k] > soft_floor:
                last_voiced, quiet_frames = k, 0
            else:
                quiet_frames += 1
            age = (k - frame) * hop / sr
            strong_attack = (age > .28 and k < next_attack + 2 and novelty[k] > max_novelty * .14
                             and novelty[k] > novelty[max(0, k - 2)] * 1.45)
            if strong_attack or quiet_frames > 7 or k >= next_attack:
                break
            k += 1
        sustained = (last_voiced - frame) * hop / sr
        note_duration = min(4.5, max(.45, sustained - .06)) if sustained >= .46 else 0
        notes.append({"id": len(notes), "time": max(.02, t), "lane": lane, "duration": note_duration})
        prev_prev, prev_lane = prev_lane, lane

    if len(notes) < 8:
        notes = [{"id": i, "time": .9 + i * .72, "lane": (i * 3) % 5, "duration": 0}
                 for i in range(max(10, int(duration * 1.25)))]
    return notes[:1600], duration
