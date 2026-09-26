import type { Accidental, Key } from './pitch.js';
import { DEFAULT_TIME_SIGNATURE } from './meter.js';

export type { Accidental, Key };

export type PartId = string;

export type Clef = 'treble' | 'alto' | 'tenor' | 'treble8vb' | 'bass';

export const CLEFS: readonly Clef[] = ['treble', 'alto', 'tenor', 'treble8vb', 'bass'];

export function isClef(raw: string): raw is Clef {
  return CLEFS.includes(raw as Clef);
}

export type Part = {
  readonly kind: 'part';
  readonly id: PartId;
  readonly name: string;
  readonly shortName: string;
  readonly clef: Clef;
};

export type VoiceNote = {
  readonly kind: 'voiceNote';
  readonly id: string;
  readonly partId: PartId;
  readonly degree: number;
  readonly accidental: Accidental;
};

export type Beat = {
  readonly kind: 'beat';
  readonly id: string;
  readonly pulses: number;
  readonly notes: readonly (VoiceNote | null)[];
  readonly lyric: string | null;
};

export type Measure = {
  readonly kind: 'measure';
  readonly id: string;
  readonly beats: readonly Beat[];
  /**
   * Indexes of the beats that open a new group inside the measure, that is the
   * beats written after a `|` rather than after a `:`. The engraving draws a
   * short barline in front of each of them.
   */
  readonly groupBreaks: readonly number[];
};

export type Section = {
  readonly kind: 'section';
  readonly id: string;
  readonly key: Key;
  readonly measures: readonly Measure[];
};

export type Score = {
  readonly kind: 'score';
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly timeSignature: string;
  readonly parts: readonly Part[];
  readonly sections: readonly Section[];
};

export type Span = {
  readonly noteId: string;
  readonly from: number;
  readonly to: number;
};

export type ParseError = {
  readonly message: string;
  readonly from: number;
  readonly to: number;
};

export type ParseResult = {
  readonly score: Score;
  readonly spans: readonly Span[];
  readonly errors: readonly ParseError[];
};

export type SerializedScore = {
  readonly text: string;
  readonly spans: readonly Span[];
};

export const DEFAULT_PARTS: readonly Part[] = [
  { kind: 'part', id: 'soprano', name: 'Soprano', shortName: 'S', clef: 'treble' },
  { kind: 'part', id: 'alto', name: 'Alto', shortName: 'A', clef: 'alto' },
  { kind: 'part', id: 'tenor', name: 'Tenor', shortName: 'T', clef: 'treble8vb' },
  { kind: 'part', id: 'bass', name: 'Bass', shortName: 'B', clef: 'bass' },
];

export function partsEqual(a: readonly Part[], b: readonly Part[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (part, index) =>
      part.id === b[index]?.id &&
      part.name === b[index]?.name &&
      part.shortName === b[index]?.shortName &&
      part.clef === b[index]?.clef,
  );
}

export function partIndexOf(parts: readonly Part[], partId: PartId): number {
  return parts.findIndex((part) => part.id === partId);
}

export function partOf(score: Score, partId: PartId): Part | undefined {
  return score.parts.find((part) => part.id === partId);
}

export function* iterateBeats(score: Score): Generator<Beat> {
  for (const section of score.sections) {
    for (const measure of section.measures) {
      yield* measure.beats;
    }
  }
}

export function* iterateVoiceNotes(score: Score): Generator<VoiceNote> {
  for (const beat of iterateBeats(score)) {
    for (const note of beat.notes) {
      if (note) yield note;
    }
  }
}

export function voiceNotesOf(score: Score): VoiceNote[] {
  return [...iterateVoiceNotes(score)];
}

export function beatsOf(score: Score): Beat[] {
  return [...iterateBeats(score)];
}

export function findVoiceNote(score: Score, noteId: string): VoiceNote | undefined {
  for (const note of iterateVoiceNotes(score)) {
    if (note.id === noteId) return note;
  }
  return undefined;
}

export function findBeat(score: Score, beatId: string): Beat | undefined {
  for (const beat of iterateBeats(score)) {
    if (beat.id === beatId) return beat;
  }
  return undefined;
}

export function sectionOfBeat(score: Score, beatId: string): Section | undefined {
  for (const section of score.sections) {
    for (const measure of section.measures) {
      if (measure.beats.some((beat) => beat.id === beatId)) return section;
    }
  }
  return undefined;
}

export function sectionOfVoiceNote(score: Score, noteId: string): Section | undefined {
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const beat of measure.beats) {
        if (beat.notes.some((note) => note && note.id === noteId)) return section;
      }
    }
  }
  return undefined;
}

export function withVoiceNote(
  score: Score,
  noteId: string,
  patch: Partial<Pick<VoiceNote, 'degree' | 'accidental'>>,
): Score {
  let changed = false;
  const sections = score.sections.map((section) => {
    let sectionChanged = false;
    const measures = section.measures.map((measure) => {
      if (!measure.beats.some((beat) => beat.notes.some((note) => note && note.id === noteId))) {
        return measure;
      }
      sectionChanged = true;
      return {
        ...measure,
        beats: measure.beats.map((beat) =>
          beat.notes.some((note) => note && note.id === noteId)
            ? {
                ...beat,
                notes: beat.notes.map((note) =>
                  note && note.id === noteId ? { ...note, ...patch } : note,
                ),
              }
            : beat,
        ),
      };
    });
    if (sectionChanged) changed = true;
    return sectionChanged ? { ...section, measures } : section;
  });
  return changed ? { ...score, sections } : score;
}

export function withBeat(
  score: Score,
  beatId: string,
  patch: Partial<Pick<Beat, 'pulses' | 'lyric'>>,
): Score {
  let changed = false;
  const sections = score.sections.map((section) => {
    let sectionChanged = false;
    const measures = section.measures.map((measure) => {
      if (!measure.beats.some((beat) => beat.id === beatId)) return measure;
      sectionChanged = true;
      return {
        ...measure,
        beats: measure.beats.map((beat) => (beat.id === beatId ? { ...beat, ...patch } : beat)),
      };
    });
    if (sectionChanged) changed = true;
    return sectionChanged ? { ...section, measures } : section;
  });
  return changed ? { ...score, sections } : score;
}

export function withSectionKey(score: Score, sectionId: string, key: Key): Score {
  return {
    ...score,
    sections: score.sections.map((section) =>
      section.id === sectionId ? { ...section, key } : section,
    ),
  };
}

export function withParts(score: Score, parts: readonly Part[]): Score {
  const count = parts.length;
  return {
    ...score,
    parts,
    sections: score.sections.map((section) => ({
      ...section,
      measures: section.measures.map((measure) => ({
        ...measure,
        beats: measure.beats.map((beat) => {
          const notes: (VoiceNote | null)[] = [];
          for (let index = 0; index < count; index += 1) {
            const candidate = beat.notes[index];
            const part = parts[index];
            if (candidate && part && candidate.partId === part.id) notes.push(candidate);
            else notes.push(null);
          }
          return { ...beat, notes };
        }),
      })),
    })),
  };
}

export function spanFor(spans: readonly Span[], noteId: string): Span | undefined {
  for (const span of spans) {
    if (span.noteId === noteId) return span;
  }
  return undefined;
}

export function noteIdAtOffset(spans: readonly Span[], offset: number): string | undefined {
  for (const span of spans) {
    if (offset >= span.from && offset <= span.to) return span.noteId;
  }
  return undefined;
}

export function firstSpanTouching(
  spans: readonly Span[],
  from: number,
  to: number,
): readonly Span[] {
  return spans.filter((span) => span.to >= from && span.from <= to);
}

/**
 * Replaces the note a voice sings on one beat. Passing `null` makes it a rest;
 * passing a note makes a rest sing again. Ids of neighbouring notes are kept.
 */
export function withBeatNote(
  score: Score,
  beatId: string,
  partId: PartId,
  note: VoiceNote | null,
): Score {
  const index = score.parts.findIndex((part) => part.id === partId);
  if (index < 0) return score;

  let changed = false;
  const sections = score.sections.map((section) => {
    let sectionChanged = false;
    const measures = section.measures.map((measure) => {
      const target = measure.beats.find((beat) => beat.id === beatId);
      if (!target) return measure;
      const current = target.notes[index] ?? null;
      if (current === note) return measure;
      if (current !== null && note !== null && current.id === note.id) return measure;
      sectionChanged = true;
      return {
        ...measure,
        beats: measure.beats.map((beat) => {
          if (beat.id !== beatId) return beat;
          const notes = [...beat.notes];
          notes[index] = note;
          return { ...beat, notes: notes as Beat['notes'] };
        }),
      };
    });
    if (sectionChanged) changed = true;
    return sectionChanged ? { ...section, measures } : section;
  });
  return changed ? { ...score, sections } : score;
}

/**
 * The pitch a voice sings nearest to a beat, used when a rest is turned back into
 * a note so the edit does not jump to an unrelated pitch. The note before the
 * beat wins; a voice that has not sung yet falls back to the next one it sings.
 */
export function nearestNoteOfPart(
  score: Score,
  beatId: string,
  partId: PartId,
): VoiceNote | null {
  const index = score.parts.findIndex((part) => part.id === partId);
  if (index < 0) return null;

  const notes: VoiceNote[] = [];
  let target = -1;
  for (const beat of iterateBeats(score)) {
    if (beat.id === beatId) target = notes.length;
    const note = beat.notes[index] ?? null;
    if (note) notes.push(note);
  }
  if (target < 0) return null;
  return notes[target - 1] ?? notes[target] ?? null;
}
