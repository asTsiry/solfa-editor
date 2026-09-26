import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { SolfaEditor, createEditor } from '@solfa/ui';

const STORAGE_KEY = 'solfa-editor:text';

const SAMPLE = `// tonic sol-fa
:do=C
:mode=major
|m: d r m f s l t
|d: |d' r' m' f' s' l' t'
|r:m |r ,m ,f ,s ,l ,t ,d'
`;

export function App(): JSX.Element {
  const [document] = useState(() => createEditor(SAMPLE));
  const [notice, setNotice] = useState('');

  const save = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, document.getState().text);
      setNotice('Saved to this browser');
    } catch {
      setNotice('Could not save (storage blocked)');
    }
  }, [document]);

  const load = useCallback(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      setNotice('Nothing saved yet');
      return;
    }
    document.dispatch({ type: 'text/set', text: stored });
    setNotice('Loaded from this browser');
  }, [document]);

  const undo = useCallback(() => document.dispatch({ type: 'history/undo' }), [document]);
  const redo = useCallback(() => document.dispatch({ type: 'history/redo' }), [document]);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>Solfa Editor</h1>
        <div className="app-actions">
          <button type="button" onClick={undo}>
            Undo
          </button>
          <button type="button" onClick={redo}>
            Redo
          </button>
          <button type="button" onClick={save}>
            Save
          </button>
          <button type="button" onClick={load}>
            Load
          </button>
        </div>
        <span className="app-status">{notice}</span>
      </header>
      <main className="app-main">
        <SolfaEditor document={document} onTextChange={() => setNotice('')} />
      </main>
    </div>
  );
}
