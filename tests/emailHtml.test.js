import { describe, it, expect } from 'vitest';
import {
  EMAIL_HTML_STARTER,
  buildEmailPreviewDocument,
  escapeTokenValues,
  looksLikeHtmlEmail,
  plainTextEmailHtml,
  sanitizeEmailHtml,
} from '../shared/emailHtml.mjs';
import { renderInHouseTokens } from '../shared/crmInHouseMail.mjs';
import { textToHtml } from '../server/mail/mailConfig.js';

describe('email HTML detection', () => {
  it('treats tag-based bodies as HTML and everything else as plain text', () => {
    expect(looksLikeHtmlEmail('<p>Hello</p>')).toBe(true);
    expect(looksLikeHtmlEmail(EMAIL_HTML_STARTER)).toBe(true);
    expect(looksLikeHtmlEmail('Dear {{client_name}},\nSee you at the expo.')).toBe(false);
    expect(looksLikeHtmlEmail('Price < 5 and > 2')).toBe(false);
  });

  it('plain-text preview matches the server plain-text wrapper', () => {
    const text = 'Line 1\nA & B <ok>';
    expect(plainTextEmailHtml(text)).toBe(
      `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${textToHtml(text)}</div>`
    );
  });
});

describe('sanitizeEmailHtml', () => {
  it('removes scripts, frames, handlers and script URLs', () => {
    const dirty = [
      '<p onclick="steal()">Hi</p>',
      '<script>alert(1)</script>',
      '<iframe src="https://evil.test"></iframe>',
      '<a href="javascript:alert(1)">x</a>',
      "<a href='vbscript:msgbox(1)'>y</a>",
      '<img src=x onerror=alert(1)>',
      '<div style="width:expression(alert(1))">z</div>',
      '<object data="a.swf"></object><embed src="a.swf">',
      '<meta http-equiv="refresh" content="0;url=https://evil.test">',
      '<link rel="stylesheet" href="https://evil.test/a.css">',
    ].join('');
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/<script|<iframe|<object|<embed|<meta|<link/i);
    expect(clean).not.toMatch(/onclick|onerror|javascript:|vbscript:|expression\(/i);
    expect(clean).toContain('<p>Hi</p>');
    expect(clean).toContain('<a href="#">x</a>');
  });

  it('keeps normal email HTML intact', () => {
    expect(sanitizeEmailHtml(EMAIL_HTML_STARTER)).toBe(EMAIL_HTML_STARTER);
    const html = '<a href="https://indus-erp.in" style="background:#b91c1c;padding:10px">Open</a><img src="https://x.test/a.png" alt="">';
    expect(sanitizeEmailHtml(html)).toBe(html);
  });
});

describe('preview document and token escaping', () => {
  it('wraps fragments in a locked-down document', () => {
    const doc = buildEmailPreviewDocument('<p>Hi</p><script>x()</script>');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('<p>Hi</p>');
    expect(doc).not.toContain('<script');
  });

  it('escapes merge-token values inside HTML bodies', () => {
    const employee = escapeTokenValues({ name: '<b>Ravi</b> & Co', email: 'r@x.com' });
    expect(renderInHouseTokens('<p>{{employee_name}}</p>', employee)).toBe('<p>&lt;b&gt;Ravi&lt;/b&gt; &amp; Co</p>');
  });
});
