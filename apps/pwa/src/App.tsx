import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { SolfaEditor, createEditor } from '@solfa/ui';
import { HelpDialog } from './HelpDialog.js';
import { SaveDialog } from './SaveDialog.js';

const STORAGE_KEY = 'solfa-editor:text';

export const SAMPLE = `// Chœur à quatre voix : do = do
:do=C
:title=Ave Maria
:subtitle=pour chœur à quatre voix
|
S: d r m f s l t
A: r m f s l t d'
T: m f s l t d' r'
B: f s l t d' r' m
P: do re mi fa sol la si

|1:
S: d' r' m' f' s' l' t'
A: m' f' s' l' t' d''
T: f' s' l' t' d'' r''
B: s' l' t' d'' r'' m''
P: do' re' mi' fa' sol' la' si'
`;

export function App(): JSX.Element {
  const [document] = useState(() => createEditor(SAMPLE));
  const [notice, setNotice] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const loadFromBrowser = useCallback(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      setNotice('Rien d’enregistré pour l’instant');
      return;
    }
    document.dispatch({ type: 'text/set', text: stored });
    setNotice('Dernière version restaurée');
  }, [document]);

  useEffect(() => {
    const persist = (): void => {
      try {
        window.localStorage.setItem(STORAGE_KEY, document.getState().text);
      } catch {
        return;
      }
    };
    persist();
    return document.subscribe(persist);
  }, [document]);

  const undo = useCallback(() => document.dispatch({ type: 'history/undo' }), [document]);
  const redo = useCallback(() => document.dispatch({ type: 'history/redo' }), [document]);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>Solfa Editor</h1>
        <div className="app-actions">
          <button type="button" onClick={() => setHelpOpen(true)}>
            Aide
          </button>
          <span className="app-separator" />
          <button type="button" onClick={undo}>
            Annuler
          </button>
          <button type="button" onClick={redo}>
            Rétablir
          </button>
          <span className="app-separator" />
          <button type="button" onClick={loadFromBrowser}>
            Charger
          </button>
          <button
            type="button"
            className="solfa-button-primary"
            onClick={() => {
              setNotice('');
              setSaveOpen(true);
            }}
          >
            Enregistrer
          </button>
        </div>
        <span className="app-status" role="status">
          {notice}
        </span>
      </header>

      <main className="app-main">
        <SolfaEditor document={document} onTextChange={() => setNotice('')} />
      </main>

      <SaveDialog open={saveOpen} document={document} onClose={() => setSaveOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
