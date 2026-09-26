import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const SOLFA_LETTERS = ['d', 'r', 'm', 'f', 's', 'l', 't'] as const;
export const SOLFA_MODES = ['major', 'minor'] as const;

const LETTER_SET = new Set<string>(SOLFA_LETTERS);
const PITCH_NAME = /^[A-Ga-g][#b]*$/;
const SECTION_HEADER = /^\|[',]*[drmfslt]:m?/;
const NUMBERED_SECTION = /^\|\d+[:.]/;
const DIRECTIVE = /^:[A-Za-z]+=([A-Za-z][A-Za-z#b]*)?/;
const PARTS_DIRECTIVE = /^:parts=[^\n]*/;
const PARTS_NAME = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9 _'-]*/;
const VOICE_LABEL = /^([A-Za-z][A-Za-z0-9]*)\s*:(?=\s|$)/;
const LYRIC_ALIASES = new Set(['p', 'paroles', 'parole', 'lyric', 'lyrics', 'words', 'text']);

export const SOLFA_LYRICS_ALIASES = [...LYRIC_ALIASES];
export const SOLFA_CLEFS = ['treble', 'alto', 'tenor', 'treble8vb', 'bass'] as const;

type SolfaStreamState = { readonly directive: string | null };

function isLyricLabel(label: string): boolean {
  return LYRIC_ALIASES.has(label.toLowerCase());
}

const solfaParser: StreamParser<SolfaStreamState> = {
  name: 'solfa',
  startState: (): SolfaStreamState => ({ directive: null }),

  token(stream): string | null {
    if (stream.eat(/^\s+/)) return null;

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.sol()) {
      if (stream.match(NUMBERED_SECTION)) return 'heading';
      const label = stream.match(VOICE_LABEL) as RegExpMatchArray | null;
      if (label) return isLyricLabel(label[1] ?? '') ? 'string' : 'labelName';
    }

    if (stream.match(SECTION_HEADER)) return 'heading';

    if (stream.match('|')) return 'separator';

    if (stream.match(PARTS_DIRECTIVE)) return 'attributeName';

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

    if (stream.match('~')) return 'null';

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

    if (stream.match(/^0+/)) return 'null';

    if (stream.match(/^[1-9][0-9]*/)) return 'number';

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
  { tag: tags.null, color: 'var(--solfa-muted)', fontStyle: 'italic' },
  { tag: tags.labelName, color: 'var(--solfa-key)', fontWeight: '700' },
  { tag: tags.string, color: 'var(--solfa-note)', fontStyle: 'italic' },
  { tag: tags.attributeName, color: 'var(--solfa-muted)' },
  { tag: tags.invalid, color: 'var(--solfa-error)' },
]);

export const solfaLanguage = StreamLanguage.define(solfaParser);

export const solfaHighlighting = syntaxHighlighting(solfaHighlightStyle);

export function isSolfaPitchName(value: string): boolean {
  return PITCH_NAME.test(value);
}
