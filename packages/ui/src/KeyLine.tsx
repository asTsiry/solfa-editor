import type { JSX } from 'react';
import {
  TIME_SIGNATURES,
  TONIC_PITCH_NAMES,
  keyForTonic,
  parsePitchName,
  tonicAccidentalWord,
  tonicPitchName,
  tonicSyllable,
  type Key,
  type SolfaDocument,
} from '@solfa/core';

export type KeyLineSlot = {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
};

export type KeyLineProps = {
  readonly document: SolfaDocument;
  /** The key of the first section, read from the text. */
  readonly tonicKey: Key;
  readonly timeSignature: string;
  /** Where the engraved key line sits. */
  readonly slot: KeyLineSlot;
};

/**
 * The tonic and the time signature, laid over the engraved key line on the left
 * of the score, under the heading. The line reads `Do dia F#, 3/4`: the syllable
 * and the alteration follow the tonic and stay read-only, while the tonic and
 * the time signature are picked from dropdowns, so neither can be typed into
 * something the engraver would not accept. Both write a directive into the text,
 * which means undo works like everywhere else.
 */
export function KeyLine(props: KeyLineProps): JSX.Element {
  const { document, tonicKey, timeSignature, slot } = props;

  const word = tonicAccidentalWord(tonicKey);
  const tonic = tonicPitchName(tonicKey);
  // A key written as `Db` or `C##` is not one of the offered tonics, so it is
  // added to the list rather than silently showing an empty dropdown.
  const tonics =
    (TONIC_PITCH_NAMES as readonly string[]).includes(tonic) ? TONIC_PITCH_NAMES : [tonic, ...TONIC_PITCH_NAMES];

  return (
    <div
      className="solfa-key-line"
      style={{
        left: `${slot.x}px`,
        top: `${slot.y}px`,
        fontSize: `${slot.fontSize}px`,
      }}
    >
      <span className="solfa-key-line-tonic" data-testid="solfa-key-line-tonic">
        {`${tonicSyllable(tonicKey)}${word === '' ? '' : ` ${word}`}`}
      </span>
      <select
        className="solfa-key-line-pitch"
        data-testid="solfa-tonic-select"
        aria-label="Tonalité"
        title="Tonalité"
        value={tonic}
        onChange={(event) => {
          const parsed = parsePitchName(event.target.value);
          if (parsed === null) return;
          document.dispatch({ type: 'key/set', key: keyForTonic(parsed, tonicKey.mode) });
        }}
      >
        {tonics.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <span className="solfa-key-line-separator">,</span>
      <select
        className="solfa-key-line-time"
        data-testid="solfa-time-select"
        aria-label="Nombre de temps"
        title="Nombre de temps"
        value={timeSignature}
        onChange={(event) => {
          document.dispatch({ type: 'time/set', value: event.target.value });
        }}
      >
        {TIME_SIGNATURES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
  );
}
