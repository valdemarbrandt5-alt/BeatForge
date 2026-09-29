import assert from 'node:assert/strict';
import test from 'node:test';
import { competitionPoints } from './competitive-score.ts';

const multiplier = combo => combo >= 50 ? 5 : combo >= 30 ? 4 : combo >= 20 ? 3 : combo >= 10 ? 2 : 1;

test('combo multipliers add ranked points beyond the old 100,000 limit', () => {
  const comboBonus = Array.from({ length: 100 }, (_, index) => multiplier(index + 1) - 1)
    .reduce((sum, value) => sum + value, 0);
  const input = { notes: 100, perfect: 100, great: 0, good: 0, miss: 0, maxCombo: 100, difficulty: 'Expert' };
  assert.equal(competitionPoints({ ...input, comboBonus: 0 }), 100000);
  assert.equal(competitionPoints({ ...input, comboBonus }), 136750);
});

test('hitting more notes at x5 raises the score even at identical accuracy and max combo', () => {
  const input = { notes: 100, perfect: 90, great: 0, good: 0, miss: 10, maxCombo: 50, difficulty: 'Expert' };
  const low = competitionPoints({ ...input, comboBonus: 25 });
  const high = competitionPoints({ ...input, comboBonus: 125 });
  assert.equal(high - low, 12500);
});

test('difficulty scaling and the 150,000 ceiling still hold', () => {
  const input = { notes: 100, perfect: 100, great: 0, good: 0, miss: 0, maxCombo: 100, comboBonus: 400 };
  assert.equal(competitionPoints({ ...input, difficulty: 'Expert' }), 150000);
  assert.equal(competitionPoints({ ...input, difficulty: 'Medium' }), 132000);
});
