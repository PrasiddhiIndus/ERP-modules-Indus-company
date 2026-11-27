/**
 * Site Ledger / P&L feature flags.
 *
 * Explicit figure save defaults OFF so production keeps the legacy autosave path
 * until deliberately enabled (env or localStorage override).
 *
 * Enable:
 *   - VITE_SITE_LEDGER_EXPLICIT_FIGURE_SAVE=true
 *   - localStorage.setItem("indus.finance.pl.explicitFigureSave", "1")
 *
 * Disable / rollback:
 *   - unset the env var (or set false)
 *   - localStorage.removeItem("indus.finance.pl.explicitFigureSave")
 *   - or set localStorage value to "0"
 */

export const EXPLICIT_FIGURE_SAVE_STORAGE_KEY = "indus.finance.pl.explicitFigureSave";
export const ATOMIC_CONCURRENCY_STORAGE_KEY = "indus.finance.pl.atomicConcurrency";

function parseFlag(raw) {
  if (raw == null || raw === "") return null;
  const v = String(raw).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

function readEnvNamed(name) {
  try {
    return parseFlag(import.meta?.env?.[name]);
  } catch {
    return null;
  }
}

function readStorageNamed(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return parseFlag(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function resolveFlag(storageKey, envName, overrides = undefined) {
  if (overrides && "storageValue" in overrides && overrides.storageValue != null) {
    return !!overrides.storageValue;
  }
  if (overrides && "envValue" in overrides && overrides.envValue != null) {
    return !!overrides.envValue;
  }
  const fromStorage = readStorageNamed(storageKey);
  if (fromStorage != null) return fromStorage;
  const fromEnv = readEnvNamed(envName);
  if (fromEnv != null) return fromEnv;
  return false;
}

/**
 * @param {{ envValue?: boolean|null, storageValue?: boolean|null }} [overrides]
 */
export function isExplicitFigureSaveEnabled(overrides = undefined) {
  return resolveFlag(
    EXPLICIT_FIGURE_SAVE_STORAGE_KEY,
    "VITE_SITE_LEDGER_EXPLICIT_FIGURE_SAVE",
    overrides,
  );
}

/**
 * Phase 3: atomic period save + setup revision OCC.
 * Default OFF. Enable:
 *   VITE_SITE_LEDGER_ATOMIC_CONCURRENCY=true
 *   localStorage.setItem("indus.finance.pl.atomicConcurrency", "1")
 *
 * @param {{ envValue?: boolean|null, storageValue?: boolean|null }} [overrides]
 */
export function isAtomicConcurrencyEnabled(overrides = undefined) {
  return resolveFlag(
    ATOMIC_CONCURRENCY_STORAGE_KEY,
    "VITE_SITE_LEDGER_ATOMIC_CONCURRENCY",
    overrides,
  );
}
