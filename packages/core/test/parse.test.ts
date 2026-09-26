import { describe, expect, it } from 'vitest';
import { sequentialIdFactory } from '../src/ids.js';
import { parse } from '../src/parse.js';
import { describeVoiceNote, serialize } from '../src/serialize.js';
import { DEFAULT_PARTS, voiceNotesOf, type PartId, type Score } from '../src/score.js';
import { spellNote, spellToString } from '../src/pitch.js';

function stable(text: string) {
  return parse(text, { idFactory: sequentialIdFactory('n') });
}

function degreesOf(score: Score, partId: PartId = 'soprano'): (number | null)[] {
  const index = score.parts.findIndex((part) => part.id === partId);
  const out: (number | null)[] = [];
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const beat of measure.beats) {
        const note = beat.notes[index];
        out.push(note ? note.degree : null);
      }
    }
  }
  return out;
}

function pulseOf(score: Score): number[] {
  const out: number[] = [];
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const beat of measure.beats) out.push(beat.pulses);
    }
  }
  return out;
}

function lyricsOf(score: Score): (string | null)[] {
  const out: (string | null)[] = [];
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const beat of measure.beats) out.push(beat.lyric);
    }
  }
  return out;
}

describe('parse: single voice', () => {
  it('parses a bare run of solfa letters into the first voice', () => {
    const { score, errors } = stable('|d r m f s l t');
    expect(errors).toHaveLength(0);
    expect(degreesOf(score)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(score.parts).toEqual(DEFAULT_PARTS);
  });

  it('defaults every note to a crotchet', () => {
    expect(pulseOf(stable('|d r').score)).toEqual([2, 2]);
  });

  it('reads pulse marks', () => {
    const { score, errors } = stable('|d ! - r, m ! .');
    expect(errors).toHaveLength(0);
    expect(pulseOf(score)).toEqual([4, 1, 3]);
  });

  it('tolerates spaces between pulse marks but not before a half pulse', () => {
    expect(pulseOf(stable("|d' ! - -").score)).toEqual([6]);
    expect(degreesOf(stable('|d ,r').score)).toEqual([0, -6]);
  });

  it('treats a leading comma as an octave mark and a trailing one as a half pulse', () => {
    const { score } = stable('|,d d,');
    expect(degreesOf(score)).toEqual([-7, 0]);
    expect(pulseOf(score)).toEqual([2, 1]);
  });

  it('accepts octave marks on either side of the letter', () => {
    expect(degreesOf(stable("|d' ,d ,d'").score)).toEqual([7, -7, 0]);
  });

  it('reads per note accidentals', () => {
    const { score, errors } = stable('|d r# mb');
    expect(errors).toHaveLength(0);
    expect(voiceNotesOf(score).map((note) => note.accidental)).toEqual([0, 1, -1]);
  });

  it('splits on bar lines and ignores empty measures', () => {
    const { score } = stable('|d r | | |m f');
    expect(score.sections[0]?.measures).toHaveLength(2);
    expect(degreesOf(score)).toEqual([0, 1, 2, 3]);
  });

  it('reports unknown directives with the surrounding text', () => {
    const { errors } = stable(':bogus=1\n|d r');
    expect(errors[0]?.message).toContain('Unknown directive ":bogus"');
  });
});

describe('parse: choir voices', () => {
  it('parses one line per voice', () => {
    const { score, errors } = stable(
      ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t'].join('\n'),
    );
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'soprano')).toEqual([0, 1, 2, 3]);
    expect(degreesOf(score, 'alto')).toEqual([1, 2, 3, 4]);
    expect(degreesOf(score, 'tenor')).toEqual([2, 3, 4, 5]);
    expect(degreesOf(score, 'bass')).toEqual([3, 4, 5, 6]);
  });

  it('accepts a full part name as the label', () => {
    const { score, errors } = stable(['|', 'Soprano: d r', 'Bass: f s'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'soprano')).toEqual([0, 1]);
    expect(degreesOf(score, 'bass')).toEqual([3, 4]);
  });

  it('shares one rhythm, taken from the first line', () => {
    const { score, errors } = stable(['|', 'S: d! - r, m', 'A: r m f'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(pulseOf(score)).toEqual([4, 1, 2]);
  });

  it('rejects duration marks on a line other than the first', () => {
    const { errors } = stable(['|', 'S: d r', 'A: r! m'].join('\n'));
    expect(errors[0]?.message).toContain('shares one rhythm');
  });

  it('rejects an unknown voice name and lists the declared parts', () => {
    const { errors } = stable(['|', 'Z: d r'].join('\n'));
    expect(errors[0]?.message).toContain('Unknown voice "Z"');
    expect(errors[0]?.message).toContain('Soprano (S)');
  });

  it('asks for a bar line before voice lines', () => {
    const { errors } = stable('S: d r m f');
    expect(errors[0]?.message).toContain('barline');
  });

  it('lets a voice drop out, leaving a rest', () => {
    const { score, errors } = stable(['|', 'S: d r m f', 'A: r m'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'alto')).toEqual([1, 2, null, null]);
  });

  it('holds the previous note with ~', () => {
    const { score, errors } = stable(['|', 'S: d r ~ ~ f', 'A: r m f s'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'soprano')).toEqual([0, 1, 1, 1, 3]);
  });

  it('complains when ~ has nothing to hold', () => {
    const { errors } = stable(['|', 'S: ~ d r', 'A: r m f'].join('\n'));
    expect(errors[0]?.message).toContain('has not sung one yet');
  });

  it('rests a voice with 0 without disturbing the duration marks', () => {
    const { score, errors } = stable(['|', 'S: d! r, 0 f', 'A: r m f s'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'soprano')).toEqual([0, 1, null, 3]);
    expect(pulseOf(score)).toEqual([2, 1, 2, 2]);
  });

  it('reads octave marks per voice', () => {
    const { score } = stable(['|', "S: d' r' m'", "A: ,d ,r ,m'"].join('\n'));
    expect(degreesOf(score, 'soprano')).toEqual([7, 8, 9]);
    expect(degreesOf(score, 'alto')).toEqual([-7, -6, 2]);
  });
});

describe('parse: parts directive', () => {
  it('declares user defined parts with clefs', () => {
    const { score, errors } = stable(
      [':parts=Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass', '|', 'S: d r', 'B: f s'].join(
        '\n',
      ),
    );
    expect(errors).toHaveLength(0);
    expect(score.parts.map((part) => part.id)).toEqual(['soprano', 'alto', 'tenor', 'bass']);
    expect(score.parts[2]?.clef).toBe('treble8vb');
  });

  it('supports a different number of parts', () => {
    const { score, errors } = stable([':parts=Descant:D:treble,Pedal:P:bass', '|', 'D: d r', 'P: f s'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(score.parts).toHaveLength(2);
    expect(degreesOf(score, 'descant')).toEqual([0, 1]);
    expect(degreesOf(score, 'pedal')).toEqual([3, 4]);
  });

  it('slugifies names that are not plain ascii', () => {
    const { score, errors } = stable([':parts=Chœur:C:treble,Basse:G:bass', '|', 'C: d', 'G: r'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(score.parts.map((part) => part.name)).toEqual(['Chœur', 'Basse']);
    expect(score.parts.map((part) => part.id)).toEqual(['ch-ur', 'basse']);
  });

  it('gives a declared part priority over a lyrics alias', () => {
    const { score, errors } = stable([':parts=Pedal:P:bass', '|', 'P: f s'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(degreesOf(score, 'pedal')).toEqual([3, 4]);
  });

  it('rejects a malformed parts list', () => {
    const { errors } = stable(':parts=Soprano\n|d r');
    expect(errors[0]?.message).toContain('":parts"');
  });

  it('rejects an unknown clef', () => {
    const { errors } = stable(':parts=Soprano:S:banjo\n|d r');
    expect(errors[0]?.message).toContain('":parts"');
  });
});

describe('parse: lyrics', () => {
  it('attaches one syllable per beat', () => {
    const { score, errors } = stable(
      ['|', 'S: d r m f', 'A: r m f s', 'P: Ave Ma ri a'].join('\n'),
    );
    expect(errors).toHaveLength(0);
    expect(lyricsOf(score)).toEqual(['Ave', 'Ma', 'ri', 'a']);
  });

  it('accepts paroles, lyrics and words as labels', () => {
    for (const label of ['P', 'Paroles', 'lyrics', 'words']) {
      const { score, errors } = stable(['|', 'S: d r', `${label}: la li`].join('\n'));
      expect(errors, label).toHaveLength(0);
      expect(lyricsOf(score), label).toEqual(['la', 'li']);
    }
  });

  it('skips a beat with _', () => {
    const { score, errors } = stable(['|', 'S: d r m f', 'P: la _ ri a'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(lyricsOf(score)).toEqual(['la', null, 'ri', 'a']);
  });

  it('treats an underscore glued to a syllable as its own beat', () => {
    const { score, errors } = stable(['|', 'S: d r m f', 'P: la_ri a'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(lyricsOf(score)).toEqual(['la', null, 'ri', 'a']);
  });

  it('counts each glued underscore as a separate skipped beat', () => {
    const { score, errors } = stable(['|', 'S: d r m f', 'P: la__ri'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(lyricsOf(score)).toEqual(['la', null, null, 'ri']);
  });

  it('complains when the syllable count does not match the beats', () => {
    const { errors } = stable(['|', 'S: d r m f', 'P: la li'].join('\n'));
    expect(errors[0]?.message).toContain('4 beats but the lyrics have 2 syllables');
  });

  it('never invents beats to absorb a long lyrics line', () => {
    const { score, errors } = stable(['|', 'S: d r m f', 'P: la li ri a fa'].join('\n'));
    expect(errors[0]?.message).toContain('4 beats but the lyrics have 5 syllables');
    expect(score.sections[0]?.measures[0]?.beats).toHaveLength(4);
    expect(lyricsOf(score)).toEqual(['la', 'li', 'ri', 'a']);
  });
});

describe('parse: sections', () => {
  it('reads a numbered section header', () => {
    const { score, errors } = stable([':do=C', '|1:', 'S: d r', '|2:', 'S: m f'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(score.sections).toHaveLength(2);
    expect(score.sections[1]?.key.doLetter).toBe('C');
  });

  it('keeps the key across a numbered section', () => {
    const { score, errors } = stable([':do=F', '|1:', 'S: d', '|2:', 'S: r'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(score.sections[1]?.key.doLetter).toBe('F');
  });

  it('still supports key changing section headers', () => {
    const { score, errors } = stable([':do=C', '|d:', 'S: d', '|m:', 'S: r'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(score.sections[0]?.key.mode).toBe('major');
    expect(score.sections[1]?.key.mode).toBe('minor');
  });

  it('reports a bad key directive', () => {
    const { errors } = stable(':do=H\n|d r');
    expect(errors[0]?.message).toContain('expects a pitch name');
  });

  it('reports a bad mode directive', () => {
    const { errors } = stable(':mode=dorian\n|d r');
    expect(errors[0]?.message).toContain('expects major or minor');
  });
});

describe('spans', () => {
  it('maps every sung note to its text', () => {
    const text = ['|', 'S: d r m f', 'A: r m f s'].join('\n');
    const { spans, score } = stable(text);
    expect(spans).toHaveLength(8);
    for (const span of spans) {
      expect(text.slice(span.from, span.to)).toMatch(/^[',]?[drmfslt][#b']*!?[-,.]*$/);
    }
    expect(voiceNotesOf(score)).toHaveLength(8);
  });

  it('gives every note a distinct id', () => {
    const { score } = stable(['|', 'S: d r m f', 'A: r m f s'].join('\n'));
    const ids = voiceNotesOf(score).map((note) => note.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('serialize', () => {
  it('round trips a choir score', () => {
    const source = [
      '// Ave Maria',
      ':do=C',
      ':parts=Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass',
      '|1:',
      'S: d! r m f',
      'A: r m f s',
      'T: m f s l',
      'B: f s l t',
      'P: Ave Ma ri a',
      '|',
      'S: d\' r\' m\' f\'',
      'A: m f s l',
      'T: s l t d\'',
      'B: l t d\' r\'',
      'P: ma ri a ben',
    ].join('\n');

    const first = parse(source);
    expect(first.errors).toHaveLength(0);

    const text = serialize(first.score).text;
    const second = parse(text);

    expect(second.errors).toHaveLength(0);
    expect(second.score.parts.map((part) => part.id)).toEqual(first.score.parts.map((part) => part.id));
    expect(lyricsOf(second.score)).toEqual(lyricsOf(first.score));
    expect(pulseOf(second.score)).toEqual(pulseOf(first.score));
    for (const part of first.score.parts) {
      expect(degreesOf(second.score, part.id), part.id).toEqual(degreesOf(first.score, part.id));
    }
  });

  it('is idempotent after one pass', () => {
    const { score } = stable([':do=F', '|1:', 'S: d! r', 'A: r m', 'B: f 0 t', 'P: Al le'].join('\n'));
    const once = serialize(score).text;
    const twice = serialize(parse(once).score).text;
    expect(twice).toBe(once);
  });

  it.each([
    [',', 1],
    ['', 2],
    ['!.', 3],
    ['!-', 4],
    ['!-.', 5],
    ['!--', 6],
    ['!--.', 7],
    ['!---', 8],
  ])('round trips the duration written as %j', (marks, pulses) => {
    const { score, errors } = stable(['|', `S: d${marks} r`].join('\n'));
    expect(errors, marks).toHaveLength(0);
    expect(pulseOf(score)).toEqual([pulses, 2]);

    const text = serialize(score).text;
    const again = parse(text);
    expect(again.errors, text).toHaveLength(0);
    expect(pulseOf(again.score), text).toEqual([pulses, 2]);
  });

  it('writes a silent first voice so the rhythm has a home', () => {
    const source = [':parts=Descant:D:treble,Chorus:C:treble', '|', 'D: 0!. 0', 'C: d r'].join('\n');
    const { score, errors } = stable(source);
    expect(errors).toHaveLength(0);
    const text = serialize(score).text;
    expect(text).toContain('D: 0!. 0');
    expect(text).toContain('C: d r');
    const again = parse(text);
    expect(again.errors).toHaveLength(0);
    expect(pulseOf(again.score)).toEqual([3, 2]);
  });

  it('keeps the rhythm on a silent first voice when the score is loaded back', () => {
    const { score } = stable(['|', 'S: d!. r', 'A: m f'].join('\n'));
    const again = parse(serialize(score).text);
    expect(again.errors).toHaveLength(0);
    expect(pulseOf(again.score)).toEqual([3, 2]);
  });

  it('writes a skip for every beat without a syllable', () => {
    const { score } = stable(['|', 'S: d r m f', 'P: Ave _ ri a'].join('\n'));
    const text = serialize(score).text;
    expect(text).toContain('P: Ave _ ri a');
    expect(lyricsOf(parse(text).score)).toEqual(['Ave', null, 'ri', 'a']);
  });

  it('pads trailing skipped beats so the syllable count still matches', () => {
    const { score } = stable(['|', 'S: d r m f', 'P: Ave Ma'].join('\n'));
    const text = serialize(score).text;
    expect(text).toContain('P: Ave Ma _ _');
    const again = parse(text);
    expect(again.errors).toHaveLength(0);
    expect(lyricsOf(again.score)).toEqual(['Ave', 'Ma', null, null]);
  });

  it('keeps the rhythm line explicit and abbreviates the others', () => {
    const { score } = stable(['|', 'S: d r r', 'A: r r 0'].join('\n'));
    const text = serialize(score).text;
    expect(text).toContain('S: d r r');
    expect(text).toContain('A: r ~ 0');
  });

  it('round trips holds and rests', () => {
    const { score } = stable(['|', 'S: d! r, f', 'A: r r 0'].join('\n'));
    const text = serialize(score).text;
    const again = parse(text);
    expect(again.errors).toHaveLength(0);
    expect(degreesOf(again.score, 'alto')).toEqual([1, 1, null]);
    expect(pulseOf(again.score)).toEqual([2, 1, 2]);
  });

  it('omits the parts directive for the default choir', () => {
    const { score } = stable(['|', 'S: d r'].join('\n'));
    expect(serialize(score).text).not.toContain(':parts=');
  });

  it('emits a parts directive for a custom choir', () => {
    const { score } = stable([':parts=Descant:D:treble,Pedal:P:bass', '|', 'D: d r', 'P: f s'].join('\n'));
    expect(serialize(score).text).toContain(':parts=Descant:D:treble,Pedal:P:bass');
  });

  it('keeps the section key out of the text when it is the default', () => {
    const { score } = stable(['|1:', 'S: d r'].join('\n'));
    expect(serialize(score).text).not.toContain(':do=');
  });

  it('describes a note with its voice and spelled pitch', () => {
    const { score } = stable([':do=F', '|1:', 'B: d l'].join('\n'));
    const bass = score.parts.find((part) => part.id === 'bass');
    const note = voiceNotesOf(score).at(-1);
    expect(note).toBeDefined();
    if (!note || !bass) return;
    const key = score.sections[0]!.key;
    expect(describeVoiceNote(score, bass, note)).toBe(
      `Bass: F major ${spellToString(spellNote(key, note))}`,
    );
  });
});
