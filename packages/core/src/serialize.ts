import { defaultIdFactory, type IdFactory } from './ids.js';
import {
  DEFAULT_KEY,
  LETTERS,
  formatPitchName,
  inRange,
  keyLabel,
  keysEqual,
  octaveOf,
  pulseMarks,
  spellNote,
  spellToString,
  type Accidental,
  type Key,
} from './pitch.js';

import { doDegreeOf } from './parse.js';
import {
  DEFAULT_PARTS,
  partsEqual,
  type Beat,
  type Measure,
  type Part,
  type Score,
  type Section,
  type SerializedScore,
  type Span,
  type VoiceNote,
} from './score.js';

export type SerializeOptions = {
  readonly idFactory?: IdFactory;
};

const HOLD = '~';
const REST = '0';
const CONTINUE = '_';
const LYRIC_LABEL = 'P';

export function noteToText(note: VoiceNote): string {
  const degree = note.degree;
  const letter = LETTERS[((degree % 7) + 7) % 7] ?? 'd';
  const accidental: Accidental = note.accidental;
  const accidentalText = accidental > 0 ? '#' : accidental < 0 ? 'b' : '';
  const up = octaveOf(degree);
  const prefix = up < 0 ? ','.repeat(-up) : '';
  const suffix = up > 0 ? "'".repeat(up) : '';
  return `${prefix}${letter}${accidentalText}${suffix}`;
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

export function partsToText(parts: readonly Part[]): string {
  return parts.map((part) => `${part.name}:${part.shortName}:${part.clef}`).join(',');
}

export function sectionHeader(degree: number, mode: 'major' | 'minor'): string {
  const letter = LETTERS[((degree % 7) + 7) % 7] ?? 'd';
  return mode === 'minor' ? `|${letter}:m` : `|${letter}:`;
}

function samePitch(a: VoiceNote | null, b: VoiceNote | null): boolean {
  if (a === null || b === null) return false;
  return a.degree === b.degree && a.accidental === b.accidental;
}

function measureSingingParts(measure: Measure, parts: readonly Part[]): number[] {
  const active: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (measure.beats.some((beat) => beat.notes[index] !== null)) active.push(index);
  }
  return active;
}

function measureLyrics(measure: Measure): string[] {
  return measure.beats.map((beat: Beat) => beat.lyric ?? CONTINUE);
}

function hasLyrics(measure: Measure): boolean {
  return measure.beats.some((beat) => beat.lyric !== null);
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

  const parts = score.parts.length > 0 ? score.parts : DEFAULT_PARTS;
  const first = score.sections[0];

  if (first && !keysEqual(first.key, DEFAULT_KEY)) {
    for (const line of keyDirectives(first.key)) write(`${line}\n`);
  }
  if (!partsEqual(parts, DEFAULT_PARTS)) {
    write(`:parts=${partsToText(parts)}\n`);
  }

  const writeMeasure = (measure: Measure, needsBarline: boolean): void => {
    const active = measureSingingParts(measure, parts);
    if (active.length === 0 && !hasLyrics(measure)) return;

    if (needsBarline) write('|\n');

    const order = active.includes(0) ? active : [0, ...active];
    for (const partIndex of order) {
      const part = parts[partIndex];
      if (!part) continue;
      const rhythmLine = partIndex === 0;

      const chunks: string[] = [];
      let previous: VoiceNote | null = null;
      for (const beat of measure.beats) {
        const note = beat.notes[partIndex] ?? null;
        if (note === null) {
          chunks.push(rhythmLine ? `${REST}${durationToText(beat.pulses)}` : REST);
          previous = null;
          continue;
        }
        if (!rhythmLine && samePitch(previous, note)) {
          chunks.push(HOLD);
          previous = note;
          continue;
        }
        chunks.push(`${noteToText(note)}${rhythmLine ? durationToText(beat.pulses) : ''}`);
        previous = note;
      }

      const line = `${part.shortName}: ${chunks.join(' ')}\n`;
      const from = write(line);
      trackSpans(spans, measure, partIndex, from, line);
    }

    if (hasLyrics(measure)) {
      const syllables = measureLyrics(measure);
      const line = `${LYRIC_LABEL}: ${syllables.join(' ')}\n`;
      write(line);
    }
  };

  score.sections.forEach((section: Section, sectionIndex) => {
    const measures = section.measures.filter(
      (measure) => measure.beats.length > 0 && (measureSingingParts(measure, parts).length > 0 || hasLyrics(measure)),
    );
    if (measures.length === 0) return;

    if (sectionIndex > 0) {
      const degree = doDegreeOf(section.key);
      if (degree === null) {
        for (const line of keyDirectives(section.key)) write(`${line}\n`);
        write('|\n');
      } else {
        write(`${sectionHeader(degree, section.key.mode)}\n`);
      }
      writeMeasure(measures[0] as Measure, false);
    } else {
      writeMeasure(measures[0] as Measure, true);
    }

    for (const measure of measures.slice(1)) writeMeasure(measure, true);
  });

  return { text, spans };
}

function trackSpans(
  spans: Span[],
  measure: Measure,
  partIndex: number,
  lineFrom: number,
  line: string,
): void {
  const labelLength = line.indexOf(':') + 2;
  let cursor = labelLength;
  const tokens = line.slice(labelLength).trimEnd().split(' ');

  measure.beats.forEach((beat, beatIndex) => {
    const token = tokens[beatIndex] ?? '';
    const note = beat.notes[partIndex] ?? null;
    if (note && token !== HOLD && token !== REST) {
      const from = lineFrom + cursor;
      spans.push({ noteId: note.id, from, to: from + token.length });
    }
    cursor += token.length + 1;
  });
}

export function describeVoiceNote(
  score: Score,
  part: Part | undefined,
  note: VoiceNote,
): string {
  const section = score.sections.find((candidate) =>
    candidate.measures.some((measure) =>
      measure.beats.some((beat) => beat.notes.some((entry) => entry && entry.id === note.id)),
    ),
  );
  const key = section?.key ?? DEFAULT_KEY;
  const voice = part ? `${part.name}: ` : '';
  return `${voice}${keyLabel(key)} ${spellToString(spellNote(key, note))}`;
}

export function normalizedDegree(degree: number): number {
  if (inRange(degree)) return degree;
  const lower = ((degree % 7) + 7) % 7;
  return lower;
}

export { defaultIdFactory };
