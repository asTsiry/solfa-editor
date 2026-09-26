import { describe, expect, it } from 'vitest';
import { SolfaDocument } from '../src/document.js';
import { reconcileIds } from '../src/reconcile.js';
import { notesOf } from '../src/score.js';
import { parse } from '../src/parse.js';
import { sequentialIdFactory } from '../src/ids.js';

describe('reconcileIds', () => {
  it('keeps ids when nothing changed', () => {
    const before = notesOf(parse('|d r m', { idFactory: sequentialIdFactory('a') }).score);
    const after = notesOf(parse('|d r m', { idFactory: sequentialIdFactory('b') }).score);
    const mapping = reconcileIds(before, after);
    expect(mapping.carriedOver).toBe(3);
    expect([...mapping.oldToNew.values()].sort()).toEqual(
      after.map((note) => note.id).sort(),
    );
  });

  it('preserves ids for untouched notes when one is inserted', () => {
    const before = notesOf(parse('|d r m', { idFactory: sequentialIdFactory('a') }).score);
    const after = notesOf(parse('|d m r m', { idFactory: sequentialIdFactory('b') }).score);
    const mapping = reconcileIds(before, after);
    expect(mapping.oldToNew.get(before[0]!.id)).toBe(after[0]!.id);
    expect(mapping.oldToNew.get(before[2]!.id)).toBe(after[3]!.id);
  });

  it('drops ids for deleted notes', () => {
    const before = notesOf(parse('|d r m', { idFactory: sequentialIdFactory('a') }).score);
    const after = notesOf(parse('|d m', { idFactory: sequentialIdFactory('b') }).score);
    const mapping = reconcileIds(before, after);
    expect(mapping.carriedOver).toBe(2);
    expect(mapping.oldToNew.size).toBe(2);
  });
});

describe('SolfaDocument', () => {
  it('starts from parsed text', () => {
    const doc = new SolfaDocument('|d r m');
    const state = doc.getState();
    expect(state.valid).toBe(true);
    expect(notesOf(state.score)).toHaveLength(3);
    expect(state.errors).toHaveLength(0);
  });

  it('keeps the last good score when the text becomes invalid', () => {
    const doc = new SolfaDocument('|d r m');
    doc.dispatch({ type: 'text/set', text: '|d r %' });
    const state = doc.getState();
    expect(state.valid).toBe(false);
    expect(state.errors.length).toBeGreaterThan(0);
    expect(notesOf(state.score).length).toBeGreaterThan(0);
  });

  it('survives a round trip through invalid and back', () => {
    const doc = new SolfaDocument("|d' r m");
    const original = doc.getState().text;
    doc.dispatch({ type: 'text/set', text: '|d r %%%' });
    doc.dispatch({ type: 'text/set', text: original });
    const state = doc.getState();
    expect(state.valid).toBe(true);
    expect(state.text).toBe(original);
  });

  it('rewrites the text when a note is edited on the canvas', () => {
    const doc = new SolfaDocument('|d r m');
    const first = doc.getState().score.sections[0]!.measures[0]!.notes[0]!;
    doc.dispatch({ type: 'note/setDegree', noteId: first.id, degree: 4 });
    expect(doc.getState().text).toBe('|s r m\n');
  });

  it('keeps the edited note selected after a canvas edit', () => {
    const doc = new SolfaDocument('|d r m');
    const first = doc.getState().score.sections[0]!.measures[0]!.notes[0]!;
    doc.dispatch({ type: 'note/setDegree', noteId: first.id, degree: 4 });
    const state = doc.getState();
    expect(state.selection.noteIds).toEqual([first.id]);
  });

  it('preserves surrounding note ids across a canvas edit', () => {
    const doc = new SolfaDocument('|d r m f');
    const notes = notesOf(doc.getState().score);
    const target = notes[1]!;
    const untouched = notes.map((note) => note.id);
    doc.dispatch({ type: 'note/setPulses', noteId: target.id, pulses: 4 });
    const after = notesOf(doc.getState().score);
    expect(after.map((note) => note.id)).toEqual(untouched);
    expect(doc.getState().text).toBe('|d r!- m f\n');
  });

  it('preserves note ids when the text is retyped', () => {
    const doc = new SolfaDocument('|d r m');
    const [d, r, m] = notesOf(doc.getState().score);
    doc.dispatch({ type: 'text/set', text: '|d r m f' });
    const after = notesOf(doc.getState().score);
    expect(after[0]?.id).toBe(d?.id);
    expect(after[1]?.id).toBe(r?.id);
    expect(after[2]?.id).toBe(m?.id);
  });

  it('keeps the tail of a score identified when a note is inserted up front', () => {
    const doc = new SolfaDocument('|r m');
    const before = notesOf(doc.getState().score).map((note) => note.id);
    doc.dispatch({ type: 'text/set', text: '|d r m' });
    const after = notesOf(doc.getState().score).map((note) => note.id);
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
  });

  it('clamps note step to a sane range', () => {
    const doc = new SolfaDocument('|d');
    const note = notesOf(doc.getState().score)[0]!;
    for (let i = 0; i < 20; i += 1) {
      doc.dispatch({ type: 'note/step', noteId: note.id, delta: -1 });
    }
    expect(notesOf(doc.getState().score)[0]?.degree).toBe(0);
    expect(doc.getState().text).toBe('|d');
  });

  it('sets a key and reflects it in the text', () => {
    const doc = new SolfaDocument('|d r');
    doc.dispatch({ type: 'key/set', key: { doPitch: 69, doLetter: 'A', mode: 'major' } });
    expect(doc.getState().text).toBe(':do=A\n|d r\n');
    expect(doc.getState().score.sections[0]?.key.doPitch).toBe(69);
  });

  it('undoes and redoes a canvas edit', () => {
    const doc = new SolfaDocument('|d r m');
    const note = notesOf(doc.getState().score)[0]!;
    doc.dispatch({ type: 'note/setDegree', noteId: note.id, degree: 5 });
    expect(doc.getState().text).toBe('|l r m\n');
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe('|d r m');
    doc.dispatch({ type: 'history/redo' });
    expect(doc.getState().text).toBe('|l r m\n');
  });

  it('coalesces consecutive typing into one undo step', () => {
    const doc = new SolfaDocument('|d');
    doc.dispatch({ type: 'text/set', text: '|d r', coalesceKey: 'type' });
    doc.dispatch({ type: 'text/set', text: '|d r m', coalesceKey: 'type' });
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe('|d');
  });

  it('notifies subscribers on change', () => {
    const doc = new SolfaDocument('|d');
    let calls = 0;
    const unsubscribe = doc.subscribe(() => {
      calls += 1;
    });
    doc.dispatch({ type: 'text/set', text: '|d r' });
    expect(calls).toBe(1);
    unsubscribe();
    doc.dispatch({ type: 'text/set', text: '|d r m' });
    expect(calls).toBe(1);
  });

  it('ignores commands for notes that no longer exist', () => {
    const doc = new SolfaDocument('|d r');
    const before = doc.getState();
    doc.dispatch({ type: 'note/setDegree', noteId: 'nope', degree: 3 });
    expect(doc.getState()).toBe(before);
  });

  it('maps a text offset back to a note id', () => {
    const doc = new SolfaDocument('|d r m');
    const state = doc.getState();
    const span = state.spans[1]!;
    expect(state.spans.map((s) => s.noteId)).toContain(span.noteId);
  });
});
