"""Check timing and coverage on repeatable audio, including quiet piano notes."""

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stem_chart import analyze_stem, _leaked_from_companion


class StemChartTest(unittest.TestCase):
    def test_shared_synth_attack_is_not_a_vocal_attack(self):
        sr, hop = 22050, 512
        seconds = np.arange(round(sr * .4)) / sr
        attack = np.sin(2 * np.pi * 520 * seconds).astype(np.float32)
        unrelated_voice = np.sin(2 * np.pi * 330 * seconds).astype(np.float32)
        y = np.zeros(sr, dtype=np.float32)
        y[hop:hop + len(attack)] = attack * .35

        class Stem:
            def __init__(self, audio): self.audio, self.position = audio, 0
            def seek(self, position): self.position = position
            def read(self, count, **_):
                return self.audio[self.position:self.position + count, None].copy()

        shared = np.zeros_like(y)
        shared[hop:hop + len(attack)] = attack * .8
        distinct = np.zeros_like(y)
        distinct[hop:hop + len(attack)] = unrelated_voice * .8
        self.assertTrue(_leaked_from_companion(y, 1, sr, 1, hop, [Stem(shared)]))
        self.assertFalse(_leaked_from_companion(y, 1, sr, 1, hop, [Stem(distinct)]))

    def test_sustained_melody_is_held_but_piano_decay_is_not(self):
        sr = 22050
        audio = np.zeros(sr * 5, dtype=np.float32)
        for start, held in ((.5, True), (2.8, False)):
            seconds = np.arange(round(1.1 * sr)) / sr
            envelope = (1 - np.exp(-seconds / .02)) * (
                .7 if held else np.exp(-seconds / .12)
            )
            position = round(start * sr)
            audio[position:position + len(seconds)] = .5 * envelope * np.sin(2 * np.pi * 440 * seconds)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'other.wav'
            sf.write(path, audio, sr)
            notes, _ = analyze_stem(path, 'melody')
        held = min(notes, key=lambda note: abs(note['time'] - .5))
        decay = min(notes, key=lambda note: abs(note['time'] - 2.8))
        self.assertGreater(held['duration'], .7)
        self.assertEqual(decay['duration'], 0)

    def test_shared_piano_stays_on_melody_and_real_syllables_stay_on_vocals(self):
        sr = 22050
        vocals = np.zeros(sr * 5, dtype=np.float32)
        melody = np.zeros_like(vocals)
        piano_times = [.5, 1., 1.5]
        voice_times = [2.2, 2.7, 3.2, 3.7]
        for t in piano_times:
            seconds = np.arange(round(.30 * sr)) / sr
            envelope = (1 - np.exp(-seconds / .012)) * np.exp(-seconds / .10)
            start = round(t * sr)
            sound = envelope * np.sin(2 * np.pi * 540 * seconds)
            melody[start:start + len(sound)] += .8 * sound
            vocals[start:start + len(sound)] += .36 * sound
        for t in voice_times:
            seconds = np.arange(round(.30 * sr)) / sr
            envelope = (1 - np.exp(-seconds / .012)) * np.exp(-seconds / .12)
            start = round(t * sr)
            vocals[start:start + len(seconds)] += .7 * envelope * np.sin(2 * np.pi * 280 * seconds)
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            sf.write(folder / 'vocals.wav', vocals, sr)
            sf.write(folder / 'other.wav', melody, sr)
            voice_notes, _ = analyze_stem(folder / 'vocals.wav', 'vocals')
            melody_notes, _ = analyze_stem(folder / 'other.wav', 'melody')
        self.assertFalse(any(note['time'] < 2 for note in voice_notes), voice_notes)
        self.assertGreaterEqual(sum(any(abs(n['time'] - t) < .09 for n in voice_notes) for t in voice_times), 3)
        self.assertGreaterEqual(sum(any(abs(n['time'] - t) < .09 for n in melody_notes) for t in piano_times), 3)

    def test_clear_medium_length_vocal_can_be_a_hold(self):
        sr = 22050
        audio = np.zeros(sr * 2, dtype=np.float32)
        seconds = np.arange(round(.82 * sr)) / sr
        envelope = 1 - np.exp(-seconds / .025)
        start = round(.5 * sr)
        audio[start:start + len(seconds)] = .6 * envelope * np.sin(2 * np.pi * 330 * seconds)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'vocals.wav'
            sf.write(path, audio, sr)
            notes, _ = analyze_stem(path, 'vocals')
        self.assertTrue(any(.65 <= note['duration'] <= 1 for note in notes), notes)

    def test_vocal_syllables_keep_phrase_pauses_and_rhythmic_density(self):
        sr = 22050
        times = [.5, .82, 1.15, 1.47, 2.8, 3.12, 3.45, 3.78]
        audio = np.zeros(sr * 5, dtype=np.float32)
        for t in times:
            seconds = np.arange(round(.26 * sr)) / sr
            envelope = (1 - np.exp(-seconds / .012)) * np.exp(-seconds / .11)
            # A second, softer pulse within each vowel is not another syllable.
            envelope += .26 * np.exp(-((seconds - .11) / .022) ** 2)
            start = round(t * sr)
            audio[start:start + len(seconds)] += .45 * envelope * np.sin(2 * np.pi * 260 * seconds)
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'vocals.wav'
            sf.write(path, audio, sr)
            notes, _ = analyze_stem(path, 'vocals')
        detected = [note['time'] for note in notes]
        self.assertGreaterEqual(sum(any(abs(n - t) < .1 for n in detected) for t in times), 6)
        self.assertLessEqual(len(detected), len(times) + 3, detected)
        self.assertFalse(any(1.75 < n < 2.65 for n in detected))

    def test_only_sustained_vocal_becomes_hold(self):
        sr = 22050
        audio = np.zeros(sr * 5, dtype=np.float32)
        for start, length, held in ((.5, 1.7, True), (3, 1.5, False)):
            seconds = np.arange(round(length * sr)) / sr
            envelope = (1 - np.exp(-seconds / .025)) * (
                .8 if held else np.exp(-seconds / .13)
            )
            tone = .6 * envelope * np.sin(2 * np.pi * 330 * seconds)
            position = round(start * sr)
            audio[position:position + len(tone)] = tone
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "vocals.wav"
            sf.write(path, audio, sr)
            notes, _ = analyze_stem(path, "vocals")
        held = min(notes, key=lambda note: abs(note["time"] - .5))
        decay = min(notes, key=lambda note: abs(note["time"] - 3))
        self.assertGreater(held["duration"], 1.3)
        self.assertEqual(decay["duration"], 0)

    def test_quiet_and_regular_melodic_attacks_reach_expert(self):
        sr = 22050
        times = np.arange(.5, 8.5, .35)
        audio = np.zeros(sr * 9, dtype=np.float32)
        for number, t in enumerate(times):
            start = round(t * sr)
            seconds = np.arange(round(.31 * sr)) / sr
            frequency = 220 * 2 ** ((number % 7) / 12)
            envelope = (1 - np.exp(-seconds / .035)) * np.exp(-seconds / .19)
            amplitude = .055 if number % 4 == 0 else .2
            tone = np.sin(2 * np.pi * frequency * seconds) + .3 * np.sin(4 * np.pi * frequency * seconds)
            audio[start:start + len(seconds)] += amplitude * envelope * tone

        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "other.wav"
            sf.write(path, audio, sr)
            notes, _ = analyze_stem(path, "melody")
        detected = np.array([note["time"] for note in notes])
        hits = sum(np.any(np.abs(detected - t) < .095) for t in times)
        self.assertGreaterEqual(hits, 20)
        self.assertLessEqual(len(notes), len(times) + 3)


if __name__ == "__main__":
    unittest.main()
