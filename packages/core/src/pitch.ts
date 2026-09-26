export const LETTERS = ['d', 'r', 'm', 'f', 's', 'l', 't'] as const;

export type Letter = (typeof LETTERS)[number];

export type Accidental = -1 | 0 | 1;

export type Mode = 'major' | 'minor';

const LETTER_SET = new Set<string>(LETTERS);

export function isLetter(ch: string): ch is Letter {
  return LETTER_SET.has(ch);
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter);
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

export function scaleSteps(mode: Mode): readonly number[] {
  return mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS;
}

export type Key = {
  readonly doPitch: number;
  readonly doLetter: string;
  readonly mode: Mode;
};

export const DEFAULT_KEY: Key = { doPitch: 60, doLetter: 'C', mode: 'major' };

export function keysEqual(a: Key, b: Key): boolean {
  return a.doPitch === b.doPitch && a.mode === b.mode && a.doLetter === b.doLetter;
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

const SPELLING: Readonly<Record<number, readonly [string, Accidental]>> = {
  0: ['C', 0],
  1: ['C', 1],
  2: ['D', 0],
  3: ['D', -1],
  4: ['E', 0],
  5: ['F', 0],
  6: ['F', 1],
  7: ['G', 0],
  8: ['G', 1],
  9: ['A', 0],
  10: ['A', -1],
  11: ['B', 0],
};

export const PITCH_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

const NATURAL_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export type ParsedPitchName = {
  readonly pitchClass: number;
  readonly letter: string;
  readonly accidental: Accidental;
};

export function parsePitchName(raw: string): ParsedPitchName | null {
  const text = raw.trim();
  const letter = text.slice(0, 1).toUpperCase();
  const base = NATURAL_CLASS[letter];
  if (base === undefined) return null;

  let accidental: Accidental = 0;
  for (const ch of text.slice(1)) {
    if (ch === '#') accidental = 1;
    else if (ch === 'b') accidental = -1;
    else return null;
  }

  return { pitchClass: mod12(base + accidental), letter, accidental };
}

export function formatPitchName(doPitch: number, doLetter?: string): string {
  if (doLetter) {
    const entry = SPELLING[mod12(doPitch)];
    const accidental = entry ? entry[1] : 0;
    if (accidental > 0) return `${doLetter}#`;
    if (accidental < 0) return `${doLetter}b`;
    return doLetter;
  }
  const entry = SPELLING[mod12(doPitch)];
  if (!entry) return '?';
  const [letter, accidental] = entry;
  if (accidental > 0) return `${letter}#`;
  if (accidental < 0) return `${letter}b`;
  return letter;
}

export function keyLabel(key: Key): string {
  return `${formatPitchName(key.doPitch, key.doLetter)} ${key.mode}`;
}

export type Spelling = {
  readonly letter: string;
  readonly accidental: Accidental;
  readonly octave: number;
};

export function keyLetters(key: Key): readonly string[] {
  const start = PITCH_LETTERS.indexOf(key.doLetter as (typeof PITCH_LETTERS)[number]);
  const offset = start < 0 ? 0 : start;
  return PITCH_LETTERS.map((_, index) => PITCH_LETTERS[(offset + index) % 7]!);
}

export function spellNote(key: Key, ref: DegreeRef): Spelling {
  const letters = keyLetters(key);
  const index = ((ref.degree % 7) + 7) % 7;
  const letter = letters[index] ?? 'C';
  const actual = absolutePitch(key, ref);
  const doOctave = Math.floor(key.doPitch / 12);
  const naturalBase = doOctave * 12 + (NATURAL_CLASS[letter] ?? 0);
  const nearestOctave = Math.round((actual - naturalBase) / 12);
  const natural = naturalBase + 12 * nearestOctave;
  const difference = actual - natural;
  const accidental = Math.max(-2, Math.min(2, difference)) as Accidental;
  return {
    letter,
    accidental,
    octave: Math.floor(natural / 12) - 1,
  };
}

export function spellToString(spelling: Spelling): string {
  const sign = spelling.accidental > 0 ? '#' : spelling.accidental < 0 ? 'b' : '';
  return `${spelling.letter}${sign}${spelling.octave}`;
}

export function octaveOf(degree: number): number {
  return Math.floor(degree / 7);
}

export function inRange(degree: number): boolean {
  return degree >= 0 && degree <= 6;
}

export type DegreeRef = {
  readonly degree: number;
  readonly accidental: Accidental;
};

export function absolutePitch(key: Key, ref: DegreeRef): number {
  const steps = scaleSteps(key.mode);
  const index = ((ref.degree % 7) + 7) % 7;
  const step = steps[index] ?? 0;
  return key.doPitch + step + ref.accidental + 12 * Math.floor(ref.degree / 7);
}

export function absPitchOfDegree(key: Key, degree: number, accidental: Accidental = 0): number {
  return absolutePitch(key, { degree, accidental });
}

export const MIN_PULSES = 1;
export const CROTCHET_PULSES = 2;
export const MAX_PULSES = 16;

export function pulseMarks(pulses: number): string[] {
  if (pulses <= 1) return [','];
  if (pulses === 2) return [];
  const extra = pulses - 2;
  const codes: string[] = ['!'];
  for (let i = 0; i < Math.floor(extra / 2); i += 1) codes.push('-');
  if (extra % 2 === 1) codes.push('.');
  return codes;
}
