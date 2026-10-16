import { describe, expect, it } from 'vitest';
import { buildGraphMessagePayload } from '../server/mail/mailConfig.js';
import { isGraphMessageTooLargeError } from '../server/mail/graphMailProvider.js';
import {
  CATEGORY_EXISTING_CONTRACT,
  CATEGORY_NEW_EMPLOYEE_CONTRACT,
  resolveCategory,
  SCHEME_OLD,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
} from '../src/pages/adminOperations/salaryAdmin/ctcEngine.js';
import { CATEGORY_OPTIONS, categoryLabel } from '../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js';

/** Must stay under Microsoft Graph simple sendMail (~3MB) with headroom for HTML + BCC. */
const GRAPH_SAFE_TOTAL_BYTES = 2.4 * 1024 * 1024;

describe('exit email Graph size limits (production)', () => {
  it('detects Graph message-too-large errors used for split-send fallback', () => {
    expect(isGraphMessageTooLargeError(413, '', '')).toBe(true);
    expect(isGraphMessageTooLargeError(400, 'RequestEntityTooLarge', '')).toBe(true);
    expect(isGraphMessageTooLargeError(400, 'ErrorMessageSizeExceeded', 'Message too large')).toBe(true);
    expect(isGraphMessageTooLargeError(403, 'ErrorAccessDenied', 'Access denied')).toBe(false);
  });

  it('budgets three PDFs under the Graph-safe total used by the client', () => {
    const docs = 3;
    const perDoc = Math.floor(GRAPH_SAFE_TOTAL_BYTES / docs);
    expect(perDoc * docs).toBeLessThanOrEqual(GRAPH_SAFE_TOTAL_BYTES);
    expect(perDoc).toBeGreaterThan(500 * 1024);
    // Base64 JSON overhead (~33%) for 3 docs must still fit under a 35mb API body with buffer.
    const base64PayloadEstimate = Math.ceil(GRAPH_SAFE_TOTAL_BYTES * (4 / 3));
    expect(base64PayloadEstimate).toBeLessThan(35 * 1024 * 1024);
  });

  it('builds Graph payload with three PDF attachments under the safe total', () => {
    const perDoc = Math.floor(GRAPH_SAFE_TOTAL_BYTES / 3);
    const pdfStub = Buffer.alloc(perDoc, 0x25); // '%' filler; size is what matters
    const payload = buildGraphMessagePayload({
      to: 'employee@example.com',
      bcc: ['hr@indusfire.com'],
      subject: 'Exit documents – Test',
      html: '<p>Please find attached</p>',
      attachments: [1, 2, 3].map((n) => ({
        filename: `doc-${n}.pdf`,
        contentType: 'application/pdf',
        content: pdfStub,
      })),
    });

    expect(payload.message.attachments).toHaveLength(3);
    const encodedBytes = payload.message.attachments.reduce(
      (sum, a) => sum + Buffer.byteLength(a.contentBytes, 'utf8'),
      0
    );
    // Base64 expands ~4/3; keep under Graph's practical ~4MB request ceiling with buffer.
    expect(encodedBytes).toBeLessThan(4 * 1024 * 1024);
  });
});

describe('Employee Category contract options', () => {
  it('lists Existing / Contract and New Employee / Contract', () => {
    const values = CATEGORY_OPTIONS.map((o) => o.value);
    expect(values).toContain(CATEGORY_EXISTING_CONTRACT);
    expect(values).toContain(CATEGORY_NEW_EMPLOYEE_CONTRACT);
    expect(categoryLabel(CATEGORY_EXISTING_CONTRACT)).toBe('Existing / Contract');
    expect(categoryLabel(CATEGORY_NEW_EMPLOYEE_CONTRACT)).toBe('New Employee / Contract');
  });

  it('maps contract categories like Existing Confirmed / New Probation', () => {
    const existing = resolveCategory(CATEGORY_EXISTING_CONTRACT, SCHEME_OLD);
    expect(existing.status).toBe(STATUS_CONFIRMED);
    expect(existing.benefits).toBe('ON');

    const neu = resolveCategory(CATEGORY_NEW_EMPLOYEE_CONTRACT, SCHEME_OLD);
    expect(neu.status).toBe(STATUS_PROBATION);
    expect(neu.benefits).toBe('OFF');
  });
});
