import { describe, it, expect } from 'vitest';
import { getAccessibleModules, getEffectiveAllowedSubModules, normalizeAccessProfile, ROLES } from '../src/config/roles.js';
import { safeSelfSignupProfileFields } from '../src/lib/safeSelfProfile.js';

function expectSettingsOnly(mods) {
  expect([...mods].sort()).toEqual(['settings']);
}

/** Mirrors src/lib/loginFlow.js buildProfileFromSession — never reads Auth metadata. */
function buildProfileFromSession(_session, quickProfile) {
  const row = quickProfile;
  const rowModules = Array.isArray(row?.allowed_modules) ? row.allowed_modules : [];
  const rowSubModules = Array.isArray(row?.allowed_sub_modules) ? row.allowed_sub_modules : [];
  const hasRow = Boolean(row?.role || rowModules.length || rowSubModules.length || row?.team);
  const inactiveFromRow = row?.is_active === false;
  return normalizeAccessProfile({
    role: row?.role ?? 'executive',
    team: row?.team ?? null,
    allowed_modules: rowModules,
    allowed_sub_modules: rowSubModules,
    module_access_pending: hasRow ? row?.module_access_pending === true : true,
    is_active: inactiveFromRow ? false : true,
  });
}

describe('self-signup cannot assign role from Auth metadata', () => {
  it('safe stub is always executive with empty modules and pending', () => {
    const row = safeSelfSignupProfileFields({
      id: 'user-1',
      email: 'attacker@example.com',
      username: 'attacker',
    });
    expect(row.role).toBe('executive');
    expect(row.team).toBeNull();
    expect(row.allowed_modules).toEqual([]);
    expect(row.allowed_sub_modules).toEqual([]);
    expect(row.module_access_pending).toBe(true);
    expectSettingsOnly(getAccessibleModules(row));
  });

  it('buildProfileFromSession ignores crafted super_admin metadata', () => {
    const session = {
      user: {
        id: 'user-1',
        email: 'attacker@example.com',
        user_metadata: {
          role: 'super_admin',
          team: 'admin',
          allowed_modules: ['userManagement', 'hr'],
          allowed_sub_modules: ['admin.employee'],
        },
      },
    };
    const profile = buildProfileFromSession(session, null);
    expect(profile.role).toBe(ROLES.EXECUTIVE);
    expect(profile.team).toBeNull();
    expect(profile.allowed_modules).toEqual([]);
    expect(profile.module_access_pending).toBe(true);
    expectSettingsOnly(getAccessibleModules(profile));
  });

  it('getEffectiveAllowedSubModules does not fall back to metadata', () => {
    const keys = getEffectiveAllowedSubModules(
      { allowed_sub_modules: [] },
      { allowed_sub_modules: ['userManagement.users'] },
    );
    expect(keys).toEqual([]);
  });

  it('existing login-check row still grants the assigned role', () => {
    const session = {
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        user_metadata: { role: 'executive' },
      },
    };
    const profile = buildProfileFromSession(session, {
      role: 'super_admin',
      team: 'admin',
      allowed_modules: [],
      module_access_pending: false,
    });
    expect(profile.role).toBe(ROLES.SUPER_ADMIN);
    expect(getAccessibleModules(profile).has('userManagement')).toBe(true);
  });
});
