import { hitTestScore, textBox, lyricGlyphOf, type LaidOutScore } from '@solfa/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { drawScore, sizeCanvas, type CanvasTheme } from './canvas/render.js';
import { createSolfaEditor } from './text/createEditor.js';
import type { SolfaEditorHandle } from './text/createEditor.js';
import type { LyricEditorTarget } from './LyricEditor.js';

export type SolfaCanvasProps = {
  readonly laid: LaidOutScore;
  readonly selectedNoteIds: readonly string[];
  readonly theme?: CanvasTheme | undefined;
  readonly onSelectNote: (noteId: string | null) => void;
  readonly onHoverNote?: ((noteId: string | null) => void) | undefined;
  readonly onSelectLyric?: ((target: LyricEditorTarget) => void) | undefined;
};

export function SolfaCanvas(props: SolfaCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [pixelRatio, setPixelRatio] = useState(1);

  useEffect(() => {
    setPixelRatio(window.devicePixelRatio || 1);
  }, []);

  const laid = props.laid;
  const selected = useMemo(() => new Set(props.selectedNoteIds), [props.selectedNoteIds]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    sizeCanvas(canvas, laid, pixelRatio);
    drawScore(context, laid, {
      theme: props.theme,
      selectedNoteIds: selected,
      hoveredNoteId,
    });
  }, [laid, pixelRatio, props.theme, selected, hoveredNoteId]);

  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listener = (): void => setPixelRatio(window.devicePixelRatio || 1);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const toScorePoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toScorePoint(event);
      const hit = hitTestScore(laid, x, y);
      const noteId = hit?.kind === 'note' ? hit.noteId : null;
      if (noteId === hoveredNoteId) return;
      setHoveredNoteId(noteId);
      props.onHoverNote?.(noteId);
    },
    [toScorePoint, laid, hoveredNoteId, props],
  );

  const openLyricEditor = useCallback(
    (beatId: string) => {
      const glyph = lyricGlyphOf(laid, beatId);
      if (!glyph || !props.onSelectLyric) return;
      const box = textBox(glyph);
      props.onSelectLyric({
        beatId,
        x: box.centerX,
        y: box.centerY,
        fontSize: glyph.fontSize,
        lyric: glyph.code,
      });
    },
    [laid, props],
  );

  const handleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toScorePoint(event);
      const hit = hitTestScore(laid, x, y);
      if (hit === null) {
        props.onSelectLyric?.(null);
        return;
      }
      if (hit.kind === 'note') {
        props.onSelectNote(hit.noteId);
        return;
      }
      if (!props.onSelectLyric) return;
      openLyricEditor(hit.beatId);
    },
    [toScorePoint, laid, props, openLyricEditor],
  );

  const handleDoubleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!props.onSelectLyric) return;
      const { x, y } = toScorePoint(event);
      const hit = hitTestScore(laid, x, y);
      if (hit === null || hit.kind !== 'lyric') return;
      openLyricEditor(hit.beatId);
    },
    [toScorePoint, laid, props],
  );

  return (
    <canvas
      ref={canvasRef}
      className="solfa-canvas"
      onPointerMove={handleMove}
      onPointerLeave={() => {
        setHoveredNoteId(null);
        props.onHoverNote?.(null);
      }}
      onPointerDown={handleClick}
      onDoubleClick={handleDoubleClick}
    />
  );
}

export type SolfaTextProps = {
  readonly text: string;
  readonly onTextChange: (text: string, coalesceKey: string | null) => void;
  readonly placeholder?: string | undefined;
};

export function SolfaText(props: SolfaTextProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<SolfaEditorHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = createSolfaEditor(host, {
      text: latest.current.text,
      onChange: (text, coalesceKey) => {
        latest.current.onTextChange(text, coalesceKey);
      },
      placeholder: latest.current.placeholder,
    });
    handleRef.current = handle;
    return () => {
      handle.view.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.syncFromDocument(props.text);
  }, [props.text]);

  return <div className="solfa-text" ref={hostRef} />;
}
