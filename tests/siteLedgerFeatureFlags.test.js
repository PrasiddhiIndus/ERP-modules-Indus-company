/**
 * Feature-flag matrix for Site Ledger: explicit figure save + atomic concurrency.
 * Both flags default OFF and are fully independent. Does not enable anything in the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATOMIC_CONCURRENCY_STORAGE_KEY,
  EXPLICIT_FIGURE_SAVE_STORAGE_KEY,
  isAtomicConcurrencyEnabled,
  isExplicitFigureSaveEnabled,
} from "../src/pages/finance/site-ledger/featureFlags.js";

const ENV_EXPLICIT = "VITE_SITE_LEDGER_EXPLICIT_FIGURE_SAVE";
const ENV_ATOMIC = "VITE_SITE_LEDGER_ATOMIC_CONCURRENCY";

function installStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  });
  return data;
}

function setEnv(explicit, atomic) {
  vi.stubEnv(ENV_EXPLICIT, explicit == null ? "" : String(explicit));
  vi.stubEnv(ENV_ATOMIC, atomic == null ? "" : String(atomic));
}

beforeEach(() => {
  installStorage();
  setEnv(null, null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const flags = (o) => ({ explicit: isExplicitFigureSaveEnabled(o), atomic: isAtomicConcurrencyEnabled(o) });

describe("matrix — Explicit × Atomic (via storage)", () => {
  it("both OFF (nothing configured) → defaults false", () => {
    expect(flags()).toEqual({ explicit: false, atomic: false });
  });

  it("both OFF (explicitly set off) → false / false", () => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "0", [ATOMIC_CONCURRENCY_STORAGE_KEY]: "0" });
    expect(flags()).toEqual({ explicit: false, atomic: false });
  });

  it("Explicit ON / Atomic OFF", () => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "1" });
    expect(flags()).toEqual({ explicit: true, atomic: false });
  });

  it("Explicit OFF / Atomic ON", () => {
    installStorage({ [ATOMIC_CONCURRENCY_STORAGE_KEY]: "1" });
    expect(flags()).toEqual({ explicit: false, atomic: true });
  });

  it("both ON", () => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "1", [ATOMIC_CONCURRENCY_STORAGE_KEY]: "1" });
    expect(flags()).toEqual({ explicit: true, atomic: true });
  });
});

describe("matrix — Explicit × Atomic (via env)", () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])("env explicit=%s atomic=%s", (explicit, atomic) => {
    setEnv(explicit, atomic);
    expect(flags()).toEqual({ explicit, atomic });
  });
});

describe("matrix — Explicit × Atomic (via overrides)", () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])("override explicit=%s atomic=%s", (explicit, atomic) => {
    expect(isExplicitFigureSaveEnabled({ storageValue: explicit })).toBe(explicit);
    expect(isAtomicConcurrencyEnabled({ storageValue: atomic })).toBe(atomic);
    expect(isExplicitFigureSaveEnabled({ envValue: explicit })).toBe(explicit);
    expect(isAtomicConcurrencyEnabled({ envValue: atomic })).toBe(atomic);
  });
});

describe("independence", () => {
  it("setting Explicit does not flip Atomic (storage)", () => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "true" });
    expect(isAtomicConcurrencyEnabled()).toBe(false);
  });

  it("setting Atomic does not flip Explicit (storage)", () => {
    installStorage({ [ATOMIC_CONCURRENCY_STORAGE_KEY]: "true" });
    expect(isExplicitFigureSaveEnabled()).toBe(false);
  });

  it("setting Explicit via env does not flip Atomic, and vice versa", () => {
    setEnv(true, null);
    expect(flags()).toEqual({ explicit: true, atomic: false });
    setEnv(null, true);
    expect(flags()).toEqual({ explicit: false, atomic: true });
  });

  it("overriding one flag leaves the other on its configured value", () => {
    installStorage({ [ATOMIC_CONCURRENCY_STORAGE_KEY]: "1" });
    expect(isExplicitFigureSaveEnabled({ storageValue: true })).toBe(true);
    expect(isAtomicConcurrencyEnabled()).toBe(true);
    expect(isExplicitFigureSaveEnabled({ storageValue: false })).toBe(false);
    expect(isAtomicConcurrencyEnabled()).toBe(true);
  });

  it("uses distinct storage keys and env names", () => {
    expect(EXPLICIT_FIGURE_SAVE_STORAGE_KEY).toBe("indus.finance.pl.explicitFigureSave");
    expect(ATOMIC_CONCURRENCY_STORAGE_KEY).toBe("indus.finance.pl.atomicConcurrency");
    expect(EXPLICIT_FIGURE_SAVE_STORAGE_KEY).not.toBe(ATOMIC_CONCURRENCY_STORAGE_KEY);
  });
});

describe("storage override wins over env", () => {
  it("storage ON beats env OFF (both flags)", () => {
    setEnv(false, false);
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "1", [ATOMIC_CONCURRENCY_STORAGE_KEY]: "1" });
    expect(flags()).toEqual({ explicit: true, atomic: true });
  });

  it("storage OFF beats env ON (both flags)", () => {
    setEnv(true, true);
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "0", [ATOMIC_CONCURRENCY_STORAGE_KEY]: "0" });
    expect(flags()).toEqual({ explicit: false, atomic: false });
  });

  it("storage decides per flag; the other flag falls back to env", () => {
    setEnv(true, true);
    installStorage({ [ATOMIC_CONCURRENCY_STORAGE_KEY]: "0" });
    expect(flags()).toEqual({ explicit: true, atomic: false });
  });

  it("env applies when storage has no value", () => {
    setEnv(true, false);
    expect(flags()).toEqual({ explicit: true, atomic: false });
  });

  it("unparseable storage value is ignored and env is used", () => {
    setEnv(true, true);
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "maybe", [ATOMIC_CONCURRENCY_STORAGE_KEY]: "" });
    expect(flags()).toEqual({ explicit: true, atomic: true });
  });

  it("explicit overrides: storageValue beats envValue; envValue beats real storage", () => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: "0" });
    expect(isExplicitFigureSaveEnabled({ envValue: true, storageValue: false })).toBe(false);
    expect(isExplicitFigureSaveEnabled({ envValue: false, storageValue: true })).toBe(true);
    expect(isExplicitFigureSaveEnabled({ envValue: true })).toBe(true);
  });

  it("null overrides fall through to storage, then env, then false", () => {
    installStorage({ [ATOMIC_CONCURRENCY_STORAGE_KEY]: "1" });
    expect(isAtomicConcurrencyEnabled({ storageValue: null, envValue: null })).toBe(true);
    installStorage();
    setEnv(null, true);
    expect(isAtomicConcurrencyEnabled({ storageValue: null, envValue: null })).toBe(true);
    setEnv(null, null);
    expect(isAtomicConcurrencyEnabled({ storageValue: null, envValue: null })).toBe(false);
  });
});

describe("value parsing", () => {
  it.each(["1", "true", "TRUE", "yes", "on", " On "])("%j → ON", (raw) => {
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: raw, [ATOMIC_CONCURRENCY_STORAGE_KEY]: raw });
    expect(flags()).toEqual({ explicit: true, atomic: true });
  });

  it.each(["0", "false", "FALSE", "no", "off"])("%j → OFF", (raw) => {
    setEnv(true, true);
    installStorage({ [EXPLICIT_FIGURE_SAVE_STORAGE_KEY]: raw, [ATOMIC_CONCURRENCY_STORAGE_KEY]: raw });
    expect(flags()).toEqual({ explicit: false, atomic: false });
  });

  it("is safe when localStorage is unavailable or throws", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(flags()).toEqual({ explicit: false, atomic: false });
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("denied"); },
    });
    setEnv(true, false);
    expect(flags()).toEqual({ explicit: true, atomic: false });
  });
});
