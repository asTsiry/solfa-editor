import { LETTERS, keyLabel, octaveOf, pulseMarks } from './pitch.js';
import type { Beat, Measure, Part, Score, Section, Span, VoiceNote } from './score.js';

export type GlyphRole =
  | 'solfa-letter'
  | 'accidental'
  | 'octave-dot'
  | 'pulse-mark'
  | 'section-label'
  | 'part-name'
  | 'lyric'
  | 'measure-number'
  | 'title'
  | 'subtitle';

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
  readonly beatId?: string | null;
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
  readonly partId: string;
  readonly partIndex: number;
  readonly rowIndex: number;
  readonly sectionIndex: number;
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly note: VoiceNote;
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
  readonly voiceRowHeight: number;
  readonly rowCount: number;
};

export type LayoutOptions = {
  readonly systemWidth: number;
  readonly leftMargin: number;
  readonly topMargin: number;
  readonly cellWidth: number;
  readonly fontSize: number;
  readonly noteHeight: number;
  readonly partGap: number;
  readonly systemGap: number;
  readonly measureGap: number;
  readonly pulseMarkWidth: number;
  readonly partNameWidth: number;
  readonly lyricHeight: number;
  readonly lyricFontSize: number;
  readonly titleFontSize: number;
  readonly subtitleFontSize: number;
};

export const DEFAULT_LAYOUT: LayoutOptions = {
  systemWidth: 960,
  leftMargin: 24,
  topMargin: 36,
  cellWidth: 26,
  fontSize: 20,
  noteHeight: 34,
  partGap: 12,
  systemGap: 52,
  measureGap: 18,
  pulseMarkWidth: 9,
  partNameWidth: 58,
  lyricHeight: 24,
  lyricFontSize: 13,
  titleFontSize: 26,
  subtitleFontSize: 15,
};

const BAR_PADDING = 14;

function pulseMarkCount(pulses: number): number {
  return pulseMarks(pulses).length;
}

function beatAccidentalWidth(beat: Beat, rows: readonly number[], options: LayoutOptions): number {
  for (const partIndex of rows) {
    const note = beat.notes[partIndex];
    if (note && note.accidental !== 0) return options.pulseMarkWidth;
  }
  return 0;
}

function beatWidth(beat: Beat, rows: readonly number[], options: LayoutOptions): number {
  const accidentalWidth = beatAccidentalWidth(beat, rows, options);
  return accidentalWidth + options.cellWidth + pulseMarkCount(beat.pulses) * options.pulseMarkWidth;
}

function measureWidth(measure: Measure, rows: readonly number[], options: LayoutOptions): number {
  let total = 0;
  for (const beat of measure.beats) total += beatWidth(beat, rows, options);
  return total;
}

function sectionHasLyrics(section: Section): boolean {
  return section.measures.some((measure) => measure.beats.some((beat) => beat.lyric !== null));
}

function singingRows(section: Section, partCount: number): number[] {
  const rows: number[] = [];
  for (let index = 0; index < partCount; index += 1) {
    const sings = section.measures.some((measure) =>
      measure.beats.some((beat) => beat.notes[index] != null),
    );
    if (sings) rows.push(index);
  }
  return rows;
}

type SystemRecord = {
  top: number;
  rows: number[];
  lyrics: boolean;
  gutter: number;
};

type PendingMeasure = {
  sectionIndex: number;
  section: Section;
  measureIndex: number;
  measure: Measure;
  rows: number[];
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

  const parts: readonly Part[] = score.parts;
  const partCount = parts.length;

  const items: DisplayItem[] = [];
  const notes: PositionedNote[] = [];
  const hitRegions: HitRegion[] = [];

  const voiceRowHeight = options.noteHeight + options.partGap;
  const systems = new Map<number, SystemRecord>();

  const centreX = options.systemWidth / 2;

  const rowsHeight = (record: SystemRecord): number =>
    record.rows.length * voiceRowHeight + (record.lyrics ? options.lyricHeight : 0);

  let systemHeight = voiceRowHeight + options.systemGap;
  // The title block sits above the first system and is centred on the page rather
  // than on the system, so it is drawn once before any system is opened.
  const titleBlockHeight =
    (score.title === null ? 0 : options.titleFontSize + 10) +
    (score.subtitle === null ? 0 : options.subtitleFontSize + 12);

  let y = options.topMargin + titleBlockHeight;
  let x = options.leftMargin;
  let currentSystem = 0;
  let isFirstMeasureOnSystem = true;
  let currentRows: number[] = [];
  let currentLyrics = false;
  let currentGutter = 0;

  const openSystem = (): void => {
    systems.set(currentSystem, {
      top: y,
      rows: currentRows,
      lyrics: currentLyrics,
      gutter: currentGutter,
    });
    x = options.leftMargin + currentGutter;
  };

  const newSystem = (): void => {
    y += systemHeight;
    currentSystem += 1;
    isFirstMeasureOnSystem = true;
    openSystem();
  };

  const textWidth = (text: string, fontSize: number): number => text.length * fontSize * 0.55;

  const openTitleBlock = (): void => {
    if (score.title !== null) {
      items.push({
        kind: 'glyph',
        role: 'title',
        code: score.title,
        x: centreX,
        y: options.topMargin + options.titleFontSize,
        width: textWidth(score.title, options.titleFontSize),
        height: options.titleFontSize + 4,
        fontSize: options.titleFontSize,
        noteId: null,
        beatId: null,
      });
    }
    if (score.subtitle !== null) {
      items.push({
        kind: 'glyph',
        role: 'subtitle',
        code: score.subtitle,
        x: centreX,
        y:
          options.topMargin +
          (score.title === null ? 0 : options.titleFontSize + 10) +
          options.subtitleFontSize,
        width: textWidth(score.subtitle, options.subtitleFontSize),
        height: options.subtitleFontSize + 4,
        fontSize: options.subtitleFontSize,
        noteId: null,
        beatId: null,
      });
    }
  };

  openTitleBlock();

  const placeMeasure = (pending: PendingMeasure): void => {
    const record = systems.get(currentSystem) ?? {
      top: y,
      rows: pending.rows,
      lyrics: currentLyrics,
      gutter: currentGutter,
    };
    const top = record.top;
    const stackHeight = rowsHeight(record);

    const rowOf = (partIndex: number): number => pending.rows.indexOf(partIndex);
    const rowY = (rowIndex: number): number => top + rowIndex * voiceRowHeight + options.noteHeight;

    if (!isFirstMeasureOnSystem) x += options.measureGap;

    items.push({
      kind: 'line',
      role: 'barline',
      x1: x,
      y1: top - 4,
      x2: x,
      y2: top + stackHeight,
      width: 1.5,
    });
    x += 6;

    pending.measure.beats.forEach((beat, beatIndex) => {
      const beatLeft = x;
      const accidentalWidth = beatAccidentalWidth(beat, pending.rows, options);
      const letterX = beatLeft + accidentalWidth;
      const marksWidth = pulseMarkCount(beat.pulses) * options.pulseMarkWidth;
      const width = accidentalWidth + options.cellWidth + marksWidth;

      if (beatIndex > 0) {
        items.push({
          kind: 'line',
          role: 'pulse-tick',
          x1: beatLeft,
          y1: top - 4,
          x2: beatLeft,
          y2: top + stackHeight,
          width: 0.5,
        });
      }

      for (const partIndex of pending.rows) {
        const note = beat.notes[partIndex] ?? null;
        if (!note) continue;
        const rowIndex = rowOf(partIndex);
        const baseline = rowY(rowIndex);

        if (note.accidental !== 0) {
          items.push({
            kind: 'glyph',
            role: 'accidental',
            code: note.accidental > 0 ? '#' : 'b',
            x: beatLeft,
            y: baseline,
            width: options.pulseMarkWidth,
            height: options.noteHeight,
            fontSize: options.fontSize,
            noteId: note.id,
          });
        }

        items.push({
          kind: 'glyph',
          role: 'solfa-letter',
          code: LETTERS[((note.degree % 7) + 7) % 7] ?? 'd',
          x: letterX,
          y: baseline,
          width: options.cellWidth,
          height: options.noteHeight,
          fontSize: options.fontSize,
          noteId: note.id,
        });

        if (rowIndex === 0) {
          let cursor = letterX + options.cellWidth;
          for (const mark of pulseMarks(beat.pulses)) {
            items.push({
              kind: 'glyph',
              role: 'pulse-mark',
              code: mark,
              x: cursor,
              y: baseline + options.noteHeight - 14,
              width: options.pulseMarkWidth,
              height: 14,
              fontSize: Math.round(options.fontSize * 0.7),
              noteId: note.id,
            });
            cursor += options.pulseMarkWidth;
          }
        }

        const up = octaveOf(note.degree);
        for (let dot = 0; dot < Math.abs(up); dot += 1) {
          items.push({
            kind: 'glyph',
            role: 'octave-dot',
            code: '',
            x: letterX - 7,
            y: up > 0 ? baseline - 11 + dot * 5 : baseline + options.noteHeight - 6 + dot * 5,
            width: 4,
            height: 4,
            fontSize: 4,
            noteId: note.id,
          });
        }

        const positioned: PositionedNote = {
          noteId: note.id,
          partId: note.partId,
          partIndex,
          rowIndex,
          sectionIndex: pending.sectionIndex,
          measureIndex: pending.measureIndex,
          beatIndex,
          note,
          span: spanByNote.get(note.id),
          x: beatLeft,
          y: baseline,
          width,
          height: options.noteHeight,
          systemIndex: currentSystem,
        };
        notes.push(positioned);
        hitRegions.push({
          noteId: note.id,
          x: beatLeft,
          y: baseline,
          width,
          height: options.noteHeight,
        });
      }

      // A slot is laid out for every beat of a system that has a lyric row, even
      // when the beat carries no word, so the row can be clicked to write one and
      // the inline editor always has a real position. An empty code draws nothing,
      // and a system without a lyric row reserves no space and gets no slots.
      if (currentLyrics) {
        const lyric = beat.lyric ?? '';
        items.push({
          kind: 'glyph',
          role: 'lyric',
          code: lyric,
          x: letterX + options.cellWidth / 2,
          y: top + pending.rows.length * voiceRowHeight + options.lyricFontSize + 6,
          width: Math.max(
            options.lyricFontSize * 0.6,
            lyric.length * options.lyricFontSize * 0.55,
          ),
          height: options.lyricFontSize + 4,
          fontSize: options.lyricFontSize,
          noteId: null,
          beatId: beat.id,
        });
      }

      x = beatLeft + width;
    });

    const barX = x + 2;
    items.push({
      kind: 'line',
      role: 'barline',
      x1: barX,
      y1: top - 4,
      x2: barX,
      y2: top + stackHeight,
      width: 1.5,
    });
    x = barX + 6;
    isFirstMeasureOnSystem = false;
  };

  const sections = score.sections
    .map((section) => ({ section, rows: singingRows(section, partCount) }))
    .filter((entry) => entry.rows.length > 0 && entry.section.measures.some((m) => m.beats.length > 0));

  sections.forEach((entry, sectionIndex) => {
    const { section, rows } = entry;
    const lyrics = sectionHasLyrics(section);
    const gutter = rows.length > 1 ? options.partNameWidth : 0;
    const needed = rows.length * voiceRowHeight + (lyrics ? options.lyricHeight : 0) + options.systemGap;

    currentRows = rows;
    currentLyrics = lyrics;
    currentGutter = gutter;

    if (sectionIndex > 0) newSystem();
    if (sectionIndex > 0 || systemHeight !== needed) systemHeight = needed;
    openSystem();

    items.push({
      kind: 'glyph',
      role: 'section-label',
      code: keyLabel(section.key),
      x: options.leftMargin,
      y: y - 18,
      width: 0,
      height: 0,
      fontSize: 12,
      noteId: null,
    });

    for (let rowIndex = 0; gutter > 0 && rowIndex < rows.length; rowIndex += 1) {
      const part = parts[rows[rowIndex] ?? -1];
      if (!part) continue;
      items.push({
        kind: 'glyph',
        role: 'part-name',
        code: part.shortName,
        x: options.leftMargin,
        y: y + rowIndex * voiceRowHeight + options.noteHeight,
        width: gutter - 6,
        height: options.noteHeight,
        fontSize: 13,
        noteId: null,
      });
    }

    for (const measure of section.measures) {
      if (measure.beats.length === 0) continue;
      const width = measureWidth(measure, rows, options);
      const lead = isFirstMeasureOnSystem ? 0 : options.measureGap;
      if (x + lead + width + BAR_PADDING > options.systemWidth) newSystem();
      placeMeasure({
        sectionIndex,
        section,
        measureIndex: section.measures.indexOf(measure),
        measure,
        rows,
        width,
      });
    }
  });

  for (const [, record] of [...systems].sort((a, b) => a[0] - b[0])) {
    for (let rowIndex = 0; rowIndex < record.rows.length; rowIndex += 1) {
      const baseline = record.top + rowIndex * voiceRowHeight + options.noteHeight + 6;
      items.push({
        kind: 'line',
        role: 'system-line',
        x1: options.leftMargin + record.gutter,
        y1: baseline,
        x2: options.systemWidth,
        y2: baseline,
        width: 1,
      });
    }
  }

  const last = [...systems.values()].pop();
  const height = last ? last.top + rowsHeight(last) + options.topMargin : options.topMargin;
  const rowCount = last ? last.rows.length : 0;

  return {
    width: options.systemWidth,
    height,
    items,
    notes,
    hitRegions,
    systemHeight,
    voiceRowHeight,
    rowCount,
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

/**
 * The box a centred text glyph occupies, in the same terms the hit test and the
 * inline editors use, so they can never drift apart. Such glyphs are drawn on
 * their baseline, so the box is measured outwards from it.
 */
export function textBox(glyph: Extract<DisplayGlyph, { kind: 'glyph' }>): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
} {
  const top = glyph.y - glyph.fontSize;
  const height = glyph.fontSize + 4;
  return {
    left: glyph.x - glyph.width / 2,
    top,
    width: glyph.width,
    height,
    centerX: glyph.x,
    centerY: top + height / 2,
  };
}

/**
 * The glyph of a beat's syllable slot, laid out whether or not the beat has a word.
 */
export function hitTestLyric(laid: LaidOutScore, x: number, y: number): string | null {
  for (const item of laid.items) {
    if (item.kind !== 'glyph' || item.role !== 'lyric' || !item.beatId) continue;
    const box = textBox(item);
    if (x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height) {
      return item.beatId;
    }
  }
  return null;
}

/** The syllable glyph of a beat, laid out whether or not the beat has a word. */
export function lyricGlyphOf(
  laid: LaidOutScore,
  beatId: string,
): Extract<DisplayGlyph, { kind: 'glyph' }> | null {
  for (const item of laid.items) {
    if (item.kind === 'glyph' && item.role === 'lyric' && item.beatId === beatId) {
      return item;
    }
  }
  return null;
}

export type ScoreHit =
  | { readonly kind: 'note'; readonly noteId: string }
  | { readonly kind: 'lyric'; readonly beatId: string };

/**
 * What a click on the engraving selects. A syllable wins over a note, because a
 * note's touch box runs a full note height below its baseline: on a choir system
 * that box would otherwise cover the whole lyric row, and clicking a word would
 * select the lowest voice instead.
 */
export function hitTestScore(laid: LaidOutScore, x: number, y: number): ScoreHit | null {
  const beatId = hitTestLyric(laid, x, y);
  if (beatId !== null) return { kind: 'lyric', beatId };
  const noteId = hitTest(laid, x, y);
  return noteId === null ? null : { kind: 'note', noteId };
}
