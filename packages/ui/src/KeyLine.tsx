import type { JSX } from 'react';
import { TIME_SIGNATURES, type SolfaDocument } from '@solfa/core';

export type KeyLineSlot = {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
};

export type KeyLineProps = {
  readonly document: SolfaDocument;
  /** The tonic as engraved, e.g. `Do nat C`. */
  readonly tonic: string;
  readonly timeSignature: string;
  /** Where the engraved key line sits. */
  readonly slot: KeyLineSlot;
};

/**
 * The tonic and the time signature, laid over the engraved key line on the left
 * of the score, under the heading. The tonic comes from the key and stays
 * read-only, while the time signature is picked from a dropdown, so the line
 * cannot be typed into something the engraver would not accept.
 */
export function KeyLine(props: KeyLineProps): JSX.Element {
  const { document, tonic, timeSignature, slot } = props;

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
        {tonic}
      </span>
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
