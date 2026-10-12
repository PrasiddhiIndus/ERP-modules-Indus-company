# Prompt — Mock data for testing the Payroll MIS Reports (Gujarat)

> Copy everything below the line into the Claude Code session that built the MIS reports.

---

## Task

Create **mock test data** so all 7 Payroll MIS reports (spec: `docs/PROMPT_payroll_mis_7_reports.md`, plan: `docs/PLAN_payroll_mis_reports.md`) can be tested end to end. The data must reproduce the spec's sample figures (Sep 2026 vs Aug 2026, YTD Apr–Sep 2026) so the cross-report tie-out tests pass against it. **State for all mock employees and all statutory rules: Gujarat.**

## Hard constraints — fully automatic, zero impact on any database

1. **No migrations, no seed scripts, no SQL for me to run.** Nothing in this task may write to Supabase (local, staging or production): no INSERT/UPDATE/DELETE, no new tables (not even a mock registry), no storage uploads, no emails sent.
2. **Mock data lives in code only**, as in-memory fixtures:
   - `tests/fixtures/payrollMisMock.js` — all mock masters, settings, rate master, compliance calendar, payroll runs (headers + lines), increment log, budget, premiums, statutory payments, access rows, exactly shaped like the real tables/RPC results the reports read.
   - Employee codes `MOCK-E0001` … (keep drill-down codes as `MOCK-E0731`, `MOCK-E0688`, `MOCK-E0912`), names like `Mock Employee 001`, fake UAN/ESIC (`999900000001`), placeholder emails (`cfo@example.test`). No real people's data.
3. **Tests run automatically** with the existing Vitest setup (`npm test`), in a new `tests/payrollMis.test.js` (split into several files if large):
   - Feed fixtures into the **same report functions/modules the screens use** (aggregation, drivers, Change %, rounding, status logic, filters, access scoping, export builders). If report logic currently lives only in SQL views/RPCs, port nothing and change nothing — instead mock the Supabase client (`vi.mock`) to return fixture rows shaped like those RPC results, and test the JS layer; list which SQL logic is therefore not covered by these tests.
   - Mock the Supabase client, storage, email sender and `Date` (`vi.useFakeTimers` / `vi.setSystemTime('2026-10-10')`) so no network call ever happens. Add a test-level guard that **fails the run if any real Supabase/fetch call is attempted**.
   - Lock / unlock / re-lock and the after-lock trigger behaviour are simulated in-memory on the fixtures (snapshot creation, replacement on re-lock, Report 7 rows created once — no duplicates).
4. **Do not modify existing code to make tests pass** — no changes to payroll calculation, lock, payslips, register, or the report logic's expected rules. If a test fails, report it as a finding (with expected vs actual), don't "fix" the spec numbers silently. Only test files, fixtures and the report generator script are new.
5. A single command does everything: `npm run test:mis` (add the script to `package.json`) → runs the tests and generates the Word report below.

## Gujarat statutory setup (as fixture rows for the rate master / compliance calendar — no hard-coding in report code)

Verify each value against the current official Gujarat / central notifications, and flag anything you can't confirm:
- **Professional Tax (Gujarat):** ₹200/month for monthly salary ≥ ₹12,000; nil below. (Sample: 220 employees × 200 = 44,000.)
- **LWF (Gujarat):** half-yearly, collected in **June and December** — employee ₹6, employer ₹12 per half-year (verify current rate). Non-zero only in June in Apr–Sep, which matches the sample (Aug/Sep LWF = 0, YTD employer LWF = 6,200). If the Gujarat rate cannot produce exactly 6,200, use the nearest employee count and report the difference.
- **PF:** 12% employee / 12% employer on PF wages (ceiling ₹15,000 where applicable), employer split EPF / EPS 8.33% / EDLI / admin charges for the PF breakup sub-table.
- **ESI:** 0.75% employee / 3.25% employer on ESI wages for employees with gross ≤ ₹21,000. (Sample: 16,00,000 wage base → 12,000 / 52,000.)
- **TDS:** on salary for 64 employees totalling 3,20,000 in Sep.
- **Compliance calendar:** TDS 7th of M+1; PF 15th of M+1; ESI 15th of M+1; Gujarat PT and LWF due dates per the Gujarat calendar (verify).
- **Default state** setting = Gujarat.

## Master / settings fixtures to build

- **Verticals:** use the billing verticals (Manpower, Training, R&M, MM, AMC, IEV, Projects) plus Corporate (shared). Map the spec's sample "Vertical A / B / C / Corporate" to three billing verticals + Corporate (e.g. A = Manpower, B = AMC, C = Projects) and state the mapping in the output.
- **Departments** linked to verticals — for Vertical A exactly: Operations / Field, Sales & Business Dev., Service & Maintenance, Admin & Accounts; reasonable departments for the others.
- **Employee tags table:** vertical, grade, cost centre, location (Gujarat cities, e.g. Ahmedabad, Vadodara, Surat, Rajkot), position_type (New / Replacement), exit_reason, state = Gujarat. Include **at least one employee with no vertical** in a separate test case to verify the red "Unassigned" row (keep them out of the main Sep fixture, or provide a toggle, so the sample totals still tie).
- **Shared-staff allocation:** one employee split 50% A / 50% B in the allocation settings table (to test decimal headcount — keep it switched off by default so sample totals tie).
- **Provision settings:** gratuity and bonus rates in the settings table.
- **Insurance premium:** one annual group policy entered for the policy year, so the "premium ÷ 12 / months remaining, shared across employees with mediclaim" path is tested; also leave at least one month with no premium so the CTC-mediclaim fallback is tested.
- **Budget master:** budget headcount and CTC per vertical per month (so "Hires without budget" = 0 for Sep).
- **Increment log:** 3 increments effective September 2026 (Report 2 driver count = 3).
- **MIS access table:** one named user scoped to a single vertical (to test vertical-head access). Use a placeholder/test user — not a real person's account.
- **Alert recipients setting:** placeholder test addresses (e.g. `cfo@example.test`, `compliance@example.test`) — do not send real emails while testing.

## Payroll run fixtures (all LOCKED, Gujarat)

Locked runs for **April–September 2026** (for YTD and 12-month trend you may also add Oct 2025–Mar 2026 so the chart shows 12 points). Plus one **Draft** run for October 2026 that must **not** appear in any report (tests the "LOCKED only" rule), and one month that is locked, unlocked and re-locked (tests snapshot replacement and no duplicate tracker rows).

The data must hit these figures exactly (the spec samples are the test cases):

**Report 1 (Sep vs Aug):** Headcount 248 / 240 · Gross 62,40,000 / 60,10,000 · Deductions 8,71,000 / 8,45,200 · Net 53,69,000 / 51,64,800 · Employer statutory & provisions 7,77,000 / 7,51,000 · Total CTC 70,17,000 / 67,61,000 · OT 2,10,000 / 1,65,000.

**Report 2 drivers (Aug → Sep):** New joiners +1,96,000 (12) · Exits −58,000 (4) · Increments +22,000 (3) · Overtime +45,000 (64) · Incentives & arrears +18,000 (9) · LOP −14,000 (21) · Other +21,000 (30) · Employer cost +26,000. Overtime drill-down must include MOCK-E0731 (4,200 → 11,800), MOCK-E0688 (3,900 → 9,500), MOCK-E0912 (0 → 4,100, Vertical B / Service).
Note: OT and arrears are currently 0 in payroll; for the mock runs, store OT / incentive / arrear amounts in whatever head the build uses for them so these drivers can be tested — without changing real payroll logic.

**Report 3 (Sep / Aug / YTD Apr–Sep):** Gross 62,40,000 / 60,10,000 / 3,58,20,000 · Employer PF 4,10,000 / 3,96,000 / 23,60,000 · ESI 52,000 / 50,500 / 3,02,000 · LWF 0 / 0 / 6,200 · Gratuity 1,50,000 / 1,44,500 / 8,65,000 · Bonus 1,05,000 / 1,02,000 / 6,05,000 · Insurance 60,000 / 58,000 / 3,50,000 · Total 70,17,000 / 67,61,000 / 4,03,08,200.
Leave encashment provision is now its own row included in Employer cost / Total CTC. Either set it to 0 in the fixtures so the spec totals tie exactly, or use a non-zero value and provide an adjusted expected-totals table — say which you chose.

**Report 4 (Sep):** A 96 HC, Gross 23,40,000, Employer 2,95,000, CTC 26,35,000, Aug 25,10,000, YTD 1,49,80,000 · B 72, 18,30,000, 2,25,000, 20,55,000, Aug 20,10,000, YTD 1,19,40,000 · C 58, 14,50,000, 1,78,000, 16,28,000, Aug 16,05,000, YTD 94,60,000 · Corporate 22, 6,20,000, 79,000, 6,99,000, Aug 6,36,000, YTD 39,28,200.

**Report 5 (Vertical A, Sep):** Operations / Field 58 HC, CTC 14,20,000, OT 82,000, 4 hires, 1 exit, Aug 13,35,000 · Sales & BD 14, 5,10,000, OT 0, 1 hire, 0 exits, Aug 4,75,000 · Service & Maintenance 16, 4,25,000, OT 23,000, 0, 0, Aug 4,20,000 · Admin & Accounts 8, 2,80,000, OT 0, 0, 0, Aug 2,80,000. Grand total: 248 HC, 2,10,000 OT, 12 hires, 4 exits.

**Report 6 (Sep):** PF 236 covered, wage base 34,15,000, 4,10,000 + 4,10,000 = 8,20,000 · ESI 98, 16,00,000, 12,000 + 52,000 = 64,000 · PT 220, 44,000 · LWF 0 · TDS 64, 3,20,000. Totals 7,86,000 / 4,62,000 / 12,48,000. Employee-wise tab must list UAN / ESIC (fake numbers).
(The spec's PF figures are rounded — 12% of 34,15,000 is 4,09,800. Prefer hitting the 4,10,000 totals by adjusting individual wages, and report any unavoidable rounding gap.)

**Report 7 (as viewed on 10 Oct 2026):**
- Sep 2026 TDS — due 07 Oct 2026, 3,20,000, paid 06 Oct 2026, challan `MOCK-CIN-0510221`, Paid on time.
- Sep 2026 PF — due 15 Oct 2026, 8,20,000, unpaid → Pending.
- Sep 2026 ESI — due 15 Oct 2026, 64,000, unpaid → Pending.
- Sep 2026 Professional Tax (Gujarat calendar) — 44,000, unpaid → Pending.
- Aug 2026 PF — due 15 Sep 2026, 7,92,000, paid 18 Sep 2026, `MOCK-TRRN-102388`, Paid late, 3 days, interest + penalty 1,850.
- Earlier months: all paid on time.
- Tiles must show: Pending ₹9,28,000 · Overdue 0 · Paid late this FY 1 · Interest & penalty YTD ₹1,850.
- Also add extra rows (separate toggle or a later wage month) to test **Due soon** (amber) and **Overdue** (red) statuses, and a test that a row cannot be marked paid without challan_ref + paid_on. Simulate one challan PDF upload with a mocked storage client (nothing is actually uploaded).

**New-hire summary fixture (for later Report 8):** 12 hires = 9 New + 3 Replacement, monthly CTC added 3,42,000, paid in Sep 1,96,000, average new-hire CTC 28,500, 0 hires without budget.

## Automated checks (all in Vitest, no database)

1. Every figure listed above for Reports 1–7 and the new-hire fixture — one assertion each, with expected vs actual.
2. Cross-report tie-outs: R1 = R3 = R4 = R5 Total CTC; R4 rows = R5 vertical subtotals; R2 previous + drivers = current (and publishing blocked when it doesn't); R2 new joiners = new-hire "paid in Sep"; R3 YTD = R4 YTD; R6 per statute = R7 amounts; R6 employer PF/ESI = R3; R7 tiles.
3. Common rules: Change % rounding to 1 decimal and "New" when previous = 0; 2-decimal storage vs whole-rupee Indian grouping display (12,34,567); "previous" = immediately previous locked month for the same filters; Draft October run never appears; re-lock replaces snapshot with no duplicate tracker rows; snapshot keeps last month's vertical after a mock transfer.
4. Filters: period (month / range / quarter / FY Apr–Mar / YTD), vertical, department, location, cost centre, grade, employment type.
5. Report 1 colours (red > 5% rise on money rows, green on fall, none on headcount); Report 4 red "Unassigned" row; 50/50 allocation gives 0.5 headcount; Report 7 statuses Pending / Due soon / Overdue / Paid on time / Paid late + days late; cannot mark paid without challan_ref + paid_on; alert email triggered (mocked) on Due soon and Overdue only.
6. Drill-downs return the employee rows that sum to each total.
7. Access: Salary Admin list sees all verticals; vertical-scoped user sees only theirs; every view/download produces a (mocked) log entry.
8. Exports: Excel contains values not formulas, CSV and PDF build without error, and every export carries the report header (company, report name, period, filters, generated on, generated by). Write sample exports to the scratch output folder only.
9. Prove no side effects: assert the mocked Supabase client recorded zero real calls and `git status` shows only the new test/fixture/report-generator files plus the generated report.

## Word test report (good-looking .docx)

After the tests run, `npm run test:mis` must generate **`docs/test-reports/Payroll_MIS_Test_Report_<YYYY-MM-DD>.docx`** automatically (use the `docx` npm package as a **devDependency** only; read Vitest results via its JSON reporter). Professional layout:

- **Cover page:** title "Payroll MIS Reports — Test Report", company name, test date, state = Gujarat, environment = "In-memory mock data (no database used)", prepared by Claude Code.
- **Executive summary:** total tests, passed, failed, skipped, overall verdict (PASS / FAIL) in a coloured status box; one-paragraph summary of findings.
- **Table of contents.**
- **Test approach:** what was mocked, why no data was touched, vertical A/B/C → billing-vertical mapping, Gujarat rate values used (and which were verified / unverified).
- **One section per report (1–7 + new-hire summary):** purpose, the mock data used (summary table), an **Expected vs Actual table for every figure** with a Pass/Fail column (green ✔ / red ✘ cells), and notes on any gap (e.g. PF rounding, LWF 6,200, leave encashment choice).
- **Cross-report tie-out matrix:** one table, each check with both values and Pass/Fail.
- **Common rules, filters, access, exports, status/colour tests:** grouped tables with Pass/Fail.
- **Defects / open issues:** each failure with report, check, expected, actual, likely cause, severity — or "None".
- **Coverage gaps:** anything not tested (e.g. SQL logic inside views/RPCs, real PDF visual layout, real email delivery) and how to cover it later.
- **Appendix:** fixture summary (employee counts per vertical/department/month), list of test files, command used, Node/Vitest versions.
- Styling: company-neutral colour theme, consistent fonts, header with report title, footer with page numbers ("Page X of Y"), tables with shaded header rows, amounts in Indian grouping, landscape pages for wide tables.

Send me the path of the .docx at the end, plus a short chat summary (pass/fail counts and any failures).

## Do not

- Do not write migrations, seed/cleanup SQL, or anything I need to run against a database.
- Do not touch existing source files (except adding the `test:mis` script and the `docx` devDependency to `package.json`).
- Do not commit; leave the changes for my review.
