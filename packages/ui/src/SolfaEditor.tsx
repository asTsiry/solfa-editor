import { describeVoiceNote, type LayoutOptions, type SolfaDocument } from '@solfa/core';
import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { SolfaCanvas, SolfaText } from './SolfaSurfaces.js';
import { createSolfaDocument, useSolfaDocument } from './state/useSolfaDocument.js';
import type { CanvasTheme } from './canvas/render.js';

export type SolfaEditorProps = {
  readonly initialText?: string;
  readonly document?: SolfaDocument;
  readonly theme?: CanvasTheme;
  readonly layoutOptions?: Partial<LayoutOptions>;
  readonly placeholder?: string;
  readonly onTextChange?: (text: string) => void;
};

export function createEditor(initialText = ''): SolfaDocument {
  return createSolfaDocument(initialText);
}

export function SolfaEditor(props: SolfaEditorProps): JSX.Element {
  const { document, state } = useSolfaDocument(props.initialText ?? '', props.document);

  const selectedNoteIds = state.selection.noteIds;

  const handleTextChange = useCallback(
    (text: string, coalesceKey: string | null) => {
      document.dispatch(coalesceKey === null ? { type: 'text/set', text } : { type: 'text/set', text, coalesceKey });
      props.onTextChange?.(text);
    },
    [document, props],
  );

  const handleSelectNote = useCallback(
    (noteId: string | null) => {
      document.dispatch({ type: 'note/select', noteIds: noteId === null ? [] : [noteId] });
    },
    [document],
  );

  const selectionLabel = useMemo(() => {
    if (state.selection.noteIds.length !== 1) return null;
    const note = document.findNote(state.selection.noteIds[0] ?? '');
    if (!note) return null;
    return describeVoiceNote(state.score, document.partOfNote(note.id), note);
  }, [document, state.selection.noteIds, state.score]);

  return (
    <div className="solfa-editor">
      <div className="solfa-editor-canvas">
        <SolfaCanvas
          score={state.score}
          spans={state.spans}
          selectedNoteIds={selectedNoteIds}
          theme={props.theme}
          layoutOptions={props.layoutOptions}
          onSelectNote={handleSelectNote}
        />
      </div>
      <div className="solfa-editor-side">
        <SolfaText
          text={state.text}
          onTextChange={handleTextChange}
          placeholder={props.placeholder ?? '|\nS: d r m f s l t\nA: r m f s l d\nT: m f s l d r\nB: f s l d r m\nP: do re mi fa'}
        />
        <div className="solfa-editor-status" data-valid={state.valid}>
          {state.errors.length > 0 ? (
            <ul className="solfa-editor-errors">
              {state.errors.map((error) => (
                <li key={`${error.from}:${error.to}`}>{error.message}</li>
              ))}
            </ul>
          ) : (
            <span>
              {selectionLabel ??
                `${state.score.parts.length} voix - ${state.score.sections.length} section(s)`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
