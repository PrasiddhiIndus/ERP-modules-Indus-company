import { describe, expect, it } from 'vitest';
import { fitFontSize } from '../server/personalLetterCards.js';

describe('personal letter card helpers', () => {
  it('keeps short names at max font size', () => {
    expect(fitFontSize('Rahul,', 1680, 84, 44)).toBe(84);
  });

  it('shrinks long names to fit the cover band', () => {
    const long = 'Venkata Subramanian Krishnamurthy Padmanabhan,';
    const size = fitFontSize(long, 900, 84, 44);
    expect(size).toBeLessThan(84);
    expect(size).toBeGreaterThanOrEqual(44);
  });
});
