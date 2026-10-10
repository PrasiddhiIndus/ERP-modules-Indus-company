# Payroll MIS Reports 1–7 — 10 Oct 2026

Adds the seven payroll MIS reports from `docs/PROMPT_payroll_mis_7_reports.md` to Salary Admin. Everything is additive: no existing table, column, function, trigger, policy, view or row is changed, and salary processing, the lock, payslips, bank export and the salary register are untouched.

## Where

- **Salary Admin → MIS Reports** (`/app/admin/salary-admin/mis`) for the Salary Admin allowlist. It has two views: Reports (1–7) and Setup.
- **Payroll reports** (`/app/admin/payroll-mis`) for vertical heads given report access in Setup. They see Reports 1–6 for their vertical (optionally one department). A sidebar link appears only for them.
- **Employee Master → Payroll reporting** section (vertical, grade, cost centre, position type, work state, exit reason). It saves on its own and is shown to Salary Admin users and Employee Master editors.

## Database (new migrations + rollbacks)

| Migration | Adds |
|---|---|
| `20261010120000_payroll_mis_foundation.sql` | MIS settings, employee tags side table (Employee Master not altered), department → vertical master, shared-staff allocation %, insurance premium, statutory rate master, compliance calendar, budget, report access, audit log, job log, alert recipients / log, access helpers, RLS |
| `20261010120100_payroll_mis_snapshot.sql` | Lock snapshot table, statutory payments table (unique wage month + statute + state; paid needs challan ref), private `payroll-statutory-challans` bucket, snapshot builder, **AFTER trigger on lock**, report functions, one-time build for months already locked |

Rollbacks are in `supabase/rollbacks/…_down.sql`. Run the snapshot rollback first, then the foundation rollback.

### Lock hook
- A new AFTER UPDATE trigger runs only when a processed month changes from unlocked to locked. The existing lock function is not modified.
- All of its work runs inside its own exception block. Any error is written to the job log and the lock still succeeds.
- Re-locking replaces that month's snapshot and upserts the payment rows, so it never creates duplicates:
  - Unpaid rows get the new amount and due date.
  - Paid rows keep their payment details and are flagged "Amount changed after payment".
- Months that were already locked get a snapshot at migration time, built from today's tags.

### Employer cost (approved)
- **Proration factor:** f = paid days ÷ month days (0 when month days is 0, never above 1). Stored to 2 decimals.

| Cost | Formula |
|---|---|
| Employer PF / ESI | f × the line's CTC breakdown figure (else the CTC record) |
| Employer LWF | 0 |
| Gratuity | f × gratuity |
| Bonus | f × (ex-gratia + bonus + special performance bonus) |
| Leave encashment | f × leave encashment. Its own row; included in employer cost and Total CTC everywhere |
| Group insurance | An annual premium from Setup covering the month is ÷ 12 (or ÷ months remaining), shared equally by employees whose CTC has mediclaim, and not prorated. Otherwise f × mediclaim |
| OT and arrears | 0 (payroll has no such heads yet); columns shown |

## App

- `src/pages/adminOperations/salaryAdmin/mis/`:
  - `misMetrics.js`: the shared cost definitions and Report 1–7 builders.
  - `misExport.js`: Excel (values), PDF and CSV, each with the report header.
  - `misReportSpecs.js`: the download layouts.
  - `misDb.js`: data access.
  - The screens.
- Common rules:
  - Filters: period (month, range, quarter, FY Apr–Mar, YTD), vertical, department, location, cost centre, grade, employment type.
  - "Previous" is the immediately previous locked month(s).
  - Change % has 1 decimal, or "New" when previous is 0. Amounts display as whole rupees with Indian grouping.
  - Every total opens a drill-down.
  - Every view and download is written to the audit log.
  - The hide-salary-figures setting masks amounts on screen and in downloads.
- Report rules:
  - **Report 1:** colours apply to money rows only (red above +5%, green on a fall). Totals are checked against the salary register lines, and a mismatch blocks downloads. The 12-month chart shows Total CTC and headcount.
  - **Report 2:** if previous CTC plus the drivers does not equal current CTC, downloads are blocked.
  - **Report 4:** untagged staff appear in a red "Unassigned" row.
  - **Reports 4 and 5:** optional split by allocation %, which gives decimal headcount.
- Server: `server/payrollMisAlerts.js` runs the daily due-soon / overdue email after 09:00 IST. Recipients are set in Setup. It sends each payment once per day and is turned off with `PAYROLL_MIS_ALERTS=off`.

## Tests

- `npm run payroll:check:mis` runs 52 checks in in-memory Postgres against the real lock function, including:
  - The lock succeeds when the snapshot fails.
  - Re-locking replaces the snapshot.
  - No duplicate payment rows.
  - The proration figures.
  - Mark paid needs a challan reference.
  - The rollback works.
- `tests/payrollMisReports.test.js` holds 21 tie-out tests. They use employee-level fixtures that reproduce every sample figure in the spec (Sep 2026 vs Aug 2026) and check the cross-report ties: R1 = R3 = R4 = R5, R2 drivers, R3 YTD = R4 YTD, R6 = R7, and the R7 tiles.

## Notes

- **Two sample discrepancies:**
  - R1 average CTC change shows **+124**. It is computed from the stored averages (28,294.35 − 28,170.83); the document prints +123.
  - R3 Employer PF % of CTC shows **5.9%**. 23,60,000 ÷ 4,03,08,200 = 5.855%; the document prints 5.8%, which would make the column add up to 99.9%.
- **Not built:** the new-hire summary block (per instruction). The data it needs (position type, budget) is stored.
- **Pending from the business:** the default work state and the alert email addresses. Both are settings in Setup, not code.
- **Existing tests:** the 9 failing salary tests (`ctcEngine`, `annexurePayroll`, `salaryHistoricalAnnexure`, `salaryReprocessAtomic`) were failing before this change and are unchanged.
