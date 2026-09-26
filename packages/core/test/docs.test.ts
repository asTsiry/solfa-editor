import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../src/parse.js';
import { serialize } from '../src/serialize.js';

const README = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');

function fencedBlocks(): string[] {
  return [...README.matchAll(/```\n([\s\S]*?)```/g)]
    .map((match) => match[1] ?? '')
    .filter((block) => /:do=|:parts=|^\s*\|/m.test(block));
}

describe('README examples', () => {
  const examples = fencedBlocks();

  it('finds the notation examples', () => {
    expect(examples.length).toBeGreaterThanOrEqual(1);
  });

  it.each(examples)('parses and re-parses: %j', (source) => {
    const first = parse(source);
    expect(first.errors.map((error) => error.message)).toEqual([]);

    const text = serialize(first.score).text;
    const second = parse(text);
    expect(second.errors.map((error) => error.message), text).toEqual([]);
    expect(serialize(second.score).text).toBe(text);
  });
});
