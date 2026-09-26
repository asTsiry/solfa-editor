/**
 * The time signature, shown on the key line under the title. It is engraved for
 * information only: the beats of a measure are written out one by one in the text,
 * so the signature neither groups nor validates them. The dropdown therefore
 * offers the usual signatures and the value is kept as a plain string.
 */
export const TIME_SIGNATURES = [
  '4/4',
  '3/4',
  '2/4',
  '2/2',
  '6/8',
  '3/8',
  '5/8',
  '7/8',
  '9/8',
  '12/8',
  'C',
  'C|',
] as const;

export type TimeSignature = (typeof TIME_SIGNATURES)[number];

export const DEFAULT_TIME_SIGNATURE: TimeSignature = '4/4';

const PATTERN = /^(\d{1,2})\/(\d{1,2})$/;

export type ParsedMeter = {
  readonly beats: number;
  readonly unit: number;
};

/** Accepts `7/8` as well as the two cut-time forms `C` and `C|`. */
export function parseTimeSignature(raw: string): ParsedMeter | null {
  const text = raw.trim();
  if (text === 'C') return { beats: 4, unit: 4 };
  if (text === 'C|') return { beats: 2, unit: 2 };

  const match = PATTERN.exec(text);
  if (!match) return null;
  const beats = Number(match[1]);
  const unit = Number(match[2]);
  if (beats < 1 || beats > 32 || unit < 1 || unit > 32) return null;
  return { beats, unit };
}

export function isTimeSignature(raw: string): boolean {
  return parseTimeSignature(raw) !== null;
}

/** Falls back to 4/4 for anything unreadable, so the key line is never empty. */
export function normalizeTimeSignature(raw: string): string {
  const text = raw.trim();
  return isTimeSignature(text) ? text : DEFAULT_TIME_SIGNATURE;
}
