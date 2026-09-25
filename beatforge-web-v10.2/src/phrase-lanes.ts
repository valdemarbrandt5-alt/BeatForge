/** Keep recurring rhythmic phrases under the same fingers while using the full keyboard. */
export function assignPhraseLanes<T extends { time: number; lane: number }>(notes: T[], laneCount: number): T[] {
  if (laneCount < 2 || !notes.length) return notes;
  const count = Math.min(5, laneCount);
  const phraseLength = 5;
  const assigned: number[] = [];
  const signatures = new Map<string, number[]>();
  let registeredThrough = -1;
  const gaps = (start: number) => Array.from({ length: phraseLength - 1 }, (_, offset) =>
    notes[start + offset + 1].time - notes[start + offset].time);
  const signature = (intervals: number[]) => {
    const average = intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length;
    return intervals.map(gap => Math.round(gap / average * 5)).join(':');
  };

  for (let i = 0; i < notes.length;) {
    // Register every completed window, even if its start did not line up with
    // a previous phrase. A chorus can begin at any note in the song.
    while (registeredThrough < i - phraseLength) {
      const start = ++registeredThrough;
      const previous = gaps(start);
      if (previous.every(gap => gap > .09 && gap < 1.5)) {
        const key = signature(previous);
        const starts = signatures.get(key) || [];
        starts.push(start);
        signatures.set(key, starts);
      }
    }

    if (i + phraseLength <= notes.length) {
      const current = gaps(i);
      if (current.every(gap => gap > .09 && gap < 1.5)) {
        const matches = signatures.get(signature(current)) || [];
        // Prefer a well distributed motif, then a recent example. This avoids
        // copying an accidental two-lane pattern throughout a steady song.
        const match = [...matches].reverse().find(start => {
          const earlier = gaps(start);
          return earlier.every((gap, index) =>
            Math.abs(gap - current[index]) <= Math.max(.055, Math.max(gap, current[index]) * .16)) &&
            new Set(assigned.slice(start, start + phraseLength)).size >= Math.min(3, count);
        });
        if (match !== undefined) {
          assigned.push(...assigned.slice(match, match + phraseLength));
          i += phraseLength;
          continue;
        }
      }
    }

    const recent = assigned.slice(-Math.max(10, count * 3));
    // Musical strength and absolute pitch never send notes to a particular
    // side. Usage is the main factor; the small hash only breaks ties.
    const jitter = (lane: number) => {
      let value = (Math.round(notes[i].time * 1000) ^ (i * 2654435761) ^ (lane * 2246822519)) >>> 0;
      value ^= value >>> 16;
      value = Math.imul(value, 2246822519);
      return ((value ^ (value >>> 13)) >>> 0) / 0xffffffff;
    };
    const candidates = Array.from({ length: count }, (_, lane) => lane);
    candidates.sort((a, b) => {
      const cost = (lane: number) => recent.filter(value => value === lane).length * 4 +
        assigned.filter(value => value === lane).length * .08 +
        (assigned.at(-1) === lane ? 2 : 0) + jitter(lane) * .5;
      return cost(a) - cost(b);
    });
    assigned.push(candidates[0]);
    i++;
  }
  return notes.map((note, index) => ({ ...note, lane: assigned[index] }));
}
