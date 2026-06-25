import { FORMULA_GROUPS, FORMULA_GROUPS_VERSION, INITIAL_PACKAGES } from './formulaLibraryData';

const STORAGE_KEY = 'hr-salary-formula-packages';
const GROUPS_STORAGE_KEY = 'hr-salary-formula-groups';
const GROUPS_VERSION_KEY = 'hr-salary-formula-groups-version';

function clonePackages(list) {
  return list.map((p) => ({
    ...p,
    formulaIds: [...(p.formulaIds || [])],
    sites: [...(p.sites || [])],
  }));
}

export function defaultPackages() {
  return clonePackages(INITIAL_PACKAGES);
}

export function loadFormulaPackages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(list) || !list.length) return defaultPackages();
    return clonePackages(list);
  } catch {
    return defaultPackages();
  }
}

export function saveFormulaPackages(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clonePackages(list)));
}

export function newPackageId() {
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newFormulaItemId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneGroups(list) {
  return list.map((g) => ({
    ...g,
    items: (g.items || []).map((i) => ({ ...i })),
  }));
}

export function defaultFormulaGroups() {
  return cloneGroups(FORMULA_GROUPS);
}

export function loadFormulaGroups() {
  try {
    const storedVersion = Number(localStorage.getItem(GROUPS_VERSION_KEY));
    if (storedVersion !== FORMULA_GROUPS_VERSION) {
      localStorage.setItem(GROUPS_VERSION_KEY, String(FORMULA_GROUPS_VERSION));
      const defaults = defaultFormulaGroups();
      saveFormulaGroups(defaults);
      return defaults;
    }
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(list) || !list.length) return defaultFormulaGroups();
    return cloneGroups(list);
  } catch {
    return defaultFormulaGroups();
  }
}

export function saveFormulaGroups(list) {
  localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(cloneGroups(list)));
}
