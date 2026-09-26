import type { JSX } from 'react';
import type { Accidental, SolfaDocument, VoiceNote } from '@solfa/core';

export type NoteToolbarProps = {
  readonly document: SolfaDocument;
  readonly note: VoiceNote | null;
  readonly onEditLyric?: ((beatId: string) => void) | undefined;
};

type Button = {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly run: (document: SolfaDocument, note: VoiceNote) => void;
};

const BUTTONS: readonly Button[] = [
  {
    key: 'up',
    label: '▲',
    title: 'Monter d’un degré (flèche haut)',
    run: (document, note) => {
      document.dispatch({ type: 'note/step', noteId: note.id, delta: 1 });
    },
  },
  {
    key: 'down',
    label: '▼',
    title: 'Descendre d’un degré (flèche bas)',
    run: (document, note) => {
      document.dispatch({ type: 'note/step', noteId: note.id, delta: -1 });
    },
  },
  {
    key: 'up-octave',
    label: '▲8',
    title: 'Monter d’une octave (Maj + flèche haut)',
    run: (document, note) => {
      document.dispatch({ type: 'note/step', noteId: note.id, delta: 7 });
    },
  },
  {
    key: 'down-octave',
    label: '▼8',
    title: 'Descendre d’une octave (Maj + flèche bas)',
    run: (document, note) => {
      document.dispatch({ type: 'note/step', noteId: note.id, delta: -7 });
    },
  },
  {
    key: 'sharp',
    label: '♯',
    title: 'Rendre cette note dièse',
    run: (document, note) => {
      document.dispatch({ type: 'note/setAccidental', noteId: note.id, accidental: 1 });
    },
  },
  {
    key: 'flat',
    label: '♭',
    title: 'Rendre cette note bémol',
    run: (document, note) => {
      document.dispatch({ type: 'note/setAccidental', noteId: note.id, accidental: -1 });
    },
  },
  {
    key: 'natural',
    label: '♮',
    title: 'Enlever l’altération',
    run: (document, note) => {
      document.dispatch({ type: 'note/setAccidental', noteId: note.id, accidental: 0 });
    },
  },
  {
    key: 'rest',
    label: '𝄽',
    title: 'Faire taire cette voix sur ce temps (écrire un silence)',
    run: (document, note) => {
      const beat = document.beatOfNote(note.id);
      if (!beat) return;
      document.dispatch({ type: 'voice/setRest', beatId: beat.id, partId: note.partId, rest: true });
    },
  },
];

function nextAccidental(current: Accidental): Accidental {
  return current === 0 ? 1 : current === 1 ? -1 : 0;
}

export function NoteToolbar(props: NoteToolbarProps): JSX.Element {
  const { document, note } = props;
  const disabled = note === null;

  return (
    <div className="solfa-toolbar" role="toolbar" aria-label="Édition de la note sélectionnée">
      {BUTTONS.map((button) => (
        <button
          key={button.key}
          type="button"
          className="solfa-toolbar-button"
          title={button.title}
          disabled={disabled}
          onClick={() => {
            if (note) button.run(document, note);
          }}
        >
          {button.label}
        </button>
      ))}
      <button
        type="button"
        className="solfa-toolbar-button solfa-toolbar-wide"
        title="Faire alterner dièse, bémol et naturel"
        disabled={disabled}
        onClick={() => {
          if (note) {
            document.dispatch({
              type: 'note/setAccidental',
              noteId: note.id,
              accidental: nextAccidental(note.accidental),
            });
          }
        }}
      >
        ♯ ♭ ♮
      </button>
      {props.onEditLyric ? (
        <button
          type="button"
          className="solfa-toolbar-wide"
          title="Écrire la syllabe de cette note"
          disabled={disabled}
          onClick={() => {
            if (note) {
              const beat = document.beatOfNote(note.id);
              if (beat) props.onEditLyric?.(beat.id);
            }
          }}
        >
          Parole
        </button>
      ) : null}
      <span className="solfa-toolbar-hint">
        {note ? 'Flèches pour monter/descendre' : 'Cliquez une note sur la partition'}
      </span>
    </div>
  );
}
