"""Check timing and coverage on repeatable audio, including quiet piano notes."""

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stem_chart import analyze_stem


class StemChartTest(unittest.TestCase):
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
