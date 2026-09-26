export type IdFactory = () => string;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const defaultIdFactory: IdFactory = () => {
  const source = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (source && typeof source.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    source.getRandomValues(bytes);
    let out = '';
    for (const byte of bytes) {
      out += ALPHABET[byte % ALPHABET.length];
    }
    return out;
  }
  let n = 0;
  n += 1;
  return `id${n.toString(36)}`;
};

export function sequentialIdFactory(prefix = 'id'): IdFactory {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}${counter.toString(36)}`;
  };
}
