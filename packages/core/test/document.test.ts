import { describe, expect, it } from 'vitest';
import { SolfaDocument } from '../src/document.js';
import { reconcileIds } from '../src/reconcile.js';
import { DEFAULT_PARTS, voiceNotesOf, type PartId, type Score } from '../src/score.js';
import { parse } from '../src/parse.js';
import { sequentialIdFactory } from '../src/ids.js';

const CHOIR = ['|', 'S: d : r : m : f', 'A: r : m : f : s', 'T: m : f : s : l', 'B: f : s : l : t'].join('\n');

function notesOf(text: string, tag = 'a') {
  return voiceNotesOf(parse(text, { idFactory: sequentialIdFactory(tag) }).score);
}

function degreesOf(score: Score, partId: PartId = 'soprano'): (number | null)[] {
  const index = score.parts.findIndex((part) => part.id === partId);
  const out: (number | null)[] = [];
  for (const section of score.sections) {
    for (const measure of section.measures) {
      for (const beat of measure.beats) out.push(beat.notes[index]?.degree ?? null);
    }
  }
  return out;
}

function firstNoteOf(doc: SolfaDocument, partId: PartId, index = 0) {
  let seen = 0;
  for (const note of voiceNotesOf(doc.getState().score)) {
    if (note.partId !== partId) continue;
    if (seen === index) return note;
    seen += 1;
  }
  return undefined;
}

describe('reconcileIds', () => {
  it('keeps ids when nothing changed', () => {
    const before = notesOf('|d : r : m', 'a');
    const after = notesOf('|d : r : m', 'b');
    const mapping = reconcileIds(before, after);
    expect(mapping.carriedOver).toBe(3);
    expect([...mapping.oldToNew.values()].sort()).toEqual(after.map((note) => note.id).sort());
  });

  it('preserves ids for untouched notes when one is inserted', () => {
    const before = notesOf('|d : r : m', 'a');
    const after = notesOf('|d : m : r : m', 'b');
    const mapping = reconcileIds(before, after);
    expect(mapping.oldToNew.get(before[0]!.id)).toBe(after[0]!.id);
    expect(mapping.oldToNew.get(before[2]!.id)).toBe(after[3]!.id);
  });

  it('drops ids for deleted notes', () => {
    const before = notesOf('|d : r : m', 'a');
    const after = notesOf('|d : m', 'b');
    const mapping = reconcileIds(before, after);
    expect(mapping.carriedOver).toBe(2);
    expect(mapping.oldToNew.size).toBe(2);
  });

  it('never maps two notes onto the same id', () => {
    const before = notesOf(CHOIR, 'a');
    const after = notesOf(CHOIR, 'b');
    const targets = [...reconcileIds(before, after).oldToNew.values()];
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('does not confuse two voices singing the same degree', () => {
    const before = notesOf(CHOIR, 'a');
    const after = notesOf(CHOIR, 'b');
    const mapping = reconcileIds(before, after);
    expect(mapping.carriedOver).toBe(before.length);
  });
});

describe('SolfaDocument: parsing', () => {
  it('starts from parsed text', () => {
    const doc = new SolfaDocument('|d : r : m');
    const state = doc.getState();
    expect(state.valid).toBe(true);
    expect(voiceNotesOf(state.score)).toHaveLength(3);
    expect(state.errors).toHaveLength(0);
  });

  it('exposes the declared parts', () => {
    const doc = new SolfaDocument(CHOIR);
    expect(doc.getState().score.parts).toEqual(DEFAULT_PARTS);
  });

  it('keeps the last good score when the text becomes invalid', () => {
    const doc = new SolfaDocument('|d : r : m');
    doc.dispatch({ type: 'text/set', text: '|d : r%' });
    const state = doc.getState();
    expect(state.valid).toBe(false);
    expect(state.errors.length).toBeGreaterThan(0);
    expect(voiceNotesOf(state.score).length).toBeGreaterThan(0);
  });

  it('survives a round trip through invalid and back', () => {
    const doc = new SolfaDocument("|d' : r : m");
    const original = doc.getState().text;
    doc.dispatch({ type: 'text/set', text: '|d : r%%%' });
    doc.dispatch({ type: 'text/set', text: original });
    const state = doc.getState();
    expect(state.valid).toBe(true);
    expect(state.text).toBe(original);
  });
});

describe('SolfaDocument: editing', () => {
  it('rewrites the text when a note is edited on the canvas', () => {
    const doc = new SolfaDocument('|d : r : m');
    const first = firstNoteOf(doc, 'soprano')!;
    doc.dispatch({ type: 'note/setDegree', noteId: first.id, degree: 4 });
    expect(doc.getState().text).toBe('|\nS: s : r : m\n');
  });

  it('edits only the voice that was clicked', () => {
    const doc = new SolfaDocument(CHOIR);
    const bass = firstNoteOf(doc, 'bass')!;
    doc.dispatch({ type: 'note/setDegree', noteId: bass.id, degree: 0 });
    expect(degreesOf(doc.getState().score, 'bass').slice(0, 4)).toEqual([0, 4, 5, 6]);
    expect(degreesOf(doc.getState().score, 'soprano').slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the edited note selected after a canvas edit', () => {
    const doc = new SolfaDocument('|d : r : m');
    const first = firstNoteOf(doc, 'soprano')!;
    doc.dispatch({ type: 'note/setDegree', noteId: first.id, degree: 4 });
    expect(doc.getState().selection.noteIds).toEqual([first.id]);
  });

  it('preserves surrounding note ids across a canvas edit', () => {
    const doc = new SolfaDocument('|d : r : m : f');
    const before = voiceNotesOf(doc.getState().score);
    doc.dispatch({ type: 'note/setDegree', noteId: before[1]!.id, degree: 4 });
    const after = voiceNotesOf(doc.getState().score);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[2]!.id).toBe(before[2]!.id);
    expect(after[3]!.id).toBe(before[3]!.id);
  });

  it('steps a note up and down by a degree', () => {
    const doc = new SolfaDocument('|d : r : m');
    const first = firstNoteOf(doc, 'soprano')!;
    doc.dispatch({ type: 'note/step', noteId: first.id, delta: 2 });
    expect(degreesOf(doc.getState().score)[0]).toBe(2);
    doc.dispatch({ type: 'note/step', noteId: first.id, delta: -1 });
    expect(degreesOf(doc.getState().score)[0]).toBe(1);
  });

  it('changes an accidental', () => {
    const doc = new SolfaDocument('|d : r : m');
    const first = firstNoteOf(doc, 'soprano')!;
    doc.dispatch({ type: 'note/setAccidental', noteId: first.id, accidental: 1 });
    expect(doc.getState().text).toContain('d#');
  });

  it('changes the shared rhythm from any note in the beat', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(alto.id)!;
    doc.dispatch({ type: 'beat/setPulses', beatId: beat.id, pulses: 1 });
    expect(doc.getState().text).toContain('S: d, : r : m : f');
  });

  it('sets and clears a syllable', () => {
    const doc = new SolfaDocument(CHOIR);
    const first = firstNoteOf(doc, 'soprano')!;
    const beat = doc.beatOfNote(first.id)!;
    doc.dispatch({ type: 'lyric/set', beatId: beat.id, lyric: 'Ave' });
    expect(doc.getState().text).toContain('P: Ave');
    doc.dispatch({ type: 'lyric/set', beatId: beat.id, lyric: null });
    expect(doc.getState().text).not.toContain('P:');
  });

  it('keeps the selection alive when the edited note is deleted', () => {
    const doc = new SolfaDocument('|d : r : m');
    const notes = voiceNotesOf(doc.getState().score);
    doc.dispatch({ type: 'note/select', noteIds: [notes[1]!.id] });
    doc.dispatch({ type: 'text/set', text: '|d : m'});
    expect(doc.getState().selection.noteIds).toEqual([]);
  });
});

describe('SolfaDocument: rests', () => {
  it('turns a note into a rest without touching the other voices', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(alto.id)!;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: true });
    expect(degreesOf(doc.getState().score, 'alto').slice(0, 2)).toEqual([null, 2]);
    expect(degreesOf(doc.getState().score, 'soprano').slice(0, 2)).toEqual([0, 1]);
    expect(doc.getState().text).toContain('A: 0 : m : f : s');
  });

  it('brings a rest back at the pitch the voice sang just before', () => {
    const doc = new SolfaDocument(CHOIR);
    const third = firstNoteOf(doc, 'alto', 2)!;
    const beat = doc.beatOfNote(third.id)!;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: true });
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: false });
    expect(degreesOf(doc.getState().score, 'alto').slice(0, 4)).toEqual([1, 2, 2, 4]);
  });

  it('falls back to the next note for a voice that has not sung yet', () => {
    const doc = new SolfaDocument(CHOIR);
    const firstAlto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(firstAlto.id)!;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: true });
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: false });
    expect(degreesOf(doc.getState().score, 'alto').slice(0, 2)).toEqual([2, 2]);
    expect(degreesOf(doc.getState().score, 'soprano').slice(0, 2)).toEqual([0, 1]);
  });

  it('gives a voice that never sings the tonic', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({
      type: 'parts/set',
      parts: [
        ...DEFAULT_PARTS,
        { kind: 'part', id: 'descant', name: 'Descant', shortName: 'D', clef: 'treble' },
      ],
    });
    const beat = doc.getState().score.sections[0]!.measures[0]!.beats[0]!;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'descant', rest: false });
    expect(degreesOf(doc.getState().score, 'descant')).toEqual([0, null, null, null]);
  });

  it('keeps the shared rhythm when the top voice rests', () => {
    const doc = new SolfaDocument(CHOIR);
    const soprano = firstNoteOf(doc, 'soprano')!;
    const beat = doc.beatOfNote(soprano.id)!;
    doc.dispatch({ type: 'beat/setPulses', beatId: beat.id, pulses: 3 });
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'soprano', rest: true });
    expect(doc.getState().text).toContain('S: 0!. : r : m : f');
    const again = doc.getState();
    expect(again.valid).toBe(true);
    expect(again.text).toContain('S: 0!. : r : m : f');
  });

  it('drops the selection when the selected note becomes a rest', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(alto.id)!;
    doc.dispatch({ type: 'note/select', noteIds: [alto.id] });
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: true });
    expect(doc.getState().selection.noteIds).toEqual([]);
  });

  it('keeps the selection when another voice is silenced', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const bass = firstNoteOf(doc, 'bass')!;
    doc.dispatch({ type: 'note/select', noteIds: [alto.id] });
    doc.dispatch({ type: 'voice/setRest', beatId: doc.beatOfNote(bass.id)!.id, partId: 'bass', rest: true });
    expect(doc.getState().selection.noteIds).toEqual([alto.id]);
  });

  it('ignores a rest toggle that would change nothing', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(alto.id)!;
    const before = doc.getState().revision;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: false });
    expect(doc.getState().revision).toBe(before);
  });

  it('undoes silencing a note', () => {
    const doc = new SolfaDocument(CHOIR);
    const alto = firstNoteOf(doc, 'alto')!;
    const beat = doc.beatOfNote(alto.id)!;
    doc.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: 'alto', rest: true });
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe(CHOIR);
  });
});

describe('SolfaDocument: history', () => {
  it('undoes and redoes a canvas edit', () => {
    const doc = new SolfaDocument('|d : r : m');
    const first = firstNoteOf(doc, 'soprano')!;
    doc.dispatch({ type: 'note/setDegree', noteId: first.id, degree: 4 });
    expect(doc.getState().text).toBe('|\nS: s : r : m\n');
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe('|d : r : m');
    doc.dispatch({ type: 'history/redo' });
    expect(doc.getState().text).toBe('|\nS: s : r : m\n');
  });

  it('reports what it can undo and redo', () => {
    const doc = new SolfaDocument('|d : r : m');
    expect(doc.getState().canUndo).toBe(false);
    doc.dispatch({ type: 'text/set', text: '|d : r : m : f'});
    expect(doc.getState().canUndo).toBe(true);
    expect(doc.getState().canRedo).toBe(false);
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().canUndo).toBe(false);
    expect(doc.getState().canRedo).toBe(true);
  });

  it('coalesces rapid typing into one undo step', () => {
    const doc = new SolfaDocument('|d');
    doc.dispatch({ type: 'text/set', text: '|d : r',coalesceKey: 'typing' });
    doc.dispatch({ type: 'text/set', text: '|d : r : m',coalesceKey: 'typing' });
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe('|d');
  });
});

describe('SolfaDocument: parts', () => {
  it('accepts a custom set of voices', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({
      type: 'parts/set',
      parts: [
        { kind: 'part', id: 'descant', name: 'Descant', shortName: 'D', clef: 'treble' },
        { kind: 'part', id: 'chorus', name: 'Chorus', shortName: 'C', clef: 'treble' },
      ],
    });
    const state = doc.getState();
    expect(state.valid).toBe(true);
    expect(state.score.parts.map((part) => part.id)).toEqual(['descant', 'chorus']);
    expect(state.text).toContain(':parts=Descant:D:treble,Chorus:C:treble');
  });

  it('keeps the notes that land on a surviving voice', () => {
    const doc = new SolfaDocument(CHOIR);
    const soprano = firstNoteOf(doc, 'soprano')!;
    const bass = firstNoteOf(doc, 'bass')!;
    doc.dispatch({
      type: 'parts/set',
      parts: [
        { kind: 'part', id: 'soprano', name: 'Soprano', shortName: 'S', clef: 'treble' },
        { kind: 'part', id: 'bass', name: 'Bass', shortName: 'B', clef: 'bass' },
      ],
    });
    const after = doc.getState();
    expect(voiceNotesOf(after.score).some((note) => note.id === soprano.id)).toBe(true);
    expect(voiceNotesOf(after.score).some((note) => note.id === bass.id)).toBe(true);
  });

  it('ignores an empty set of voices', () => {
    const doc = new SolfaDocument(CHOIR);
    const before = doc.getState().text;
    doc.dispatch({ type: 'parts/set', parts: [] });
    expect(doc.getState().text).toBe(before);
  });
});

describe('SolfaDocument: title', () => {
  it('sets and clears the title', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({ type: 'title/set', field: 'title', value: 'Ave Maria' });
    expect(doc.getState().score.title).toBe('Ave Maria');
    expect(doc.getState().text).toContain(':title=Ave Maria');
    doc.dispatch({ type: 'title/set', field: 'title', value: '' });
    expect(doc.getState().score.title).toBeNull();
    expect(doc.getState().text).not.toContain(':title');
  });

  it('sets and clears the subtitle', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({ type: 'title/set', field: 'subtitle', value: 'Cordes' });
    expect(doc.getState().score.subtitle).toBe('Cordes');
    expect(doc.getState().text).toContain(':subtitle=Cordes');
  });

  it('trims surrounding spaces', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({ type: 'title/set', field: 'title', value: '  Ave Maria  ' });
    expect(doc.getState().score.title).toBe('Ave Maria');
    expect(doc.getState().text).toContain(':title=Ave Maria\n');
  });

  it('ignores a change to the value it already has', () => {
    const doc = new SolfaDocument(CHOIR);
    const untouched = doc.getState().revision;
    doc.dispatch({ type: 'title/set', field: 'title', value: '   ' });
    expect(doc.getState().revision).toBe(untouched);

    doc.dispatch({ type: 'title/set', field: 'title', value: 'Ave Maria' });
    const set = doc.getState().revision;
    doc.dispatch({ type: 'title/set', field: 'title', value: 'Ave Maria' });
    expect(doc.getState().revision).toBe(set);
  });

  it('undoes and redoes a title change', () => {
    const doc = new SolfaDocument(CHOIR);
    doc.dispatch({ type: 'title/set', field: 'title', value: 'Ave Maria' });
    doc.dispatch({ type: 'title/set', field: 'subtitle', value: 'Cordes' });
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().score.subtitle).toBeNull();
    expect(doc.getState().score.title).toBe('Ave Maria');
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().score.title).toBeNull();
    expect(doc.getState().text).toBe(CHOIR);
    doc.dispatch({ type: 'history/redo' });
    expect(doc.getState().score.title).toBe('Ave Maria');
  });

  it('leaves the notes alone', () => {
    const doc = new SolfaDocument(CHOIR);
    const before = degreesOf(doc.getState().score, 'soprano');
    doc.dispatch({ type: 'title/set', field: 'title', value: 'Ave Maria' });
    expect(degreesOf(doc.getState().score, 'soprano')).toEqual(before);
  });
});
