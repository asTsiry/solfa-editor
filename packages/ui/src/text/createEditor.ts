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
  readonly doc: EditorState;
  readonly onChange: (text: string, coalesceKey: string | null) => void;
  readonly placeholder?: string | undefined;
};

type TypingRun = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly length: number;
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

  if (
    previous !== null &&
    previous.length === changes.newLength &&
    Math.abs(previous.to - change.from) <= 1 &&
    Math.abs(previous.from - change.to) <= 1
  ) {
    return previous;
  }

  return {
    key: `typing:${changes.newLength}:${change.from}`,
    from: change.from,
    to: change.to,
    length: changes.newLength,
  };
}

export type SolfaEditorHandle = {
  readonly view: EditorView;
  syncFromDocument: (text: string) => void;
};

export function createSolfaEditor(parent: HTMLElement, options: SolfaEditorOptions): SolfaEditorHandle {
  let run: TypingRun | null = null;
  let applyingExternal = false;

  const view = new EditorView({
    parent,
    state: options.doc,
    extensions: [
      ...baseExtensions(),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (applyingExternal) return;
        run = isTypingChange(update.changes, run);
        options.onChange(update.state.doc.toString(), run?.key ?? null);
      }),
      placeholder(options.placeholder ?? 'd r m f s l t'),
    ],
  });

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

export function createEditorState(text: string): EditorState {
  return EditorState.create({ doc: text });
}
