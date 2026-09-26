import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse.js';
import { serialize } from '../src/serialize.js';
import { sequentialIdFactory } from '../src/ids.js';
import type { Measure } from '../src/score.js';

function read(lines: string[]) {
  const result = parse(lines.join('\n'), { idFactory: sequentialIdFactory('n') });
  return {
    errors: result.errors.map((error) => error.message),
    measure: (): Measure | undefined => result.score.sections[0]?.measures[0],
    breaks: (): readonly number[] => result.score.sections[0]?.measures[0]?.groupBreaks ?? [],
    text: serialize(result.score).text,
  };
}

const SEPARATOR = 'separated by ":" inside a group and "|" between groups';

describe('the beats of a measure', () => {
  it('are separated one by one with a colon', () => {
    const result = read(['|', 'S: d : r : m : f']);
    expect(result.errors).toHaveLength(0);
    expect(result.measure()?.beats).toHaveLength(4);
    expect(result.breaks()).toEqual([]);
  });

  it('refuse two beats written next to each other', () => {
    const result = read(['|', 'S: d r m f']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(SEPARATOR);
  });

  it('refuse a missing separator in the middle of a bar', () => {
    expect(read(['|', 'S: d : r m : f']).errors[0]).toContain(SEPARATOR);
    expect(read(['|', 'S: d r : m : f']).errors[0]).toContain(SEPARATOR);
  });

  it('accept a group break written as a pipe', () => {
    const result = read(['|', 'S: d : r | m : f']);
    expect(result.errors).toHaveLength(0);
    expect(result.measure()?.beats).toHaveLength(4);
  });

  it('open a group on every beat written after a pipe', () => {
    const result = read(['|', 'S: d : r | m | f : s']);
    expect(result.errors).toHaveLength(0);
    expect(result.breaks()).toEqual([2, 3]);
  });

  it('mark the first beat of a measure as a group only when it follows a pipe', () => {
    expect(read(['|', 'S: d : r : m']).breaks()).toEqual([]);
    expect(read(['|1:', 'S: d | r : m']).breaks()).toEqual([1]);
  });

  it('accept several groups in one measure', () => {
    const result = read(['|', 'S: d | r | m | f']);
    expect(result.errors).toHaveLength(0);
    expect(result.measure()?.beats).toHaveLength(4);
    expect(result.breaks()).toEqual([1, 2, 3]);
  });
});

describe('the voices of a measure', () => {
  it('group their beats the same way', () => {
    const result = read(['|', 'S: d : r | m : f', 'A: r : m | f : s']);
    expect(result.errors).toHaveLength(0);
  });

  it('refuse two voices that group differently', () => {
    const result = read(['|', 'S: d : r | m : f', 'A: r : m : f : s']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('same way');
  });

  it('compare the groups of a whole measure, not of a single line', () => {
    const result = read(['|', 'S: d | r', 'A: r | m', 'T: m : f', 'B: f : s']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('same way');
  });

  it('take the groups of the first line of the measure', () => {
    expect(read(['|', 'A: r : m | f : s', 'S: d : r | m : f']).breaks()).toEqual([2]);
  });
});

describe('the syllables', () => {
  it('follow the same separators as the notes', () => {
    const result = read(['|', 'S: d : r : m : f', 'P: la : li : mi : fa']);
    expect(result.errors).toHaveLength(0);
  });

  it('refuse two syllables written next to each other', () => {
    expect(read(['|', 'S: d : r : m : f', 'P: la li mi fa']).errors[0]).toContain(SEPARATOR);
  });

  it('still count a group break as one time', () => {
    const result = read(['|', 'S: d : r | m : f', 'P: la : li | mi : fa']);
    expect(result.errors).toHaveLength(0);
    expect(result.measure()?.beats).toHaveLength(4);
  });
});

describe('writing a measure back', () => {
  it('puts a colon between the beats and a pipe before each group', () => {
    const result = read(['|', 'S: d : r | m | f : s', 'P: la : li | mi | fa : sol']);
    expect(result.errors).toHaveLength(0);
    expect(result.text).toContain('S: d : r | m | f : s');
    expect(result.text).toContain('P: la : li | mi | fa : sol');
  });

  it('writes a single space around the separators', () => {
    const result = read(['|', 'S: d : r | m : f', 'P: la : li | mi : fa']);
    expect(result.text).not.toMatch(/  /);
  });

  it('keeps the groups through a round trip', () => {
    const first = read(['|', 'S: d : r | m : f', 'A: r : m | f : s']);
    const again = parse(first.text, { idFactory: sequentialIdFactory('n') });
    expect(again.errors).toHaveLength(0);
    expect(again.score.sections[0]?.measures[0]?.groupBreaks).toEqual([2]);
  });

  it('opens every measure on its own line', () => {
    const result = read(['|1:', 'S: d : r', '|2:', 'S: m : f']);
    expect(result.text).toBe(['|1:', 'S: d : r', '|2:', 'S: m : f', ''].join('\n'));
  });
});
