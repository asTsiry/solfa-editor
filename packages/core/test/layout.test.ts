import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  hitTest,
  hitTestLyric,
  hitTestScore,
  layout,
  textBox,
  lyricGlyphOf,
  nearestNote,
  type DisplayGlyph,
  type LaidOutScore,
} from '../src/layout.js';
import { parse } from '../src/parse.js';
import { sequentialIdFactory } from '../src/ids.js';
import { DEFAULT_PARTS, voiceNotesOf } from '../src/score.js';

function build(text: string, options = {}) {
  const result = parse(text, { idFactory: sequentialIdFactory('n') });
  expect(result.errors).toHaveLength(0);
  const laid = layout(result.score, result.spans, { ...DEFAULT_LAYOUT, ...options });
  return { result, laid, notes: voiceNotesOf(result.score) };
}

function glyphs(laid: LaidOutScore, role: DisplayGlyph['role']): DisplayGlyph[] {
  return (laid.items as readonly DisplayGlyph[]).filter(
    (item) => item.kind === 'glyph' && item.role === role,
  );
}

function lines(laid: LaidOutScore, role: string) {
  return (laid.items as readonly { kind: string; role: string; y1: number; x1: number; x2: number }[])
    .filter((item) => item.kind === 'line' && item.role === role);
}

const CHOIR = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t'].join('\n');

describe('layout: single voice', () => {
  it('emits one letter glyph per note', () => {
    const { laid, notes } = build('|d r');
    expect(glyphs(laid, 'solfa-letter')).toHaveLength(notes.length);
  });

  it('emits a bar line on both sides of a measure', () => {
    const { laid } = build('|d r m');
    expect(lines(laid, 'barline')).toHaveLength(2);
  });

  it('renders pulse marks for durations', () => {
    const { laid } = build('|d ! -');
    expect(glyphs(laid, 'pulse-mark').map((item) => item.code)).toEqual(['!', '-']);
  });

  it('renders no pulse marks for a plain crotchet', () => {
    const { laid } = build('|d r');
    expect(glyphs(laid, 'pulse-mark')).toHaveLength(0);
  });

  it('draws octave dots above and below', () => {
    const { laid } = build("|d' ,d");
    const dots = glyphs(laid, 'octave-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0]!.y).toBeLessThan(dots[1]!.y);
  });

  it('draws an accidental glyph when a note is altered', () => {
    const { laid } = build('|r#');
    const accidentals = glyphs(laid, 'accidental');
    expect(accidentals).toHaveLength(1);
    expect(accidentals[0]?.code).toBe('#');
  });

  it('attaches a text span to every positioned note', () => {
    const { laid, result } = build('|d r m');
    for (const note of laid.notes) {
      expect(result.spans.some((candidate) => candidate.noteId === note.noteId)).toBe(true);
    }
  });

  it('never overlaps two notes horizontally', () => {
    const { laid } = build('|d r m f s l t');
    const sorted = [...laid.notes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
  });

  it('wraps onto a new system when a measure will not fit', () => {
    const { laid } = build('|d r m f s l t |d r m f s l t', { systemWidth: 300 });
    expect(new Set(laid.notes.map((note) => note.systemIndex)).size).toBe(2);
  });

  it('keeps every note inside the system width', () => {
    const { laid } = build('|d ! - r ! - m ! - f s l t |d r m f s l t', { systemWidth: 300 });
    for (const note of laid.notes) {
      expect(note.x).toBeGreaterThanOrEqual(0);
      expect(note.x + note.width).toBeLessThanOrEqual(laid.width);
    }
    expect(laid.height).toBeGreaterThan(laid.systemHeight);
  });

  it('hit tests a note by its region', () => {
    const { laid, notes } = build('|d r m');
    const target = laid.notes[1]!;
    expect(hitTest(laid, target.x + 2, target.y + 4)).toBe(notes[1]?.id);
  });

  it('returns null when hitting empty space', () => {
    const { laid } = build('|d r m');
    expect(hitTest(laid, 5, laid.height + 500)).toBeNull();
  });

  it('falls back to the nearest note outside any region', () => {
    const { laid, notes } = build('|d r m');
    const target = laid.notes[1]!;
    expect(nearestNote(laid, target.x + 1, target.y - 60)).toBe(notes[1]?.id);
  });

  it('lays out a modulated score without throwing', () => {
    const { laid } = build('|d r |f: f s l |d: d r');
    expect(laid.notes.length).toBeGreaterThan(0);
  });

  it('handles an empty score', () => {
    const laid = layout({ kind: 'score', title: null, subtitle: null, parts: [], sections: [] }, [], DEFAULT_LAYOUT);
    expect(laid.notes).toHaveLength(0);
    expect(laid.hitRegions).toHaveLength(0);
  });

  it('handles a score with parts but no music', () => {
    const laid = layout({ kind: 'score', title: null, subtitle: null, parts: DEFAULT_PARTS, sections: [] }, [], DEFAULT_LAYOUT);
    expect(laid.notes).toHaveLength(0);
  });
});

describe('layout: choir', () => {
  it('gives every part its own row', () => {
    const { laid, notes } = build(CHOIR);
    expect(laid.notes).toHaveLength(notes.length);
    const rows = [...new Set(laid.notes.map((note) => note.y))].sort((a, b) => a - b);
    expect(rows).toHaveLength(4);
  });

  it('puts the parts in score order from top to bottom', () => {
    const { laid } = build(CHOIR);
    const byRow = new Map<number, string>();
    for (const note of laid.notes) byRow.set(note.y, note.partId);
    expect([...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, id]) => id)).toEqual([
      'soprano',
      'alto',
      'tenor',
      'bass',
    ]);
  });

  it('shares one column across the voices of a beat', () => {
    const { laid } = build(CHOIR);
    const first = laid.notes.filter((note) => note.beatIndex === 0);
    expect(new Set(first.map((note) => note.x)).size).toBe(1);
  });

  it('advances every voice to the next column together', () => {
    const { laid } = build(CHOIR);
    const beats = new Map<number, Set<number>>();
    for (const note of laid.notes) {
      const set = beats.get(note.beatIndex) ?? new Set<number>();
      set.add(note.x);
      beats.set(note.beatIndex, set);
    }
    const columns = [...beats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, xs]) => [...xs][0]);
    expect(new Set(columns).size).toBe(columns.length);
    for (let i = 1; i < columns.length; i += 1) {
      expect(columns[i]!).toBeGreaterThan(columns[i - 1]!);
    }
  });

  it('draws one staff line per voice per system', () => {
    const { laid } = build(CHOIR, { systemWidth: 300 });
    const systems = new Set(laid.notes.map((note) => note.systemIndex));
    expect(lines(laid, 'system-line')).toHaveLength(systems.size * 4);
  });

  it('draws a light tick at the start of every beat but the first', () => {
    const { laid } = build(CHOIR);
    expect(lines(laid, 'pulse-tick')).toHaveLength(3);
  });

  it('writes the rhythm once, on the first voice only', () => {
    const { laid } = build(['|', 'S: d! - r, m', 'A: r m f', 'T: m f s', 'B: f s l'].join('\n'));
    const marks = glyphs(laid, 'pulse-mark');
    expect(marks.map((item) => item.code)).toEqual(['!', '-', ',']);
    expect(new Set(marks.map((item) => item.y)).size).toBe(1);
  });

  it('leaves a gap where a voice rests', () => {
    const { laid } = build(['|', 'S: d r m f', 'A: r m 0 f', 'T: m f s l', 'B: f s l t'].join('\n'));
    const alto = laid.notes.filter((note) => note.partId === 'alto');
    expect(alto).toHaveLength(3);
  });

  it('reserves the same column width whether or not a voice is altered', () => {
    const { laid } = build(['|', 'S: d r', 'A: r r#'].join('\n'));
    const soprano = laid.notes.filter((note) => note.partId === 'soprano');
    const alto = laid.notes.filter((note) => note.partId === 'alto');
    for (let i = 0; i < soprano.length; i += 1) {
      expect(alto[i]!.x).toBe(soprano[i]!.x);
    }
  });

  it('hit tests each voice in its own row', () => {
    const { laid, notes } = build(CHOIR);
    const bass = laid.notes.find((note) => note.partId === 'bass')!;
    expect(hitTest(laid, bass.x + 2, bass.y + 4)).toBe(bass.noteId);
    const sopranoNote = notes.find((note) => note.partId === 'soprano')!;
    expect(hitTest(laid, bass.x + 2, bass.y + 4)).not.toBe(sopranoNote.id);
  });

  it('labels every row with its voice name when there is more than one part', () => {
    const { laid } = build(CHOIR);
    expect(glyphs(laid, 'part-name').map((item) => item.code)).toEqual(['S', 'A', 'T', 'B']);
  });

  it('leaves out the voice gutter for a single part', () => {
    const { laid } = build([':parts=Soprano:S:treble', '|', 'S: d r'].join('\n'));
    expect(glyphs(laid, 'part-name')).toHaveLength(0);
  });

  it('stacks the rows of a system without overlapping them', () => {
    const { laid } = build(CHOIR);
    const rows = [...new Set(laid.notes.map((note) => note.y))].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]! - rows[i - 1]!).toBe(laid.voiceRowHeight);
    }
  });

  it('keeps every voice inside the system height', () => {
    const { laid } = build(CHOIR, { systemWidth: 300 });
    const lowest = Math.max(...laid.notes.map((note) => note.y + note.height));
    expect(lowest).toBeLessThanOrEqual(laid.height);
  });

  it('grows the page with the number of voices', () => {
    const one = build([':parts=Soprano:S:treble', '|', 'S: d r'].join('\n')).laid;
    const four = build(CHOIR).laid;
    expect(four.height).toBeGreaterThan(one.height);
  });
});

describe('layout: lyrics', () => {
  const SUNG = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t', 'P: Ave Ma ri a'].join('\n');

  it('draws one glyph per syllable', () => {
    const { laid } = build(SUNG);
    expect(glyphs(laid, 'lyric').map((item) => item.code)).toEqual(['Ave', 'Ma', 'ri', 'a']);
  });

  it('puts the lyrics under the lowest voice', () => {
    const { laid } = build(SUNG);
    const lyric = glyphs(laid, 'lyric')[0]!;
    const lowestStaff = Math.max(...lines(laid, 'system-line').map((line) => line.y1));
    expect(lyric.y).toBeGreaterThan(lowestStaff);
  });

  it('centres each syllable inside the column of its beat', () => {
    const { laid } = build(SUNG);
    const byBeat = new Map<number, { x: number; width: number }>();
    for (const note of laid.notes) {
      byBeat.set(note.beatIndex, { x: note.x, width: note.width });
    }
    const lyrics = glyphs(laid, 'lyric');
    lyrics.forEach((lyric, beatIndex) => {
      const column = byBeat.get(beatIndex)!;
      expect(lyric.x).toBeGreaterThan(column.x);
      expect(lyric.x).toBeLessThan(column.x + column.width);
    });
  });

  it('puts the first syllable under the first beat', () => {
    const { laid } = build(SUNG);
    const first = laid.notes.find((note) => note.beatIndex === 0)!;
    expect(glyphs(laid, 'lyric')[0]!.x).toBe(first.x + DEFAULT_LAYOUT.cellWidth / 2);
  });

  it('leaves out the lyric row when there are no lyrics', () => {
    const { laid } = build(CHOIR);
    expect(glyphs(laid, 'lyric')).toHaveLength(0);
  });

  it('reserves a lyric row only for the systems that need one', () => {
    const mixed = build(['|1:', 'S: d r', 'A: r m', 'T: m f', 'B: f s', '|2:', 'S: m f', 'A: m f', 'T: f s', 'B: s l'].join('\n'));
    expect(glyphs(mixed.laid, 'lyric')).toHaveLength(0);
  });

  it('draws a staff line per voice even on a system with lyrics', () => {
    const { laid } = build(SUNG);
    expect(lines(laid, 'system-line')).toHaveLength(4);
  });
});

describe('systems and section labels', () => {
  it('draws a staff line for every system, including the first and last', () => {
    const text = '|d r m f s l t |d r m f s l t |d r m f s l t |d r m f s l t |d r m f s l t';
    const { laid } = build(text, { systemWidth: 300 });
    const systems = new Set(laid.notes.map((note) => note.systemIndex));
    expect(lines(laid, 'system-line')).toHaveLength(systems.size);
    expect(systems.size).toBeGreaterThan(1);
  });

  it('stacks systems down the page rather than on one line', () => {
    const text = '|d r m f s l t |d r m f s l t |d r m f s l t';
    const { laid } = build(text, { systemWidth: 300 });
    const tops = [...new Set(laid.notes.map((note) => note.y))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1);
    expect(tops[1]! - tops[0]!).toBe(laid.systemHeight);
  });

  it('gives every note a distinct horizontal position on one system', () => {
    const { laid } = build('|d r m f s l t', { systemWidth: 960 });
    const xs = laid.notes.map((note) => note.x);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it('starts a new system for each new section and labels it with the key', () => {
    const { laid } = build('|d r |f: f s l', { systemWidth: 960 });
    expect(glyphs(laid, 'section-label').map((item) => item.code)).toEqual(['C major', 'F major']);
  });

  it('never overlaps a section label with the notes of its system', () => {
    const { laid } = build('|d r |f: f s l', { systemWidth: 960 });
    const label = glyphs(laid, 'section-label')[0]!;
    expect(label.y).toBeLessThan(Math.min(...laid.notes.map((note) => note.y)));
  });

  it('labels a numbered section with the key it kept', () => {
    const { laid } = build([':do=F', '|1:', 'S: d r', '|2:', 'S: m f'].join('\n'));
    expect(glyphs(laid, 'section-label').map((item) => item.code)).toEqual(['F major', 'F major']);
  });

  it('grows the page height to fit every system', () => {
    const single = build('|d r m f s l t', { systemWidth: 960 }).laid;
    const many = build('|d r m f s l t |d r m f s l t |d r m f s l t |d r m f s l t', {
      systemWidth: 300,
    }).laid;
    expect(many.height).toBeGreaterThan(single.height);
    const lowestNote = Math.max(...many.notes.map((note) => note.y + note.height));
    expect(many.height).toBeGreaterThan(lowestNote);
  });
});

describe('layout: clicking the engraving', () => {
  const CHOIR = [
    '|',
    'S: d r m f',
    'A: r m f s',
    'T: m f s l',
    'B: f s l t',
    'P: do re mi fa',
  ].join('\n');
  const laid = layout(parse(CHOIR).score, parse(CHOIR).spans, DEFAULT_LAYOUT);

  it('selects the syllable even where the lowest voice box reaches it', () => {
    const glyph = lyricGlyphOf(laid, lyricGlyphs(laid)[0]!.beatId!)!;
    const box = textBox(glyph);
    // The bass note's touch box overlaps this band; the lyric must still win.
    expect(hitTest(laid, box.centerX, box.centerY)).not.toBeNull();
    const hit = hitTestScore(laid, box.centerX, box.centerY);
    expect(hit).toEqual({ kind: 'lyric', beatId: glyph.beatId });
  });

  it('still selects a note when the click is on the staff', () => {
    const note = laid.notes[0]!;
    const hit = hitTestScore(laid, note.x + note.width / 2, note.y + note.height / 2);
    expect(hit).toEqual({ kind: 'note', noteId: note.noteId });
  });

  it('returns nothing for empty engraving space', () => {
    expect(hitTestScore(laid, laid.width - 4, 4)).toBeNull();
  });

  it('finds a beat with no syllable, so a word can be added there', () => {
    const score = parse(['|', 'S: d r', 'P: do'].join('\n'));
    const plain = layout(score.score, score.spans, DEFAULT_LAYOUT);
    const slots = lyricGlyphs(plain);
    expect(slots).toHaveLength(2);
    expect(slots.map((g) => g.code)).toEqual(['do', '']);
    const hit = hitTestScore(plain, textBox(slots[1]!).centerX, textBox(slots[1]!).centerY);
    expect(hit?.kind).toBe('lyric');
  });

  it('keeps the hit box and the editor position derived from the same numbers', () => {
    const glyph = lyricGlyphs(laid)[0]!;
    const box = textBox(glyph);
    expect(box.centerX).toBe(glyph.x);
    // The box must contain the visual centre the inline editor is placed on.
    expect(box.top).toBeLessThan(box.centerY);
    expect(box.centerY).toBeLessThan(box.top + box.height);
    expect(hitTestLyric(laid, box.centerX, box.centerY)).toBe(glyph.beatId);
  });
});

function lyricGlyphs(target: LaidOutScore) {
  return target.items.filter(
    (item): item is Extract<typeof item, { kind: 'glyph' }> =>
      item.kind === 'glyph' && item.role === 'lyric',
  );
}

describe('layout: title block', () => {
  const NOTES = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t'].join('\n');
  const laidWith = (text: string) => {
    const result = parse(text);
    expect(result.errors).toHaveLength(0);
    return layout(result.score, result.spans, DEFAULT_LAYOUT);
  };
  const roles = (laid: LaidOutScore) =>
    laid.items.filter(
      (item): item is Extract<typeof item, { kind: 'glyph' }> =>
        item.kind === 'glyph' && (item.role === 'title' || item.role === 'subtitle'),
    );

  it('centres the title on the page', () => {
    const laid = laidWith(`:title=Ave Maria\n${NOTES}`);
    const title = roles(laid)[0]!;
    expect(title.role).toBe('title');
    expect(title.code).toBe('Ave Maria');
    expect(title.x).toBe(laid.width / 2);
  });

  it('puts the subtitle under the title', () => {
    const laid = laidWith(`:title=Ave Maria\n:subtitle=Cordes\n${NOTES}`);
    const [title, subtitle] = roles(laid);
    expect(subtitle!.role).toBe('subtitle');
    expect(subtitle!.code).toBe('Cordes');
    expect(subtitle!.x).toBe(laid.width / 2);
    expect(subtitle!.y).toBeGreaterThan(title!.y);
    expect(subtitle!.fontSize).toBeLessThan(title!.fontSize);
  });

  it('lifts the first system to make room for the title', () => {
    const plain = laidWith(NOTES);
    const withTitle = laidWith(`:title=Ave Maria\n${NOTES}`);
    const withBoth = laidWith(`:title=Ave Maria\n:subtitle=Cordes\n${NOTES}`);
    const firstTop = (laid: LaidOutScore): number =>
      Math.min(...laid.items.filter((i) => i.kind === 'line').map((i) => i.y1));

    expect(firstTop(withTitle)).toBeGreaterThan(firstTop(plain));
    expect(firstTop(withBoth)).toBeGreaterThan(firstTop(withTitle));
    expect(withTitle.height - plain.height).toBe(DEFAULT_LAYOUT.titleFontSize + 10);
    expect(withBoth.height - withTitle.height).toBe(DEFAULT_LAYOUT.subtitleFontSize + 12);
  });

  it('draws no title block when there is no title', () => {
    expect(roles(laidWith(NOTES))).toHaveLength(0);
  });

  it('grows the exported image height to fit the title', () => {
    const plain = laidWith(NOTES);
    const withTitle = laidWith(`:title=Ave Maria\n${NOTES}`);
    expect(withTitle.height).toBeGreaterThan(plain.height);
  });
});
