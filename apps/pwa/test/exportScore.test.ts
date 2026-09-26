import { describe, expect, it } from 'vitest';
import { choosePage, fitToPage, sanitizeFileName } from '../src/exportScore.js';

describe('sanitizeFileName', () => {
  it('keeps a plain name', () => {
    expect(sanitizeFileName('partition-solfa')).toBe('partition-solfa');
  });

  it('replaces characters that are illegal in file names', () => {
    expect(sanitizeFileName('ma/partition:2024?')).toBe('ma-partition-2024-');
  });

  it('strips accents so the name works everywhere', () => {
    expect(sanitizeFileName('mélodie française')).toBe('melodie francaise');
  });

  it('collapses whitespace and trims dots and spaces', () => {
    expect(sanitizeFileName('  ..ma  partition..  ')).toBe('ma partition');
  });

  it('falls back when nothing usable remains', () => {
    expect(sanitizeFileName('   ')).toBe('partition-solfa');
    expect(sanitizeFileName('')).toBe('partition-solfa');
    expect(sanitizeFileName('...', 'repli')).toBe('repli');
  });

  it('truncates very long names', () => {
    expect(sanitizeFileName('a'.repeat(400))).toHaveLength(120);
  });
});

describe('choosePage', () => {
  it('uses a portrait page for a tall score', () => {
    const page = choosePage(800, 1200);
    expect(page.width).toBeLessThan(page.height);
  });

  it('uses a landscape page for a wide score', () => {
    const page = choosePage(1200, 800);
    expect(page.width).toBeGreaterThan(page.height);
  });

  it('keeps the same area whatever the orientation', () => {
    const portrait = choosePage(800, 1200);
    const landscape = choosePage(1200, 800);
    expect(portrait.width * portrait.height).toBeCloseTo(landscape.width * landscape.height, 1);
  });

  it('treats a square score as portrait', () => {
    const page = choosePage(900, 900);
    expect(page.width).toBeLessThan(page.height);
  });
});

describe('fitToPage', () => {
  const page = { width: 600, height: 800 };

  it('centres the image on the page', () => {
    const fit = fitToPage(400, 200, page);
    expect(fit.x + fit.width / 2).toBeCloseTo(page.width / 2, 6);
    expect(fit.y + fit.height / 2).toBeCloseTo(page.height / 2, 6);
  });

  it('preserves the aspect ratio', () => {
    const fit = fitToPage(400, 200, page);
    expect(fit.width / fit.height).toBeCloseTo(2, 6);
  });

  it('shrinks a score that is too wide to fit', () => {
    const fit = fitToPage(4000, 2000, page, 28);
    expect(fit.width).toBeLessThanOrEqual(page.width);
    expect(fit.height).toBeLessThanOrEqual(page.height);
  });

  it('keeps the margin clear on both sides', () => {
    const fit = fitToPage(4000, 2000, page, 28);
    expect(fit.x).toBeGreaterThanOrEqual(28);
    expect(fit.y).toBeGreaterThanOrEqual(28);
  });

  it('never returns a zero or negative size', () => {
    const fit = fitToPage(1, 1, page, 28);
    expect(fit.width).toBeGreaterThan(0);
    expect(fit.height).toBeGreaterThan(0);
  });
});
