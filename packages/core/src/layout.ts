import { LETTERS, octaveOf, pulseMarks, type Note } from './pitch.js';
import type { Score, Section, Span } from './score.js';

export type GlyphRole =
  | 'solfa-letter'
  | 'accidental'
  | 'octave-dot'
  | 'pulse-mark'
  | 'section-label'
  | 'measure-number';

export type DisplayGlyph = {
  readonly kind: 'glyph';
  readonly role: GlyphRole;
  readonly code: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly noteId: string | null;
};

export type DisplayLine = {
  readonly kind: 'line';
  readonly role: 'barline' | 'system-line' | 'pulse-tick';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
};

export type DisplayItem = DisplayGlyph | DisplayLine;

export type HitRegion = {
  readonly noteId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type PositionedNote = {
  readonly noteId: string;
  readonly sectionIndex: number;
  readonly measureIndex: number;
  readonly noteIndex: number;
  readonly note: Note;
  readonly span: Span | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly systemIndex: number;
};

export type LaidOutScore = {
  readonly width: number;
  readonly height: number;
  readonly items: readonly DisplayItem[];
  readonly notes: readonly PositionedNote[];
  readonly hitRegions: readonly HitRegion[];
  readonly systemHeight: number;
};

export type LayoutOptions = {
  readonly systemWidth: number;
  readonly leftMargin: number;
  readonly topMargin: number;
  readonly cellWidth: number;
  readonly fontSize: number;
  readonly noteHeight: number;
  readonly systemGap: number;
  readonly measureGap: number;
  readonly pulseMarkWidth: number;
};

export const DEFAULT_LAYOUT: LayoutOptions = {
  systemWidth: 960,
  leftMargin: 24,
  topMargin: 24,
  cellWidth: 26,
  fontSize: 20,
  noteHeight: 34,
  systemGap: 28,
  measureGap: 18,
  pulseMarkWidth: 9,
};

function pulseMarkCount(pulses: number): number {
  return pulseMarks(pulses).length;
}

function noteWidth(note: Note, options: LayoutOptions): number {
  const marks = pulseMarkCount(note.pulses);
  const accidentalWidth = note.accidental === 0 ? 0 : options.pulseMarkWidth;
  return accidentalWidth + options.cellWidth + marks * options.pulseMarkWidth;
}

function measureWidth(
  notes: readonly Note[],
  options: LayoutOptions,
): number {
  let total = 0;
  for (const note of notes) total += noteWidth(note, options);
  return total;
}

type PendingMeasure = {
  sectionIndex: number;
  section: Section;
  measureIndex: number;
  notes: readonly Note[];
  width: number;
};

export function layout(
  score: Score,
  spans: readonly Span[],
  optionsInput: Partial<LayoutOptions> = {},
): LaidOutScore {
  const options: LayoutOptions = { ...DEFAULT_LAYOUT, ...optionsInput };
  const spanByNote = new Map<string, Span>();
  for (const span of spans) spanByNote.set(span.noteId, span);

  const items: DisplayItem[] = [];
  const notes: PositionedNote[] = [];
  const hitRegions: HitRegion[] = [];

  const systemHeight = options.noteHeight + options.systemGap;
  let y = options.topMargin;
  let x = options.leftMargin;

  let currentSystem = 0;
  let isFirstMeasureOnSystem = true;

  const newSystem = (): void => {
    items.push({
      kind: 'line',
      role: 'system-line',
      x1: options.leftMargin,
      y1: y + options.noteHeight + 6,
      x2: options.systemWidth,
      y2: y + options.noteHeight + 6,
      width: 1,
    });
    x = options.leftMargin;
    y += systemHeight;
    currentSystem += 1;
  };

  const placeMeasure = (pending: PendingMeasure): void => {
    if (!isFirstMeasureOnSystem) x += options.measureGap;

    items.push({
      kind: 'line',
      role: 'barline',
      x1: x,
      y1: y - 2,
      x2: x,
      y2: y + options.noteHeight,
      width: 1.5,
    });
    x += 6;

    pending.notes.forEach((note, noteIndex) => {
      const width = noteWidth(note, options);
      const height = options.noteHeight;

      if (note.accidental !== 0) {
        items.push({
          kind: 'glyph',
          role: 'accidental',
          code: note.accidental > 0 ? '#' : 'b',
          x,
          y,
          width: options.pulseMarkWidth,
          height,
          fontSize: options.fontSize,
          noteId: note.id,
        });
        x += options.pulseMarkWidth;
      }

      items.push({
        kind: 'glyph',
        role: 'solfa-letter',
        code: LETTERS[((note.degree % 7) + 7) % 7] ?? 'd',
        x,
        y,
        width: options.cellWidth,
        height,
        fontSize: options.fontSize,
        noteId: note.id,
      });
      x += options.cellWidth;

      for (const mark of pulseMarks(note.pulses)) {
        items.push({
          kind: 'glyph',
          role: 'pulse-mark',
          code: mark,
          x,
          y: y + height - 14,
          width: options.pulseMarkWidth,
          height: 14,
          fontSize: Math.round(options.fontSize * 0.7),
          noteId: note.id,
        });
        x += options.pulseMarkWidth;
      }

      const up = octaveOf(note.degree);
      for (let dot = 0; dot < Math.abs(up); dot += 1) {
        items.push({
          kind: 'glyph',
          role: 'octave-dot',
          code: '',
          x: x - options.cellWidth + 2,
          y: up > 0 ? y - 9 + dot * 5 : y + height - 4 + dot * 5,
          width: 4,
          height: 4,
          fontSize: 4,
          noteId: note.id,
        });
      }

      const positioned: PositionedNote = {
        noteId: note.id,
        sectionIndex: pending.sectionIndex,
        measureIndex: pending.measureIndex,
        noteIndex,
        note,
        span: spanByNote.get(note.id),
        x: x - width,
        y,
        width,
        height,
        systemIndex: currentSystem,
      };
      notes.push(positioned);
      hitRegions.push({
        noteId: note.id,
        x: positioned.x,
        y,
        width,
        height,
      });
    });

    const barX = x + 2;
    items.push({
      kind: 'line',
      role: 'barline',
      x1: barX,
      y1: y - 2,
      x2: barX,
      y2: y + options.noteHeight,
      width: 1.5,
    });
    x = barX + 6;
    isFirstMeasureOnSystem = false;
  };

  score.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      items.push({
        kind: 'glyph',
        role: 'section-label',
        code: '',
        x: options.leftMargin,
        y: y - 16,
        width: 0,
        height: 0,
        fontSize: 12,
        noteId: null,
      });
      x = options.leftMargin;
    }

    section.measures.forEach((measure, measureIndex) => {
      if (measure.notes.length === 0) return;
      const width = measureWidth(measure.notes, options);

      if (x !== options.leftMargin && x + width > options.systemWidth) newSystem();

      placeMeasure({ sectionIndex, section, measureIndex, notes: measure.notes, width });
    });
  });

  return {
    width: options.systemWidth,
    height: y + options.noteHeight + options.topMargin,
    items,
    notes,
    hitRegions,
    systemHeight,
  };
}

export function hitTest(laid: LaidOutScore, x: number, y: number): string | null {
  for (const region of laid.hitRegions) {
    if (
      x >= region.x &&
      x <= region.x + region.width &&
      y >= region.y &&
      y <= region.y + region.height
    ) {
      return region.noteId;
    }
  }
  return null;
}

export function nearestNote(laid: LaidOutScore, x: number, y: number): string | null {
  const hit = hitTest(laid, x, y);
  if (hit) return hit;

  let best: PositionedNote | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const note of laid.notes) {
    const centreX = note.x + note.width / 2;
    const centreY = note.y + note.height / 2;
    const distance = Math.abs(centreX - x) * 2 + Math.abs(centreY - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = note;
    }
  }
  return best ? best.noteId : null;
}
