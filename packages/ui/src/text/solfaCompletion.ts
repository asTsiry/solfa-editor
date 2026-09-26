import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { SOLFA_LETTERS } from './solfaLanguage.js';

const SCALE_SUGGESTIONS = SOLFA_LETTERS.map((label) => ({
  label,
  type: 'keyword',
  detail: 'solfa note',
}));

const DIRECTIVE_SUGGESTIONS: Completion[] = [
  { label: 'do', type: 'keyword', detail: 'set tonic', apply: '=C' },
  { label: 'mode', type: 'keyword', detail: 'major or minor', apply: '=major' },
];

const MODE_SUGGESTIONS: Completion[] = [
  { label: 'major', type: 'enum' },
  { label: 'minor', type: 'enum' },
];

const KEY_SUGGESTIONS: Completion[] = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'F#',
  'C#',
].map((label) => ({ label, type: 'constant' }));

const PULSE_SUGGESTIONS: Completion[] = [
  { label: '!', type: 'text', detail: 'one pulse' },
  { label: '-', type: 'text', detail: 'one pulse (spaced ok)' },
  { label: ',', type: 'text', detail: 'half pulse (must follow the letter)' },
  { label: '.', type: 'text', detail: 'half pulse (spaced ok)' },
];

function completionsFor(context: CompletionContext): CompletionResult | null {
  const cursor = context.state.selection.main.from;
  if (!context.explicit && !context.matchBefore(/[A-Za-z#b:|,!-]$/)) return null;

  const lineBefore = context.state.doc.sliceString(
    Math.max(0, context.state.doc.lineAt(cursor).from),
    cursor,
  );

  const directiveValue = lineBefore.match(/:([A-Za-z]+)=([A-Za-z#b]*)$/);
  if (directiveValue) {
    const name = (directiveValue[1] ?? '').toLowerCase();
    const options = name === 'mode' ? MODE_SUGGESTIONS : name === 'do' || name === 'key' ? KEY_SUGGESTIONS : [];
    if (options.length === 0) return null;
    return {
      from: cursor - (directiveValue[2] ?? '').length,
      options,
      validFor: /^[A-Za-z#b]*$/,
    };
  }

  const directiveName = lineBefore.match(/:([A-Za-z]*)$/);
  if (directiveName) {
    return { from: cursor, options: DIRECTIVE_SUGGESTIONS, validFor: /^[A-Za-z]*$/ };
  }

  if (/[|]$/.test(lineBefore)) {
    return {
      from: cursor,
      options: SCALE_SUGGESTIONS.map((entry) => ({ ...entry, apply: `${entry.label}:` })),
      validFor: /^:?[a-g]?m?$/,
    };
  }

  if (/[drmfslt']$/.test(lineBefore)) {
    return { from: cursor, options: PULSE_SUGGESTIONS, validFor: /^[!.,-]?$/ };
  }

  return { from: cursor, options: SCALE_SUGGESTIONS, validFor: /^[drmfslt]?$/ };
}

export const solfaAutocompletion = {
  override: [completionsFor],
  icons: false,
};
