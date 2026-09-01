import { describe, it, expect } from 'vitest';
import {
  getAccessibleModules,
  normalizeAccessProfile,
  ROLES,
} from '../src/config/roles.js';

function expectSettingsOnly(mods) {
  expect([...mods].sort()).toEqual(['settings']);
}

/**
 * Mirrors login-check row merge: profiles.module_access_pending is the lock.
 * Auth metadata must not grant or clear privileges.
 */
function profileFromLoginCheckWithoutAuthPending(profileRow) {
  return normalizeAccessProfile({
    role: profileRow.role,
    team: profileRow.team ?? null,
    allowed_modules: profileRow.allowed_modules,
    allowed_sub_modules: profileRow.allowed_sub_modules,
    module_access_pending: profileRow.module_access_pending === true,
  });
}

describe('getAccessibleModules — unassigned privilege escalation fix', () => {
  it('(a) blank team + blank modules → settings-only for executive (single-create shape)', () => {
    const mods = getAccessibleModules({
      role: ROLES.EXECUTIVE,
      team: null,
      allowed_modules: [],
    });
    expectSettingsOnly(mods);
  });

  it('(a) blank team + blank modules → settings-only for manager (bulk-create shape with pending)', () => {
    const mods = getAccessibleModules({
      role: ROLES.MANAGER,
      team: '',
      allowed_modules: [],
      module_access_pending: true,
    });
    expectSettingsOnly(mods);
  });

  it('(a) blank team + blank modules → settings-only for admin', () => {
    const mods = getAccessibleModules({
      role: ROLES.ADMIN,
      team: null,
      allowed_modules: [],
    });
    expectSettingsOnly(mods);
  });

  it('(b) mapped team → unchanged scoped access (executive)', () => {
    const mods = getAccessibleModules({
      role: ROLES.EXECUTIVE,
      team: 'HR',
      allowed_modules: [],
    });
    expect(mods.has('settings')).toBe(true);
    expect(mods.has('hr')).toBe(true);
    expect(mods.has('overview')).toBe(false);
    expect(mods.has('billing')).toBe(false);
    expect(mods.has('userManagement')).toBe(false);
  });

  it('(b) mapped team + extra allowed_modules → scoped set includes both', () => {
    const mods = getAccessibleModules({
      role: ROLES.MANAGER,
      team: 'HR',
      allowed_modules: ['billing'],
    });
    expect(mods.has('hr')).toBe(true);
    expect(mods.has('billing')).toBe(true);
    expect(mods.has('settings')).toBe(true);
    expect(mods.has('userManagement')).toBe(false);
  });

  it('(c) module_access_pending on profiles row survives login path that omits auth metadata', () => {
    const profile = profileFromLoginCheckWithoutAuthPending({
      role: 'executive',
      team: null,
      allowed_modules: [],
      allowed_sub_modules: [],
      module_access_pending: true,
    });
    expect(profile.module_access_pending).toBe(true);
    expectSettingsOnly(getAccessibleModules(profile));
  });

  it('(d) Super Admin unaffected', () => {
    const mods = getAccessibleModules({
      role: ROLES.SUPER_ADMIN,
      team: null,
      allowed_modules: [],
    });
    expect(mods.has('overview')).toBe(true);
    expect(mods.has('settings')).toBe(true);
    expect(mods.has('hr')).toBe(true);
    expect(mods.has('userManagement')).toBe(true);
  });

  it('(d) Super Admin Pro unaffected', () => {
    const mods = getAccessibleModules({
      role: ROLES.SUPER_ADMIN_PRO,
      team: null,
      allowed_modules: [],
    });
    expect(mods.has('userManagement')).toBe(true);
    expect(mods.has('overview')).toBe(true);
    expect(mods.has('settings')).toBe(true);
  });
});
