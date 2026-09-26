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
} from './pitch.js';
import {
  DEFAULT_PARTS,
  isClef,
  type Beat,
  type Clef,
  type Measure,
  type ParseError,
  type ParseResult,
  type Part,
  type Score,
  type Section,
  type Span,
  type VoiceNote,
} from './score.js';

const LETTER_PITCH_CLASS: Readonly<Record<string, number>> = {
  d: 0,
  r: 2,
  m: 4,
  f: 5,
  s: 7,
  l: 9,
  t: 11,
};

const PITCH_CLASS_LETTER: Readonly<Record<number, string>> = {
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
  Tilde = 0x7e,
  Underscore = 0x5f,
}

const LYRIC_ALIASES = new Set(['p', 'paroles', 'parole', 'lyrics', 'lyric', 'words', 'text']);
const CONTINUE = '_';
const Rest = '0';

export type ParseOptions = {
  readonly idFactory?: IdFactory;
};

type SectionHeader = {
  readonly degree: number;
  readonly mode: Mode;
};

type MutableBeat = {
  kind: 'beat';
  id: string;
  pulses: number;
  notes: (VoiceNote | null)[];
  lyric: string | null;
};

type MutableMeasure = {
  kind: 'measure';
  id: string;
  beats: MutableBeat[];
  lyricCount: number;
  lyricFrom: number;
  lyricTo: number;
};

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

  skipInlineSpace(): void {
    while (!this.done) {
      const code = this.code();
      if (code === Ch.Space || code === Ch.Tab || code === Ch.CarriageReturn) this.pos += 1;
      else break;
    }
  }

  skipLine(): void {
    while (!this.done && this.code() !== Ch.LineFeed) this.pos += 1;
  }

  atLineEnd(): boolean {
    if (this.done) return true;
    const code = this.code();
    return code === Ch.LineFeed || (code === Ch.Slash && this.code(1) === Ch.Slash);
  }

  readWord(): string {
    const start = this.pos;
    while (!this.done) {
      const code = this.code();
      if (this.isSpace(code) || code === Ch.Colon || code === Ch.Pipe) break;
      this.pos += 1;
    }
    return this.text.slice(start, this.pos);
  }

  readToken(): string {
    const start = this.pos;
    while (!this.done && !this.isSpace(this.code()) && this.code() !== Ch.Slash) this.pos += 1;
    return this.text.slice(start, this.pos);
  }

  readLyricTokens(): string[] {
    const tokens: string[] = [];
    for (;;) {
      const start = this.pos;
      while (
        !this.done &&
        !this.isSpace(this.code()) &&
        this.code() !== Ch.Slash &&
        this.code() !== Ch.Underscore
      ) {
        this.pos += 1;
      }
      if (this.pos > start) tokens.push(this.text.slice(start, this.pos));
      if (this.code() === Ch.Underscore) {
        this.pos += 1;
        tokens.push(CONTINUE);
        continue;
      }
      return tokens;
    }
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

  tryNumberedSectionHeader(): boolean {
    const save = this.pos;
    this.pos += 1;
    let digits = 0;
    while (this.code() >= 0x30 && this.code() <= 0x39) {
      digits += 1;
      this.pos += 1;
    }
    if (digits === 0 || this.code() !== Ch.Colon) {
      this.pos = save;
      return false;
    }
    this.pos += 1;
    return true;
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

    const degree = letterIndex(ch as LetterName) + prefix * 7;
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

  readPulses(noteStart: number): { pulses: number; end: number; marks: number } {
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

    this.skipInlineSpace();
    while (isSpacedMark(this.code())) {
      marks.push(this.code() as Ch);
      this.pos += 1;
      lastMarkEnd = this.pos;
      this.skipInlineSpace();
    }

    if (marks.length === 0) {
      this.pos = lastMarkEnd;
      return { pulses: 2, end: lastMarkEnd, marks: 0 };
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
      return { pulses: 1, end: lastMarkEnd, marks: marks.length };
    }

    if (first !== Ch.Bang) {
      this.error(
        `Duration must begin with ! (one pulse) or , (half a pulse), found "${String.fromCharCode(first ?? Ch.Space)}"`,
        noteStart,
        this.pos,
      );
      return { pulses: 2, end: lastMarkEnd, marks: marks.length };
    }

    let pulses = 2;
    for (const mark of marks.slice(1)) {
      if (mark === Ch.Dash) pulses += 2;
      else if (mark === Ch.Dot) pulses += 1;
    }
    return { pulses, end: lastMarkEnd, marks: marks.length };
  }

  readNote():
    | {
        readonly note: Omit<VoiceNote, 'partId'>;
        readonly end: number;
        readonly pulses: number;
        readonly marks: number;
      }
    | null {
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

    const degree = letterIndex(ch as LetterName) + prefix * 7;
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
    const duration = this.readPulses(start);

    if (duration.pulses > MAX_PULSES) {
      this.error(`A note cannot last longer than ${MAX_PULSES / 2} pulses`, start, this.pos);
    }

    return {
      note: { kind: 'voiceNote', id: this.nextId(), degree: degree + suffix * 7, accidental },
      end: duration.end,
      pulses: duration.pulses,
      marks: duration.marks,
    };
  }
}

function partIndexFor(parts: readonly Part[], raw: string): number {
  const lowered = raw.toLowerCase();
  const byShort = parts.findIndex((part) => part.shortName.toLowerCase() === lowered);
  if (byShort >= 0) return byShort;
  return parts.findIndex((part) => part.name.toLowerCase() === lowered);
}

function slugify(raw: string, fallback: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? fallback : cleaned;
}

function parsePartsDirective(value: string): Part[] | null {
  const parts: Part[] = [];
  const used = new Set<string>();

  for (const entry of value.split(',')) {
    const fields = entry.split(':');
    if (fields.length < 2 || fields.length > 3) return null;
    const name = (fields[0] ?? '').trim();
    const shortName = (fields[1] ?? '').trim();
    if (name === '' || shortName === '') return null;

    const clefRaw = (fields[2] ?? '').trim().toLowerCase();
    let clef: Clef = 'treble';
    if (clefRaw !== '') {
      if (!isClef(clefRaw)) return null;
      clef = clefRaw;
    }

    let id = slugify(name, `part-${parts.length + 1}`);
    let suffix = 1;
    while (used.has(id)) {
      suffix += 1;
      id = `${slugify(name, 'part')}-${suffix}`;
    }
    used.add(id);
    parts.push({ kind: 'part', id, name, shortName, clef });
  }

  return parts.length > 0 ? parts : null;
}

export function parse(text: string, options: ParseOptions = {}): ParseResult {
  const nextId = options.idFactory ?? defaultIdFactory;
  const parser = new Parser(text, nextId);

  const sections: MutableSection[] = [];
  let parts: Part[] = [...DEFAULT_PARTS];
  let currentKey: Key = { ...DEFAULT_KEY };
  let currentMeasures: MutableMeasure[] = [];
  let currentBeats: MutableBeat[] = [];
  let measureOpen = false;
  let lyricCount = 0;
  let lyricFrom = -1;
  let lyricTo = -1;
  let started = false;

  const doOctaveOf = (key: Key): number => Math.floor(key.doPitch / 12);

  const normalise = (notes: (VoiceNote | null)[]): (VoiceNote | null)[] => {
    if (notes.length === parts.length) return notes;
    const out: (VoiceNote | null)[] = [];
    for (let index = 0; index < parts.length; index += 1) out.push(notes[index] ?? null);
    return out;
  };

  const beatAt = (index: number): MutableBeat => {
    while (currentBeats.length <= index) {
      currentBeats.push({
        kind: 'beat',
        id: nextId(),
        pulses: 2,
        notes: new Array(parts.length).fill(null) as (VoiceNote | null)[],
        lyric: null,
      });
    }
    return currentBeats[index] as MutableBeat;
  };

  const requireMeasure = (at: number): boolean => {
    if (measureOpen) return true;
    parser.error('Write a barline "|" before the voice lines of a measure', at);
    return false;
  };

  const previousNoteFor = (partIndex: number, upTo: number): VoiceNote | null => {
    for (let index = upTo - 1; index >= 0; index -= 1) {
      const note = currentBeats[index]?.notes[partIndex];
      if (note) return note;
    }
    return null;
  };

  const runVoiceLine = (rawLabel: string, labelAt: number): void => {
    const partIndex = partIndexFor(parts, rawLabel);
    if (partIndex < 0) {
      parser.error(
        `Unknown voice "${rawLabel}". Declared parts: ${parts
          .map((part) => `${part.name} (${part.shortName})`)
          .join(', ')}`,
        labelAt,
        labelAt + rawLabel.length,
      );
      return;
    }
    if (!requireMeasure(labelAt)) {
      parser.skipLine();
      return;
    }

    const part = parts[partIndex];
    if (!part) return;
    const carriesRhythm = partIndex === 0;
    let previous: VoiceNote | null = null;
    let index = 0;

    for (;;) {
      parser.skipInlineSpace();
      if (parser.atLineEnd()) break;

      const code = parser.peek();
      const isNoteStart =
        code === Ch.Quote ||
        code === Ch.Comma ||
        code === Ch.LowerB ||
        code === Ch.Tilde ||
        code === 0x30 ||
        isLetter(parser.ch());

      if (!isNoteStart) break;

      if (code === Ch.Tilde || code === 0x30) {
        const markAt = parser.pos;
        parser.advance();
        const beat = beatAt(index);
        beat.notes[partIndex] = null;
        if (code === Ch.Tilde) {
          const held: VoiceNote | null = previous ?? previousNoteFor(partIndex, index);
          if (held) beat.notes[partIndex] = { ...held, id: nextId() };
          else {
            parser.error(
              '"~" holds the previous note but this voice has not sung one yet in this measure',
              markAt,
              markAt + 1,
            );
          }
          previous = beat.notes[partIndex] ?? null;
        } else {
          previous = null;
          const duration = parser.readPulses(markAt);
          if (duration.marks > 0) {
            if (carriesRhythm) {
              beat.pulses = duration.pulses;
            } else {
              parser.error(
                'Every voice shares one rhythm, written on the first line. Remove the duration marks from this line.',
                markAt,
                duration.end,
              );
            }
          }
        }
        index += 1;
        continue;
      }

      const noteStart = parser.pos;
      const parsed = parser.readNote();
      if (!parsed) {
        index += 1;
        continue;
      }

      const beat = beatAt(index);
      index += 1;
      beat.notes = normalise(beat.notes);
      const note: VoiceNote = { ...parsed.note, partId: part.id };
      beat.notes[partIndex] = note;
      previous = note;
      parser.spans.push({ noteId: note.id, from: noteStart, to: parsed.end });

      if (carriesRhythm) {
        beat.pulses = parsed.pulses;
      } else if (parsed.marks > 0) {
        parser.error(
          `Every voice shares one rhythm, written on the first line (${parts[0]?.shortName ?? 'S'}:). Remove the duration marks from this line.`,
          noteStart,
          parsed.end,
        );
      }
    }
  };

  const runLyricLine = (): void => {
    if (!requireMeasure(parser.pos)) {
      parser.skipLine();
      return;
    }
    let lyricIndex = 0;
    for (;;) {
      parser.skipInlineSpace();
      if (parser.atLineEnd()) break;
      const code = parser.peek();
      if (code === Ch.Pipe || code === Ch.Colon) break;

      const before = parser.pos;
      const tokens = parser.readLyricTokens();
      if (tokens.length === 0) break;
      if (lyricCount === 0) lyricFrom = before;
      lyricTo = parser.pos;
      for (const token of tokens) {
        lyricCount += 1;
        const beat = currentBeats[lyricIndex];
        if (token !== CONTINUE && beat) beat.lyric = token;
        lyricIndex += 1;
      }
    }
  };

  const flushMeasure = (): void => {
    if (currentBeats.length === 0) {
      measureOpen = false;
      lyricCount = 0;
      return;
    }
    if (lyricCount > 0 && lyricCount !== currentBeats.length) {
      parser.error(
        `This measure has ${currentBeats.length} beat${currentBeats.length === 1 ? '' : 's'} but the lyrics have ${lyricCount} syllable${lyricCount === 1 ? '' : 's'} (use _ to skip one)`,
        lyricFrom,
        lyricTo,
      );
    }
    for (const beat of currentBeats) beat.notes = normalise(beat.notes);
    currentMeasures.push({
      kind: 'measure',
      id: nextId(),
      beats: currentBeats,
      lyricCount,
      lyricFrom,
      lyricTo,
    });
    currentBeats = [];
    measureOpen = false;
    lyricCount = 0;
  };

  const flushSection = (): void => {
    flushMeasure();
    if (currentMeasures.length > 0 || !started) {
      sections.push({ kind: 'section', id: nextId(), key: currentKey, measures: currentMeasures });
    }
    currentMeasures = [];
    started = true;
  };

  const startSection = (key: Key): void => {
    currentKey = key;
    currentMeasures = [];
    currentBeats = [];
    measureOpen = true;
    lyricCount = 0;
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
    if (currentMeasures.length > 0 || currentBeats.length > 0) flushSection();
    currentKey = next;
  };

  const applyDirective = (name: string, value: string, at: number): void => {
    if (name === 'do' || name === 'key') {
      const parsed = parsePitchName(value);
      if (parsed === null) {
        parser.error(`":${name}" expects a pitch name like C, F# or Bb, found "${value}"`, at);
        return;
      }
      setKey({
        doPitch: doOctaveOf(currentKey) * 12 + parsed.pitchClass,
        doLetter: parsed.letter,
      });
      return;
    }
    if (name === 'mode') {
      if (value === 'major' || value === 'M') setKey({ mode: 'major' });
      else if (value === 'minor' || value === 'm') setKey({ mode: 'minor' });
      else parser.error(`":mode" expects major or minor, found "${value}"`, at);
      return;
    }
    if (name === 'parts' || name === 'voices') {
      const next = parsePartsDirective(value);
      if (next === null) {
        parser.error(
          `":${name}" expects a comma separated list such as Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass, found "${value}"`,
          at,
        );
        return;
      }
      parts = next;
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
      if (parser.tryNumberedSectionHeader()) {
        if (currentMeasures.length > 0 || currentBeats.length > 0) flushSection();
        startSection(currentKey);
        continue;
      }
      const header = parser.trySectionHeader();
      if (header) {
        if (currentMeasures.length > 0 || currentBeats.length > 0) flushSection();
        const letter = LETTERS[((header.degree % 7) + 7) % 7] ?? 'd';
        const pitchClass = LETTER_PITCH_CLASS[letter] ?? 0;
        startSection({
          doPitch: doOctaveOf(currentKey) * 12 + pitchClass + 12 * Math.floor(header.degree / 7),
          doLetter: SOLFA_TO_PITCH_LETTER[letter] ?? 'C',
          mode: header.mode,
        });
        continue;
      }
      parser.advance();
      flushMeasure();
      measureOpen = true;
      continue;
    }

    if (code === Ch.Colon) {
      const directive = parser.readDirective();
      if (directive) applyDirective(directive.name, directive.value, start);
      continue;
    }

    const wordStart = parser.pos;
    const word = parser.readWord();
    if (word !== '' && parser.peek() === Ch.Colon) {
      parser.advance();
      const partIndex = partIndexFor(parts, word);
      if (partIndex >= 0 || !LYRIC_ALIASES.has(word.toLowerCase())) {
        runVoiceLine(word, start);
      } else {
        runLyricLine();
      }
      continue;
    }
    parser.pos = wordStart;

    const bare =
      code === Ch.Quote || code === Ch.Comma || code === Ch.LowerB || isLetter(parser.ch());
    if (bare) {
      const first = parts[0];
      if (first) runVoiceLine(first.shortName, start);
      else parser.error('No voices are declared; add a ":parts=..." directive', start);
      continue;
    }

    parser.error(`Unexpected character "${parser.ch()}"`, start);
    parser.advance();
  }

  flushSection();

  const score: Score = {
    kind: 'score',
    parts,
    sections: sections.map(
      (section): Section => ({
        kind: 'section',
        id: section.id,
        key: section.key,
        measures: section.measures.map(
          (measure): Measure => ({
            kind: 'measure',
            id: measure.id,
            beats: measure.beats.map(
              (beat): Beat => ({
                kind: 'beat',
                id: beat.id,
                pulses: beat.pulses,
                notes: beat.notes,
                lyric: beat.lyric,
              }),
            ),
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
  return letterIndex(letter as LetterName);
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
