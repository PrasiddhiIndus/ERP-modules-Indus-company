export const DEFAULT_REPORT_SETTING_NAMES = [
  'Chambal Fertilizers Salary Sheet',
  'IOM',
  'Deepak Phenolics Salary Sheet',
  'Deepak Phenolics Food Allowance Report',
  'Deepak Phenolics (OT Sheet)',
  'Cairn MPT Fire LTA Report',
  'Cairn MPT Fire (Salary Sheet)',
  'Nayara Energy Limited Salary Sheet',
  'YARA Fertilizers (Salary Sheet)',
  'Tata Chemicals Limited salary sheet',
  'Tata Chemicals Limited (OT Sheet)',
  'YARA Fertilizers OT Sheet',
  'ISRO Rasayani (Salary Sheet)',
  'Cairn Radhanpur Salary Sheet',
  'Cairn Radhanpur OT Sheet',
  'Cairn - Radhanpur LTA Sheet',
  'Arcelormittal Nippon Steel India Ltd.(Fire) Hazira',
  'Arcelormittal Nippon Steel India Ltd.,(Fire) Hazira TPT Sheet',
  'Sterling Auxiliaries, Dahej Salary Sheet',
];

export const DEFAULT_SETTING_CONFIG = {
  reportType: 'master',
  filterCondition: '',
  selectedFields: [],
  excludedFormulaIds: [],
};

export const DEFAULT_DATAWIZARD_REPORT = {
  settings: [],
  selectedSettingId: '',
};

const STORAGE_KEY = 'hr-salary-datawizard-report';

function cloneField(row) {
  return { ...row };
}

function cloneSetting(setting) {
  return {
    ...DEFAULT_SETTING_CONFIG,
    ...setting,
    selectedFields: (setting.selectedFields || []).map(cloneField),
    excludedFormulaIds: [...(setting.excludedFormulaIds || [])],
  };
}

function cloneReport(data) {
  return {
    settings: (data.settings || []).map(cloneSetting),
    selectedSettingId: data.selectedSettingId || '',
  };
}

export function settingIdFromName(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `setting-${slug || 'item'}`;
}

export function createDefaultSettings() {
  return DEFAULT_REPORT_SETTING_NAMES.map((name) => ({
    id: settingIdFromName(name),
    name,
    ...DEFAULT_SETTING_CONFIG,
  }));
}

/** Ensure all default report names exist in the settings list. */
export function ensureDefaultSettings(settings) {
  const list = Array.isArray(settings) ? settings.map(cloneSetting) : [];
  const existing = new Set(list.map((s) => s.name.toLowerCase()));
  for (const name of DEFAULT_REPORT_SETTING_NAMES) {
    if (!existing.has(name.toLowerCase())) {
      list.push({ id: settingIdFromName(name), name, ...DEFAULT_SETTING_CONFIG });
    }
  }
  return list;
}

function migrateLegacyReport(data) {
  const settings = ensureDefaultSettings(
    Array.isArray(data.settings) && data.settings.length ? data.settings : createDefaultSettings()
  );

  const hasTopLevelFields =
    Array.isArray(data.selectedFields) && data.selectedFields.length > 0;
  const hasTopLevelConfig =
    data.reportType || data.filterCondition || hasTopLevelFields || data.excludedFormulaIds?.length;

  if (!hasTopLevelConfig) {
    return cloneReport({ settings, selectedSettingId: data.selectedSettingId || '' });
  }

  const selectedId = data.selectedSettingId || '';
  const migratedSettings = settings.map((setting) => {
    if (setting.id !== selectedId) return setting;
    return cloneSetting({
      ...setting,
      reportType: data.reportType || setting.reportType,
      filterCondition: data.filterCondition ?? setting.filterCondition,
      selectedFields: hasTopLevelFields ? data.selectedFields : setting.selectedFields,
      excludedFormulaIds: data.excludedFormulaIds?.length
        ? data.excludedFormulaIds
        : setting.excludedFormulaIds,
    });
  });

  return cloneReport({ settings: migratedSettings, selectedSettingId: selectedId });
}

export function defaultDatawizardReport() {
  return cloneReport({
    ...DEFAULT_DATAWIZARD_REPORT,
    settings: createDefaultSettings(),
  });
}

export function loadDatawizardReport() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return defaultDatawizardReport();
    return migrateLegacyReport(data);
  } catch {
    return defaultDatawizardReport();
  }
}

export function saveDatawizardReport(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cloneReport(data)));
}

export function newReportSettingId() {
  return `setting-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newReportFieldId() {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getActiveSetting(report) {
  if (!report?.selectedSettingId) return null;
  return report.settings.find((s) => s.id === report.selectedSettingId) || null;
}

export function getActiveConfig(report) {
  const setting = getActiveSetting(report);
  if (!setting) return { ...DEFAULT_SETTING_CONFIG };
  return {
    reportType: setting.reportType,
    filterCondition: setting.filterCondition,
    selectedFields: setting.selectedFields,
    excludedFormulaIds: setting.excludedFormulaIds,
  };
}

export function updateActiveSetting(report, patch) {
  const { selectedSettingId, settings } = report;
  if (!selectedSettingId) return report;
  return {
    ...report,
    settings: settings.map((s) => (s.id === selectedSettingId ? cloneSetting({ ...s, ...patch }) : s)),
  };
}

export function createFormulaFieldRow(item) {
  return {
    id: newReportFieldId(),
    kind: 'field',
    formulaSourceId: item.id,
    fieldName: item.name,
    displayName: item.name,
    totalRequired: false,
    protectColumn: false,
    hideColumn: false,
  };
}

/** Merge All-formulas items into report fields while preserving order and display names. */
export function syncSelectedFieldsFromGroups(groups, config) {
  const flatItems = (groups || []).flatMap((g) => g.items || []);
  const itemById = new Map(flatItems.map((item) => [item.id, item]));
  const excluded = new Set(config.excludedFormulaIds || []);
  const seen = new Set();
  const synced = [];

  for (const row of config.selectedFields || []) {
    if (row.formulaSourceId && itemById.has(row.formulaSourceId)) {
      const item = itemById.get(row.formulaSourceId);
      synced.push({
        ...row,
        kind: row.kind || 'field',
        fieldName: item.name,
        displayName: row.displayName?.trim() ? row.displayName : item.name,
      });
      seen.add(row.formulaSourceId);
    } else if (!row.formulaSourceId) {
      synced.push(row);
    }
  }

  for (const item of flatItems) {
    if (seen.has(item.id) || excluded.has(item.id)) continue;
    synced.push(createFormulaFieldRow(item));
  }

  return synced;
}

/** Sync fields for the active setting only when a setting is selected. */
export function syncActiveSettingFields(groups, report) {
  const setting = getActiveSetting(report);
  if (!setting) return report;

  const synced = syncSelectedFieldsFromGroups(groups, setting);
  return updateActiveSetting(report, { selectedFields: synced });
}

export function initDatawizardReport(groups) {
  const loaded = loadDatawizardReport();
  if (!loaded.selectedSettingId) return loaded;
  return syncActiveSettingFields(groups, loaded);
}
