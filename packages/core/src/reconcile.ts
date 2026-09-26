import type { Score, VoiceNote } from './score.js';
import { voiceNotesOf } from './score.js';

const MAX_CELLS = 400_000;

export type IdMapping = {
  readonly oldToNew: ReadonlyMap<string, string>;
  readonly carriedOver: number;
};

function lcsPairs(a: readonly string[], b: readonly string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];

  if (n * m > MAX_CELLS) {
    const pairs: [number, number][] = [];
    const shared = Math.min(n, m);
    for (let i = 0; i < shared; i += 1) pairs.push([i, i]);
    return pairs;
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const rowBase = i * width;
      const nextRow = rowBase + width;
      if (a[i] === b[j]) {
        table[rowBase + j] = (table[nextRow + j + 1] ?? 0) + 1;
      } else {
        const skipA = table[nextRow + j] ?? 0;
        const skipB = table[rowBase + j + 1] ?? 0;
        table[rowBase + j] = skipA >= skipB ? skipA : skipB;
      }
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
      continue;
    }
    const skipA = table[(i + 1) * width + j] ?? 0;
    const skipB = table[i * width + j + 1] ?? 0;
    if (skipA >= skipB) i += 1;
    else j += 1;
  }
  return pairs;
}

export function noteKey(note: VoiceNote): string {
  return `${note.partId}:${note.degree}/${note.accidental}`;
}

export function reconcileIds(previous: readonly VoiceNote[], next: readonly VoiceNote[]): IdMapping {
  const oldToNew = new Map<string, string>();
  if (previous.length === 0 || next.length === 0) {
    return { oldToNew, carriedOver: 0 };
  }

  const pairs = lcsPairs(previous.map(noteKey), next.map(noteKey));

  for (const [oldIndex, newIndex] of pairs) {
    const oldNote = previous[oldIndex];
    const newNote = next[newIndex];
    if (oldNote && newNote) oldToNew.set(oldNote.id, newNote.id);
  }

  return { oldToNew, carriedOver: pairs.length };
}

export function carryOverIds(notes: readonly VoiceNote[], mapping: IdMapping): VoiceNote[] {
  const newToOld = new Map<string, string>();
  for (const [oldId, newId] of mapping.oldToNew) {
    newToOld.set(newId, oldId);
  }
  return notes.map((note) => {
    const stableId = newToOld.get(note.id);
    return stableId ? { ...note, id: stableId } : note;
  });
}

export function reconcileScore(previous: Score, next: Score): Score {
  const mapping = reconcileIds(voiceNotesOf(previous), voiceNotesOf(next));
  const carried = carryOverIds(voiceNotesOf(next), mapping);
  let index = 0;
  return {
    ...next,
    sections: next.sections.map((section) => ({
      ...section,
      measures: section.measures.map((measure) => ({
        ...measure,
        beats: measure.beats.map((beat) => ({
          ...beat,
          notes: beat.notes.map((note) => (note ? (carried[index++] as VoiceNote) : null)),
        })),
      })),
    })),
  };
}
