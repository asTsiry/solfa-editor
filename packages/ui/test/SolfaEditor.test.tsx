import { SolfaDocument } from '@solfa/core';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JSX } from 'react';
import { SolfaEditor } from '../src/SolfaEditor.js';

afterEach(cleanup);

function Harness(props: { readonly document: SolfaDocument }): JSX.Element {
  return <SolfaEditor document={props.document} />;
}

function editorText(): string {
  return document.querySelector('.cm-content')?.textContent ?? '';
}

function errorCount(): number {
  return document.querySelectorAll('.solfa-editor-errors li').length;
}

describe('SolfaEditor', () => {
  it('renders both a canvas and a text surface', () => {
    const doc = new SolfaDocument('|d r m');
    const { container } = render(<Harness document={doc} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('.cm-editor')).not.toBeNull();
  });

  it('parses the initial text and reports no errors', () => {
    const doc = new SolfaDocument('|d r m f');
    render(<Harness document={doc} />);
    expect(errorCount()).toBe(0);
    expect(doc.getState().valid).toBe(true);
  });

  it('surfaces parse errors for invalid text', () => {
    const doc = new SolfaDocument('|d %%%');
    render(<Harness document={doc} />);
    expect(errorCount()).toBeGreaterThan(0);
  });

  it('writes graphical note edits back into the text surface', async () => {
    const doc = new SolfaDocument('|d r m');
    render(<Harness document={doc} />);
    const [first] = doc.getState().score.sections[0]!.measures[0]!.notes;

    doc.dispatch({ type: 'note/step', noteId: first!.id, delta: 1 });

    await waitFor(() => expect(doc.getState().text).toBe('|r r m\n'));
    await waitFor(() => expect(editorText().trimEnd()).toBe('|r r m'));
  });

  it('does not add undo entries when syncing graphical edits into the text surface', () => {
    const doc = new SolfaDocument('|d r m');
    render(<Harness document={doc} />);
    const [first] = doc.getState().score.sections[0]!.measures[0]!.notes;
    const before = doc.getState().revision;

    doc.dispatch({ type: 'note/step', noteId: first!.id, delta: 1 });

    expect(doc.getState().revision).toBe(before + 1);
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe('|d r m');
  });

  it('applies a text command to the score', () => {
    const doc = new SolfaDocument('|d r');
    render(<Harness document={doc} />);
    doc.dispatch({ type: 'text/set', text: '|f s l' });
    const notes = doc.getState().score.sections[0]!.measures[0]!.notes;
    expect(notes.map((note) => note.degree)).toEqual([3, 4, 5]);
  });

  it('keeps note ids stable across a graphical edit', () => {
    const doc = new SolfaDocument('|d r m f');
    render(<Harness document={doc} />);
    const before = doc.getState().score.sections[0]!.measures[0]!.notes.map((note) => note.id);
    doc.dispatch({ type: 'note/step', noteId: before[1]!, delta: 2 });
    const after = doc.getState().score.sections[0]!.measures[0]!.notes.map((note) => note.id);
    expect(after).toEqual(before);
  });

  it('pushes an external text change into the editor', async () => {
    const doc = new SolfaDocument('|d r');
    render(<Harness document={doc} />);
    doc.dispatch({ type: 'text/set', text: '|s l t' });
    await waitFor(() => expect(editorText().trimEnd()).toBe('|s l t'));
  });
});
