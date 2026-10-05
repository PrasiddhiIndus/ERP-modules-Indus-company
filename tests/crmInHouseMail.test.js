import { describe, it, expect } from 'vitest';
import {
  buildEmployeeDirectory,
  employeeActiveState,
  employeeDisplayName,
  indexEmployeeMaster,
  inHouseCampaignStatus,
  isValidEmployeeEmail,
  normalizeEmployeeEmail,
  renderInHouseTokens,
  usesPersonalTokens,
} from '../shared/crmInHouseMail.mjs';
import { startInHouseCampaign } from '../server/crmInHouseMailApi.js';
import { buildGraphMessagePayload } from '../server/mail/mailConfig.js';

describe('In-House employee directory', () => {
  it('drops inactive, missing, invalid and duplicate emails', () => {
    const { employees, stats } = buildEmployeeDirectory([
      { id: '1', username: 'Ravi Patel', email: ' Ravi@IndusFire.com ', team: 'HR', is_active: true },
      { id: '2', username: 'Duplicate Ravi', email: 'ravi@indusfire.com', is_active: true },
      { id: '3', username: 'No Mail', email: null, is_active: true },
      { id: '4', username: 'Bad Mail', email: 'not-an-email', is_active: true },
      { id: '5', username: 'Left', email: 'left@indusfire.com', is_active: false },
      { id: '6', username: '', email: 'asha.shah@indusfire.com' },
    ]);
    expect(employees.map((e) => e.id)).toEqual(['6', '1']);
    expect(employees.find((e) => e.id === '1').email).toBe('ravi@indusfire.com');
    expect(employees.find((e) => e.id === '6').name).toBe('Asha Shah');
    expect(stats).toEqual({ total: 6, inactive: 1, left: 0, notEmployee: 0, missingEmail: 1, invalidEmail: 1, duplicateEmail: 1 });
  });

  it('keeps only employees Active in Employee Master and not past their leaving date', () => {
    const masterIndex = indexEmployeeMaster([
      { user_id: 'u1', employee_code: 'E1', status: 'Active', date_of_leaving: null },
      { user_id: null, employee_code: 'e 2', status: 'Inactive', date_of_leaving: null },
      { user_id: 'u3', employee_code: 'E3', status: 'Active', date_of_leaving: '2026-09-30' },
      { user_id: 'u4', employee_code: 'E4', status: 'Active', date_of_leaving: '2026-10-31' },
    ]);
    const { employees, stats } = buildEmployeeDirectory(
      [
        { id: 'u1', username: 'Active One', email: 'one@indusfire.com' },
        { id: 'u2', username: 'Inactive In Master', email: 'two@indusfire.com', employee_code: 'E2' },
        { id: 'u3', username: 'Left Last Month', email: 'three@indusfire.com', employee_code: 'E3' },
        { id: 'u4', username: 'Serving Notice', email: 'four@indusfire.com', employee_code: 'E4' },
        { id: 'u5', username: 'No Employee Record', email: 'five@indusfire.com', employee_code: 'X9' },
      ],
      { masterIndex, today: '2026-10-05' }
    );
    expect(employees.map((e) => e.id).sort()).toEqual(['u1', 'u4']);
    expect(stats).toMatchObject({ inactive: 1, left: 1, notEmployee: 1 });
    expect(employeeActiveState({ id: 'u4', is_active: false }, masterIndex, '2026-10-05')).toBe('inactive');
  });

  it('normalizes and validates emails', () => {
    expect(normalizeEmployeeEmail('  A@B.COM ')).toBe('a@b.com');
    expect(isValidEmployeeEmail('a@b.com')).toBe(true);
    expect(isValidEmployeeEmail('a@b')).toBe(false);
    expect(isValidEmployeeEmail('')).toBe(false);
    expect(employeeDisplayName({ email: 'x@y.com' })).toBe('X');
  });
});

describe('In-House merge tokens and status', () => {
  it('renders employee tokens', () => {
    const text = renderInHouseTokens('Hi {{first_name}} ({{employee_name}}, {{team}}, {{employee_code}}) {{employee_email}}', {
      name: 'Ravi Patel',
      email: 'ravi@indusfire.com',
      team: 'HR',
      employeeCode: 'E100',
    });
    expect(text).toBe('Hi Ravi (Ravi Patel, HR, E100) ravi@indusfire.com');
  });

  it('derives campaign status from counts', () => {
    expect(inHouseCampaignStatus({ delivered: 3, remaining: 2 })).toBe('Sending');
    expect(inHouseCampaignStatus({ delivered: 3 })).toBe('Delivered');
    expect(inHouseCampaignStatus({ delivered: 3, failed: 1 })).toBe('Partial');
    expect(inHouseCampaignStatus({ delivered: 2, skipped: 1 })).toBe('Partial');
    expect(inHouseCampaignStatus({ delivered: 0, failed: 2 })).toBe('Failed');
  });
});

describe('In-House delivery mode', () => {
  it('detects per-employee tokens', () => {
    expect(usesPersonalTokens('Office closed Friday', 'Dear team, …')).toBe(false);
    expect(usesPersonalTokens('Hello', 'Dear {{first_name}},')).toBe(true);
    expect(usesPersonalTokens('{{team}} update', '')).toBe(true);
  });

  it('builds one Graph message with hidden BCC recipients', () => {
    const { message } = buildGraphMessagePayload({
      to: 'notifications@indusfire.com',
      bcc: ['a@indusfire.com', ' b@indusfire.com ', ''],
      subject: 'Notice',
      text: 'Hello all',
    });
    expect(message.toRecipients).toEqual([{ emailAddress: { address: 'notifications@indusfire.com' } }]);
    expect(message.bccRecipients).toEqual([
      { emailAddress: { address: 'a@indusfire.com' } },
      { emailAddress: { address: 'b@indusfire.com' } },
    ]);
  });

  it('leaves single-recipient messages unchanged (no BCC)', () => {
    const { message } = buildGraphMessagePayload({ to: 'x@y.com', subject: 's', text: 't' });
    expect(message.bccRecipients).toBeUndefined();
  });
});

describe('In-House campaign start validation', () => {
  const db = {};
  it('requires subject, body and recipients', async () => {
    await expect(startInHouseCampaign({ supabaseAdmin: db, userId: 'u', subject: '', bodyTemplate: 'b', recipientProfileIds: ['1'] }))
      .rejects.toThrow('Subject is required.');
    await expect(startInHouseCampaign({ supabaseAdmin: db, userId: 'u', subject: 's', bodyTemplate: ' ', recipientProfileIds: ['1'] }))
      .rejects.toThrow('Message body is required.');
    await expect(startInHouseCampaign({ supabaseAdmin: db, userId: 'u', subject: 's', bodyTemplate: 'b', recipientProfileIds: [], groupIds: [] }))
      .rejects.toThrow('Select at least one employee or group.');
  });

  it('requires a signed-in user and a database client', async () => {
    await expect(startInHouseCampaign({ supabaseAdmin: db, userId: null, subject: 's', bodyTemplate: 'b', recipientProfileIds: ['1'] }))
      .rejects.toMatchObject({ status: 401 });
    await expect(startInHouseCampaign({ supabaseAdmin: null, userId: 'u', subject: 's', bodyTemplate: 'b', recipientProfileIds: ['1'] }))
      .rejects.toMatchObject({ status: 500 });
  });
});
