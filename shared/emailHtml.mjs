/**
 * Email body helpers shared by the template editors (browser) and the mail API (Node).
 * A body is treated as HTML when it contains real HTML tags; otherwise it is plain text
 * and is sent exactly as before (line breaks → <br>, Arial 14px).
 */

const HTML_TAG_RE = /<\s*(html|head|body|table|tbody|thead|tr|td|th|div|p|br|span|a|img|h[1-6]|ul|ol|li|strong|b|em|i|u|style|center|font|hr|section|header|footer|button)\b[^>]*>/i;

export function looksLikeHtmlEmail(body) {
  return HTML_TAG_RE.test(String(body || ''));
}

export function escapeEmailHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape every string value so merge tokens cannot inject markup into an HTML body. */
export function escapeTokenValues(values) {
  if (!values || typeof values !== 'object') return values;
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, typeof v === 'string' ? escapeEmailHtml(v) : v])
  );
}

/** Same wrapper the mail server uses for plain-text bodies (keep in sync with mailConfig.textToHtml). */
export function plainTextEmailHtml(text) {
  const html = escapeEmailHtml(text).replace(/\r?\n/g, '<br>\n');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${html}</div>`;
}

const STRIP_WITH_CONTENT = ['script', 'iframe', 'frame', 'frameset', 'object', 'applet', 'noscript', 'template'];
const STRIP_VOID = ['embed', 'base', 'frame', 'param'];

/**
 * Remove active / dangerous content while keeping normal email HTML intact
 * (tables, inline styles, <style> blocks, images, links, buttons, media queries).
 */
export function sanitizeEmailHtml(html) {
  let out = String(html || '');

  for (const tag of STRIP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }
  for (const tag of STRIP_VOID) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>`, 'gi'), '');
  }
  // <meta http-equiv="refresh"> and similar redirects.
  out = out.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '');
  // <link> can pull remote stylesheets/scripts; email clients drop them anyway.
  out = out.replace(/<link\b[^>]*>/gi, '');

  // Inline event handlers: onclick=, onload=, onerror=…
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Script-capable URLs in href / src / action / formaction / xlink:href / background.
  out = out.replace(
    /(\s(?:href|src|action|formaction|xlink:href|background|poster)\s*=\s*)(?:"\s*(?:javascript\s*:|vbscript\s*:|data:text\/html)[^"]*"|'\s*(?:javascript\s*:|vbscript\s*:|data:text\/html)[^']*'|(?:javascript\s*:|vbscript\s*:|data:text\/html)[^\s>]*)/gi,
    '$1"#"'
  );

  // CSS execution vectors (old IE expression(), javascript: in url()).
  out = out.replace(/expression\s*\(/gi, '(');
  out = out.replace(/url\(\s*(['"]?)\s*(?:javascript|vbscript)\s*:[^)]*\)/gi, 'url()');
  out = out.replace(/-moz-binding\s*:[^;"']*/gi, '');

  return out;
}

/** Final HTML sent to Microsoft Graph for an HTML body (already token-rendered). */
export function emailHtmlForSending(renderedBody) {
  return sanitizeEmailHtml(renderedBody);
}

/** Full document for the preview iframe — mirrors what the mail server sends. */
export function buildEmailPreviewDocument(body) {
  const raw = String(body || '');
  const content = looksLikeHtmlEmail(raw) ? sanitizeEmailHtml(raw) : plainTextEmailHtml(raw);
  const csp =
    "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline' https:; font-src https: data:";
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1">`;

  if (/<html[\s>]/i.test(content)) {
    if (/<head[\s>]/i.test(content)) return content.replace(/<head([^>]*)>/i, `<head$1>${head}`);
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return `<!doctype html><html><head>${head}<style>body{margin:8px;}</style></head><body>${content}</body></html>`;
}

export const EMAIL_HTML_STARTER = `<!-- Responsive email: tables + inline styles work in all major mail apps -->
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;color:#1f2937;">
        <tr>
          <td style="background:#b91c1c;padding:20px 32px;color:#ffffff;font-size:20px;font-weight:bold;">
            Indus Fire &amp; Safety
          </td>
        </tr>
        <tr>
          <td class="px" style="padding:28px 32px;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 12px;">Dear Team,</p>
            <p style="margin:0 0 20px;">Write your message here.</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:6px;background:#b91c1c;">
                  <a href="https://indus-erp.in" style="display:inline-block;padding:10px 22px;color:#ffffff;text-decoration:none;font-weight:bold;">View details</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;font-size:12px;color:#6b7280;">
            This is an automated message from Indus ERP.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
