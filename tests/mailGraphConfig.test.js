import { describe, expect, it } from 'vitest';
import {
  buildGraphMessagePayload,
  getMicrosoftGraphMailConfig,
  isMicrosoftGraphMailConfigured,
  textToHtml,
} from '../server/mail/mailConfig.js';
import { isMailDispatchConfigured } from '../server/mail/index.js';

describe('Microsoft Graph mail config', () => {
  it('is not configured when env placeholders are empty', () => {
    expect(isMicrosoftGraphMailConfigured()).toBe(false);
    expect(isMailDispatchConfigured()).toBe(false);
    expect(getMicrosoftGraphMailConfig()).toBeNull();
  });

  it('builds Graph message payload with HTML body and reply-to', () => {
    const payload = buildGraphMessagePayload({
      to: 'client@example.com',
      subject: 'Hello',
      text: 'Line one\nLine two',
      replyTo: 'events@indusfiresafety.com',
      replyToName: 'Indus Events',
    });

    expect(payload.saveToSentItems).toBe(true);
    expect(payload.message.subject).toBe('Hello');
    expect(payload.message.body.contentType).toBe('HTML');
    expect(payload.message.body.content).toContain('Line one');
    expect(payload.message.toRecipients[0].emailAddress.address).toBe('client@example.com');
    expect(payload.message.replyTo[0].emailAddress.address).toBe('events@indusfiresafety.com');
  });

  it('normalizes attachments for Graph fileAttachment', () => {
    const payload = buildGraphMessagePayload({
      to: 'client@example.com',
      subject: 'With file',
      text: 'See attached',
      attachments: [
        {
          filename: 'notes.txt',
          contentType: 'text/plain',
          content: Buffer.from('hello').toString('base64'),
        },
      ],
    });

    expect(payload.message.attachments).toHaveLength(1);
    expect(payload.message.attachments[0]['@odata.type']).toBe('#microsoft.graph.fileAttachment');
    expect(payload.message.attachments[0].name).toBe('notes.txt');
  });

  it('escapes HTML in plain-text fallback', () => {
    expect(textToHtml('<script>')).toContain('&lt;script&gt;');
  });
});
