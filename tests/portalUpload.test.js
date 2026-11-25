import { describe, expect, it } from 'vitest';
import { normalizePortalFileName } from '../src/lib/portalUpload.js';

describe('portalUpload helpers', () => {
  it('keeps names that already have an extension', () => {
    expect(normalizePortalFileName({ name: 'signed.pdf', type: 'application/pdf' })).toBe('signed.pdf');
  });

  it('adds an extension from MIME when the phone camera omits one', () => {
    expect(normalizePortalFileName({ name: 'image', type: 'image/jpeg' })).toBe('image.jpg');
    expect(normalizePortalFileName({ name: 'scan', type: 'application/pdf' })).toBe('scan.pdf');
  });
});
