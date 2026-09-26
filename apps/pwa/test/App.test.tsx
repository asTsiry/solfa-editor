import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';

vi.mock('@solfa/ui', async () => {
  const actual = await vi.importActual<typeof import('@solfa/ui')>('@solfa/ui');
  return {
    ...actual,
    renderScoreCanvas: () => {
      throw new Error('no 2d canvas context in this environment');
    },
  };
});

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function bar(): HTMLElement {
  const element = document.querySelector('.app-bar');
  if (!element) throw new Error('missing app bar');
  return within(element as HTMLElement);
}

describe('App', () => {
  it('renders the editor with the sample score', () => {
    const { container } = render(<App />);
    expect(container.querySelector('canvas')).not.toBeNull();
    const content = container.querySelector('.cm-content')?.textContent ?? '';
    expect(content).toContain('S: d r m f s l t');
    expect(content).toContain('B: f s l t');
    expect(content).toContain('P: do re mi fa sol la si');
  });

  it('reports no parse error for the sample score', () => {
    render(<App />);
    expect(document.querySelectorAll('.solfa-editor-errors li')).toHaveLength(0);
  });

  it('exposes the French toolbar', () => {
    render(<App />);
    for (const label of ['Aide', 'Annuler', 'Rétablir', 'Charger', 'Enregistrer']) {
      expect(bar().getByRole('button', { name: label })).not.toBeNull();
    }
  });

  it('opens the export dialog from the Enregistrer button', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(bar().getByRole('button', { name: 'Enregistrer' }));

    const dialog = screen.getByRole('dialog', { name: 'Enregistrer la partition' });
    expect(within(dialog).getByLabelText('Nom du fichier')).not.toBeNull();
    expect(within(dialog).getByRole('radio', { name: /PDF/ })).not.toBeNull();
    expect(within(dialog).getByRole('radio', { name: /Image PNG/ })).not.toBeNull();
  });

  it('opens the help dialog from Aide and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(bar().getByRole('button', { name: 'Aide' }));
    const help = screen.getByRole('dialog', { name: 'Aide — Solfa Editor' });
    expect(within(help).getByText(/solfège à do mobile/)).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a French message when the export cannot run in this browser', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(bar().getByRole('button', { name: 'Enregistrer' }));
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer la partition' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(dialog).findByText(/Impossible de préparer l'image/)).not.toBeNull();
  });

  it('persists the text to localStorage on load', () => {
    render(<App />);
    expect(window.localStorage.getItem('solfa-editor:text')).toContain('A: r m f s l t');
  });

  it('reports when there is nothing to load', async () => {
    const user = userEvent.setup();
    render(<App />);
    window.localStorage.clear();
    await user.click(bar().getByRole('button', { name: 'Charger' }));
    expect(bar().getByRole('status').textContent).toBe('Rien d’enregistré pour l’instant');
  });
});
