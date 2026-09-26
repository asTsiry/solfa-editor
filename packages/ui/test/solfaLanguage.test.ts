import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { solfaLanguage } from '../src/text/solfaLanguage.js';

function tokensOf(code: string): [string, string][] {
  const state = EditorState.create({ doc: code, extensions: [solfaLanguage] });
  const found: [string, string][] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name && node.name !== 'Document') {
        found.push([node.name, state.doc.sliceString(node.from, node.to)]);
      }
    },
  });
  return found;
}

describe('solfa language: title and subtitle', () => {
  it('marks the directive name apart from its prose', () => {
    expect(tokensOf(':title=Ave Maria')).toEqual([
      ['attributeName', ':title='],
      ['string', 'Ave Maria'],
    ]);
  });

  it('marks a subtitle the same way', () => {
    expect(tokensOf(':subtitle=à quatre voix')).toEqual([
      ['attributeName', ':subtitle='],
      ['string', 'à quatre voix'],
    ]);
  });

  it('does not run the title value into the next line', () => {
    expect(tokensOf(':title=Ave Maria\n|')).toEqual([
      ['attributeName', ':title='],
      ['string', 'Ave Maria'],
      ['separator', '|'],
    ]);
  });

  it('still highlights a voice line after a title', () => {
    const tokens = tokensOf(':title=Ave Maria\nS: d r');
    expect(tokens).toContainEqual(['labelName', 'S:']);
    expect(tokens.map(([, text]) => text)).toEqual(
      expect.arrayContaining([expect.stringContaining('d'), expect.stringContaining('r')]),
    );
  });

  it('treats an empty title as a name with nothing after it', () => {
    expect(tokensOf(':title=')).toEqual([['attributeName', ':title=']]);
  });

  it('leaves the other directives alone', () => {
    expect(tokensOf(':do=C')[0]).toEqual(['keyword', ':do=C']);
    expect(tokensOf(':mode=minor')[0]).toEqual(['atom', ':mode=minor']);
  });
});
