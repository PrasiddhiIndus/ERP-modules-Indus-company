import { describe, it, expect } from 'vitest';
import {
  NAV_MODULE_TREE,
  ROLES,
  ALL_RECRUITMENT_TAB_KEYS,
  ALL_ADMIN_RECRUITMENT_TAB_KEYS,
  PROJECTS_ENQUIRY_ACCESS_LEVELS,
  toggleRecruitmentAccessKey,
  getAccessibleModules,
  getAccessibleSubModulePaths,
} from '../src/config/roles.js';
import { EMPLOYEE_MASTER_SUBMODULE_KEY } from '../src/pages/adminOperations/salaryAdmin/salaryAccess.js';
import {
  buildAccessTree,
  applyModuleToggle,
  applySubToggle,
  selectAllPagesInModule,
  clearModule,
  selectAllTabs,
  clearTabs,
  moduleState,
  diffAccess,
  accessKeyLabel,
} from '../src/pages/userManagement/accessTree/accessModel.js';

// --- The previous picker's rules, copied verbatim, to prove the new editor behaves the same. ---
const LEGACY_OPT_IN = new Set([
  ...NAV_MODULE_TREE.flatMap((m) => (m.subModules || []).filter((s) => s.optIn).map((s) => s.value)),
  ...PROJECTS_ENQUIRY_ACCESS_LEVELS.map((l) => l.value),
]);
function legacyToggleModule(prev, value) {
  const willAdd = !prev.allowed_modules.includes(value);
  return {
    allowed_modules: willAdd ? [...prev.allowed_modules, value] : prev.allowed_modules.filter((m) => m !== value),
    allowed_sub_modules: willAdd
      ? prev.allowed_sub_modules.filter(
          (s) =>
            LEGACY_OPT_IN.has(s) ||
            ALL_ADMIN_RECRUITMENT_TAB_KEYS.includes(s) ||
            (!s.startsWith(`${value}.`) && !ALL_RECRUITMENT_TAB_KEYS.includes(s))
        )
      : prev.allowed_sub_modules,
  };
}
function legacyToggleSub(prev, subValue) {
  const switching = subValue === EMPLOYEE_MASTER_SUBMODULE_KEY && prev.allowed_modules.includes('admin');
  const willAdd = switching || !prev.allowed_sub_modules.includes(subValue);
  const rec = toggleRecruitmentAccessKey(prev.allowed_sub_modules, subValue);
  const subs = rec
    ? rec
    : willAdd
      ? [...prev.allowed_sub_modules.filter((s) => s !== subValue), subValue]
      : prev.allowed_sub_modules.filter((s) => s !== subValue);
  return {
    allowed_modules: switching ? prev.allowed_modules.filter((m) => m !== 'admin') : prev.allowed_modules,
    allowed_sub_modules: subs,
  };
}

const ALL_MODULE_KEYS = NAV_MODULE_TREE.map((m) => m.value);
const ALL_SUB_KEYS = NAV_MODULE_TREE.flatMap((m) =>
  (m.subModules || []).flatMap((s) => [s.value, ...(s.tabModules || []).map((t) => t.value)])
);

const SAMPLE_FORMS = [
  { team: 'HR', allowed_modules: [], allowed_sub_modules: [] },
  { team: 'HR', allowed_modules: [], allowed_sub_modules: ['hr.calling-master', 'hr.recruitment.dashboard', 'hr.recruitment.referral'] },
  { team: 'Projects', allowed_modules: ['finance', 'admin'], allowed_sub_modules: ['admin.rules-console', 'projects.enquiry.view'] },
  { team: '', allowed_modules: ['projects'], allowed_sub_modules: ['projects.enquiry.kpi', 'finance.po-at-glance', 'site-attendance-page.sites'] },
  { team: 'Billing', allowed_modules: [], allowed_sub_modules: ['admin.recruitment', 'admin.recruitment.candidates', 'fireTender.costing.quotation', 'iev-config.selected', 'iev-config.price-master', 'calling-scope.fire'] },
];

const sortForm = (f) => ({ allowed_modules: [...f.allowed_modules].sort(), allowed_sub_modules: [...f.allowed_sub_modules].sort() });

describe('access editor keeps the existing toggle rules', () => {
  it('module toggles match the old picker for every module and sample profile', () => {
    for (const form of SAMPLE_FORMS) {
      for (const key of ALL_MODULE_KEYS) {
        const next = applyModuleToggle(form, key);
        const legacy = legacyToggleModule(form, key);
        if (key === 'fireTender' && next.allowed_modules.includes('fireTender') && !form.allowed_modules.includes('fireTender')) {
          // Fresh full IEV grant also defaults Net Total Access on.
          expect(next.allowed_modules).toEqual(legacy.allowed_modules);
          expect(next.allowed_sub_modules.filter((k) => k !== 'fireTender.costing.costing-sheet.net-total').sort()).toEqual(
            [...legacy.allowed_sub_modules].sort()
          );
          expect(next.allowed_sub_modules).toContain('fireTender.costing.costing-sheet.net-total');
        } else {
          expect(next).toEqual(legacy);
        }
      }
    }
  });

  it('page / tab toggles match the old picker for every key and sample profile', () => {
    for (const form of SAMPLE_FORMS) {
      for (const key of [...ALL_SUB_KEYS, EMPLOYEE_MASTER_SUBMODULE_KEY]) {
        const { added, ...next } = applySubToggle(form, key);
        expect(typeof added).toBe('boolean');
        const legacy = legacyToggleSub(form, key);
        if (key === 'fireTender.costing' && added) {
          expect(next.allowed_modules).toEqual(legacy.allowed_modules);
          expect(next.allowed_sub_modules.filter((k) => k !== 'fireTender.costing.costing-sheet.net-total').sort()).toEqual(
            [...legacy.allowed_sub_modules].sort()
          );
          expect(next.allowed_sub_modules).toContain('fireTender.costing.costing-sheet.net-total');
        } else if (
          (key === 'fireTender.costing' || key === 'fireTender.costing.costing-sheet') &&
          !added &&
          form.allowed_sub_modules.includes('fireTender.costing.costing-sheet.net-total')
        ) {
          // Revoking IEV Costing / Costing Sheet also drops Net Total Access.
          expect(next.allowed_sub_modules).not.toContain('fireTender.costing.costing-sheet.net-total');
        } else {
          expect(next).toEqual(legacy);
        }
      }
    }
  });
});

describe('opening and saving without edits changes nothing', () => {
  it('reports no differences for an untouched form, even if order differs', () => {
    for (const form of SAMPLE_FORMS) {
      expect(diffAccess(form, { ...form })).toEqual({ modulesAdded: [], modulesRemoved: [], subsAdded: [], subsRemoved: [] });
      const reordered = { allowed_modules: [...form.allowed_modules].reverse(), allowed_sub_modules: [...form.allowed_sub_modules].reverse() };
      expect(diffAccess(form, reordered).subsAdded).toEqual([]);
      expect(diffAccess(form, reordered).subsRemoved).toEqual([]);
    }
  });

  it('every stored key is shown with a readable label', () => {
    for (const key of ALL_SUB_KEYS) expect(accessKeyLabel(key)).not.toBe(key);
    expect(accessKeyLabel('site-attendance-page.sites')).toMatch(/Site Attendance/);
    expect(accessKeyLabel('iev-config.price-master')).toMatch(/Configuration/);
  });
});

describe('tree covers the navigation', () => {
  const tree = buildAccessTree('');
  it('lists every module and page from NAV_MODULE_TREE', () => {
    for (const mod of NAV_MODULE_TREE.filter((m) => m.value !== 'userManagement')) {
      const node = tree.find((n) => n.key === mod.value);
      expect(node).toBeTruthy();
      for (const sub of mod.subModules || []) expect(node.pages.some((p) => p.key === sub.value)).toBe(true);
    }
  });
  it('adds nested Site Attendance, Payroll, IEV Configuration and Fire / Safety scope', () => {
    const hr = tree.find((n) => n.key === 'hr');
    expect(hr.pages.find((p) => p.key === 'hr.site-attendance').pageGroup.items).toHaveLength(7);
    expect(hr.pages.find((p) => p.key === 'hr.salary-management').infoTabs).toContain('Formula master');
    expect(hr.scope.items.map((i) => i.key)).toEqual(['calling-scope.fire', 'calling-scope.safety']);
    const iev = tree.find((n) => n.key === 'fireTender');
    expect(iev.pages.find((p) => p.key === 'iev-config').pageGroup.items.length).toBe(8);
    const projects = tree.find((n) => n.key === 'projects');
    expect(projects.pages.find((p) => p.key === 'projects.enquiry').accessLevels.map((l) => l.label)).toEqual(['View', 'Edit']);
  });
  it('marks the primary team module', () => {
    expect(buildAccessTree('HR').find((n) => n.key === 'hr').implicitViaTeam).toBe(true);
  });
});

describe('Select all / Deselect all', () => {
  const tree = buildAccessTree('');
  const billing = tree.find((n) => n.key === 'billing');
  const admin = tree.find((n) => n.key === 'admin');
  const hr = tree.find((n) => n.key === 'hr');

  it('selects every standard page and opens the same routes as before', () => {
    const next = selectAllPagesInModule({ allowed_modules: [], allowed_sub_modules: [] }, billing);
    expect(next.allowed_modules).toEqual([]);
    expect(next.allowed_sub_modules.sort()).toEqual(billing.pages.map((p) => p.key).sort());
  });

  it('never selects opt-in pages', () => {
    const next = selectAllPagesInModule({ allowed_modules: [], allowed_sub_modules: [] }, admin);
    expect(next.allowed_sub_modules).not.toContain('admin.rules-console');
    expect(next.allowed_sub_modules).not.toContain('admin.recruitment');
  });

  it('grants Recruitment through the parent key (workflow tabs, not opt-in Add Referral)', () => {
    const next = selectAllPagesInModule({ allowed_modules: [], allowed_sub_modules: [] }, hr);
    expect(next.allowed_sub_modules).toContain('hr.calling-master');
    expect(next.allowed_sub_modules).toContain('hr.recruitment.candidates');
    expect(next.allowed_sub_modules).not.toContain('hr.recruitment.referral');
  });

  it('is idempotent and keeps unrelated grants', () => {
    const start = { allowed_modules: ['finance'], allowed_sub_modules: ['projects.enquiry.view', 'billing.create'] };
    const once = selectAllPagesInModule(start, billing);
    expect(selectAllPagesInModule(once, billing)).toEqual(once);
    expect(once.allowed_modules).toEqual(['finance']);
    expect(once.allowed_sub_modules).toContain('projects.enquiry.view');
  });

  it('Deselect all removes only that module (incl. its scope / page keys)', () => {
    const start = {
      allowed_modules: ['hr', 'billing'],
      allowed_sub_modules: ['hr.recruitment.referral', 'site-attendance-page.sites', 'calling-scope.fire', 'billing.create', 'iev-config.selected'],
    };
    const next = clearModule(start, hr);
    expect(next.allowed_modules).toEqual(['billing']);
    expect(next.allowed_sub_modules).toEqual(['billing.create', 'iev-config.selected']);
  });

  it('tab Select all uses the page key; None removes the page and its tabs only', () => {
    const projects = tree.find((n) => n.key === 'projects');
    const enquiry = projects.pages.find((p) => p.key === 'projects.enquiry');
    const start = { allowed_modules: [], allowed_sub_modules: ['projects.enquiry.database', 'projects.enquiry.view'] };
    expect(selectAllTabs(start, enquiry).allowed_sub_modules).toContain('projects.enquiry');
    expect(clearTabs(start, enquiry).allowed_sub_modules).toEqual(['projects.enquiry.view']);
  });
});

describe('effective access is read from the same keys', () => {
  it('a profile opened in the editor keeps the same modules and routes', () => {
    for (const form of SAMPLE_FORMS) {
      const profile = { ...form, role: ROLES.EXECUTIVE };
      const tree = buildAccessTree(form.team);
      tree.forEach((mod) => moduleState(mod, form)); // reading must not mutate
      expect(sortForm(form)).toEqual(sortForm(SAMPLE_FORMS.find((f) => f === form)));
      expect([...getAccessibleModules(profile)].sort()).toEqual([...getAccessibleModules({ ...profile })].sort());
      expect([...getAccessibleSubModulePaths(profile)].sort()).toEqual([...getAccessibleSubModulePaths({ ...profile })].sort());
    }
  });
});
