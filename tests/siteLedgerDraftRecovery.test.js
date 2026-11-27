import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SaveCoordinator,
  __resetSharedSaveCoordinatorForTests,
} from "../src/pages/finance/site-ledger/persistence/saveCoordinator.js";
import {
  __resetDraftMemoryForTests,
  __setDraftIdbAdapterForTests,
  classifyDraftStorageError,
  deleteDraftIfUnchanged,
  fingerprintPayload,
  getDraft,
  listDraftsForUser,
  onLedgerUserContextChange,
  putDraft,
  sanitizeDraftPayload,
} from "../src/pages/finance/site-ledger/persistence/draftStore.js";
import {
  compareDraftToServer,
  formatDraftReviewLines,
} from "../src/pages/finance/site-ledger/persistence/draftCompare.js";
import { __resetLedgerTabIdForTests } from "../src/pages/finance/site-ledger/persistence/draftSession.js";
import { periodRecordKey } from "../src/pages/finance/site-ledger/state/workingCopy.js";

beforeEach(() => {
  __resetDraftMemoryForTests();
  __resetSharedSaveCoordinatorForTests();
  __resetLedgerTabIdForTests();
  __setDraftIdbAdapterForTests(null);
});

describe("sanitizeDraftPayload / security", () => {
  it("strips tokens, secrets and _audit from drafts", () => {
    const clean = sanitizeDraftPayload({
      labour: 10,
      access_token: "secret",
      refresh_token: "x",
      password: "p",
      _audit: { userId: "u", token: "nope" },
      note: "ok",
    });
    expect(clean).toEqual({ labour: 10, note: "ok" });
    expect(clean.access_token).toBeUndefined();
    expect(clean._audit).toBeUndefined();
  });
});

describe("draft persistence lifecycle", () => {
  it("recovers draft after simulated browser refresh (new coordinator)", async () => {
    const c1 = new SaveCoordinator({ userId: "u1" });
    c1.loadPeriod("SITE", "2026-01", { labour: 0 });
    c1.editPeriod("SITE", "2026-01", { labour: 55 });
    await new Promise((r) => setTimeout(r, 0));

    const c2 = new SaveCoordinator({ userId: "u1" });
    c2.loadPeriod("SITE", "2026-01", { labour: 0 }, { forceReset: true });
    const evaluated = await c2.evaluatePeriodDraft("SITE", "2026-01", { labour: 0 });
    expect(evaluated.comparison.differsFromServer).toBe(true);
    expect(evaluated.comparison.kind).toBe("draft_newer");

    const resumed = await c2.resumePeriodDraft("SITE", "2026-01");
    expect(resumed.working.labour).toBe(55);
    expect(resumed.dirty).toBe(true);
    expect(resumed.committed.labour).toBe(0);
  });

  it("simulates close/reopen via getDraft without auto-applying", async () => {
    await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("A", "2026-02"),
      kind: "period",
      siteCode: "A",
      periodKey: "2026-02",
      payload: { labour: 9 },
      serverSnapshot: { labour: 0 },
    });
    const draft = await getDraft("u1", periodRecordKey("A", "2026-02"));
    expect(draft.payload.labour).toBe(9);
    expect(draft.createdAt).toBeTruthy();
    expect(draft.updatedAt).toBeTruthy();
    expect(draft.status).toBe("pending");
    // Reopen evaluation only — no silent mutate of "server".
    const comparison = compareDraftToServer({
      draft,
      serverSnapshot: { labour: 0 },
    });
    expect(comparison.differsFromServer).toBe(true);
  });

  it("keeps draft after network/save failure", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("S", "2026-03", { labour: 0 });
    coord.editPeriod("S", "2026-03", { labour: 12 });
    const result = await coord.savePeriod("S", "2026-03", {
      persist: async () => {
        throw new Error("network interrupted");
      },
    });
    expect(result.ok).toBe(false);
    const draft = await getDraft("u1", periodRecordKey("S", "2026-03"));
    expect(draft.payload.labour).toBe(12);
    expect(draft.status).toBe("save_failed");
    expect(draft.lastError).toMatch(/network interrupted/);
  });

  it("clears draft only after successful commit with no newer pending edits", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("S", "2026-04", { labour: 0 });
    coord.editPeriod("S", "2026-04", { labour: 3 });
    await new Promise((r) => setTimeout(r, 0));
    const result = await coord.savePeriod("S", "2026-04", {
      persist: async () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.record.dirty).toBe(false);
    const draft = await getDraft("u1", periodRecordKey("S", "2026-04"));
    expect(draft).toBeNull();
  });

  it("retains draft when newer edits happen while an earlier save is in flight", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    coord.loadPeriod("S", "2026-05", { labour: 0 });
    coord.editPeriod("S", "2026-05", { labour: 1 });

    let release;
    const gate = new Promise((r) => { release = r; });
    let started;
    const startedGate = new Promise((r) => { started = r; });

    const p1 = coord.savePeriod("S", "2026-05", {
      persist: async () => {
        started();
        await gate;
      },
    });
    await startedGate;
    coord.editPeriod("S", "2026-05", { labour: 99 });
    release();
    await p1;

    const draft = await getDraft("u1", periodRecordKey("S", "2026-05"));
    expect(draft.payload.labour).toBe(99);
    expect(coord.getRecord(periodRecordKey("S", "2026-05")).dirty).toBe(true);
  });
});

describe("multi-site / multi-period drafts", () => {
  it("stores independent drafts per site and period", async () => {
    await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("S1", "2026-01"),
      siteCode: "S1",
      periodKey: "2026-01",
      payload: { labour: 1 },
      serverSnapshot: {},
    });
    await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("S1", "2026-02"),
      siteCode: "S1",
      periodKey: "2026-02",
      payload: { labour: 2 },
      serverSnapshot: {},
    });
    await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("S2", "2026-01"),
      siteCode: "S2",
      periodKey: "2026-01",
      payload: { labour: 3 },
      serverSnapshot: {},
    });
    const all = await listDraftsForUser("u1");
    expect(all).toHaveLength(3);
    const jan = await listDraftsForUser("u1", { periodKey: "2026-01" });
    expect(jan).toHaveLength(2);
    const s2 = await listDraftsForUser("u1", { siteCode: "S2" });
    expect(s2).toHaveLength(1);
    expect(s2[0].payload.labour).toBe(3);
  });
});

describe("user account switching", () => {
  it("does not expose or delete another user's drafts", async () => {
    await putDraft({
      userId: "alice",
      recordKey: periodRecordKey("X", "2026-01"),
      siteCode: "X",
      periodKey: "2026-01",
      payload: { labour: 11 },
      serverSnapshot: {},
    });
    const coord = new SaveCoordinator({ userId: "alice" });
    coord.loadPeriod("X", "2026-01", { labour: 0 });
    coord.editPeriod("X", "2026-01", { labour: 11 });
    coord.setUserId("bob");
    expect(await getDraft("bob", periodRecordKey("X", "2026-01"))).toBeNull();
    expect((await getDraft("alice", periodRecordKey("X", "2026-01")))?.payload?.labour).toBe(11);
    // Logout / switch must not wipe recoverable drafts for the previous user.
    onLedgerUserContextChange("alice");
    expect((await getDraft("alice", periodRecordKey("X", "2026-01")))?.payload?.labour).toBe(11);
    // Bob's coordinator must not see Alice's working copy in memory.
    expect(coord.getRecord(periodRecordKey("X", "2026-01"))).toBeNull();
  });
});

describe("stale / conflict detection", () => {
  it("flags conflict when server moved since draft baseline", () => {
    const draft = {
      payload: { labour: 5 },
      payloadFingerprint: fingerprintPayload({ labour: 5 }),
      serverFingerprint: fingerprintPayload({ labour: 1 }),
      sourceRevision: "r1",
      updatedAt: 100,
      createdAt: 50,
    };
    const comparison = compareDraftToServer({
      draft,
      serverSnapshot: { labour: 2 },
      currentSourceRevision: "r2",
    });
    expect(comparison.isConflict).toBe(true);
    expect(comparison.differsFromServer).toBe(true);
    expect(formatDraftReviewLines(comparison).length).toBeGreaterThan(0);
  });

  it("never treats identical draft as needing silent overwrite", () => {
    const payload = { labour: 4 };
    const draft = {
      payload,
      payloadFingerprint: fingerprintPayload(payload),
      serverFingerprint: fingerprintPayload(payload),
      updatedAt: 1,
      createdAt: 1,
    };
    const comparison = compareDraftToServer({ draft, serverSnapshot: payload });
    expect(comparison.differsFromServer).toBe(false);
    expect(comparison.kind).toBe("identical");
  });
});

describe("multi-tab conditional delete", () => {
  it("does not delete a newer draft written by another tab after commit", async () => {
    const key = periodRecordKey("T", "2026-06");
    const first = await putDraft({
      userId: "u1",
      recordKey: key,
      siteCode: "T",
      periodKey: "2026-06",
      payload: { labour: 1 },
      serverSnapshot: { labour: 0 },
    });
    const second = await putDraft({
      userId: "u1",
      recordKey: key,
      siteCode: "T",
      periodKey: "2026-06",
      payload: { labour: 2 },
      serverSnapshot: { labour: 0 },
    });
    const result = await deleteDraftIfUnchanged("u1", key, {
      expectedPayloadFingerprint: first.draft.payloadFingerprint,
      expectedUpdatedAt: first.draft.updatedAt,
    });
    expect(result.deleted).toBe(false);
    expect(result.reason).toMatch(/fingerprint|newer/);
    expect((await getDraft("u1", key)).payload.labour).toBe(2);
    expect(second.draft.payload.labour).toBe(2);
  });
});

describe("IndexedDB / quota failures", () => {
  it("falls back to memory when IndexedDB put throws", async () => {
    __setDraftIdbAdapterForTests({
      openDb: async () => ({}),
      put: async () => {
        throw new Error("IndexedDB put failed");
      },
      get: async () => null,
      delete: async () => {},
      getAllForUser: async () => [],
    });
    const result = await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("Q", "2026-01"),
      siteCode: "Q",
      periodKey: "2026-01",
      payload: { labour: 7 },
      serverSnapshot: {},
    });
    expect(result.storage).toBe("memory");
    expect(result.error).toBeTruthy();
    expect((await getDraft("u1", periodRecordKey("Q", "2026-01"))).payload.labour).toBe(7);
  });

  it("classifies quota exceeded errors", () => {
    const err = Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    const classified = classifyDraftStorageError(err);
    expect(classified.code).toBe("quota");
    expect(classified.message).toMatch(/storage is full/i);
  });

  it("surfaces quota failures from adapter without losing the draft payload", async () => {
    __setDraftIdbAdapterForTests({
      openDb: async () => ({}),
      put: async () => {
        const e = new Error("exceeded");
        e.name = "QuotaExceededError";
        throw e;
      },
      get: async () => null,
      delete: async () => {},
      getAllForUser: async () => [],
    });
    const result = await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("Q2", "2026-01"),
      payload: { labour: 8 },
      serverSnapshot: {},
    });
    expect(result.error.code).toBe("quota");
    expect(result.draft.payload.labour).toBe(8);
  });
});

describe("SaveCoordinator evaluatePeriodDraft", () => {
  it("does not silently overwrite server-backed working copy", async () => {
    const coord = new SaveCoordinator({ userId: "u1" });
    await putDraft({
      userId: "u1",
      recordKey: periodRecordKey("Z", "2026-07"),
      siteCode: "Z",
      periodKey: "2026-07",
      payload: { labour: 100 },
      serverSnapshot: { labour: 1 },
    });
    coord.loadPeriod("Z", "2026-07", { labour: 50 }, { forceReset: true });
    const before = coord.getRecord(periodRecordKey("Z", "2026-07"));
    expect(before.working.labour).toBe(50);
    const evaluated = await coord.evaluatePeriodDraft("Z", "2026-07", { labour: 50 });
    expect(evaluated.comparison.differsFromServer).toBe(true);
    // Still untouched until Resume.
    expect(coord.getRecord(periodRecordKey("Z", "2026-07")).working.labour).toBe(50);
  });
});
