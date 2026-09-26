import { DEFAULT_LAYOUT, layout, voiceNotesOf, SolfaDocument } from '@solfa/core';
import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SolfaEditor } from '../src/SolfaEditor.js';

afterEach(cleanup);

const CHOIR = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t', 'P: do re mi fa'].join('\n');

function mount(text = CHOIR) {
  const document = new SolfaDocument(text);
  const utils = render(<SolfaEditor document={document} />);
  const content = utils.container.querySelector('.cm-content') as HTMLElement;
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error('the text panel did not mount');
  return { document, view, ...utils };
}

function type(view: EditorView, text: string): void {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
}

function degreesOf(document: SolfaDocument, partId: string): (number | null)[] {
  return voiceNotesOf(document.getState().score)
    .filter((note) => note.partId === partId)
    .map((note) => note.degree);
}

describe('the text panel drives the engraving', () => {
  it('redraws the score as soon as the text is typed', () => {
    const { document, view } = mount();
    type(view, CHOIR.replace('A: r m f s', 'A: r m l l'));

    expect(document.getState().text).toContain('A: r m l l');
    expect(degreesOf(document, 'alto')).toEqual([1, 2, 5, 5]);
    expect(document.getState().valid).toBe(true);
  });

  it('keeps the engraving in step with a single inserted note', () => {
    const { document, view } = mount();
    const at = CHOIR.indexOf('A: r m f s') + 'A: r m f '.length;
    act(() => {
      view.dispatch({ changes: { from: at, insert: 'l ' } });
    });
    expect(document.getState().text).toContain('A: r m f l s');
    expect(degreesOf(document, 'alto')).toEqual([1, 2, 3, 5, 4]);
  });

  it('still follows the text while it is invalid', () => {
    const { document, view } = mount();
    // Fewer syllables than beats: an error, but the score must still track the text.
    type(view, CHOIR.replace('P: do re mi fa', 'P: do re'));
    expect(document.getState().valid).toBe(false);
    expect(document.getState().errors[0]?.message).toContain('lyrics have 2 syllables');
    expect(degreesOf(document, 'soprano')).toEqual([0, 1, 2, 3]);

    // Fixing it with a skipped beat makes the score valid again.
    type(view, CHOIR.replace('P: do re mi fa', 'P: do re _ fa'));
    expect(document.getState().valid).toBe(true);
    expect(document.getState().errors).toHaveLength(0);
  });

  it('grows the engraving when enough bars are added to wrap a system', () => {
    const { document, view } = mount();
    const heightOf = (): number =>
      layout(document.getState().score, document.getState().spans, DEFAULT_LAYOUT).height;
    const before = heightOf();

    const bar = ['|', 'S: d r m f', 'A: r m f s', 'T: m f s l', 'B: f s l t', 'P: do re mi fa'];
    type(view, [CHOIR, ...Array.from({ length: 40 }, () => bar.join('\n'))].join('\n'));

    expect(document.getState().valid).toBe(true);
    expect(heightOf()).toBeGreaterThan(before);
  });

  it('pushes an edit from the engraving into the text panel', () => {
    const { document, view } = mount();
    const note = voiceNotesOf(document.getState().score).find((n) => n.partId === 'alto')!;
    act(() => {
      document.dispatch({ type: 'note/select', noteIds: [note.id] });
    });
    fireEvent.click(screen.getByTitle('Monter d’un degré (flèche haut)'));

    expect(view.state.doc.toString()).toContain('A: m ~ f s');
    // The panel must not echo the change back into the document.
    const revision = document.getState().revision;
    act(() => {
      document.dispatch({ type: 'text/set', text: view.state.doc.toString() });
    });
    expect(document.getState().revision).toBe(revision);
  });
});

describe('the text panel is a real editor', () => {
  it('is built with its extensions, not a bare document', () => {
    const { container, view } = mount();
    expect(container.querySelector('.cm-gutters')).not.toBeNull();
    expect(container.querySelectorAll('.cm-lineNumbers').length).toBeGreaterThan(0);
    expect(syntaxTree(view.state).length).toBeGreaterThan(0);
  });

  it('highlights a voice label differently from a note', () => {
    const { view } = mount();
    const names: string[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name && node.name !== 'Document') names.push(node.name);
      },
    });
    expect(names).toContain('labelName');
  });

  it('undoes a whole typing run with one step', () => {
    const { document, view } = mount();
    let at = CHOIR.indexOf('S: d r m f') + 'S: d '.length;
    for (const letter of ['l', 't', 'd']) {
      act(() => {
        view.dispatch({ changes: { from: at, insert: letter } });
      });
      at += 1;
    }
    expect(document.getState().text).toContain('S: d ltdr m f');

    let steps = 0;
    while (document.getState().canUndo) {
      act(() => {
        document.dispatch({ type: 'history/undo' });
      });
      steps += 1;
      if (steps > 12) break;
    }
    expect(steps).toBe(1);
    expect(document.getState().text).toBe(CHOIR);
  });

  it('keeps a paste as its own undo step', () => {
    const { document, view } = mount();
    const at = CHOIR.indexOf('S: d r m f') + 'S: d '.length;
    act(() => {
      view.dispatch({ changes: { from: at, insert: 'ltd' } });
    });
    expect(document.getState().text).toContain('S: d ltdr m f');
    act(() => {
      document.dispatch({ type: 'history/undo' });
    });
    expect(document.getState().text).toBe(CHOIR);
  });
});
