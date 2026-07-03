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

export const ATTENDANCE_CYCLE_OPTIONS = ['1st to 31st', '21st to 20th'];

export const FORMULA_PACKAGE_OPTIONS = ['Default', 'Security', 'Housekeeping Pack'];

export const OT_RATE_OPTIONS = ['Single Rate', 'Double Rate', 'No OT'];

export const SITE_STATUS_OPTIONS = ['Active', 'Inactive'];

export function createEmptySiteForm() {
  return {
    id: '',
    siteCode: '',
    siteName: '',
    industryCategory: '',
    costCentre: '',
    state: '',
    siteAddress: '',
    primaryClientContact: '',
    contactPhoneEmail: '',
    attendanceCycle: '1st to 31st',
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
  ['attendanceCycle', 'Attendance Cycle'],
  ['formulaPackage', 'Formula Package'],
  ['otRate', 'Overtime (OT) Rate'],
  ['status', 'Status'],
];
