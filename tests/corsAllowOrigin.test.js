import { describe, expect, it } from 'vitest';
import { isAllowedCorsOrigin, isLocalDevOrigin } from '../server/corsAllowOrigin.js';

describe('isAllowedCorsOrigin', () => {
  const allowed = ['https://indus-erp.in'];

  it('allows missing origin (non-browser / same-site navigations)', () => {
    expect(isAllowedCorsOrigin('', allowed)).toBe(true);
    expect(isAllowedCorsOrigin(null, allowed)).toBe(true);
  });

  it('allows exact listed origin', () => {
    expect(isAllowedCorsOrigin('https://indus-erp.in', allowed)).toBe(true);
  });

  it('allows www sibling of apex production host', () => {
    expect(isAllowedCorsOrigin('https://www.indus-erp.in', allowed)).toBe(true);
  });

  it('allows apex when only www is listed', () => {
    expect(isAllowedCorsOrigin('https://indus-erp.in', ['https://www.indus-erp.in'])).toBe(true);
  });

  it('rejects unrelated origins', () => {
    expect(isAllowedCorsOrigin('https://evil.example', allowed)).toBe(false);
    expect(isAllowedCorsOrigin('http://indus-erp.in', allowed)).toBe(false);
  });

  it('allows all when allow-list is empty', () => {
    expect(isAllowedCorsOrigin('https://evil.example', [])).toBe(true);
  });
});

describe('isLocalDevOrigin', () => {
  it('recognizes localhost and loopback', () => {
    expect(isLocalDevOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalDevOrigin('http://127.0.0.1:8787')).toBe(true);
    expect(isLocalDevOrigin('https://indus-erp.in')).toBe(false);
  });
});
