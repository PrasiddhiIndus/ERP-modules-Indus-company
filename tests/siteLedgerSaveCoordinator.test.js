import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyWorkingEdit,
  createWorkingCopy,
  discardWorkingCopy,
  hydrateFromServer,
  markSaveFailed,
  markSaveSucceeded,
  restoreDraftIntoWorking,
} from "../src/pages/finance/site-ledger/state/workingCopy.js";
import {
  SaveCoordinator,
  __resetSharedSaveCoordinatorForTests,
} from "../src/pages/finance/site-ledger/persistence/saveCoordinator.js";
import {
  __resetDraftMemoryForTests,
  getDraft,
  putDraft,
} from "../src/pages/finance/site-ledger/persistence/draftStore.js";
import {
  attachLedgerNavigationGuard,
  confirmLeaveIfDirty,
} from "../src/pages/finance/site-ledger/hooks/navigationGuard.js";
import {
  EXPLICIT_FIGURE_SAVE_STORAGE_KEY,
  isExplicitFigureSaveEnabled,
} from "../src/pages/finance/site-ledger/featureFlags.js";

beforeEach(() => {
  __resetDraftMemoryForTests();
  __resetSharedSaveCoordinatorForTests();
});

describe("workingCopy primitives", () => {
  it("keeps original immutable when applying edits", () => {
    const rec = createWorkingCopy({ key: "period:A__2026-01", original: { labour: 10 } });
    const next = applyWorkingEdit(rec, { labour: 25 });
    expect(rec.original.labour).toBe(10);
    expect(rec.working.labour).toBe(10);
    expect(next.working.labour).toBe(25);
    expect(next.original.labour).toBe(10);
    expect(next.dirty).toBe(true);
    expect(next.localGen).toBe(rec.localGen + 1);
  });

  it("does not clear working copy on save failure", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = applyWorkingEdit(rec, { labour: 9 });
    const failed = markSaveFailed(rec, new Error("network down"));
    expect(failed.working.labour).toBe(9);
    expect(failed.dirty).toBe(true);
    expect(failed.status).toBe("error");
    expect(failed.lastError).toMatch(/network/i);
  });

  it("keeps newer local edits when a stale save succeeds", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = applyWorkingEdit(rec, { labour: 2 }); // gen 1
    const savedGen = rec.localGen;
    rec = applyWorkingEdit(rec, { labour: 3 }); // gen 2 while in flight
    const next = markSaveSucceeded(rec, { labour: 2 }, savedGen);
    expect(next.working.labour).toBe(3);
    expect(next.original.labour).toBe(2);
    expect(next.dirty).toBe(true);
    expect(next.status).toBe("dirty");
  });

  it("marks clean only when savedGen matches current localGen", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = applyWorkingEdit(rec, { labour: 5 });
    const next = markSaveSucceeded(rec, { labour: 5 }, rec.localGen);
    expect(next.dirty).toBe(false);
    expect(next.status).toBe("saved");
    expect(next.working.labour).toBe(5);
  });

  it("hydrateFromServer does not wipe dirty working copy unless forceReset", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = applyWorkingEdit(rec, { labour: 8 });
    const kept = hydrateFromServer(rec, { labour: 2 });
    expect(kept.working.labour).toBe(8);
    expect(kept.original.labour).toBe(2);
    expect(kept.dirty).toBe(true);
    const reset = hydrateFromServer(rec, { labour: 2 }, { forceReset: true });
    expect(reset.working.labour).toBe(2);
    expect(reset.dirty).toBe(false);
  });

  it("restoreDraftIntoWorking never marks committed", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = restoreDraftIntoWorking(rec, { labour: 99 });
    expect(rec.working.labour).toBe(99);
    expect(rec.dirty).toBe(true);
    expect(rec.committed.labour).toBe(1);
  });

  it("discardWorkingCopy restores original", () => {
    let rec = createWorkingCopy({ key: "p", original: { labour: 1 } });
    rec = applyWorkingEdit(rec, { labour: 7 });
    rec = discardWorkingCopy(rec);
    expect(rec.working.labour).toBe(1);
    expect(rec.dirty).toBe(false);
  });
});

describe("SaveCoordinator", () => {
  it("serializes overlapping saves for the same period", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("SITE", "2026-01", { labour: 0 });
    coord.editPeriod("SITE", "2026-01", { labour: 10 });

    const order = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    let startedFirst;
    const startedFirstGate = new Promise((resolve) => { startedFirst = resolve; });

    const p1 = coord.savePeriod("SITE", "2026-01", {
      persist: async () => {
        order.push("start-1");
        startedFirst();
        await firstGate;
        order.push("end-1");
      },
    });
    const p2 = coord.savePeriod("SITE", "2026-01", {
      persist: async (working) => {
        order.push(`start-2:${working.labour}`);
        order.push("end-2");
      },
    });

    // Wait until first persist has captured gen/payload, then edit, then release.
    await startedFirstGate;
    coord.editPeriod("SITE", "2026-01", { labour: 20 });
    releaseFirst();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(order.indexOf("end-1")).toBeLessThan(order.indexOf("start-2:20"));
    const rec = coord.getRecord("period:SITE__2026-01");
    expect(rec.working.labour).toBe(20);
    expect(rec.dirty).toBe(false);
  });

  it("never reports success or clears dirty when persist throws", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("SITE", "2026-01", { labour: 0 });
    coord.editPeriod("SITE", "2026-01", { labour: 42 });

    const result = await coord.savePeriod("SITE", "2026-01", {
      persist: async () => {
        throw new Error("RPC failed");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/RPC failed/);
    const rec = coord.getRecord("period:SITE__2026-01");
    expect(rec.dirty).toBe(true);
    expect(rec.working.labour).toBe(42);
    expect(rec.status).toBe("error");
    const draft = await getDraft("u1", "period:SITE__2026-01");
    expect(draft?.payload?.labour).toBe(42);
  });

  it("commits server revision from persist result (no local +1 guess)", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("SITE", "2026-01", { labour: 0, _revision: 3 });
    coord.editPeriod("SITE", "2026-01", { labour: 11, _revision: 3 });

    const result = await coord.savePeriod("SITE", "2026-01", {
      persist: async () => ({ peId: "pe-1", revision: 7 }),
    });

    expect(result.ok).toBe(true);
    expect(result.persistResult?.revision).toBe(7);
    const rec = coord.getRecord("period:SITE__2026-01");
    expect(rec.working._revision).toBe(7);
    expect(rec.committed._revision).toBe(7);
    expect(rec.dirty).toBe(false);
  });

  it("clears setup draft only after successful saveSetup", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadSetup({ sites: [{ id: "S1" }], library: [], parents: [] });
    coord.editSetup({ sites: [{ id: "S1", name: "Renamed" }], library: [], parents: [] }, { persistDraft: true });
    // editSetup persists drafts asynchronously (void); wait for IndexedDB/memory write.
    await vi.waitFor(async () => {
      expect(await getDraft("u1", "setup:ledger")).toBeTruthy();
    });

    const result = await coord.saveSetup({
      scope: "ledger",
      persist: async () => ({ headsKept: [] }),
    });
    expect(result.ok).toBe(true);
    expect(result.persistResult?.headsKept).toEqual([]);
    expect(await getDraft("u1", "setup:ledger")).toBeFalsy();
  });

  it("ignores stale save completion after a newer exclusive token", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("SITE", "2026-01", { labour: 0 });
    coord.editPeriod("SITE", "2026-01", { labour: 1 });

    let finishSlow;
    const slow = new Promise((resolve) => { finishSlow = resolve; });

    const slowSave = coord.savePeriod("SITE", "2026-01", {
      persist: async () => {
        await slow;
      },
    });

    // Queue a second save that completes first in chain after slow resolves,
    // then mutate gen after first persist returns by editing before mark.
    // Simpler path: bump saveTokens via a second save that finishes.
    coord.editPeriod("SITE", "2026-01", { labour: 99 });
    const fastSave = coord.savePeriod("SITE", "2026-01", {
      persist: async () => {},
    });

    finishSlow();
    const [slowResult, fastResult] = await Promise.all([slowSave, fastSave]);
    expect(slowResult.ok).toBe(true);
    expect(fastResult.ok).toBe(true);
    const rec = coord.getRecord("period:SITE__2026-01");
    // Fast save of 99 should win as committed/clean if gen matched at its persist time.
    expect(rec.working.labour).toBe(99);
  });

  it("rejects overlapping duplicate persist by awaiting the same key chain", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("SITE", "2026-02", { labour: 0 });
    coord.editPeriod("SITE", "2026-02", { labour: 5 });
    let active = 0;
    let maxActive = 0;
    const persist = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
    };
    await Promise.all([
      coord.savePeriod("SITE", "2026-02", { persist }),
      coord.savePeriod("SITE", "2026-02", { persist }),
      coord.savePeriod("SITE", "2026-02", { persist }),
    ]);
    expect(maxActive).toBe(1);
  });

  it("preserves drafts across simulated refresh (getDraft)", async () => {
    const coord = new SaveCoordinator({ userId: "u-refresh" });
    coord.loadPeriod("S1", "2026-03", { labour: 0 });
    coord.editPeriod("S1", "2026-03", { labour: 77 });
    await new Promise((r) => setTimeout(r, 0));
    const draft = await getDraft("u-refresh", "period:S1__2026-03");
    expect(draft?.payload?.labour).toBe(77);

    const coord2 = new SaveCoordinator({ userId: "u-refresh" });
    coord2.loadPeriod("S1", "2026-03", { labour: 0 }, { forceReset: true });
    const resumed = await coord2.resumePeriodDraft("S1", "2026-03");
    expect(resumed.working.labour).toBe(77);
    expect(resumed.dirty).toBe(true);
    expect(resumed.committed.labour).toBe(0);
  });
});

describe("draftStore", () => {
  it("scopes drafts by user", async () => {
    await putDraft({
      userId: "alice",
      recordKey: "period:X__2026-01",
      payload: { labour: 1 },
    });
    await putDraft({
      userId: "bob",
      recordKey: "period:X__2026-01",
      payload: { labour: 2 },
    });
    expect((await getDraft("alice", "period:X__2026-01")).payload.labour).toBe(1);
    expect((await getDraft("bob", "period:X__2026-01")).payload.labour).toBe(2);
  });
});

describe("navigation guard", () => {
  it("blocks beforeunload when shouldBlock is true", () => {
    const listeners = {};
    const fakeWindow = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      removeEventListener: (type) => { delete listeners[type]; },
    };
    globalThis.window = fakeWindow;
    globalThis.document = { visibilityState: "visible" };

    let blocked = true;
    const unsub = attachLedgerNavigationGuard({
      shouldBlock: () => blocked,
      onHidden: vi.fn(),
    });
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    listeners.beforeunload(event);
    expect(event.preventDefault).toHaveBeenCalled();

    blocked = false;
    const event2 = { preventDefault: vi.fn(), returnValue: undefined };
    const result = listeners.beforeunload(event2);
    expect(event2.preventDefault).not.toHaveBeenCalled();
    expect(result).toBeUndefined();

    unsub();
    delete globalThis.window;
    delete globalThis.document;
  });

  it("confirmLeaveIfDirty returns true when clean", async () => {
    const confirmFn = vi.fn();
    await expect(confirmLeaveIfDirty({ isDirty: false, confirmFn })).resolves.toBe(true);
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("confirmLeaveIfDirty asks when dirty", async () => {
    const confirmFn = vi.fn().mockResolvedValue(true);
    await expect(confirmLeaveIfDirty({ isDirty: true, confirmFn })).resolves.toBe(true);
    expect(confirmFn).toHaveBeenCalled();
  });
});

describe("feature flag", () => {
  it("is disabled when storage and env both force off", () => {
    expect(isExplicitFigureSaveEnabled({ envValue: false, storageValue: false })).toBe(false);
  });

  it("storage override wins over env", () => {
    expect(isExplicitFigureSaveEnabled({ envValue: false, storageValue: true })).toBe(true);
    expect(isExplicitFigureSaveEnabled({ storageValue: false, envValue: true })).toBe(false);
  });

  it("exposes stable storage key for rollback docs", () => {
    expect(EXPLICIT_FIGURE_SAVE_STORAGE_KEY).toBe("indus.finance.pl.explicitFigureSave");
  });
});
