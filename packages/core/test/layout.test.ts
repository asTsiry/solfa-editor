import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  hitTest,
  layout,
  nearestNote,
  type DisplayGlyph,
} from '../src/layout.js';
import { parse } from '../src/parse.js';
import { sequentialIdFactory } from '../src/ids.js';
import { notesOf } from '../src/score.js';

function build(text: string, options = {}) {
  const result = parse(text, { idFactory: sequentialIdFactory('n') });
  expect(result.errors).toHaveLength(0);
  const laid = layout(result.score, result.spans, { ...DEFAULT_LAYOUT, ...options });
  return { result, laid, notes: notesOf(result.score) };
}

function glyphs(laid: { items: readonly unknown[] }, role: DisplayGlyph['role']): DisplayGlyph[] {
  return (laid.items as readonly DisplayGlyph[]).filter(
    (item) => item.kind === 'glyph' && item.role === role,
  );
}

describe('layout', () => {
  it('emits one letter glyph per note', () => {
    const { laid, notes } = build('|d r');
    expect(glyphs(laid, 'solfa-letter')).toHaveLength(notes.length);
  });

  it('emits a bar line on both sides of a measure', () => {
    const { laid } = build('|d r m');
    const bars = (laid.items as readonly { kind: string; role: string }[]).filter(
      (item) => item.kind === 'line' && item.role === 'barline',
    );
    expect(bars).toHaveLength(2);
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
    const systems = new Set(laid.notes.map((note) => note.systemIndex));
    expect(systems.size).toBe(2);
  });

  it('keeps every note inside the system width', () => {
    const { laid } = build('|d ! - r ! - m ! - f s l t |d r m f s l t', {
      systemWidth: 300,
    });
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
    const laid = layout({ kind: 'score', sections: [] }, [], DEFAULT_LAYOUT);
    expect(laid.notes).toHaveLength(0);
    expect(laid.hitRegions).toHaveLength(0);
  });
});
