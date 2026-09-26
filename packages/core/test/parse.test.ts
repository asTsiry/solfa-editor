import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../src/ids.js';
import { parse } from '../src/parse.js';
import { serialize } from '../src/serialize.js';
import { notesInSection, notesOf, type Note, type Score } from '../src/score.js';
import { spellNote, spellToString } from '../src/pitch.js';

function stable(text: string) {
  return parse(text, { idFactory: sequentialIdFactory('n') });
}

function isNoteList(source: Score | readonly Note[]): source is readonly Note[] {
  return Array.isArray(source);
}

function shape(source: Score | readonly Note[]): { degree: number; accidental: number; pulses: number }[] {
  const notes = isNoteList(source) ? source : notesOf(source);
  return notes.map((note) => ({
    degree: note.degree,
    accidental: note.accidental,
    pulses: note.pulses,
  }));
}

describe('parse', () => {
  it('parses a bare run of solfa letters', () => {
    const { score, errors } = stable('|d r m f s l t');
    expect(errors).toHaveLength(0);
    expect(notesOf(score)).toHaveLength(7);
    expect(shape(score).map((n) => n.degree)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('defaults every note to a crotchet', () => {
    const { score } = stable('|d r');
    expect(notesOf(score).map((n) => n.pulses)).toEqual([2, 2]);
  });

  it('reads pulse marks', () => {
    const { score, errors } = stable('|d ! - r, m ! .');
    expect(errors).toHaveLength(0);
    expect(notesOf(score).map((n) => n.pulses)).toEqual([4, 1, 3]);
  });

  it('tolerates spaces between pulse marks but not before a half pulse', () => {
    const spaced = stable("|d' ! - -");
    expect(spaced.errors).toHaveLength(0);
    expect(notesOf(spaced.score)[0]?.pulses).toBe(6);
    const ambiguous = stable('|d ,r');
    expect(notesOf(ambiguous.score).map((n) => n.degree)).toEqual([0, -6]);
  });

  it('treats a leading comma as an octave mark and a trailing one as a half pulse', () => {
    const { score } = stable('|,d d,');
    const notes = notesOf(score);
    expect(notes[0]?.degree).toBe(-7);
    expect(notes[1]?.pulses).toBe(1);
  });

  it('accepts octave marks on either side of the letter', () => {
    const { score } = stable("|d' ,d ,d'");
    expect(notesOf(score).map((n) => n.degree)).toEqual([7, -7, 0]);
  });

  it('reads per note accidentals', () => {
    const { score, errors } = stable('|d r# mb');
    expect(errors).toHaveLength(0);
    expect(notesOf(score).map((n) => n.accidental)).toEqual([0, 1, -1]);
  });

  it('splits on bar lines and ignores empty measures', () => {
    const { score } = stable('|d r | | |m f');
    expect(score.sections[0]?.measures).toHaveLength(2);
    expect(shape(score.sections[0]?.measures[0]?.notes ?? [])).toHaveLength(2);
  });

  it('reads key and mode directives', () => {
    const { score } = stable(':do=F\n:mode=minor\n|d r m');
    expect(score.sections[0]?.key).toEqual({ doPitch: 65, doLetter: 'F', mode: 'minor' });
  });

  it('reads a section header as a modulation', () => {
    const { score } = stable('|d r |f: f s l');
    expect(score.sections).toHaveLength(2);
    expect(score.sections[0]?.key.doPitch).toBe(60);
    expect(score.sections[1]?.key).toEqual({ doPitch: 65, doLetter: 'F', mode: 'major' });
  });

  it('reads |m: as do equals d in minor', () => {
    const { score } = stable('|m: d r m');
    expect(score.sections[0]?.key).toEqual({ doPitch: 60, doLetter: 'C', mode: 'minor' });
  });

  it('reads |r:m as do equals r in minor', () => {
    const { score, errors } = stable('|r:m d r m');
    expect(errors).toHaveLength(0);
    expect(score.sections[0]?.key).toEqual({ doPitch: 62, doLetter: 'D', mode: 'minor' });
    expect(notesOf(score)).toHaveLength(3);
  });

  it('starts a new section when a directive changes key mid score', () => {
    const { score } = stable('|d r | :do=E |f s');
    expect(score.sections).toHaveLength(2);
    expect(score.sections[1]?.key.doPitch).toBe(64);
  });

  it('skips line comments', () => {
    const { score, errors } = stable('// a comment\n|d r // trailing\n| m');
    expect(errors).toHaveLength(0);
    expect(notesOf(score)).toHaveLength(3);
  });

  it('reports errors without losing the rest of the score', () => {
    const { score, errors } = stable('|d % r m');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('%');
    expect(notesOf(score)).toHaveLength(3);
  });

  it('rejects a duration that does not start with a pulse mark', () => {
    const { errors } = stable('|d - r');
    expect(errors[0]?.message).toContain('must begin with');
  });

  it('rejects holding a half pulse note', () => {
    const { errors } = stable('|d,-');
    expect(errors[0]?.message).toContain('cannot be held');
  });

  it('always produces a score, even for empty input', () => {
    const { score, errors } = stable('');
    expect(errors).toHaveLength(0);
    expect(score.sections).toHaveLength(1);
    expect(score.sections[0]?.measures).toHaveLength(0);
  });
});

describe('absolute pitch', () => {
  it('resolves a major scale from do', () => {
    const { score } = stable(':do=C\n|d r m f s l t');
    const key = score.sections[0]!.key;
    const names = notesOf(score).map((note) => spellToString(spellNote(key, note)));
    expect(names).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
  });

  it('resolves a natural minor scale from do', () => {
    const { score } = stable(':do=A\n:mode=minor\n|d r m f s l t');
    const key = score.sections[0]!.key;
    const names = notesOf(score).map((note) => spellToString(spellNote(key, note)));
    expect(names).toEqual(['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
  });

  it('follows the key across a modulation', () => {
    const { score } = stable('|d r |f: f s l');
    const [first, second] = score.sections;
    if (!first || !second) throw new Error('expected two sections');
    const firstNames = notesInSection(first).map((note) =>
      spellToString(spellNote(first.key, note)),
    );
    const secondNames = notesInSection(second).map((note) =>
      spellToString(spellNote(second.key, note)),
    );
    expect(firstNames).toEqual(['C4', 'D4']);
    expect(secondNames).toEqual(['Bb4', 'C5', 'D5']);
  });
});

describe('round trip', () => {
  const cases: string[] = [
    '',
    '|d r m f s l t',
    "|d' r' m' f' s' l' t'",
    '|d ! - r, m ! .',
    ':do=F\n:mode=minor\n|d r m f s l t',
    '|d r m |f s l |d r',
    '|m: d r m',
    ':do=C#\n|d r',
    "|,d d' ,d' d ,d",
    '|d# rb m',
  ];

  for (const input of cases) {
    it(`is stable for ${JSON.stringify(input)}`, () => {
      const first = parse(input, { idFactory: sequentialIdFactory('n') });
      expect(first.errors).toHaveLength(0);
      const once = serialize(first.score).text;
      const second = parse(once, { idFactory: sequentialIdFactory('n') });
      const twice = serialize(second.score).text;
      expect(twice).toBe(once);
      expect(shape(second.score)).toEqual(shape(first.score));
      expect(second.score.sections.map((s) => s.key)).toEqual(
        first.score.sections.map((s) => s.key),
      );
    });
  }

  it('produces canonical text from a score', () => {
    const { score } = stable(':do=A\n:mode=minor\n|d r m');
    expect(serialize(score).text).toBe(':do=A\n:mode=minor\n|d r m\n');
  });

  it('emits a header for every section after the first', () => {
    const { score } = stable('|d r |f: f s |d: d r');
    const text = serialize(score).text;
    expect(text).toBe('|d r\n|f:\n|f s\n|d:\n|d r\n');
    const reparsed = parse(text, { idFactory: sequentialIdFactory('n') });
    expect(reparsed.score.sections).toHaveLength(3);
  });
});

describe('spans', () => {
  it('points at the source text of each note', () => {
    const text = '|d r m';
    const { spans, score } = stable(text);
    const notes = notesOf(score);
    expect(spans).toHaveLength(3);
    for (const [index, span] of spans.entries()) {
      const note = notes[index];
      expect(span.noteId).toBe(note?.id);
      expect(span.to).toBeGreaterThan(span.from);
    }
    expect(text.slice(spans[0]!.from, spans[0]!.to)).toBe('d');
    expect(text.slice(spans[1]!.from, spans[1]!.to)).toBe('r');
  });

  it('covers a full note including duration marks', () => {
    const text = '|d ! - r';
    const { spans } = stable(text);
    expect(text.slice(spans[0]!.from, spans[0]!.to)).toBe('d ! -');
  });

  it('stays accurate after a canvas style edit', () => {
    const text = '|d r m';
    const { score, spans } = stable(text);
    const withPulse: Score = {
      ...score,
      sections: score.sections.map((section) => ({
        ...section,
        measures: section.measures.map((measure) => ({
          ...measure,
          notes: measure.notes.map((note, index) =>
            index === 1 ? { ...note, pulses: 4 } : note,
          ),
        })),
      })),
    };
    const result = serialize(withPulse);
    expect(result.text).toBe('|d r!- m\n');
    expect(result.text.slice(result.spans[1]!.from, result.spans[1]!.to)).toBe('r!-');
    expect(result.spans.map((s) => s.noteId)).toEqual(spans.map((s) => s.noteId));
  });
});
