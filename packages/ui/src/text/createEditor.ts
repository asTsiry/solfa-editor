import { EditorState, type ChangeSet, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { solfaAutocompletion } from './solfaCompletion.js';
import { solfaHighlighting, solfaLanguage } from './solfaLanguage.js';

function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    history(),
    closeBrackets(),
    autocompletion(solfaAutocompletion),
    solfaLanguage,
    solfaHighlighting,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
}

export type SolfaEditorOptions = {
  readonly text: string;
  readonly onChange: (text: string, coalesceKey: string | null) => void;
  readonly placeholder?: string | undefined;
};

type TypingRun = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
};

type SingleChange = { readonly from: number; readonly to: number; readonly insert: string };

type ChangeCapture = { count: number; single: SingleChange | null };

function isTypingChange(changes: ChangeSet, previous: TypingRun | null): TypingRun | null {
  const capture: ChangeCapture = { count: 0, single: null };
  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    capture.count += 1;
    if (capture.count > 1) return false;
    capture.single = { from: fromA, to: toA, insert: inserted.toString() };
    return undefined;
  });
  if (capture.count !== 1) return null;

  const change = capture.single;
  if (change === null) return null;

  const isSingleInsert = change.from === change.to && change.insert.length === 1;
  const isSingleDelete = change.insert.length === 0 && change.to - change.from === 1;
  if (!isSingleInsert && !isSingleDelete) return null;

  // A run continues while each edit is a single character adjacent to the window
  // the run has covered so far, in either direction, so a word typed in one go (or
  // typed then corrected) is one undo step. The window slides as the caret moves,
  // and the key of the first edit is kept, because the document skips pushing
  // history while the key still matches the top entry.
  if (
    previous !== null &&
    change.from - previous.to <= 1 &&
    previous.from - change.to <= 1
  ) {
    return {
      key: previous.key,
      from: Math.min(previous.from, change.from),
      to: Math.max(previous.to, change.to),
    };
  }

  return {
    key: `typing:${changes.newLength}:${change.from}`,
    from: change.from,
    to: change.to,
  };
}

export type SolfaEditorHandle = {
  readonly view: EditorView;
  syncFromDocument: (text: string) => void;
};

export function createSolfaEditor(
  parent: HTMLElement,
  options: SolfaEditorOptions,
): SolfaEditorHandle {
  let run: TypingRun | null = null;
  let applyingExternal = false;

  // The extensions must go into the state itself: EditorView ignores its own
  // `extensions` option whenever a `state` is supplied, which would silently cost
  // the update listener, the highlighting and the line numbers.
  const state = EditorState.create({
    doc: options.text,
    extensions: [
      ...baseExtensions(),
      placeholder(options.placeholder ?? 'd r m f s l t'),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (applyingExternal) return;
        run = isTypingChange(update.changes, run);
        options.onChange(update.state.doc.toString(), run?.key ?? null);
      }),
    ],
  });

  const view = new EditorView({ parent, state });

  const syncFromDocument = (text: string): void => {
    const current = view.state.doc.toString();
    if (current === text) return;
    applyingExternal = true;
    try {
      view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
    } finally {
      applyingExternal = false;
    }
  };

  return { view, syncFromDocument };
}
