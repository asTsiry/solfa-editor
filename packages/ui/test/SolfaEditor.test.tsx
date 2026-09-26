import { SolfaDocument, voiceNotesOf } from '@solfa/core';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JSX } from 'react';
import { SolfaEditor } from '../src/SolfaEditor.js';

afterEach(cleanup);

const CHOIR = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t', 'P: do re mi fa'].join('\n');

function Harness(props: { readonly document: SolfaDocument }): JSX.Element {
  return <SolfaEditor document={props.document} />;
}

function editorText(): string {
  return document.querySelector('.cm-content')?.textContent ?? '';
}

function errorCount(): number {
  return document.querySelectorAll('.solfa-editor-errors li').length;
}

function noteOf(doc: SolfaDocument, partId: string, index = 0) {
  return voiceNotesOf(doc.getState().score).filter((note) => note.partId === partId)[index];
}

describe('SolfaEditor', () => {
  it('renders both a canvas and a text surface', () => {
    const doc = new SolfaDocument('|d r m');
    const { container } = render(<Harness document={doc} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('.cm-editor')).not.toBeNull();
  });

  it('parses a full choir score and reports no errors', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(errorCount()).toBe(0);
    expect(doc.getState().valid).toBe(true);
  });

  it('reports the number of voices in the status bar', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(document.querySelector('.solfa-editor-status')?.textContent).toContain('4 voix');
  });

  it('surfaces parse errors for invalid text', () => {
    const doc = new SolfaDocument('|d %%%');
    render(<Harness document={doc} />);
    expect(errorCount()).toBeGreaterThan(0);
  });

  it('writes a graphical edit back into the text surface on its own voice line', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);

    doc.dispatch({ type: 'note/step', noteId: noteOf(doc, 'alto', 3)!.id, delta: 1 });

    await waitFor(() => expect(doc.getState().text).toContain('A: r m f l'));
    await waitFor(() => expect(editorText()).toContain('A: r m f l'));
  });

  it('leaves the other voices untouched when one note moves', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);

    doc.dispatch({ type: 'note/step', noteId: noteOf(doc, 'bass', 3)!.id, delta: 1 });

    const text = doc.getState().text;
    expect(text).toContain('S: d r m f');
    expect(text).toContain('A: r m f s');
    expect(text).toContain('T: m f s l');
    expect(text).toContain('B: f s l d');
  });

  it('does not add undo entries when syncing graphical edits into the text surface', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const before = doc.getState().revision;

    doc.dispatch({ type: 'note/step', noteId: noteOf(doc, 'soprano', 3)!.id, delta: 1 });

    expect(doc.getState().revision).toBe(before + 1);
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe(CHOIR);
  });

  it('applies a text command to every voice at once', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    doc.dispatch({ type: 'text/set', text: '|\nS: f s l t\nA: s l t d\nT: l t d r\nB: t d r m' });
    const score = doc.getState().score;
    const degrees = score.sections[0]!.measures[0]!.beats.map((beat) => beat.notes[0]!.degree);
    expect(degrees).toEqual([3, 4, 5, 6]);
    expect(score.sections[0]!.measures[0]!.beats[0]!.lyric).toBeNull();
  });

  it('keeps note ids stable across a graphical edit in one voice', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const before = voiceNotesOf(doc.getState().score).map((note) => note.id);
    doc.dispatch({ type: 'note/step', noteId: noteOf(doc, 'tenor', 2)!.id, delta: 2 });
    expect(voiceNotesOf(doc.getState().score).map((note) => note.id)).toEqual(before);
  });

  it('pushes an external text change into the editor', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    doc.dispatch({ type: 'text/set', text: '|\nS: s l t d\nA: l t d r\nT: t d r m\nB: d r m f' });
    await waitFor(() => expect(editorText()).toContain('S: s l t d'));
  });
});
