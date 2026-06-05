import { INITIAL_PACKAGES } from './formulaLibraryData';

const STORAGE_KEY = 'hr-salary-formula-packages';

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
