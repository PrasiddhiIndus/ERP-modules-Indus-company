import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clone, dbState, seed, state, supabase as fakeDb } from "./helpers/fakeSalarySupabase.js";

vi.mock("../src/lib/supabase.js", async () => {
  const { supabase } = await import("./helpers/fakeSalarySupabase.js");
  return { supabase };
});

const {
  MONTH_LOCKED_MESSAGE,
  getMonthRunByKey,
  getMonthRunWithLines,
  lockMonthRun,
  monthRunLocked,
  processSalaryMonth,
  publishSalarySlipsForMonth,
  reprocessMonthRunAtomic,
  saveMonthRunEdits,
  unlockMonthRun,
} = await import("../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js");

const AUG = { year: 2026, month: 8, monthDays: 26, processedOn: "2026-09-01" };
const SEP = { year: 2026, month: 9, monthDays: 26, processedOn: "2026-10-01" };

async function lockedAugust() {
  const res = await processSalaryMonth(AUG);
  await lockMonthRun(res.run.id);
  return res.run.id;
}

const sheetTables = () => {
  const t = clone(state.tables);
  return {
    runs: t.admin_salary_month_runs,
    lines: t.admin_salary_month_lines,
    revisions: t.admin_salary_run_revisions,
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T06:30:00.000Z"));
  seed();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("D-03 lock a processed month", () => {
  it("existing months stay unlocked until someone locks them", async () => {
    const res = await processSalaryMonth(AUG);
    expect(monthRunLocked(res.run)).toBe(false);
  });

  it("lock is stored with who and when, and survives a reload", async () => {
    const runId = await lockedAugust();
    const reloaded = await getMonthRunByKey("2026-08");
    expect(reloaded.id).toBe(runId);
    expect(monthRunLocked(reloaded)).toBe(true);
    expect(reloaded.locked_by).toBe("user-1");
    expect(reloaded.locked_at).toBeTruthy();
    const again = await getMonthRunWithLines(runId);
    expect(monthRunLocked(again.run)).toBe(true);
    expect(again.lines).toHaveLength(3);
  });

  it("locking twice is harmless", async () => {
    const runId = await lockedAugust();
    const before = sheetTables();
    await lockMonthRun(runId);
    expect(sheetTables()).toEqual(before);
  });
});

describe("D-03 a locked month rejects changes through the app", () => {
  it("full reprocess is rejected and nothing is written", async () => {
    await lockedAugust();
    const before = sheetTables();
    state.rpcCalls = [];
    await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toThrow(MONTH_LOCKED_MESSAGE);
    expect(state.rpcCalls).toEqual([]);
    expect(sheetTables()).toEqual(before);
  });

  it("adding employees to the month is rejected", async () => {
    const res = await processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Ops"] });
    await lockMonthRun(res.run.id);
    const before = sheetTables();
    await expect(
      processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Admin"] })
    ).rejects.toThrow(MONTH_LOCKED_MESSAGE);
    expect(sheetTables()).toEqual(before);
  });

  it("sheet edits are rejected", async () => {
    const runId = await lockedAugust();
    const { lines } = await getMonthRunWithLines(runId);
    const before = sheetTables();
    await expect(saveMonthRunEdits(runId, [{ ...lines[0], loan: 500 }])).rejects.toThrow(MONTH_LOCKED_MESSAGE);
    expect(sheetTables()).toEqual(before);
  });

  it("publishing slips is rejected", async () => {
    await lockedAugust();
    const before = sheetTables();
    await expect(publishSalarySlipsForMonth({ year: 2026, month: 8 })).rejects.toThrow(MONTH_LOCKED_MESSAGE);
    expect(sheetTables()).toEqual(before);
  });

  it("processing a brand-new month is still allowed", async () => {
    await lockedAugust();
    vi.setSystemTime(new Date("2026-10-01T06:30:00.000Z"));
    const res = await processSalaryMonth(SEP);
    expect(res.run.month_key).toBe("2026-09");
    expect(monthRunLocked(res.run)).toBe(false);
    expect(res.lines).toHaveLength(3);
  });

  it("viewing a locked month still works", async () => {
    const runId = await lockedAugust();
    const bundle = await getMonthRunWithLines(runId);
    expect(bundle.run.revision_no).toBe(1);
    expect(bundle.lines.map((l) => String(l.employee_master_id)).sort()).toEqual(["101", "102", "103"]);
  });
});

describe("D-03 a locked month rejects changes at the database", () => {
  it("the atomic reprocess call is rejected and rolled back", async () => {
    const runId = await lockedAugust();
    const before = sheetTables();
    await expect(
      reprocessMonthRunAtomic({
        runId,
        runPatch: { revision_no: 2, status: "processed" },
        lines: [{ run_id: runId, employee_master_id: 101, net_salary: 1 }],
        revision: { revision_no: 2, changed_by: "user-1", change_summary_json: {} },
      })
    ).rejects.toThrow(MONTH_LOCKED_MESSAGE);
    expect(sheetTables()).toEqual(before);
  });

  it("deleting the month is rejected", async () => {
    const runId = await lockedAugust();
    const before = sheetTables();
    const { error } = await fakeDb.from("admin_salary_month_runs").delete().eq("id", runId);
    expect(error?.hint).toBe("salary_month_locked");
    expect(sheetTables()).toEqual(before);
  });

  it("deleting, adding or editing lines is rejected", async () => {
    const runId = await lockedAugust();
    const before = sheetTables();
    const del = await fakeDb.from("admin_salary_month_lines").delete().eq("run_id", runId);
    expect(del.error?.hint).toBe("salary_month_locked");
    const ins = await fakeDb.from("admin_salary_month_lines").insert({ run_id: runId, employee_master_id: 999 });
    expect(ins.error?.hint).toBe("salary_month_locked");
    const upd = await fakeDb.from("admin_salary_month_lines").update({ loan: 1 }).eq("run_id", runId);
    expect(upd.error?.hint).toBe("salary_month_locked");
    expect(sheetTables()).toEqual(before);
  });

  it("the lock cannot be removed by editing the month directly", async () => {
    const runId = await lockedAugust();
    const before = sheetTables();
    const { error } = await fakeDb.from("admin_salary_month_runs").update({ is_locked: false }).eq("id", runId);
    expect(error?.hint).toBe("salary_month_lock_columns");
    expect(sheetTables()).toEqual(before);
  });
});

describe("D-03 unlock needs a reason", () => {
  it("an empty or too-short reason is rejected before calling the database", async () => {
    const runId = await lockedAugust();
    state.rpcCalls = [];
    await expect(unlockMonthRun(runId, "")).rejects.toThrow(/reason/i);
    await expect(unlockMonthRun(runId, "   ok  ")).rejects.toThrow(/reason/i);
    expect(state.rpcCalls).toEqual([]);
    expect(monthRunLocked(await getMonthRunByKey("2026-08"))).toBe(true);
  });

  it("the database also rejects a missing reason", async () => {
    const runId = await lockedAugust();
    const { error } = await fakeDb.rpc("admin_salary_unlock_month_run", { p_run_id: runId, p_reason: " " });
    expect(error?.message).toMatch(/reason/i);
    expect(monthRunLocked(await getMonthRunByKey("2026-08"))).toBe(true);
  });

  it("unlock records reason, who and when, keeps a trail, and allows reprocess again", async () => {
    const runId = await lockedAugust();
    await unlockMonthRun(runId, "  Attendance correction approved by HR  ");
    const run = await getMonthRunByKey("2026-08");
    expect(monthRunLocked(run)).toBe(false);
    expect(run.unlock_reason).toBe("Attendance correction approved by HR");
    expect(run.unlocked_by).toBe("user-1");
    expect(run.unlocked_at).toBeTruthy();
    expect(run.summary_json.lock_history.map((h) => h.action)).toEqual(["lock", "unlock"]);
    expect(run.summary_json.lock_history[1].reason).toBe("Attendance correction approved by HR");

    const res = await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    expect(res.run.revision_no).toBe(2);
    expect(res.run.summary_json.lock_history.map((h) => h.action)).toEqual(["lock", "unlock"]);
    expect(dbState().lines).toHaveLength(3);
  });

  it("the lock trail cannot be changed by other writes", async () => {
    const runId = await lockedAugust();
    await unlockMonthRun(runId, "Correction approved");
    const trail = (await getMonthRunByKey("2026-08")).summary_json.lock_history;
    await fakeDb
      .from("admin_salary_month_runs")
      .update({ summary_json: { lock_history: [] } })
      .eq("id", runId);
    expect((await getMonthRunByKey("2026-08")).summary_json.lock_history).toEqual(trail);
  });
});
