import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { SOLFA_LETTERS, SOLFA_CLEFS } from './solfaLanguage.js';

const SCALE_SUGGESTIONS = SOLFA_LETTERS.map((label) => ({
  label,
  type: 'keyword',
  detail: 'solfa note',
}));

const REST_AND_HOLD: Completion[] = [
  { label: '0', type: 'constant', detail: 'silence' },
  { label: '~', type: 'constant', detail: 'repeat previous note' },
];

const DIRECTIVE_SUGGESTIONS: Completion[] = [
  { label: 'do', type: 'keyword', detail: 'set tonic', apply: '=C' },
  { label: 'mode', type: 'keyword', detail: 'major or minor', apply: '=major' },
  {
    label: 'parts',
    type: 'keyword',
    detail: 'declare the voices',
    apply: '=Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass',
  },
];

const CLEF_SUGGESTIONS: Completion[] = SOLFA_CLEFS.map((label) => ({
  label,
  type: 'enum',
}));

const PART_SUGGESTIONS: Completion[] = [
  { label: 'S', type: 'class', detail: 'Soprano', apply: ': ' },
  { label: 'A', type: 'class', detail: 'Alto', apply: ': ' },
  { label: 'T', type: 'class', detail: 'Tenor', apply: ': ' },
  { label: 'B', type: 'class', detail: 'Bass', apply: ': ' },
  { label: 'P', type: 'text', detail: 'paroles / lyrics', apply: ': ' },
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
  if (!context.explicit && !context.matchBefore(/[A-Za-z#b:|,!~.0-9-]$/)) return null;

  const lineFrom = context.state.doc.lineAt(cursor).from;
  const lineBefore = context.state.doc.sliceString(lineFrom, cursor);
  const atLineStart = lineBefore.trim() === '' && context.explicit;

  if (atLineStart) {
    return { from: cursor, options: PART_SUGGESTIONS, validFor: /^[A-Za-z]*:? ?$/ };
  }

  if (/:parts=/.test(lineBefore) || /,[A-Za-z]+:[A-Za-z0-9]*$/.test(lineBefore)) {
    const trailing = lineBefore.match(/:[A-Za-z0-9]*$/);
    if (trailing) {
      return { from: cursor - (trailing[0] ?? '').length, options: CLEF_SUGGESTIONS, validFor: /^[A-Za-z]*$/ };
    }
    return null;
  }

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

  if (/[drmfslt'~]$/.test(lineBefore)) {
    return { from: cursor, options: [...PULSE_SUGGESTIONS, ...REST_AND_HOLD], validFor: /^[!.,~-]?$/ };
  }

  return { from: cursor, options: [...SCALE_SUGGESTIONS, ...REST_AND_HOLD], validFor: /^[drmfslt0~]?$/ };
}

export const solfaAutocompletion = {
  override: [completionsFor],
  icons: false,
};
