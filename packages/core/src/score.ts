import type { Accidental, Key, Note } from './pitch.js';

export type { Accidental, Key, Note };

export type Measure = {
  readonly kind: 'measure';
  readonly id: string;
  readonly notes: readonly Note[];
};

export type Section = {
  readonly kind: 'section';
  readonly id: string;
  readonly key: Key;
  readonly measures: readonly Measure[];
};

export type Score = {
  readonly kind: 'score';
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

export function* iterateNotes(score: Score): Generator<Note> {
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const note of measure.notes) {
        yield note;
      }
    }
  }
}

export function notesOf(score: Score): Note[] {
  return [...iterateNotes(score)];
}

export function notesInSection(section: Section): Note[] {
  return section.measures.flatMap((measure) => [...measure.notes]);
}

export function findNote(score: Score, noteId: string): Note | undefined {
  for (const note of iterateNotes(score)) {
    if (note.id === noteId) return note;
  }
  return undefined;
}

export function sectionOfNote(score: Score, noteId: string): Section | undefined {
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const note of measure.notes) {
        if (note.id === noteId) return section;
      }
    }
  }
  return undefined;
}

export function indexOfNote(score: Score, noteId: string): number {
  let index = 0;
  for (const note of iterateNotes(score)) {
    if (note.id === noteId) return index;
    index += 1;
  }
  return -1;
}

export function withNote(
  score: Score,
  noteId: string,
  patch: Partial<Pick<Note, 'degree' | 'accidental' | 'pulses'>>,
): Score {
  let changed = false;
  const sections = score.sections.map((section) => {
    let sectionChanged = false;
    const measures = section.measures.map((measure) => {
      if (!measure.notes.some((note) => note.id === noteId)) return measure;
      sectionChanged = true;
      return {
        ...measure,
        notes: measure.notes.map((note) =>
          note.id === noteId ? { ...note, ...patch } : note,
        ),
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
