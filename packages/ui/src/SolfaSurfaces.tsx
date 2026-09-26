import {
  DEFAULT_LAYOUT,
  hitTest,
  layout,
  type LayoutOptions,
  type Score,
  type Span,
} from '@solfa/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { drawScore, sizeCanvas, type CanvasTheme } from './canvas/render.js';
import { createEditorState, createSolfaEditor } from './text/createEditor.js';
import type { SolfaEditorHandle } from './text/createEditor.js';

export type SolfaCanvasProps = {
  readonly score: Score;
  readonly spans: readonly Span[];
  readonly selectedNoteIds: readonly string[];
  readonly theme?: CanvasTheme | undefined;
  readonly layoutOptions?: Partial<LayoutOptions> | undefined;
  readonly onSelectNote: (noteId: string | null) => void;
  readonly onHoverNote?: (noteId: string | null) => void;
};

export function SolfaCanvas(props: SolfaCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [pixelRatio, setPixelRatio] = useState(1);

  useEffect(() => {
    setPixelRatio(window.devicePixelRatio || 1);
  }, []);

  const options = useMemo<LayoutOptions>(
    () => ({ ...DEFAULT_LAYOUT, ...props.layoutOptions }),
    [props.layoutOptions],
  );

  const laid = useMemo(() => layout(props.score, props.spans, options), [props.score, props.spans, options]);

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
      const noteId = hitTest(laid, x, y);
      if (noteId === hoveredNoteId) return;
      setHoveredNoteId(noteId);
      props.onHoverNote?.(noteId);
    },
    [toScorePoint, laid, hoveredNoteId, props],
  );

  const handleClick = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toScorePoint(event);
      props.onSelectNote(hitTest(laid, x, y));
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
      doc: createEditorState(latest.current.text),
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
