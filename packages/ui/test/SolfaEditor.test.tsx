import {
  DEFAULT_LAYOUT,
  textBox,
  layout,
  SolfaDocument,
  voiceNotesOf,
  type DisplayGlyph,
} from '@solfa/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { JSX } from 'react';
import { SolfaEditor } from '../src/SolfaEditor.js';

function screenButtonByTitle(startsWith: string): HTMLButtonElement {
  const button = document.querySelector(`[title^="${startsWith}"]`);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no button titled ${startsWith}`);
  return button;
}

function screenUpButton(): HTMLButtonElement {
  return screenButtonByTitle('Monter d’un degré');
}

function screenDownButton(): HTMLButtonElement {
  return screenButtonByTitle('Descendre d’un degré');
}

afterEach(cleanup);

const CHOIR = ['|', 'S: d : r : m : f', 'A: r : m : f : s', 'T: m : f : s : l', 'B: f : s : l : t', 'P: do : re : mi : fa'].join('\n');

function Harness(props: { readonly document: SolfaDocument }): JSX.Element {
  return <SolfaEditor document={props.document} />;
}

function editorText(): string {
  return document.querySelector('.cm-content')?.textContent ?? '';
}

function errorCount(): number {
  return document.querySelectorAll('.solfa-editor-errors li').length;
}

function lyricGlyphs(laid: { items: readonly unknown[] }): DisplayGlyph[] {
  return (laid.items as readonly DisplayGlyph[]).filter(
    (item) => item.kind === 'glyph' && item.role === 'lyric',
  );
}

function degreeOf(doc: SolfaDocument, partId: string, index = 0): number | null {
  const notes = voiceNotesOf(doc.getState().score).filter((note) => note.partId === partId);
  return notes[index]?.degree ?? null;
}

function noteOf(doc: SolfaDocument, partId: string, index = 0) {
  return voiceNotesOf(doc.getState().score).filter((note) => note.partId === partId)[index];
}

describe('SolfaEditor', () => {
  it('renders both a canvas and a text surface', () => {
    const doc = new SolfaDocument('|d : r : m');
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

    await waitFor(() => expect(doc.getState().text).toContain('A: r : m : f : l'));
    await waitFor(() => expect(editorText()).toContain('A: r : m : f : l'));
  });

  it('leaves the other voices untouched when one note moves', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);

    doc.dispatch({ type: 'note/step', noteId: noteOf(doc, 'bass', 3)!.id, delta: 1 });

    const text = doc.getState().text;
    expect(text).toContain('S: d : r : m : f');
    expect(text).toContain('A: r : m : f : s');
    expect(text).toContain('T: m : f : s : l');
    expect(text).toContain('B: f : s : l : d');
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
    doc.dispatch({ type: 'text/set', text: '|\nS: f : s : l : t\nA: s : l : t : d\nT: l : t : d : r\nB: t : d : r : m' });
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
    doc.dispatch({ type: 'text/set', text: '|\nS: s : l : t : d\nA: l : t : d : r\nT: t : d : r : m\nB: d : r : m : f' });
    await waitFor(() => expect(editorText()).toContain('S: s : l : t : d'));
  });
});

describe('SolfaEditor: note controls', () => {
  function selectNote(doc: SolfaDocument, partId: string, index = 0) {
    const note = noteOf(doc, partId, index);
    act(() => {
      doc.dispatch({ type: 'note/select', noteIds: [note!.id] });
    });
    return note!;
  }

  it('disables the note buttons until a note is selected', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const buttons = document.querySelectorAll('.solfa-toolbar-button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of Array.from(buttons)) expect(button.disabled).toBe(true);
  });

  it('raises the selected note with the up button', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(degreeOf(doc, 'alto')).toBe(1);
    selectNote(doc, 'alto');
    fireEvent.click(screenUpButton());
    expect(degreeOf(doc, 'alto')).toBe(2);
    expect(doc.getState().text).toContain('A: m : ~ : f : s');
  });

  it('lowers the selected note with the down button', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(degreeOf(doc, 'alto')).toBe(1);
    selectNote(doc, 'alto');
    fireEvent.click(screenDownButton());
    expect(degreeOf(doc, 'alto')).toBe(0);
    expect(doc.getState().text).toContain('A: d : m : f : s');
  });

  it('shifts the selected note by an octave', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(degreeOf(doc, 'bass')).toBe(3);
    selectNote(doc, 'bass');
    fireEvent.click(screenButtonByTitle('Monter d’une octave'));
    expect(degreeOf(doc, 'bass')).toBe(10);
  });

  it('adds and clears an accidental', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'tenor');
    fireEvent.click(screenButtonByTitle('Rendre cette note dièse'));
    expect(doc.getState().text).toContain('T: m# : f : s : l');
    fireEvent.click(screenButtonByTitle('Enlever l’altération'));
    expect(doc.getState().text).toContain('T: m : f : s : l');
  });

  it('silences the selected voice on that beat', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'bass', 1);
    fireEvent.click(screenButtonByTitle('Faire taire cette voix'));
    expect(doc.getState().text).toContain('B: f : 0 : l : t');
    expect(degreeOf(doc, 'alto', 1)).toBe(2);
  });

  it('drops the toolbar when the selected note is silenced', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'bass', 1);
    fireEvent.click(screenButtonByTitle('Faire taire cette voix'));
    expect(screenUpButton().disabled).toBe(true);
    expect(doc.getState().selection.noteIds).toEqual([]);
  });

  it('keeps the rhythm when the top voice is silenced by the button', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'soprano', 0);
    fireEvent.click(screenButtonByTitle('Faire taire cette voix'));
    expect(doc.getState().text).toContain('S: 0 : r : m : f');
    expect(doc.getState().valid).toBe(true);
  });

  it('opens the inline editor by clicking the syllable itself', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const laid = layout(doc.getState().score, doc.getState().spans, DEFAULT_LAYOUT);
    const glyph = lyricGlyphs(laid)[0]!;
    const box = textBox(glyph);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, { clientX: box.centerX, clientY: box.centerY });

    const input = document.querySelector('[data-testid="solfa-lyric-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('do');
    // The field must sit on the syllable, not below it.
    expect(input.style.left).toBe(`${box.centerX}px`);
    expect(input.style.top).toBe(`${box.centerY}px`);
    expect(input.style.fontSize).toBe(`${glyph.fontSize}px`);
    // Clicking a word must not also select the voice underneath it.
    expect(doc.getState().selection.noteIds).toEqual([]);
  });

  it('still selects a note when the click lands on the staff', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const laid = layout(doc.getState().score, doc.getState().spans, DEFAULT_LAYOUT);
    const note = laid.notes[0]!;
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, {
      clientX: note.x + note.width / 2,
      clientY: note.y + note.height / 2,
    });

    expect(doc.getState().selection.noteIds).toEqual([note.noteId]);
    expect(document.querySelector('[data-testid="solfa-lyric-input"]')).toBeNull();
  });

  it('adds a syllable to a beat that has none by clicking the empty slot', () => {
    const doc = new SolfaDocument(['|', 'S: d : r : m : f', 'A: r : m : f : s', 'T: m : f : s : l', 'B: f : s : l : t', 'P: do : _ : _ : _'].join('\n'));
    render(<Harness document={doc} />);
    const laid = layout(doc.getState().score, doc.getState().spans, DEFAULT_LAYOUT);
    const slot = laid.items.find(
      (item) => item.kind === 'glyph' && item.role === 'lyric' && item.code === '',
    )!;
    const box = textBox(slot);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;

    fireEvent.pointerDown(canvas, { clientX: box.centerX, clientY: box.centerY });
    const input = document.querySelector('[data-testid="solfa-lyric-input"]') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'la' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(doc.getState().text).toContain('P: do : la : _ : _');
  });

  it('types the title into the heading and keeps it in the text', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const input = screen.getByTestId('solfa-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ave Maria' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(doc.getState().score.title).toBe('Ave Maria');
    expect(doc.getState().text).toContain(':title=Ave Maria');
  });

  it('commits the title on blur', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const input = screen.getByTestId('solfa-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ave Maria' } });
    fireEvent.blur(input);
    expect(doc.getState().score.title).toBe('Ave Maria');
  });

  it('shows the existing title in the heading', () => {
    const doc = new SolfaDocument(`:title=Ave Maria\n${CHOIR}`);
    render(<Harness document={doc} />);
    expect((screen.getByTestId('solfa-title-input') as HTMLInputElement).value).toBe('Ave Maria');
  });

  it('centres the heading on the page and on the engraved title', () => {
    const doc = new SolfaDocument(`:title=Ave Maria\n${CHOIR}`);
    const { container } = render(<Harness document={doc} />);
    const laid = layout(doc.getState().score, doc.getState().spans, DEFAULT_LAYOUT);
    const title = laid.items.find(
      (item) => item.kind === 'glyph' && item.role === 'title',
    )!;
    const box = textBox(title);
    const input = screen.getByTestId('solfa-title-input') as HTMLInputElement;
    expect(input.style.left).toBe(`${box.centerX}px`);
    expect(input.style.top).toBe(`${box.centerY}px`);
    expect(input.style.fontSize).toBe(`${title.fontSize}px`);
    expect(container.querySelector('.solfa-heading')).not.toBeNull();
  });

  it('hides the subtitle until the button asks for it', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(screen.queryByTestId('solfa-subtitle-input')).toBeNull();
    fireEvent.click(screen.getByTestId('solfa-add-subtitle'));
    expect(screen.getByTestId('solfa-subtitle-input')).not.toBeNull();
    // Still nothing written: the button only reveals the field.
    expect(doc.getState().score.subtitle).toBeNull();
  });

  it('types a subtitle once revealed', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    fireEvent.click(screen.getByTestId('solfa-add-subtitle'));
    const input = screen.getByTestId('solfa-subtitle-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Cordes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(doc.getState().score.subtitle).toBe('Cordes');
    expect(doc.getState().text).toContain(':subtitle=Cordes');
  });

  it('reveals a subtitle that the text already had', () => {
    const doc = new SolfaDocument(`:subtitle=Cordes\n${CHOIR}`);
    render(<Harness document={doc} />);
    expect((screen.getByTestId('solfa-subtitle-input') as HTMLInputElement).value).toBe('Cordes');
    expect(screen.queryByTestId('solfa-add-subtitle')).toBeNull();
  });

  it('removes the subtitle again', () => {
    const doc = new SolfaDocument(`:title=Ave Maria\n:subtitle=Cordes\n${CHOIR}`);
    render(<Harness document={doc} />);
    fireEvent.click(screen.getByTestId('solfa-remove-subtitle'));
    expect(doc.getState().score.subtitle).toBeNull();
    expect(doc.getState().text).not.toContain(':subtitle');
    expect(doc.getState().score.title).toBe('Ave Maria');
  });

  it('keeps a removed subtitle out of the way until asked again', () => {
    const doc = new SolfaDocument(`:title=Ave Maria\n:subtitle=Cordes\n${CHOIR}`);
    render(<Harness document={doc} />);
    fireEvent.click(screen.getByTestId('solfa-remove-subtitle'));
    expect(screen.queryByTestId('solfa-subtitle-input')).toBeNull();
    fireEvent.click(screen.getByTestId('solfa-add-subtitle'));
    expect((screen.getByTestId('solfa-subtitle-input') as HTMLInputElement).value).toBe('');
  });

  it('undoes a title typed in the heading', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const input = screen.getByTestId('solfa-title-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ave Maria' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    act(() => {
      doc.dispatch({ type: 'history/undo' });
    });
    expect(doc.getState().score.title).toBeNull();
    expect((screen.getByTestId('solfa-title-input') as HTMLInputElement).value).toBe('');
  });

  it('leaves the note arrows alone while typing in the title', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'alto');
    fireEvent.keyDown(screen.getByTestId('solfa-title-input'), { key: 'ArrowUp' });
    expect(degreeOf(doc, 'alto')).toBe(1);
  });

  it('leaves the note arrows alone while typing in the subtitle', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'alto');
    fireEvent.click(screen.getByTestId('solfa-add-subtitle'));
    fireEvent.keyDown(screen.getByTestId('solfa-subtitle-input'), { key: 'ArrowUp' });
    expect(degreeOf(doc, 'alto')).toBe(1);
  });

  it('leaves the note arrows alone while typing a syllable', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'alto');
    fireEvent.click(screenButtonByTitle('Écrire la syllabe'));
    fireEvent.keyDown(screen.getByTestId('solfa-lyric-input'), { key: 'ArrowUp' });
    expect(degreeOf(doc, 'alto')).toBe(1);
  });

  it('cycles the accidental with the combined button', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'tenor');
    fireEvent.click(screenButtonByTitle('Faire alterner'));
    expect(doc.getState().text).toContain('T: m# : f : s : l');
    fireEvent.click(screenButtonByTitle('Faire alterner'));
    expect(doc.getState().text).toContain('T: mb : f : s : l');
    fireEvent.click(screenButtonByTitle('Faire alterner'));
    expect(doc.getState().text).toContain('T: m : f : s : l');
  });

  it('moves the selected note with the arrow keys', () => {
    const doc = new SolfaDocument(CHOIR);
    const { container } = render(<Harness document={doc} />);
    expect(degreeOf(doc, 'soprano', 3)).toBe(3);
    selectNote(doc, 'soprano', 3);
    const stage = container.querySelector('.solfa-editor-canvas') as HTMLElement;
    stage.focus();
    fireEvent.keyDown(stage, { key: 'ArrowUp' });
    expect(degreeOf(doc, 'soprano', 3)).toBe(4);

    fireEvent.keyDown(stage, { key: 'ArrowDown' });
    expect(degreeOf(doc, 'soprano', 3)).toBe(3);
  });

  it('moves the selected note by an octave with shift and the arrow keys', () => {
    const doc = new SolfaDocument(CHOIR);
    const { container } = render(<Harness document={doc} />);
    selectNote(doc, 'soprano', 3);
    const stage = container.querySelector('.solfa-editor-canvas') as HTMLElement;
    stage.focus();
    fireEvent.keyDown(stage, { key: 'ArrowUp', shiftKey: true });
    expect(degreeOf(doc, 'soprano', 3)).toBe(10);
  });

  it('ignores arrow keys while typing in the text surface', () => {
    const doc = new SolfaDocument(CHOIR);
    const { container } = render(<Harness document={doc} />);
    selectNote(doc, 'soprano', 3);
    const before = doc.getState().text;
    const content = container.querySelector('.cm-content') as HTMLElement;
    fireEvent.keyDown(content, { key: 'ArrowUp' });
    expect(doc.getState().text).toBe(before);
  });

  it('undoes a button edit with a single step', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    selectNote(doc, 'alto');
    fireEvent.click(screenUpButton());
    expect(degreeOf(doc, 'alto')).toBe(2);
    doc.dispatch({ type: 'history/undo' });
    expect(doc.getState().text).toBe(CHOIR);
    expect(degreeOf(doc, 'alto')).toBe(1);
  });
});

describe('SolfaEditor: lyrics', () => {
  it('opens an inline field from the toolbar and writes the syllable', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const note = noteOf(doc, 'soprano', 1)!;
    act(() => {
      doc.dispatch({ type: 'note/select', noteIds: [note.id] });
    });

    fireEvent.click(screenButtonByTitle('Écrire la syllabe'));
    const input = await screen.findByTestId('solfa-lyric-input');
    fireEvent.change(input, { target: { value: 'Ma' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(doc.getState().text).toContain('P: do : Ma : mi : fa'));
  });

  it('confirms on blur', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const note = noteOf(doc, 'soprano', 1)!;
    act(() => {
      doc.dispatch({ type: 'note/select', noteIds: [note.id] });
    });

    fireEvent.click(screenButtonByTitle('Écrire la syllabe'));
    const input = await screen.findByTestId('solfa-lyric-input');
    fireEvent.change(input, { target: { value: 'Ma' } });
    fireEvent.blur(input);

    await waitFor(() => expect(doc.getState().text).toContain('P: do : Ma : mi : fa'));
  });

  it('discards the edit on escape', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const note = noteOf(doc, 'soprano', 1)!;
    act(() => {
      doc.dispatch({ type: 'note/select', noteIds: [note.id] });
    });

    fireEvent.click(screenButtonByTitle('Écrire la syllabe'));
    const input = await screen.findByTestId('solfa-lyric-input');
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('solfa-lyric-input')).toBeNull());
    expect(doc.getState().text).toBe(CHOIR);
  });

  it('clears a syllable when the field is emptied', async () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const note = noteOf(doc, 'soprano', 0)!;
    act(() => {
      doc.dispatch({ type: 'note/select', noteIds: [note.id] });
    });

    fireEvent.click(screenButtonByTitle('Écrire la syllabe'));
    const input = await screen.findByTestId('solfa-lyric-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(doc.getState().text).toContain('P: _ : re : mi : fa'));
  });
});

describe('the key line', () => {
  function timeSelect(): HTMLSelectElement {
    const select = document.querySelector('[data-testid="solfa-time-select"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('no time signature select');
    return select;
  }

  function tonic(): string {
    const node = document.querySelector('[data-testid="solfa-key-line-tonic"]');
    return node?.textContent ?? '';
  }

  function tonicSelect(): HTMLSelectElement {
    const select = document.querySelector('[data-testid="solfa-tonic-select"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('no tonic select');
    return select;
  }

  it('shows the tonic and the default signature', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    expect(tonic()).toBe('Do');
    expect(tonicSelect().value).toBe('C');
    expect(timeSelect().value).toBe('4/4');
  });

  it('reads the tonic of a transposed score', () => {
    const doc = new SolfaDocument([':do=F#', '|', 'S: d : r'].join('\n'));
    render(<Harness document={doc} />);
    expect(tonic()).toBe('Fa dia');
    expect(tonicSelect().value).toBe('F#');
  });

  it('offers the twelve tonics', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    const values = [...tonicSelect().options].map((option) => option.value);
    expect(values).toEqual(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  });

  it('changes the key from the dropdown and writes it to the text', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    fireEvent.change(tonicSelect(), { target: { value: 'Eb' } });
    expect(tonic()).toBe('Mi bem');
    expect(tonicSelect().value).toBe('Eb');
    expect(doc.getState().text).toContain(':do=Eb');
    expect(doc.getState().score.sections[0]?.key.doPitch % 12).toBe(3);
  });

  it('keeps the mode when the tonic changes', () => {
    const doc = new SolfaDocument([':do=C', ':mode=minor', '|', 'S: d : r'].join('\n'));
    render(<Harness document={doc} />);
    fireEvent.change(tonicSelect(), { target: { value: 'G' } });
    expect(doc.getState().score.sections[0]?.key.mode).toBe('minor');
    expect(doc.getState().text).toContain(':do=G');
  });

  it('undoes a tonic change', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    fireEvent.change(tonicSelect(), { target: { value: 'F#' } });
    act(() => {
      doc.dispatch({ type: 'history/undo' });
    });
    expect(tonicSelect().value).toBe('C');
    expect(doc.getState().text).not.toContain(':do=');
  });

  it('shows a tonic that is not one of the twelve', () => {
    const doc = new SolfaDocument([':do=Db', '|', 'S: d : r'].join('\n'));
    render(<Harness document={doc} />);
    // Read as the text wrote it, and added to the list rather than lost.
    expect(tonic()).toBe('Ré bem');
    expect(tonicSelect().value).toBe('Db');
    expect([...tonicSelect().options].map((option) => option.value)).toContain('Db');
  });

  it('changes the signature from the dropdown and writes it to the text', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    fireEvent.change(timeSelect(), { target: { value: '6/8' } });
    expect(doc.getState().score.timeSignature).toBe('6/8');
    expect(doc.getState().text).toContain(':time=6/8');
  });

  it('follows a signature written in the text', () => {
    const doc = new SolfaDocument([':time=3/4', '|', 'S: d : r : m'].join('\n'));
    render(<Harness document={doc} />);
    expect(timeSelect().value).toBe('3/4');
  });

  it('can be undone', () => {
    const doc = new SolfaDocument(CHOIR);
    render(<Harness document={doc} />);
    fireEvent.change(timeSelect(), { target: { value: '2/4' } });
    act(() => {
      doc.dispatch({ type: 'history/undo' });
    });
    expect(doc.getState().score.timeSignature).toBe('4/4');
    expect(doc.getState().text).not.toContain(':time');
  });

  it('sits on the left, under the heading', () => {
    const doc = new SolfaDocument([':title=Ave Maria', ':subtitle=pour ch\u0153ur', CHOIR].join('\n'));
    const { container } = render(<Harness document={doc} />);
    const line = container.querySelector('.solfa-key-line');
    if (!(line instanceof HTMLElement)) throw new Error('missing key line');
    // Flush left, like the engraved key line.
    expect(line.style.left).toBe(`${DEFAULT_LAYOUT.leftMargin}px`);
    // And below the heading rather than beside the title.
    const top = Number.parseFloat(line.style.top);
    expect(top).toBeGreaterThan(DEFAULT_LAYOUT.topMargin + DEFAULT_LAYOUT.titleFontSize);
  });
});
