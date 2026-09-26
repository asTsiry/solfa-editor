import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { SolfaDocument } from '@solfa/core';

export type LyricEditorTarget = {
  readonly beatId: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly lyric: string | null;
} | null;

export type LyricEditorProps = {
  readonly document: SolfaDocument;
  readonly target: LyricEditorTarget;
  readonly onClose: () => void;
};

/**
 * An inline field positioned over a syllable in the engraving, so a lyric can be
 * written without leaving the score. Enter or blur confirms, Escape cancels.
 */
export function LyricEditor(props: LyricEditorProps): JSX.Element | null {
  const { target, document, onClose } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const cancelled = useRef(false);

  useEffect(() => {
    if (!target) return;
    cancelled.current = false;
    setValue(target.lyric ?? '');
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, [target]);

  const commit = useCallback(() => {
    if (!target || cancelled.current) return;
    document.dispatch({ type: 'lyric/set', beatId: target.beatId, lyric: value.trim() });
  }, [document, target, value]);

  if (!target) return null;

  return (
    <input
      ref={inputRef}
      className="solfa-lyric-input"
      style={{ left: `${target.x}px`, top: `${target.y}px`, fontSize: `${target.fontSize}px` }}
      data-testid="solfa-lyric-input"

      value={value}
      size={Math.max(6, value.length + 2)}
      aria-label="Syllabe"
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          onClose();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelled.current = true;
          onClose();
        }
      }}
      onBlur={() => {
        commit();
        onClose();
      }}
    />
  );
}
