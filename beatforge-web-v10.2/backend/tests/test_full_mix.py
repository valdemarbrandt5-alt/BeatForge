"""Check that Full Mix combines musical phrases without layering every stem."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from instant_chart import compose_full_mix


class FullMixTest(unittest.TestCase):
    def test_uses_vocal_hold_and_piano_then_drums_in_a_pause(self):
        def notes(times, duration=0):
            return [{"time": time, "lane": index % 5, "duration": duration}
                    for index, time in enumerate(times)]

        charts = {
            "vocals": (notes([.5], 1.1), 4.),
            "melody": (notes([.53, 1., 1.5, 2.2, 2.6]), 4.),
            "drums": (notes([.52, .75, 1., 1.25, 1.5, 1.75, 2., 2.25, 2.5, 2.75, 3.2]), 4.),
            "bass": (notes([.5, 1., 1.5, 2., 2.5, 3.]), 4.),
        }
        mix, duration = compose_full_mix(charts)
        self.assertEqual(duration, 4.)
        self.assertTrue(any(abs(n["time"] - .5) < .01 and n["duration"] == 1.1 for n in mix))
        self.assertTrue(any(abs(n["time"] - 2.6) < .01 for n in mix))
        self.assertTrue(any(abs(n["time"] - 3.2) < .01 for n in mix))
        self.assertLess(len(mix), sum(len(part[0]) for part in charts.values()))
        hold = next(n for n in mix if abs(n["time"] - .5) < .01)
        self.assertTrue(all(n["lane"] != hold["lane"] for n in mix
                            if hold["time"] < n["time"] < hold["time"] + hold["duration"]))

    def test_dense_instruments_stay_playable(self):
        times = [round(.1 * index, 2) for index in range(35)]
        chart = ([{"time": time, "lane": index % 5, "duration": 0}
                  for index, time in enumerate(times)], 4.)
        mix, _ = compose_full_mix({name: chart for name in ("vocals", "melody", "drums", "bass")})
        self.assertTrue(all(right["time"] - left["time"] >= .105
                            for left, right in zip(mix, mix[1:])))
        self.assertLessEqual(len(mix), 20)


if __name__ == "__main__":
    unittest.main()
