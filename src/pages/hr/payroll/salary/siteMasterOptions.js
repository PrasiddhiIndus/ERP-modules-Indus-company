export const INDUSTRY_CATEGORY_OPTIONS = [
  'Manufacturing',
  'BFSI',
  'Retail',
  'Oil & Gas',
  'Refinery',
  'Chemical',
  'Power',
  'Construction',
  'Port',
  'Other',
];

export const COST_CENTRE_OPTIONS = [
  'CC-1001 — Corporate Ops',
  'CC-1002 — Manufacturing',
  'CC-1003 — Logistics',
  'CC-1004 — Security Services',
  'CC-1005 — Housekeeping',
];

export const STATE_JURISDICTION_OPTIONS = [
  'Andhra Pradesh',
  'Bihar',
  'Delhi',
  'Gujarat',
  'Haryana',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'West Bengal',
];

export const ATTENDANCE_CYCLE_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1));

function ordinalDay(day) {
  const num = Number(day);
  if (!Number.isFinite(num) || num < 1 || num > 31) return '';
  const mod100 = num % 100;
  const mod10 = num % 10;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? 'st'
      : mod10 === 2 && mod100 !== 12
        ? 'nd'
        : mod10 === 3 && mod100 !== 13
          ? 'rd'
          : 'th';
  return `${num}${suffix}`;
}

export function formatAttendanceCycle(startDay, endDay) {
  const start = Number(startDay) || 1;
  const end = Number(endDay) || 31;
  return `${ordinalDay(start)} to ${ordinalDay(end)}`;
}

export function parseAttendanceCycle(value) {
  if (!value) return { startDay: '1', endDay: '31' };
  const match = String(value).match(/(\d{1,2})\D*\s+to\s+(\d{1,2})/i);
  if (match) {
    const startDay = String(Math.min(31, Math.max(1, Number(match[1]) || 1)));
    const endDay = String(Math.min(31, Math.max(1, Number(match[2]) || 31)));
    return { startDay, endDay };
  }
  return { startDay: '1', endDay: '31' };
}

export const FORMULA_PACKAGE_OPTIONS = ['Default', 'Security', 'Housekeeping Pack'];

export const OT_RATE_OPTIONS = ['Single Rate', 'Double Rate', 'No OT'];

export const SITE_STATUS_OPTIONS = ['Active', 'Inactive'];

export function industryCategoryToForm(stored) {
  if (!stored) return { industryCategory: '', industryCategoryCustom: '' };
  if (INDUSTRY_CATEGORY_OPTIONS.includes(stored)) {
    return { industryCategory: stored, industryCategoryCustom: '' };
  }
  return { industryCategory: 'Other', industryCategoryCustom: stored };
}

export function resolveIndustryCategory(form) {
  if (form.industryCategory === 'Other') {
    return String(form.industryCategoryCustom || '').trim();
  }
  return String(form.industryCategory || '').trim();
}

export function costCentreToForm(stored) {
  return { costCentre: stored ? String(stored) : '' };
}

export function resolveCostCentre(form) {
  return String(form.costCentre || '').trim();
}

export function createEmptySiteForm() {
  return {
    id: '',
    siteCode: '',
    siteName: '',
    industryCategory: '',
    industryCategoryCustom: '',
    costCentre: '',
    state: '',
    siteAddress: '',
    primaryClientContact: '',
    contactPhoneEmail: '',
    attendanceCycleStartDay: '1',
    attendanceCycleEndDay: '31',
    formulaPackage: 'Default',
    otRate: 'Single Rate',
    status: 'Active',
  };
}

export const SITE_FORM_REQUIRED = [
  ['siteCode', 'Site Code'],
  ['siteName', 'Site Name'],
  ['industryCategory', 'Industry Category'],
  ['costCentre', 'Cost Centre'],
  ['state', 'State'],
  ['attendanceCycleStartDay', 'Attendance Cycle start day'],
  ['attendanceCycleEndDay', 'Attendance Cycle end day'],
  ['otRate', 'Overtime (OT) Rate'],
  ['status', 'Status'],
];

export function validateSiteForm(form) {
  for (const [field, label] of SITE_FORM_REQUIRED) {
    if (!String(form[field] || '').trim()) {
      return `Please enter ${label}.`;
    }
  }
  if (form.industryCategory === 'Other' && !String(form.industryCategoryCustom || '').trim()) {
    return 'Please enter Industry Category (manual entry).';
  }
  return '';
}
