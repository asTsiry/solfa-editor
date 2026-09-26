import { defaultIdFactory, type IdFactory } from './ids.js';
import {
  DEFAULT_KEY,
  isLetter,
  letterIndex,
  LETTERS,
  MAX_PULSES,
  parsePitchName,
  type Accidental,
  type Key,
  type Mode,
  type Note,
} from './pitch.js';
import type { Measure, ParseError, ParseResult, Score, Section, Span } from './score.js';

const LETTER_PITCH_CLASS: Readonly<Record<string, number>> = {
  d: 0,
  r: 2,
  m: 4,
  f: 5,
  s: 7,
  l: 9,
  t: 11,
};

const PITCH_CLASS_LETTER: Readonly<Record<number, LetterName>> = {
  0: 'd',
  2: 'r',
  4: 'm',
  5: 'f',
  7: 's',
  9: 'l',
  11: 't',
};

const SOLFA_TO_PITCH_LETTER: Readonly<Record<string, string>> = {
  d: 'C',
  r: 'D',
  m: 'E',
  f: 'F',
  s: 'G',
  l: 'A',
  t: 'B',
};

type LetterName = (typeof LETTERS)[number];

const enum Ch {
  Tab = 0x09,
  LineFeed = 0x0a,
  CarriageReturn = 0x0d,
  Space = 0x20,
  Bang = 0x21,
  Quote = 0x27,
  Comma = 0x2c,
  Dash = 0x2d,
  Dot = 0x2e,
  Slash = 0x2f,
  Colon = 0x3a,
  Equal = 0x3d,
  Hash = 0x23,
  LowerM = 0x6d,
  LowerB = 0x62,
  Pipe = 0x7c,
}

export type ParseOptions = {
  readonly idFactory?: IdFactory;
};

type SectionHeader = {
  readonly degree: number;
  readonly mode: Mode;
};

type MutableMeasure = { kind: 'measure'; id: string; notes: Note[] };
type MutableSection = { kind: 'section'; id: string; key: Key; measures: MutableMeasure[] };

class Parser {
  pos = 0;
  readonly errors: ParseError[] = [];
  readonly spans: Span[] = [];

  constructor(
    private readonly text: string,
    private readonly nextId: IdFactory,
  ) {}

  private code(offset = 0): number {
    return this.text.charCodeAt(this.pos + offset);
  }

  get done(): boolean {
    return this.pos >= this.text.length;
  }

  ch(offset = 0): string {
    const c = this.code(offset);
    return Number.isNaN(c) ? '' : String.fromCharCode(c);
  }

  peek(offset = 0): number {
    return this.code(offset);
  }

  advance(count = 1): void {
    this.pos += count;
  }

  private isSpace(code: number): boolean {
    return (
      code === Ch.Space || code === Ch.Tab || code === Ch.LineFeed || code === Ch.CarriageReturn
    );
  }

  error(message: string, from: number, to = from + 1): void {
    this.errors.push({ message, from, to });
  }

  skipTrivia(): void {
    for (;;) {
      if (this.done) return;
      const code = this.code();
      if (this.isSpace(code)) {
        this.pos += 1;
        continue;
      }
      if (code === Ch.Slash && this.code(1) === Ch.Slash) {
        while (!this.done && this.code() !== Ch.LineFeed) this.pos += 1;
        continue;
      }
      return;
    }
  }

  private skipSpaces(): void {
    while (!this.done && this.isSpace(this.code())) this.pos += 1;
  }

  private readOctavePrefix(): number {
    let marks = 0;
    for (;;) {
      const code = this.code();
      if (code === Ch.Quote) marks += 1;
      else if (code === Ch.Comma) marks -= 1;
      else return marks;
      this.pos += 1;
    }
  }

  private readOctaveSuffix(): number {
    let marks = 0;
    while (this.code() === Ch.Quote) {
      marks += 1;
      this.pos += 1;
    }
    return marks;
  }

  trySectionHeader(): SectionHeader | null {
    const save = this.pos;
    this.pos += 1;
    const prefix = this.readOctavePrefix();
    const ch = this.ch();

    if (ch === 'm' && this.code(1) === Ch.Colon) {
      this.pos += 2;
      return { degree: 0, mode: 'minor' };
    }

    if (ch === '' || !isLetter(ch)) {
      this.pos = save;
      return null;
    }

    const degree = letterIndex(ch) + prefix * 7;
    this.pos += 1;

    if (this.code() !== Ch.Colon) {
      this.pos = save;
      return null;
    }
    this.pos += 1;

    let mode: Mode = 'major';
    if (this.code() === Ch.LowerM) {
      mode = 'minor';
      this.pos += 1;
    }
    return { degree, mode };
  }

  readDirective(): { name: string; value: string } | null {
    const start = this.pos;
    this.pos += 1;

    const nameStart = this.pos;
    while (!this.done && !this.isSpace(this.code()) && this.code() !== Ch.Equal) this.pos += 1;
    const name = this.text.slice(nameStart, this.pos).toLowerCase();

    if (this.code() !== Ch.Equal) {
      this.error(`Directive ":${name}" needs a value, for example ":${name}=C"`, start, this.pos + 1);
      while (!this.done && !this.isSpace(this.code())) this.pos += 1;
      return null;
    }
    this.pos += 1;

    const valueStart = this.pos;
    while (!this.done && !this.isSpace(this.code())) this.pos += 1;
    return { name, value: this.text.slice(valueStart, this.pos) };
  }

  readPulses(noteStart: number): { pulses: number; end: number } {
    const isAnyMark = (code: number): boolean =>
      code === Ch.Bang || code === Ch.Comma || code === Ch.Dash || code === Ch.Dot;
    const isSpacedMark = (code: number): boolean =>
      code === Ch.Bang || code === Ch.Dash || code === Ch.Dot;

    const marks: Ch[] = [];
    let lastMarkEnd = this.pos;

    while (isAnyMark(this.code())) {
      marks.push(this.code() as Ch);
      this.pos += 1;
      lastMarkEnd = this.pos;
    }

    if (marks.length === 0) {
      this.skipSpaces();
      while (isSpacedMark(this.code())) {
        marks.push(this.code() as Ch);
        this.pos += 1;
        lastMarkEnd = this.pos;
        this.skipSpaces();
      }
      if (marks.length === 0) {
        this.pos = lastMarkEnd;
        return { pulses: 2, end: lastMarkEnd };
      }
    }

    const first = marks[0];
    if (first === Ch.Comma) {
      if (marks.length > 1) {
        this.error(
          'A note starting on a half pulse (,) cannot be held; write the next note instead',
          noteStart,
          this.pos,
        );
      }
      return { pulses: 1, end: lastMarkEnd };
    }

    if (first !== Ch.Bang) {
      this.error(
        `Duration must begin with ! (one pulse) or , (half a pulse), found "${String.fromCharCode(first ?? Ch.Space)}"`,
        noteStart,
        this.pos,
      );
      return { pulses: 2, end: lastMarkEnd };
    }

    let pulses = 2;
    for (const mark of marks.slice(1)) {
      if (mark === Ch.Dash) pulses += 2;
      else if (mark === Ch.Dot) pulses += 1;
    }
    return { pulses, end: lastMarkEnd };
  }

  readNote(): { note: Note; end: number } | null {
    const start = this.pos;
    const prefix = this.readOctavePrefix();
    const ch = this.ch();

    if (ch === '' || !isLetter(ch)) {
      this.error(
        prefix === 0
          ? `Unexpected character "${ch}"`
          : `An octave mark must be followed by a note letter (${LETTERS.join(' ')}), found "${ch}"`,
        start,
        Math.max(this.pos, start + 1),
      );
      if (ch !== '') this.pos += 1;
      return null;
    }

    const degree = letterIndex(ch) + prefix * 7;
    this.pos += 1;

    let accidental: Accidental = 0;
    if (this.code() === Ch.Hash) {
      accidental = 1;
      this.pos += 1;
    } else if (this.code() === Ch.LowerB) {
      accidental = -1;
      this.pos += 1;
    }

    const suffix = this.readOctaveSuffix();
    const { pulses, end } = this.readPulses(start);

    if (pulses > MAX_PULSES) {
      this.error(`A note cannot last longer than ${MAX_PULSES / 2} pulses`, start, this.pos);
    }

    return {
      note: {
        kind: 'note',
        id: this.nextId(),
        degree: degree + suffix * 7,
        accidental,
        pulses,
      },
      end,
    };
  }
}

export function parse(text: string, options: ParseOptions = {}): ParseResult {
  const nextId = options.idFactory ?? defaultIdFactory;
  const parser = new Parser(text, nextId);

  const sections: MutableSection[] = [];
  let currentKey: Key = { ...DEFAULT_KEY };
  let currentMeasures: MutableMeasure[] = [];
  let currentNotes: Note[] = [];
  let started = false;

  const doOctaveOf = (key: Key): number => Math.floor(key.doPitch / 12);

  const flushMeasure = (): void => {
    if (currentNotes.length === 0) return;
    currentMeasures.push({ kind: 'measure', id: nextId(), notes: currentNotes });
    currentNotes = [];
  };

  const flushSection = (): void => {
    flushMeasure();
    if (currentMeasures.length > 0 || !started) {
      sections.push({
        kind: 'section',
        id: nextId(),
        key: currentKey,
        measures: currentMeasures,
      });
    }
    currentMeasures = [];
    started = true;
  };

  const startSection = (key: Key): void => {
    currentKey = key;
    currentMeasures = [];
    currentNotes = [];
    started = true;
  };

  const setKey = (patch: Partial<Key>): void => {
    const next: Key = { ...currentKey, ...patch };
    if (
      next.doPitch === currentKey.doPitch &&
      next.mode === currentKey.mode &&
      next.doLetter === currentKey.doLetter
    ) {
      return;
    }
    if (currentMeasures.length > 0 || currentNotes.length > 0) flushSection();
    currentKey = next;
  };

  const applyDirective = (name: string, value: string, at: number): void => {
    if (name === 'do' || name === 'key') {
      const parsed = parsePitchName(value);
      if (parsed === null) {
        parser.error(
          `":${name}" expects a pitch name like C, F# or Bb, found "${value}"`,
          at,
        );
        return;
      }
      setKey({ doPitch: doOctaveOf(currentKey) * 12 + parsed.pitchClass, doLetter: parsed.letter });
      return;
    }
    if (name === 'mode') {
      if (value === 'major' || value === 'M') {
        setKey({ mode: 'major' });
      } else if (value === 'minor' || value === 'm') {
        setKey({ mode: 'minor' });
      } else {
        parser.error(`":mode" expects major or minor, found "${value}"`, at);
      }
      return;
    }
    parser.error(`Unknown directive ":${name}"`, at);
  };

  for (;;) {
    parser.skipTrivia();
    if (parser.done) break;

    const start = parser.pos;
    const code = parser.peek();

    if (code === Ch.Pipe) {
      const header = parser.trySectionHeader();
      if (header) {
        if (currentMeasures.length > 0 || currentNotes.length > 0) flushSection();
        const letter = LETTERS[((header.degree % 7) + 7) % 7] ?? 'd';
        const pitchClass = LETTER_PITCH_CLASS[letter] ?? 0;
        startSection({
          doPitch:
            doOctaveOf(currentKey) * 12 +
            pitchClass +
            12 * Math.floor(header.degree / 7),
          doLetter: SOLFA_TO_PITCH_LETTER[letter] ?? 'C',
          mode: header.mode,
        });
        continue;
      }
      parser.advance();
      flushMeasure();
      continue;
    }

    if (code === Ch.Colon) {
      const directive = parser.readDirective();
      if (directive) applyDirective(directive.name, directive.value, start);
      continue;
    }

    if (
      code === Ch.Quote ||
      code === Ch.Comma ||
      code === Ch.LowerB ||
      isLetter(parser.ch())
    ) {
      const noteStart = parser.pos;
      const parsed = parser.readNote();
      if (parsed) {
        currentNotes.push(parsed.note);
        parser.spans.push({ noteId: parsed.note.id, from: noteStart, to: parsed.end });
      }
      continue;
    }

    parser.error(`Unexpected character "${parser.ch()}"`, start);
    parser.advance();
  }

  flushSection();

  const score: Score = {
    kind: 'score',
    sections: sections.map(
      (section): Section => ({
        kind: 'section',
        id: section.id,
        key: section.key,
        measures: section.measures.map(
          (measure): Measure => ({
            kind: 'measure',
            id: measure.id,
            notes: measure.notes,
          }),
        ),
      }),
    ),
  };

  return { score, spans: parser.spans, errors: parser.errors };
}

export function doDegreeOf(key: Key): number | null {
  const pitchClass = ((key.doPitch % 12) + 12) % 12;
  const letter = PITCH_CLASS_LETTER[pitchClass];
  if (!letter) return null;
  return letterIndex(letter);
}

export function keyFromDoDegree(degree: number, mode: Mode, referenceOctave: number): Key {
  const letter = LETTERS[((degree % 7) + 7) % 7] ?? 'd';
  const pitchClass = LETTER_PITCH_CLASS[letter] ?? 0;
  return {
    doPitch: referenceOctave * 12 + pitchClass + 12 * Math.floor(degree / 7),
    doLetter: SOLFA_TO_PITCH_LETTER[letter] ?? 'C',
    mode,
  };
}
