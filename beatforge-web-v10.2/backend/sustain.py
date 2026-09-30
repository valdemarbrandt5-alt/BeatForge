"""Group a voiced phrase into a hold, with sparse taps for audible inflections.

Energy continuity owns the hold length. Onset detections inside it are only
ornaments: regular vibrato/tremolo must not restart the note. The browser uses
the same thresholds in src/sustain-notes.ts.
"""

import numpy as np


def sustain_notes(events, envelope, seconds_per_frame, min_hold, pitches=None, gap_tolerance=.085,
                  split_attacks=False, sustained_floor_ratio=None):
    """Return (event index, duration); unselected interior ripples are omitted."""
    if not events or len(envelope) == 0:
        return []
    dt = seconds_per_frame
    noise_floor = float(np.max(envelope)) * .012
    grace = max(1, round(gap_tolerance / dt))
    max_frames = round(3 / dt)
    active_start = active_end = -1
    active_result = -1
    last_tap = -float('inf')
    result = []

    def window(values, frame, start, end):
        return values[max(0, frame + round(start / dt)):min(len(values), frame + round(end / dt))]

    def middle(values):
        return float(np.median(values)) if len(values) else 0.0

    # Repeated instrumental attacks can have ringing tails between them. A
    # clear decay followed by a fresh rise is a new note, not one endless hold.
    restarts = set()
    if split_attacks:
        for frame, _ in events:
            shoulder = middle(window(envelope, frame, -.20, -.08))
            valley = window(envelope, frame, -.065, .01)
            low = float(np.percentile(valley, 25)) if len(valley) else 0
            after = middle(window(envelope, frame, .02, .10))
            if shoulder > noise_floor and low < shoulder * .65 and after > max(noise_floor, low * 1.8):
                restarts.add(frame)

    def is_inflection(frame):
        # Compare stable neighborhoods, not two adjacent FFT frames. The latter
        # turns every cycle of vibrato into another attack.
        if pitches is not None:
            before = window(pitches, frame, -.16, -.04)
            after = window(pitches, frame, .04, .16)
            before, after = before[before > 0], after[after > 0]
            if len(before) >= 2 and len(after) >= 2:
                left, right = middle(before), middle(after)
                change = abs(1200 * np.log2(right / left))
                spread = max(middle(np.abs(1200 * np.log2(before / left))),
                             middle(np.abs(1200 * np.log2(after / right))))
                if change >= 120 and spread < 70:
                    return True
        # A brief, pronounced vocal break may keep the same pitch. Normal
        # volume oscillation does not reach this depth relative to both sides.
        before = middle(window(envelope, frame, -.18, -.09))
        after = middle(window(envelope, frame, .03, .12))
        valley = window(envelope, frame, -.09, .025)
        return bool(len(valley) and min(before, after) > noise_floor * 2
                    and float(np.min(valley)) < min(before, after) * .5)

    def lasting_pitch_change(frame):
        if pitches is None:
            return False
        before = window(pitches, frame, -.18, -.06)
        after = window(pitches, frame, .10, .27)
        later = window(pitches, frame, .27, .42)
        before, after, later = (part[part > 0] for part in (before, after, later))
        if min(len(before), len(after), len(later)) < 2:
            return False
        old, new, still = map(middle, (before, after, later))
        cents = lambda a, b: abs(1200 * np.log2(a / b))
        return (cents(new, old) >= 240 and cents(still, new) < 90
                and middle(np.abs(1200 * np.log2(after / new))) < 70)

    for index, (frame, _) in enumerate(events):
        # Window leakage at a sound's release is not a new playable attack.
        before = middle(window(envelope, frame, -.06, -.015))
        after = middle(window(envelope, frame, .02, .07))
        if (active_end >= 0 and abs(frame - active_end) * dt < .1
                and before > noise_floor and after < max(noise_floor, before * .15)):
            continue
        if frame <= active_end:
            elapsed, remaining = (frame - active_start) * dt, (active_end - frame) * dt
            if (not split_attacks and active_result >= 0 and elapsed >= min_hold
                    and remaining >= min_hold and (frame - last_tap) * dt >= .35
                    and lasting_pitch_change(frame)):
                # Hand over the held vowel to the new stable pitch. A short
                # overlap gives the player time to press the next free lane.
                previous, _ = result[active_result]
                result[active_result] = (previous, min(3.0, elapsed + .08))
                result.append((index, min(3.0, remaining - .06)))
                active_result = len(result) - 1
                active_start = last_tap = frame
                continue
            if ((frame - active_start) * dt >= .25 and (active_end - frame) * dt >= .12
                    and (frame - last_tap) * dt >= .28 and is_inflection(frame)):
                result.append((index, 0.0))
                last_tap = frame
            continue

        initial = window(envelope, frame, 0, .12)
        level = float(np.percentile(initial, 70)) if len(initial) else float(envelope[frame])
        floor = max(noise_floor, level * .35)
        last_active, quiet = frame, 0
        for current in range(frame + 1, min(len(envelope), frame + max_frames + 1)):
            if current in restarts:
                break
            if envelope[current] > floor:
                last_active, quiet = current, 0
            else:
                quiet += 1
                if quiet > grace:
                    break
        # A permissive floor bridges vibrato, but reverb or a quiet backing
        # bed must not make a short sound look like a long held note.
        if sustained_floor_ratio is not None and last_active > frame:
            support_floor = max(noise_floor, level * sustained_floor_ratio)
            support_grace = max(grace, round(.12 / dt))
            warmup = round(.16 / dt)
            last_supported, unsupported = frame, 0
            for current in range(frame + 1, last_active + 1):
                if envelope[current] > support_floor:
                    last_supported, unsupported = current, 0
                elif current - frame > warmup:
                    unsupported += 1
                    if unsupported > support_grace:
                        break
            last_active = last_supported
        raw = (last_active - frame) * dt
        length = min(3.0, raw - .06) if raw >= min_hold else 0.0
        result.append((index, length))
        if length:
            active_start, active_end = frame, last_active
            active_result = len(result) - 1
            last_tap = frame
    return result
