import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { SolfaDocument } from '@solfa/core';

export type HeadingSlot = {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
};

export type TitleBlockProps = {
  readonly document: SolfaDocument;
  readonly title: string | null;
  readonly subtitle: string | null;
  /** Where the engraved title sits, and the same for the subtitle. */
  readonly titleSlot: HeadingSlot;
  readonly subtitleSlot: HeadingSlot;
};

/**
 * The title, and a subtitle when one is asked for, laid over the engraved heading
 * at the top centre of the score. Both are plain inputs so the heading can be
 * typed straight onto the page, and the button reveals the subtitle only when
 * there is one to show.
 */
export function TitleBlock(props: TitleBlockProps): JSX.Element {
  const { document, title, subtitle, titleSlot, subtitleSlot } = props;
  const [subtitleOpen, setSubtitleOpen] = useState(subtitle !== null);
  const [titleDraft, setTitleDraft] = useState(title ?? '');
  const [subtitleDraft, setSubtitleDraft] = useState(subtitle ?? '');
  const lastTitle = useRef<string | null>(title);
  const lastSubtitle = useRef<string | null>(subtitle);

  useEffect(() => {
    if (title === lastTitle.current) return;
    lastTitle.current = title;
    setTitleDraft(title ?? '');
  }, [title]);

  useEffect(() => {
    if (subtitle === lastSubtitle.current) return;
    lastSubtitle.current = subtitle;
    setSubtitleDraft(subtitle ?? '');
    if (subtitle !== null) setSubtitleOpen(true);
  }, [subtitle]);

  const commitTitle = (): void => {
    document.dispatch({ type: 'title/set', field: 'title', value: titleDraft });
  };

  const commitSubtitle = (): void => {
    document.dispatch({ type: 'title/set', field: 'subtitle', value: subtitleDraft });
  };

  const showSubtitle = subtitleOpen || subtitle !== null;

  return (
    <div className="solfa-heading">
      <input
        className="solfa-heading-title"
        data-testid="solfa-title-input"
        aria-label="Titre"
        placeholder="Titre"
        size={Math.max(8, titleDraft.length + 1)}
        value={titleDraft}
        style={{
          left: `${titleSlot.x}px`,
          top: `${titleSlot.y}px`,
          fontSize: `${titleSlot.fontSize}px`,
        }}
        onChange={(event) => {
          setTitleDraft(event.target.value);
        }}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitTitle();
          }
        }}
      />
      {showSubtitle ? (
        <input
          className="solfa-heading-subtitle"
          data-testid="solfa-subtitle-input"
          aria-label="Sous-titre"
          placeholder="Sous-titre"
          size={Math.max(8, subtitleDraft.length + 1)}
          value={subtitleDraft}
          style={{
            left: `${subtitleSlot.x}px`,
            top: `${subtitleSlot.y}px`,
            fontSize: `${subtitleSlot.fontSize}px`,
          }}
          onChange={(event) => {
            setSubtitleDraft(event.target.value);
          }}
          onBlur={commitSubtitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitSubtitle();
            }
          }}
        />
      ) : null}
      {showSubtitle ? (
        <button
          type="button"
          className="solfa-heading-toggle"
          data-testid="solfa-remove-subtitle"
          title="Retirer le sous-titre"
          style={{
            left: `${subtitleSlot.x}px`,
            top: `${subtitleSlot.y}px`,
            fontSize: `${Math.round(subtitleSlot.fontSize * 0.75)}px`,
          }}
          onClick={() => {
            setSubtitleOpen(false);
            setSubtitleDraft('');
            document.dispatch({ type: 'title/set', field: 'subtitle', value: null });
          }}
        >
          Retirer
        </button>
      ) : (
        <button
          type="button"
          className="solfa-heading-toggle"
          data-testid="solfa-add-subtitle"
          title="Ajouter un sous-titre"
          style={{
            left: `${subtitleSlot.x}px`,
            top: `${subtitleSlot.y}px`,
            fontSize: `${Math.round(subtitleSlot.fontSize * 0.75)}px`,
          }}
          onClick={() => {
            setSubtitleOpen(true);
          }}
        >
          + Sous-titre
        </button>
      )}
    </div>
  );
}
