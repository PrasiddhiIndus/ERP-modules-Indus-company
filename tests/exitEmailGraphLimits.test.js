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
import { EXIT_EMAIL_NGINX_SAFE_PDF_BYTES } from '../src/lib/exitEmailLimits.js';

/** One-PDF-per-request must stay under nginx’s default 1mb body (base64 expands ~4/3). */
const NGINX_DEFAULT_BODY_BYTES = 1 * 1024 * 1024;

describe('exit email Graph / nginx size limits (production)', () => {
  it('detects Graph message-too-large errors used for split-send fallback', () => {
    expect(isGraphMessageTooLargeError(413, '', '')).toBe(true);
    expect(isGraphMessageTooLargeError(400, 'RequestEntityTooLarge', '')).toBe(true);
    expect(isGraphMessageTooLargeError(400, 'ErrorMessageSizeExceeded', 'Message too large')).toBe(true);
    expect(isGraphMessageTooLargeError(403, 'ErrorAccessDenied', 'Access denied')).toBe(false);
  });

  it('keeps a single exit PDF request under nginx’s default 1mb body limit', () => {
    expect(EXIT_EMAIL_NGINX_SAFE_PDF_BYTES).toBeLessThanOrEqual(520 * 1024);
    const jsonOverhead = 2 * 1024; // employeeId, to, senderMail, filenames
    const base64Bytes = Math.ceil(EXIT_EMAIL_NGINX_SAFE_PDF_BYTES * (4 / 3));
    expect(base64Bytes + jsonOverhead).toBeLessThan(NGINX_DEFAULT_BODY_BYTES);
  });

  it('builds Graph payload for one PDF under Graph’s simple-attachment ceiling', () => {
    const pdfStub = Buffer.alloc(EXIT_EMAIL_NGINX_SAFE_PDF_BYTES, 0x25);
    const payload = buildGraphMessagePayload({
      to: 'employee@example.com',
      bcc: ['hr@indusfire.com'],
      subject: 'Exit documents – Test',
      html: '<p>Please find attached</p>',
      attachments: [
        {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          content: pdfStub,
        },
      ],
    });

    expect(payload.message.attachments).toHaveLength(1);
    const encodedBytes = Buffer.byteLength(payload.message.attachments[0].contentBytes, 'utf8');
    expect(encodedBytes).toBeLessThan(3 * 1024 * 1024);
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
