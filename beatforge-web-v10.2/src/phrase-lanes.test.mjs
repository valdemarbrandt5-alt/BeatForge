import assert from 'node:assert/strict';
import test from 'node:test';
import { assignPhraseLanes } from './phrase-lanes.ts';

test('a recurring phrase uses the same fingers even after unrelated notes', () => {
  const first = [0, .31, .66, .88, 1.43];
  const filler = [2.2, 2.45, 2.74, 3.16, 3.58, 3.94, 4.19];
  const second = first.map(time => time + 8.13);
  const notes = [...first, ...filler, ...second].map((time, id) => ({ id, time, lane: id % 2 }));
  const result = assignPhraseLanes(notes, 5);
  assert.deepEqual(result.slice(0, 5).map(n => n.lane), result.slice(-5).map(n => n.lane));
  assert.equal(new Set(result.map(n => n.lane)).size, 5);
  assert.deepEqual(assignPhraseLanes(notes, 5), result);
  assert.deepEqual(notes.map(n => n.lane), notes.map((_, id) => id % 2));
});

test('steady Expert charts use all lanes without clustering on one side', () => {
  const notes = Array.from({ length: 240 }, (_, id) => ({ id, time: id * .32, lane: 0 }));
  for (const lanes of [3, 4, 5]) {
    const result = assignPhraseLanes(notes, lanes);
    for (let start = 0; start < notes.length; start += 20) {
      const segment = result.slice(start, start + 20).map(n => n.lane);
      assert.equal(new Set(segment).size, lanes);
      assert.ok(segment.filter(lane => lane < Math.floor(lanes / 2)).length < 15);
    }
  }
});

test('a changed rhythm gets a fresh pattern, rather than one fixed lane per pitch', () => {
  const times = [0, .3, .6, .9, 1.2, 2.5, 2.78, 3.4, 3.63, 4.4];
  const result = assignPhraseLanes(times.map((time, id) => ({ time, lane: 0, id })), 5);
  assert.equal(new Set(result.map(n => n.lane)).size, 5);
  assert.ok(result.every(n => n.lane >= 0 && n.lane < 5));
});
