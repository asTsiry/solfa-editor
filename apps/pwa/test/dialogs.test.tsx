import { createEditor } from '@solfa/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JSX } from 'react';
import { parse } from '@solfa/core';
import { HelpDialog } from '../src/HelpDialog.js';
import { SaveDialog } from '../src/SaveDialog.js';

afterEach(cleanup);

function Harness(props: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const document = createEditor('|d r m f');
  return (
    <>
      <SaveDialog open={props.open} document={document} onClose={props.onClose} />
      <HelpDialog open={props.open} onClose={props.onClose} />
    </>
  );
}

describe('SaveDialog', () => {
  it('is hidden until opened', () => {
    render(<Harness open={false} onClose={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a file name input pre-filled with a default', () => {
    render(<Harness open onClose={() => undefined} />);
    const input = screen.getByLabelText('Nom du fichier') as HTMLInputElement;
    expect(input.value).toBe('partition-solfa');
  });

  it('previews the resulting file name and updates it as you type', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => undefined} />);
    const input = screen.getByLabelText('Nom du fichier');
    await user.clear(input);
    await user.type(input, 'mélodie');
    expect(screen.getByText('melodie.pdf')).not.toBeNull();
  });

  it('offers PDF and PNG with PDF preselected', () => {
    render(<Harness open onClose={() => undefined} />);
    const pdf = screen.getByRole('radio', { name: /PDF/ }) as HTMLInputElement;
    const png = screen.getByRole('radio', { name: /Image PNG/ }) as HTMLInputElement;
    expect(pdf.checked).toBe(true);
    expect(png.checked).toBe(false);
  });

  it('switches the previewed extension when the format changes', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => undefined} />);
    await user.click(screen.getByRole('radio', { name: /Image PNG/ }));
    expect(screen.getByText('partition-solfa.png')).not.toBeNull();
  });

  it('closes when Annuler is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('HelpDialog', () => {
  function help(): HTMLElement {
    render(<Harness open onClose={() => undefined} />);
    return within(screen.getByRole('dialog', { name: 'Aide — Solfa Editor' }));
  }

  it('is titled in French', () => {
    expect(help().getByText('Aide — Solfa Editor')).not.toBeNull();
  });

  it('explains the movable-do principle and the solfa letters', () => {
    const view = help();
    expect(view.getByText(/solfège à do mobile/)).not.toBeNull();
    expect(view.getByText('Degrés 1 à 7 de la gamme')).not.toBeNull();
  });

  it('documents the voices, the holds, the rests and the lyrics', () => {
    const view = help();
    expect(view.getByRole('heading', { name: 'Les voix' })).not.toBeNull();
    expect(view.getByText('Début d\'une ligne de voix')).not.toBeNull();
    expect(view.getByText('Reprendre la note précédente de cette voix')).not.toBeNull();
    expect(view.getByText('Silence')).not.toBeNull();
    expect(view.getByText('Dans les paroles : un temps sans syllabe')).not.toBeNull();
  });

  it('documents the pulse marks and the comma rule', () => {
    const view = help();
    expect(view.getByText(/Les durées/)).not.toBeNull();
    expect(view.getByText(/demi-temps doit rester/)).not.toBeNull();
  });

  it('documents keys, modes, sections and shortcuts', () => {
    const view = help();
    expect(view.getByText('Raccourcis')).not.toBeNull();
    expect(view.getByText('Annuler la dernière modification')).not.toBeNull();
    expect(view.getByRole('heading', { name: 'La tonalité' })).not.toBeNull();
  });

  it('shows a choir example that parses without errors', () => {
    const view = help();
    const example = view.getByText(/:parts=Soprano:S:treble,Alto:A:alto/);
    const text = example.textContent ?? '';
    const parsed = parse(text.slice(text.indexOf('//')));
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.score.parts).toHaveLength(4);
  });

  it('describes every toolbar button', () => {
    const view = help();
    expect(view.getByText('Aide')).not.toBeNull();
    expect(view.getByText('Annuler')).not.toBeNull();
    expect(view.getByText('Rétablir')).not.toBeNull();
    expect(view.getByText('Charger')).not.toBeNull();
    expect(view.getByText('Enregistrer')).not.toBeNull();
  });
});
