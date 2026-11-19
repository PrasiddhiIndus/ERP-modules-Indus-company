/**
 * IT Support outbound email helper (Microsoft Graph).
 * Best-effort — failures are logged and do not fail the HTTP request body consumers expect.
 */
import { isMailDispatchConfigured, sendOutboundMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';

function asEmailList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  const s = String(value || '').trim();
  return s ? [s] : [];
}

/**
 * POST /api/it-support/notify-email
 * body: { to, subject, text?, html?, ticketNo? }
 */
export function registerItSupportNotifyRoutes(app, { requireAuth }) {
  app.post('/api/it-support/notify-email', requireAuth, async (req, res) => {
    try {
      if (!isMailDispatchConfigured()) {
        return res.status(503).json({ message: MAIL_NOT_CONFIGURED_MESSAGE, skipped: true });
      }

      const to = asEmailList(req.body?.to);
      if (!to.length) {
        return res.status(400).json({ message: 'At least one recipient (to) is required.' });
      }

      const subject = String(req.body?.subject || '').trim();
      if (!subject) {
        return res.status(400).json({ message: 'subject is required.' });
      }

      const text = String(req.body?.text || '').trim() || subject;
      const html =
        String(req.body?.html || '').trim() ||
        `<p>${text.replace(/</g, '&lt;')}</p>`;

      await sendOutboundMail({ to, subject, text, html });
      res.json({ ok: true, ticketNo: req.body?.ticketNo || null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[it-support notify-email]', err?.message || err);
      const status = Number(err?.status) || 500;
      res.status(status).json({ message: err?.message || 'Failed to send email.' });
    }
  });
}
