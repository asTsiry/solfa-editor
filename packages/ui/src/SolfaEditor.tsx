import {
  DEFAULT_KEY,
  DEFAULT_LAYOUT,
  describeVoiceNote,
  layout,
  textBox,
  lyricGlyphOf,
  tonicLabel,
  type LayoutOptions,
  type SolfaDocument,
  type VoiceNote,
} from '@solfa/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { SolfaCanvas, SolfaText } from './SolfaSurfaces.js';
import { LyricEditor, type LyricEditorTarget } from './LyricEditor.js';
import { KeyLine, type KeyLineSlot } from './KeyLine.js';
import { TitleBlock, type HeadingSlot } from './TitleBlock.js';
import { NoteToolbar } from './NoteToolbar.js';
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
  const [lyricTarget, setLyricTarget] = useState<LyricEditorTarget>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const selectedNoteIds = state.selection.noteIds;

  const laid = useMemo(
    () => layout(state.score, state.spans, { ...DEFAULT_LAYOUT, ...props.layoutOptions }),
    [state.score, state.spans, props.layoutOptions],
  );

  const selectedNote: VoiceNote | null = useMemo(() => {
    if (state.selection.noteIds.length !== 1) return null;
    return document.findNote(state.selection.noteIds[0] ?? '') ?? null;
  }, [document, state.selection.noteIds]);

  const handleTextChange = useCallback(
    (text: string, coalesceKey: string | null) => {
      document.dispatch(
        coalesceKey === null ? { type: 'text/set', text } : { type: 'text/set', text, coalesceKey },
      );
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

  const stepSelected = useCallback(
    (delta: number) => {
      if (!selectedNote) return;
      document.dispatch({ type: 'note/step', noteId: selectedNote.id, delta });
    },
    [document, selectedNote],
  );

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    // Anything the caret can sit in is left alone. This cannot be done with
    // stopPropagation on the field, because this listener is native and runs
    // before React's delegated handlers.
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!selectedNote) return;
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      stepSelected(event.shiftKey ? direction * 7 : direction);
    };
    host.addEventListener('keydown', onKeyDown);
    return () => host.removeEventListener('keydown', onKeyDown);
  }, [selectedNote, stepSelected]);

  const openLyricForBeat = useCallback(
    (beatId: string) => {
      const glyph = lyricGlyphOf(laid, beatId);
      const lyric = document.findBeat(beatId)?.lyric ?? null;
      if (glyph) {
        const box = textBox(glyph);
        setLyricTarget({
          beatId,
          x: box.centerX,
          y: box.centerY,
          fontSize: glyph.fontSize,
          lyric,
        });
      }
    },
    [document, laid],
  );

  // The heading inputs sit exactly on the engraved heading when there is one, and
  // on the space it would occupy otherwise, so typing a title does not move it.
  const headingSlots = useMemo(() => {
    const slotOf = (role: 'title' | 'subtitle', fallbackY: number): HeadingSlot => {
      for (const item of laid.items) {
        if (item.kind === 'glyph' && item.role === role) {
          const box = textBox(item);
          return { x: box.centerX, y: box.centerY, fontSize: item.fontSize };
        }
      }
      const fontSize = role === 'title' ? DEFAULT_LAYOUT.titleFontSize : DEFAULT_LAYOUT.subtitleFontSize;
      return { x: laid.width / 2, y: fallbackY, fontSize };
    };

    const top = DEFAULT_LAYOUT.topMargin;
    const keyLineSlot: KeyLineSlot = ((): KeyLineSlot => {
      for (const item of laid.items) {
        if (item.kind === 'glyph' && item.role === 'key-line') {
          const box = textBox(item);
          return { x: box.left, y: box.centerY, fontSize: item.fontSize };
        }
      }
      const y =
        top +
        (state.score.title === null ? 0 : DEFAULT_LAYOUT.titleFontSize + 10) +
        (state.score.subtitle === null ? 0 : DEFAULT_LAYOUT.subtitleFontSize + 12) +
        DEFAULT_LAYOUT.keyLineFontSize / 2;
      return { x: DEFAULT_LAYOUT.leftMargin, y, fontSize: DEFAULT_LAYOUT.keyLineFontSize };
    })();

    return {
      keyLineSlot,
      titleSlot: slotOf('title', top + DEFAULT_LAYOUT.titleFontSize / 2),
      subtitleSlot: slotOf(
        'subtitle',
        top +
          (state.score.title === null ? 0 : DEFAULT_LAYOUT.titleFontSize + 10) +
          DEFAULT_LAYOUT.subtitleFontSize / 2,
      ),
    };
  }, [laid, state.score.title]);

  const selectionLabel = useMemo(() => {
    if (!selectedNote) return null;
    return describeVoiceNote(state.score, document.partOfNote(selectedNote.id), selectedNote);
  }, [document, selectedNote, state.score]);

  return (
    <div className="solfa-editor">
      <div className="solfa-editor-canvas" ref={stageRef} tabIndex={-1}>
        <div className="solfa-stage">
          <SolfaCanvas
            laid={laid}
            selectedNoteIds={selectedNoteIds}
            theme={props.theme}
            onSelectNote={handleSelectNote}
            onSelectLyric={setLyricTarget}
          />
          <KeyLine
            document={document}
            tonic={tonicLabel(state.score.sections[0]?.key ?? DEFAULT_KEY)}
            timeSignature={state.score.timeSignature}
            slot={headingSlots.keyLineSlot}
          />
          <TitleBlock
            document={document}
            title={state.score.title}
            subtitle={state.score.subtitle}
            titleSlot={headingSlots.titleSlot}
            subtitleSlot={headingSlots.subtitleSlot}
          />
          <LyricEditor
            document={document}
            target={lyricTarget}
            onClose={() => {
              setLyricTarget(null);
            }}
          />
        </div>
        <NoteToolbar document={document} note={selectedNote} onEditLyric={openLyricForBeat} />
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
