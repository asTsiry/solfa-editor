import { defaultIdFactory, type IdFactory } from './ids.js';
import {
  DEFAULT_KEY,
  LETTERS,
  formatPitchName,
  inRange,
  keysEqual,
  octaveOf,
  pulseMarks,
  spellNote,
  spellToString,
  type Accidental,
  type Key,
  type Note,
} from './pitch.js';
import { doDegreeOf } from './parse.js';
import type { Score, SerializedScore, Span } from './score.js';

export type SerializeOptions = {
  readonly idFactory?: IdFactory;
};

export function noteToText(note: Note): string {
  const degree = note.degree;
  const letter = LETTERS[((degree % 7) + 7) % 7] ?? 'd';
  const accidental: Accidental = note.accidental;
  const accidentalText = accidental > 0 ? '#' : accidental < 0 ? 'b' : '';
  const up = octaveOf(degree);
  const prefix = up < 0 ? ','.repeat(-up) : '';
  const suffix = up > 0 ? "'".repeat(up) : '';
  return `${prefix}${letter}${accidentalText}${suffix}${durationToText(note.pulses)}`;
}

export function durationToText(pulses: number): string {
  return pulseMarks(pulses).join('');
}

function keyDirectives(key: Key): string[] {
  const lines: string[] = [];
  if (key.doPitch !== DEFAULT_KEY.doPitch || key.doLetter !== DEFAULT_KEY.doLetter) {
    lines.push(`:do=${formatPitchName(key.doPitch, key.doLetter)}`);
  }
  if (key.mode !== DEFAULT_KEY.mode) {
    lines.push(`:mode=${key.mode}`);
  }
  return lines;
}

export function sectionHeader(degree: number, mode: 'major' | 'minor'): string {
  const letter = LETTERS[((degree % 7) + 7) % 7] ?? 'd';
  return mode === 'minor' ? `|${letter}:m` : `|${letter}:`;
}

export function serialize(score: Score, options: SerializeOptions = {}): SerializedScore {
  void options.idFactory;
  const spans: Span[] = [];
  let text = '';
  const write = (chunk: string): number => {
    const from = text.length;
    text += chunk;
    return from;
  };

  const first = score.sections[0];

  if (first && !keysEqual(first.key, DEFAULT_KEY)) {
    for (const line of keyDirectives(first.key)) write(`${line}\n`);
  }

  score.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      const degree = doDegreeOf(section.key);
      if (degree === null) {
        for (const line of keyDirectives(section.key)) write(`${line}\n`);
      } else {
        write(`${sectionHeader(degree, section.key.mode)}\n`);
      }
    }

    for (const measure of section.measures) {
      if (measure.notes.length === 0) continue;
      write('|');
      measure.notes.forEach((note, noteIndex) => {
        if (noteIndex > 0) write(' ');
        const from = write(noteToText(note));
        spans.push({ noteId: note.id, from, to: text.length });
      });
      write('\n');
    }
  });

  return { text, spans };
}

export function describeNote(score: Score, note: Note): string {
  const section = score.sections.find((candidate) =>
    candidate.measures.some((measure) => measure.notes.includes(note)),
  );
  const key = section?.key ?? DEFAULT_KEY;
  return `${keyLabel(key)} ${spellToString(spellNote(key, note))}`;
}

export function keyLabel(key: Key): string {
  return `${formatPitchName(key.doPitch, key.doLetter)} ${key.mode}`;
}

export function normalizedDegree(degree: number): number {
  if (inRange(degree)) return degree;
  const lower = ((degree % 7) + 7) % 7;
  return lower;
}

export { defaultIdFactory };
