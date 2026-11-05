import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({}) }));

import { decideProbationAccess } from '../src/pages/adminOperations/probationReviews/probationAccess.js';
import { needsMyProbationAction, scoresComplete } from '../src/pages/adminOperations/probationReviews/probationReviewForm.js';
import { empCodesMatch } from '../src/pages/adminOperations/probationReviews/probationReviewApi.js';
import {
  getAccessibleModules,
  getAccessibleSubModulePaths,
  isPathAllowed,
  isProbationReviewsAppPath,
  ROLES,
} from '../src/config/roles.js';

// Shape returned by get_manager_l1_team_roster(): caller row (is_self) + active L1 reportees.
const roster = (selfCode, reporteeCodes = []) => [
  { employee_code: selfCode, employee_name: 'Me', is_self: true },
  ...reporteeCodes.map((c) => ({ employee_code: c, employee_name: `E${c}`, is_self: false })),
];

describe('Probation Reviews access decision', () => {
  it('L1 manager with reportees gets access', () => {
    const a = decideProbationAccess(roster('2001', ['3001', '3002']), null);
    expect(a).toMatchObject({ canAccess: true, isL1WithReportees: true, isProbationHr: false, reporteeCount: 2 });
  });

  it('user without reportees gets no access (even if they have Corporate HR/Admin)', () => {
    expect(decideProbationAccess(roster('2002'), null).canAccess).toBe(false);
  });

  it('HR 10935 gets access without reportees, with code padding tolerated', () => {
    expect(decideProbationAccess(roster('10935'), null)).toMatchObject({ canAccess: true, isProbationHr: true });
    expect(decideProbationAccess([], '010935').canAccess).toBe(true);
  });

  it('unknown caller / empty roster gets no access', () => {
    expect(decideProbationAccess([], null).canAccess).toBe(false);
    expect(decideProbationAccess(null, '').canAccess).toBe(false);
  });

  it('a self row repeated as non-self does not count as a reportee', () => {
    const rows = [...roster('2003'), { employee_code: '2003', is_self: false }];
    expect(decideProbationAccess(rows, null).canAccess).toBe(false);
  });
});

describe('Probation Reviews route guard scope', () => {
  const executiveNoAdmin = { role: ROLES.EXECUTIVE, team: 'projects', allowed_modules: [], allowed_sub_modules: [] };
  const mods = getAccessibleModules(executiveNoAdmin);
  const subs = getAccessibleSubModulePaths(executiveNoAdmin);

  it('lets the probation list and detail routes through to their own guard', () => {
    expect(isProbationReviewsAppPath('/app/admin/probation-reviews')).toBe(true);
    expect(isProbationReviewsAppPath('/app/admin/probation-reviews/abc-123')).toBe(true);
    expect(isPathAllowed('/app/admin/probation-reviews', mods, subs)).toBe(true);
    expect(isPathAllowed('/app/admin/probation-reviews/abc-123/', mods, subs)).toBe(true);
  });

  it('does not open any other Corporate HR/Admin URL', () => {
    for (const p of [
      '/app/admin/dashboard',
      '/app/admin/employee/master',
      '/app/admin/employee/onboarding',
      '/app/admin/recruitment',
      '/app/admin/rules-console',
      '/app/admin/probation-reviewsX',
      '/app/admin/probation',
    ]) {
      expect(isPathAllowed(p, mods, subs), p).toBe(false);
    }
  });
});

describe('Probation workflow helpers (parity with Indus One)', () => {
  it('pending vs history split follows the stage owner', () => {
    const base = { l1_code: '2001', l2_code: '2100', hr_code: '10935' };
    expect(needsMyProbationAction({ ...base, status: 'awaiting_l1' }, '2001', empCodesMatch)).toBe(true);
    expect(needsMyProbationAction({ ...base, status: 'correction_required' }, '2001', empCodesMatch)).toBe(true);
    expect(needsMyProbationAction({ ...base, status: 'awaiting_l2' }, '2001', empCodesMatch)).toBe(false);
    expect(needsMyProbationAction({ ...base, status: 'awaiting_l2' }, '2100', empCodesMatch)).toBe(true);
    expect(needsMyProbationAction({ ...base, status: 'awaiting_hr' }, '10935', empCodesMatch)).toBe(true);
    expect(needsMyProbationAction({ ...base, status: 'finalized' }, '10935', empCodesMatch)).toBe(false);
  });

  it('supervisory competency is required only for Work Level 2', () => {
    const six = { job_knowledge: 3, drive: 3, operational_excellence: 3, interpersonal: 3, communication: 3, professional_conduct: 3 };
    expect(scoresComplete(six, false)).toBe(true);
    expect(scoresComplete(six, true)).toBe(false);
    expect(scoresComplete({ ...six, supervisory: 4 }, true)).toBe(true);
  });
});
