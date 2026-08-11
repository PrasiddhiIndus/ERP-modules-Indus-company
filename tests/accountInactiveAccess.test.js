import { describe, it, expect } from 'vitest';
import {
  getAccessibleModules,
  normalizeAccessProfile,
  ROLES,
} from '../src/config/roles.js';
import {
  ACCOUNT_INACTIVE_CODE,
  ACCOUNT_INACTIVE_MESSAGE,
  isAuthBannedError,
  accountInactiveError,
} from '../src/lib/accountInactive.js';

function expectSettingsOnly(mods) {
  expect([...mods].sort()).toEqual(['settings']);
}

describe('inactive account access revocation', () => {
  it('inactive profile loses all module access (including Super Admin)', () => {
    for (const role of [
      ROLES.EXECUTIVE,
      ROLES.MANAGER,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.SUPER_ADMIN_PRO,
    ]) {
      const mods = getAccessibleModules({
        role,
        team: 'HR',
        allowed_modules: ['billing'],
        is_active: false,
      });
      expect(mods.size).toBe(0);
    }
  });

  it('reactivated user keeps previously assigned scoped access (not legacy broad)', () => {
    const mods = getAccessibleModules({
      role: ROLES.EXECUTIVE,
      team: 'HR',
      allowed_modules: ['billing'],
      is_active: true,
    });
    expect(mods.has('hr')).toBe(true);
    expect(mods.has('billing')).toBe(true);
    expect(mods.has('settings')).toBe(true);
    expect(mods.has('userManagement')).toBe(false);
    expect(mods.has('overview')).toBe(false);
  });

  it('missing is_active defaults to active for backward compatibility', () => {
    const mods = getAccessibleModules({
      role: ROLES.EXECUTIVE,
      team: 'HR',
      allowed_modules: [],
    });
    expect(mods.has('hr')).toBe(true);
  });

  it('normalizeAccessProfile preserves is_active=false from profiles row', () => {
    const profile = normalizeAccessProfile({
      role: 'executive',
      team: null,
      allowed_modules: [],
      is_active: false,
    });
    expect(profile.is_active).toBe(false);
    expect(getAccessibleModules(profile).size).toBe(0);
  });

  it('maps GoTrue banned errors to inactive account messaging', () => {
    expect(isAuthBannedError({ message: 'User is banned' })).toBe(true);
    expect(isAuthBannedError({ message: 'Database error querying schema' })).toBe(true);
    expect(isAuthBannedError({ message: 'Invalid login credentials' })).toBe(false);
    const err = accountInactiveError();
    expect(err.code).toBe(ACCOUNT_INACTIVE_CODE);
    expect(err.message).toBe(ACCOUNT_INACTIVE_MESSAGE);
  });

  it('login-check style reject payload is recognizable as inactive', () => {
    const chk = {
      ok: false,
      error: ACCOUNT_INACTIVE_MESSAGE,
      code: ACCOUNT_INACTIVE_CODE,
    };
    expect(chk.code).toBe(ACCOUNT_INACTIVE_CODE);
    expect(/inactive/i.test(chk.error)).toBe(true);
  });
});

describe('getAccessibleModules — prior unassigned fix still holds', () => {
  it('blank team + blank modules → settings-only when active', () => {
    expectSettingsOnly(
      getAccessibleModules({
        role: ROLES.EXECUTIVE,
        team: null,
        allowed_modules: [],
        is_active: true,
      })
    );
  });
});
