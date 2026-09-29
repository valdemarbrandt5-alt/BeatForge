"""Audio regressions for held vowels, expressive breaks, and separate syllables."""

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stem_chart import analyze_stem
from instant_chart import generate_instant_chart
from sustain import sustain_notes


def vowel(sr, seconds=1.6, expressive=False, vibrato=True):
    t = np.arange(round(seconds * sr)) / sr
    cents = 45 * np.sin(2 * np.pi * 5.2 * t) if vibrato else np.zeros_like(t)
    if expressive:
        cents += np.where(t >= .65, 200, 0) - np.where(t >= 1.25, 300, 0)
    frequency = 330 * 2 ** (cents / 1200)
    phase = 2 * np.pi * np.cumsum(frequency) / sr
    envelope = (1 - np.exp(-t / .025)) * (1 + .16 * np.sin(2 * np.pi * 4.7 * t))
    if expressive:
        envelope *= 1 - .65 * np.exp(-((t - .65) / .02) ** 2)
    return (.5 * envelope * (np.sin(phase) + .2 * np.sin(2 * phase))).astype(np.float32)


class SustainAudioTest(unittest.TestCase):
    def test_stable_new_pitch_hands_a_hold_to_the_next_lane(self):
        dt = .01
        frames = np.arange(250)
        envelope = np.where((frames >= 20) & (frames < 220), 1.0, 0.0)
        pitches = np.where(frames < 105, 330., 330. * 2 ** (320 / 1200))
        events = [(20, .2), (105, 1.05), (145, 1.45)]
        shaped = sustain_notes(events, envelope, dt, .6, pitches)
        holds = [(events[i][1], length) for i, length in shaped if length]
        self.assertEqual(len(holds), 2, shaped)
        self.assertGreater(holds[0][0] + holds[0][1], holds[1][0])
        self.assertGreater(holds[1][1], .9)

    def test_small_pitch_bend_stays_inside_one_hold(self):
        frames = np.arange(250)
        envelope = np.where((frames >= 20) & (frames < 220), 1.0, 0.0)
        pitches = np.where(frames < 105, 330., 330. * 2 ** (175 / 1200))
        shaped = sustain_notes([(20, .2), (105, 1.05)], envelope, .01, .6, pitches)
        self.assertEqual(sum(length > 0 for _, length in shaped), 1, shaped)

    def analyze(self, signal, sr, instrument='vocals', mix=False):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'voice.wav'
            sf.write(path, signal, sr)
            return generate_instant_chart(path)[0] if mix else analyze_stem(path, instrument)[0]

    def recording(self, sr, expressive=False):
        audio = np.zeros(sr * 4, dtype=np.float32)
        tone = vowel(sr, seconds=2.0 if expressive else 1.6, expressive=expressive)
        start = round(.5 * sr)
        audio[start:start + len(tone)] = tone
        return audio

    def test_vibrato_remains_one_long_note_across_sample_rates(self):
        for sr in (22050, 44100, 48000):
            for instrument in ('vocals', 'melody'):
                with self.subTest(sr=sr, instrument=instrument):
                    notes = self.analyze(self.recording(sr), sr, instrument)
                    holds = [note for note in notes if note['duration'] > 0]
                    self.assertEqual(len(holds), 1, notes)
                    self.assertGreater(holds[0]['duration'], 1.3, notes)
                    self.assertLessEqual(len(notes), 2, notes)

    def test_small_break_is_a_tap_and_lasting_new_pitch_hands_off_the_hold(self):
        for sr in (22050, 44100):
            with self.subTest(sr=sr):
                notes = self.analyze(self.recording(sr, expressive=True), sr)
                holds = [note for note in notes if note['duration']]
                self.assertEqual(len(holds), 2, notes)
                held, next_hold = holds
                self.assertGreater(held['duration'], 1.1, notes)
                self.assertGreater(next_hold['duration'], .68, notes)
                self.assertGreater(held['time'] + held['duration'], next_hold['time'], notes)
                taps = [note for note in notes if not note['duration'] and held['time'] < note['time'] < held['time'] + held['duration']]
                self.assertTrue(any(abs(note['time'] - 1.15) < .16 for note in taps), notes)
                self.assertLessEqual(len(taps), 3, notes)

    def test_quiet_vocal_break_does_not_end_the_hold_at_the_next_attack(self):
        sr = 22050
        audio = np.zeros(sr * 4, dtype=np.float32)
        tone = vowel(sr, seconds=2.0, expressive=True)
        t = np.arange(len(tone)) / sr
        for center in (.42, .98, 1.48):
            tone *= (1 - .96 * np.exp(-((t - center) / .045) ** 8)).astype(np.float32)
        start = round(.5 * sr)
        audio[start:start + len(tone)] = tone
        notes = self.analyze(audio, sr)
        self.assertTrue(any(n['duration'] > 1.7 for n in notes), notes)

    def test_a_breath_separates_two_long_syllables(self):
        sr = 44100
        audio = np.zeros(sr * 4, dtype=np.float32)
        for start in (.5, 1.8):
            tone = vowel(sr, seconds=.9)
            position = round(start * sr)
            audio[position:position + len(tone)] = tone
        notes = self.analyze(audio, sr)
        holds = [note for note in notes if note['duration']]
        self.assertEqual(len(holds), 2, notes)
        self.assertLess(holds[0]['time'] + holds[0]['duration'], 1.5, notes)
        self.assertGreater(holds[1]['time'], 1.7, notes)

    def test_full_mix_retains_a_real_hold_even_in_a_sparse_chart(self):
        sr = 44100
        notes = self.analyze(self.recording(sr), sr, mix=True)
        self.assertTrue(any(note['duration'] > 1.3 for note in notes), notes)
        self.assertLessEqual(len(notes), 3, notes)

    def test_drums_never_turn_into_holds(self):
        sr = 22050
        notes = self.analyze(self.recording(sr), sr, instrument='drums')
        self.assertTrue(notes)
        self.assertTrue(all(note['duration'] == 0 for note in notes))


if __name__ == '__main__':
    unittest.main()
