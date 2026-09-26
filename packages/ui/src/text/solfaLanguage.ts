import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const SOLFA_LETTERS = ['d', 'r', 'm', 'f', 's', 'l', 't'] as const;
export const SOLFA_MODES = ['major', 'minor'] as const;

const LETTER_SET = new Set<string>(SOLFA_LETTERS);
const PITCH_NAME = /^[A-Ga-g][#b]*$/;
const SECTION_HEADER = /^\|[',]*[drmfslt]:m?/;
const DIRECTIVE = /^:[A-Za-z]+=([A-Za-z][A-Za-z#b]*)?/;

type SolfaStreamState = { readonly directive: string | null };

const solfaParser: StreamParser<SolfaStreamState> = {
  name: 'solfa',
  startState: (): SolfaStreamState => ({ directive: null }),

  token(stream): string | null {
    if (stream.eat(/^\s+/)) return null;

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match(SECTION_HEADER)) return 'heading';

    if (stream.match('|')) return 'separator';

    if (stream.match(DIRECTIVE)) {
      const text = stream.current();
      const equals = text.indexOf('=');
      const name = text.slice(1, equals).toLowerCase();
      const value = text.slice(equals + 1);
      if (name === 'do' || name === 'key') return 'keyword';
      if (name === 'mode' && SOLFA_MODES.includes(value as (typeof SOLFA_MODES)[number])) {
        return 'atom';
      }
      return 'invalid';
    }

    if (stream.match(/^[,']+/)) {
      return stream.current().includes("'") ? 'atom' : 'modifier';
    }

    if (stream.match(/^[!.-]/)) {
      if (stream.peek() === "'" && stream.current() !== ',') {
        stream.next();
        return 'atom';
      }
      return 'modifier';
    }

    if (stream.match(/^[0-9]+/)) return 'number';

    const letter = stream.peek();
    if (letter !== undefined && LETTER_SET.has(letter)) {
      stream.next();
      if (stream.peek() === "'") {
        stream.next();
        return 'atom';
      }
      if (stream.peek() === '#' || stream.peek() === 'b') {
        stream.next();
        return 'keyword';
      }
      return 'atom';
    }

    if (letter !== undefined) {
      stream.next();
      return 'invalid';
    }

    return null;
  },

  languageData: {
    commentTokens: { line: '//' },
  },
};

export const solfaHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--solfa-muted)', fontStyle: 'italic' },
  { tag: tags.keyword, color: 'var(--solfa-key)' },
  { tag: tags.atom, color: 'var(--solfa-note)', fontWeight: '600' },
  { tag: tags.modifier, color: 'var(--solfa-muted)' },
  { tag: tags.separator, color: 'var(--solfa-bar)' },
  { tag: tags.heading, color: 'var(--solfa-key)', fontWeight: '700' },
  { tag: tags.number, color: 'var(--solfa-muted)' },
  { tag: tags.invalid, color: 'var(--solfa-error)' },
]);

export const solfaLanguage = StreamLanguage.define(solfaParser);

export const solfaHighlighting = syntaxHighlighting(solfaHighlightStyle);

export function isSolfaPitchName(value: string): boolean {
  return PITCH_NAME.test(value);
}
