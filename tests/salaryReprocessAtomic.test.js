import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clone, dbState, seed, state } from "./helpers/fakeSalarySupabase.js";

vi.mock("../src/lib/supabase.js", async () => {
  const { supabase } = await import("./helpers/fakeSalarySupabase.js");
  return { supabase };
});

const fake = { state, clone };

const { processSalaryMonth, getMonthRunWithLines } = await import(
  "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
);

const AUG = { year: 2026, month: 8, monthDays: 26, processedOn: "2026-09-01" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T06:30:00.000Z"));
  seed();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("D-02 success path: same stored data and result as before", () => {
  it("fresh month process", async () => {
    const res = await processSalaryMonth(AUG);
    expect({ db: dbState(), meta: res.processMeta, run: res.run }).toMatchSnapshot();
  });

  it("full reprocess of an existing month", async () => {
    await processSalaryMonth(AUG);
    fake.state.tables.admin_salary_structures[0].gross_monthly = 32000;
    fake.state.tables.admin_salary_structures[0].special_allowance_monthly = 11000;
    vi.setSystemTime(new Date("2026-09-02T06:30:00.000Z"));
    const res = await processSalaryMonth({ ...AUG, forceFullReprocess: true, processedOn: "2026-09-02" });
    expect({ db: dbState(), meta: res.processMeta, run: res.run, lineCount: res.lines.length }).toMatchSnapshot();
  });

  it("running the same full reprocess twice gives the same lines", async () => {
    await processSalaryMonth(AUG);
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const first = dbState();
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const second = dbState();
    const amounts = (s) => s.lines.map(({ id, line_revision_no, ...l }) => l);
    expect(amounts(second)).toEqual(amounts(first));
    expect(second.runs[0].revision_no).toBe(first.runs[0].revision_no + 1);
    expect(second.revisions.map((r) => r.revision_no)).toEqual([1, 2, 3]);
  });

  it("full reprocess makes one database call and no separate table writes", async () => {
    await processSalaryMonth(AUG);
    fake.state.calls = [];
    fake.state.rpcCalls = [];
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    expect(fake.state.rpcCalls.map((c) => c.name)).toEqual(["admin_salary_reprocess_month_run"]);
    const sheetWrites = fake.state.calls.filter(
      (c) =>
        c.op !== "select" &&
        ["admin_salary_month_runs", "admin_salary_month_lines", "admin_salary_run_revisions"].includes(c.table)
    );
    expect(sheetWrites).toEqual([]);
  });

  it("partial process of an existing month", async () => {
    await processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Ops"] });
    const res = await processSalaryMonth({ ...AUG, processMode: "dept", departments: ["Admin"] });
    expect({ db: dbState(), meta: res.processMeta }).toMatchSnapshot();
  });
});

describe("D-02 failure at any step leaves the previous sheet untouched", () => {
  for (const step of ["before", "update_run", "delete_lines", "insert_lines", "insert_revision"]) {
    it(`fails at ${step}`, async () => {
      await processSalaryMonth(AUG);
      const before = fake.clone(fake.state.tables);
      fake.state.tables.admin_salary_structures[0].gross_monthly = 50000;
      const structuresAfterEdit = fake.clone(fake.state.tables.admin_salary_structures);
      fake.state.failRpcAt = step;
      await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toBeTruthy();
      expect(fake.state.tables.admin_salary_month_runs).toEqual(before.admin_salary_month_runs);
      expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
      expect(fake.state.tables.admin_salary_run_revisions).toEqual(before.admin_salary_run_revisions);
      expect(fake.state.tables.admin_salary_structures).toEqual(structuresAfterEdit);
    });
  }

  it("a duplicate employee in the new lines rolls back and shows the existing message", async () => {
    await processSalaryMonth(AUG);
    const before = fake.clone(fake.state.tables);
    const { reprocessMonthRunAtomic } = await import(
      "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
    );
    const runId = before.admin_salary_month_runs[0].id;
    const line = { run_id: runId, employee_master_id: 101, net_salary: 1 };
    await expect(
      reprocessMonthRunAtomic({
        runId,
        runPatch: { revision_no: 2, status: "processed" },
        lines: [line, { ...line }],
        revision: { revision_no: 2, changed_by: "user-1", change_summary_json: {} },
      })
    ).rejects.toThrow("Duplicate employee detected on this month sheet. Refresh and try again.");
    expect(fake.state.tables.admin_salary_month_runs).toEqual(before.admin_salary_month_runs);
    expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
  });

  it("a revision number already used (concurrent reprocess) rolls back everything", async () => {
    await processSalaryMonth(AUG);
    await processSalaryMonth({ ...AUG, forceFullReprocess: true });
    const before = fake.clone(fake.state.tables);
    fake.state.tables.admin_salary_month_runs[0].revision_no = 1;
    const staleRuns = fake.clone(fake.state.tables.admin_salary_month_runs);
    await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toMatchObject({ code: "23505" });
    expect(fake.state.tables.admin_salary_month_runs).toEqual(staleRuns);
    expect(fake.state.tables.admin_salary_month_lines).toEqual(before.admin_salary_month_lines);
    expect(fake.state.tables.admin_salary_run_revisions).toEqual(before.admin_salary_run_revisions);
  });

  it("the stored sheet still loads after a failed reprocess", async () => {
    const first = await processSalaryMonth(AUG);
    fake.state.failRpcAt = "insert_lines";
    await expect(processSalaryMonth({ ...AUG, forceFullReprocess: true })).rejects.toBeTruthy();
    const bundle = await getMonthRunWithLines(first.run.id);
    expect(bundle.run.revision_no).toBe(1);
    expect(bundle.lines).toHaveLength(3);
  });
});
