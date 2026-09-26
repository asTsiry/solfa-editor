import { describe, expect, it } from 'vitest';
import { SolfaDocument } from '../src/document.js';
import {
  DEFAULT_TIME_SIGNATURE,
  isTimeSignature,
  normalizeTimeSignature,
  parseTimeSignature,
} from '../src/meter.js';
import { parse } from '../src/parse.js';
import { serialize } from '../src/serialize.js';
import { layout, DEFAULT_LAYOUT, type LaidOutScore, type DisplayGlyph } from '../src/layout.js';
import { sequentialIdFactory } from '../src/ids.js';

function keyLines(laid: LaidOutScore): string[] {
  return (laid.items as readonly DisplayGlyph[])
    .filter((item) => item.kind === 'glyph' && item.role === 'key-line')
    .map((item) => item.code);
}

function keyLineOf(text: string): string {
  const { score } = parse(text);
  return keyLines(layout(score, [], DEFAULT_LAYOUT))[0] ?? '';
}

describe('the time signature', () => {
  it('reads the usual signatures and the two cut time forms', () => {
    expect(parseTimeSignature('4/4')).toEqual({ beats: 4, unit: 4 });
    expect(parseTimeSignature('7/8')).toEqual({ beats: 7, unit: 8 });
    expect(parseTimeSignature('C')).toEqual({ beats: 4, unit: 4 });
    expect(parseTimeSignature('C|')).toEqual({ beats: 2, unit: 2 });
  });

  it('rejects anything that is not a signature', () => {
    for (const raw of ['', '4', '4/', '/4', 'a/b', '0/4', '4/0', '33/4', '4/33', '4-4']) {
      expect(parseTimeSignature(raw), raw).toBeNull();
      expect(isTimeSignature(raw), raw).toBe(false);
    }
  });

  it('falls back to 4/4 so the key line is never empty', () => {
    expect(normalizeTimeSignature('7/8')).toBe('7/8');
    expect(normalizeTimeSignature(' 6/8 ')).toBe('6/8');
    expect(normalizeTimeSignature('nope')).toBe(DEFAULT_TIME_SIGNATURE);
  });

  it('defaults to 4/4 and reads the :time directive', () => {
    expect(parse('|').score.timeSignature).toBe(DEFAULT_TIME_SIGNATURE);
    expect(parse(':time=3/4\n|').score.timeSignature).toBe('3/4');
    expect(parse(':meter=6/8\n|').score.timeSignature).toBe('6/8');
  });

  it('reports an unreadable signature', () => {
    const { errors } = parse(':time=nope\n|');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('nope');
  });

  it('writes the signature only when it is not the default', () => {
    expect(serialize(parse('|').score).text).not.toContain(':time');
    expect(serialize(parse(':time=3/4\n|').score).text).toContain(':time=3/4');
  });

  it('is changed by a command and can be undone', () => {
    const doc = new SolfaDocument('|');
    doc.dispatch({ type: 'time/set', value: '7/8' });
    expect(doc.getState().score.timeSignature).toBe('7/8');
    expect(doc.getState().text).toContain(':time=7/8');

    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().score.timeSignature).toBe(DEFAULT_TIME_SIGNATURE);
    expect(doc.getState().text).not.toContain(':time');

    doc.dispatch({ type: 'history/redo' });
    expect(doc.getState().score.timeSignature).toBe('7/8');
  });

  it('keeps the first signature when the command repeats it', () => {
    const doc = new SolfaDocument(':time=3/4\n|');
    const before = doc.getState();
    doc.dispatch({ type: 'time/set', value: '3/4' });
    expect(doc.getState()).toBe(before);
  });

  it('falls back to 4/4 when the command gets something unreadable', () => {
    const doc = new SolfaDocument(':time=3/4\n|');
    doc.dispatch({ type: 'time/set', value: 'nope' });
    expect(doc.getState().score.timeSignature).toBe(DEFAULT_TIME_SIGNATURE);
  });

  it('engraves the tonic and the signature under the title', () => {
    const { score } = parse(':do=C\n:time=3/4\n|');
    const laid = layout(score, [], DEFAULT_LAYOUT);
    expect(keyLines(laid)).toEqual(['Do nat C, 3/4']);
  });

  it('engraves the line even without a title', () => {
    const { score } = parse(':do=F#\n:time=2/2\n|');
    const laid = layout(score, [], DEFAULT_LAYOUT);
    expect(keyLines(laid)).toEqual(['Fa dia F#, 2/2']);
  });

  it('takes the tonic of the first section', () => {
    const { score, errors } = parse(
      [':do=C', '|', 'S: d : r', ':do=Bb', '|', 'S: m : f'].join('\n'),
      { idFactory: sequentialIdFactory('n') },
    );
    expect(errors).toHaveLength(0);
    expect(score.sections.map((section) => section.key.doLetter)).toEqual(['C', 'B']);
    expect(keyLines(layout(score, [], DEFAULT_LAYOUT))).toEqual(['Do nat C, 4/4']);
  });
});

describe('the tonic of the key line', () => {
  it('always spells the alteration out', () => {
    expect(keyLineOf(':do=C\n|')).toBe('Do nat C, 4/4');
    expect(keyLineOf(':do=F#\n|')).toBe('Fa dia F#, 4/4');
    expect(keyLineOf(':do=Bb\n|')).toBe('Si bem Bb, 4/4');
    expect(keyLineOf(':do=F\n|')).toBe('Fa nat F, 4/4');
  });
});
