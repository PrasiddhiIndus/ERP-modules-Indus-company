/** scripts/security/check-rls-policies.mjs — CI check for open RLS policies. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { evaluate, isAlwaysTrue, openPolicyFindings, parsePolicies } from '../scripts/security/check-rls-policies.mjs';

describe('parsePolicies / openPolicyFindings', () => {
  it('flags FOR ALL USING (true) for authenticated', () => {
    const f = openPolicyFindings('x.sql', 'create policy p on projects.quotations for all to authenticated using (true) with check (true);');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ table: 'projects.quotations', cmd: 'all', name: 'p' });
  });

  it('flags a policy with no TO clause (applies to PUBLIC)', () => {
    expect(openPolicyFindings('x.sql', 'CREATE POLICY "Open" ON t FOR SELECT USING ( true );')).toHaveLength(1);
  });

  it('flags "any logged-in user" expressions', () => {
    expect(isAlwaysTrue("auth.role() = 'authenticated'")).toBe(true);
    expect(isAlwaysTrue('auth.uid() IS NOT NULL')).toBe(true);
    expect(isAlwaysTrue('(select auth.uid()) is not null')).toBe(true);
    expect(isAlwaysTrue('1 = 1')).toBe(true);
  });

  it('ignores scoped policies, service_role-only policies and comments', () => {
    const sql = `
      -- create policy commented on t using (true);
      create policy ok on t for select to authenticated using (public.current_user_can_access_module('projects'));
      create policy svc on t for all to service_role using (true) with check (true);
      create policy own on t for select to authenticated using (user_id = auth.uid());`;
    expect(openPolicyFindings('x.sql', sql)).toHaveLength(0);
    expect(parsePolicies(sql)).toHaveLength(3);
  });

  it('finds policies created with EXECUTE format(...)', () => {
    const sql = "EXECUTE format('CREATE POLICY amc_%s_auth_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);";
    expect(openPolicyFindings('x.sql', sql)).toHaveLength(1);
  });
});

describe('evaluate', () => {
  const finding = (table, cmd = 'all', file = 'new.sql') => ({
    id: `${file}::${table}::p`, table, cmd, roles: ['authenticated'], usingExpr: 'true', checkExpr: null,
  });

  it('fails new open policies', () => {
    expect(evaluate([finding('public.things')], new Set(), [])).toHaveLength(1);
  });

  it('passes grandfathered (baseline) findings', () => {
    const f = finding('public.things');
    expect(evaluate([f], new Set([f.id]), [])).toHaveLength(0);
  });

  it('allow-list covers read-only lookup tables only (SELECT with a reason)', () => {
    const allow = [{ table: 'public.countries', reason: 'reference data' }];
    expect(evaluate([finding('public.countries', 'select')], new Set(), allow)).toHaveLength(0);
    expect(evaluate([finding('public.countries', 'all')], new Set(), allow)).toHaveLength(1);
    expect(evaluate([finding('public.countries', 'select')], new Set(), [{ table: 'public.countries' }])).toHaveLength(1);
  });

  it('protected (C2) tables can never be allow-listed', () => {
    const allow = [{ table: 'projects.quotations', reason: 'nope' }];
    expect(evaluate([finding('projects.quotations', 'select')], new Set(), allow)).toHaveLength(1);
  });
});

describe('repository state', () => {
  it('the current migrations pass the check', () => {
    expect(() => execFileSync(process.execPath, ['scripts/security/check-rls-policies.mjs'], { stdio: 'pipe' })).not.toThrow();
  });
});
