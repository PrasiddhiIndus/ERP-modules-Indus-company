# Payroll MIS — mock test data

Mock data that makes all 7 Payroll MIS reports reproduce the sample figures in
`docs/PROMPT_payroll_mis_7_reports.md` (Sep 2026 vs Aug 2026, YTD Apr–Sep 2026). **Local / staging only.**
Every statutory rule and every mock employee uses the state **Gujarat**.

| File | What it does |
| --- | --- |
| `seed_mis_mock.sql` | One transaction: guard → masters → 252 employees → salary months Oct 2025 – Oct 2026 → locks → payments. Generated — do not edit by hand. |
| `cleanup_mis_mock.sql` | Removes everything the seed (and extras) inserted, in dependency order, and drops the registry. |
| `seed_mis_mock_extras.sql` | Optional: one Unassigned employee added to Sep 2026 (unlock → add → re-lock) and two deposits dated from today (Due soon / Overdue). Changes the Sep totals. |
| `upload_mock_challan.mjs` | Optional: uploads one dummy "MOCK — not a real payment" challan PDF for the Sep 2026 TDS row (`--remove` deletes it). |
| `model.mjs`, `generate_seed.mjs` | Build the figures and write the seed: `node scripts/mis-mock/generate_seed.mjs`. |
| `harness.mjs` + `tests/payrollMisMockData.test.js` | In-memory Postgres check of seed → reports → extras → cleanup. |

## Run on staging

1. The Payroll MIS migrations must be applied. There must be **no real salary months from Oct 2025 to Oct 2026** (one run per month is allowed; the seed refuses otherwise).
2. Optional: create a test login `mis.vertical.head@example.test`. The seed gives it Vertical A report access. Use another address with `SELECT set_config('mis_mock.vertical_head_email', 'you@example.test', false);`.
3. Open `seed_mis_mock.sql`, check the target printed at the top, un-comment the `set_config('mis_mock.confirm', 'not-production', false)` line and run:
   `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f scripts/mis-mock/seed_mis_mock.sql`. Running it again does nothing.
4. Optional: run `seed_mis_mock_extras.sql` (same confirmation). Optional: `MIS_MOCK_CONFIRM=not-production node scripts/mis-mock/upload_mock_challan.mjs`.
5. When done: `node scripts/mis-mock/upload_mock_challan.mjs --remove` (if you uploaded), then `cleanup_mis_mock.sql`. Running cleanup twice is safe.

Verify without a database: `npx vitest run tests/payrollMisMockData.test.js`. It prints a pass / fail table per report.

## Mapping and fixture

- Verticals: **A = Manpower** (`manpower`), **B = AMC** (`amc`), **C = Projects** (`projects`), **Corporate** (`corporate`).
- Vertical A departments: Operations / Field (58), Sales & Business Dev. (14), Service & Maintenance (16), Admin & Accounts (8).
- Other departments: B uses Service and AMC Coordination; C uses Project Execution and Design & Estimation; Corporate uses Corporate Finance and HR & Admin. These names are added to the department master only if missing.
- Codes `MOCK-E0001…` (E0731, E0688 and E0912 are the OT drill-down employees). Names `Mock Employee 001`. Fake UAN `9999xxxxxxxx` and ESIC `9999xxxxxx`. No PAN, bank, phone or real names.
- Gujarat cities (Vadodara, Ahmedabad, Surat, Rajkot, Bharuch, Gandhinagar), grades G1–G4 and cost centres CC-A / CC-B / CC-C / CC-CORP.
- Tags also set: position type (9 new and 3 replacement hires) and exit reasons (4 exits on 1 Sep 2026).
- One employee is shared 50 % A / 50 % B; the split view is off by default.
- Budget master for Apr–Sep: budget = actual headcount + 2, so no hire is without budget. Leave encashment is 0.
- 3 increments in Sep (B ₹7,000, C ₹5,000, Corporate ₹10,000). 9 incentives (one paid as an arrear), 21 LOP employees and 30 "other" changes. New hires: CTC added ₹3,42,000 (average ₹28,500) and ₹1,96,000 paid in Sep.
- Insurance: policy ₹4,20,000 spread Sep 2026 – Mar 2027 (₹60,000 a month, ₹250 × 240 covered). Apr–Aug fall back to the CTC mediclaim (₹58,000 a month).
- Runs: Oct 2025 – Sep 2026 processed and locked. Jul 2026 is locked, unlocked and re-locked. Oct 2026 is a Draft and never appears in reports.
- Payments: everything before Sep is paid on time, except Aug PF (paid 18 Sep, 3 days late, interest ₹1,500 + penalty ₹350). Sep TDS paid 6 Oct (`MOCK-CIN-0510221`); Sep PF / ESI / PT pending (₹9,28,000).
- Alert recipients `cfo@example.test` and `compliance@example.test` (test addresses only).
- There is no separate provision setting in the MIS. Gratuity, ex-gratia and mediclaim provisions come from each mock CTC record.

## How mock rows are marked and removed

The MIS tables have no `is_mock` column, and adding columns would change the schema, so every inserted row is listed in `public.mis_mock_registry` (`source = 'mock_mis'`). The registry is created by the seed and dropped by cleanup; RLS is on and app users cannot read it. Rows that have a `note` column also carry `mock_mis`; runs and lines carry `mock_mis: true` in their JSON. Employees are inserted with an empty employee code, so the leave, hierarchy and login-sync triggers do nothing for them.

Insert-only toward existing data. The only UPDATEs touch rows the seed itself inserted:

- balancing CTC values between monthly locks;
- the lock flags (through the lock function, or the same guarded update when no Salary Admin is signed in, e.g. in the SQL editor);
- overtime, arrears and LWF copied into the mock snapshot rows;
- marking mock deposits paid.

The default-state setting row is left unchanged; it is only added (Gujarat) if missing. Cleanup also removes report view/download log rows written since the seed (`SET mis_mock.keep_audit_log = on` keeps them). Sequences and identity counters are not rewound.

## Values inserted directly (not produced by the payroll engine)

- **Salary lines** are inserted with final amounts. No attendance or processing run is used, and payroll calculation code is untouched.
- **Overtime, arrears and LWF** are copied from the line JSON into the snapshot right after each lock. The snapshot builder stores these as 0 because the salary line has no source columns for them yet; without this, Report 1 OT, the Report 2 OT driver and LWF would all be 0.
- **Paid status** of deposits is set by an UPDATE on mock rows. The mark-paid function needs a signed-in Salary Admin; the challan rule (no paid-on date without a challan reference) is still enforced and is tested.

## Figures that cannot be hit exactly

| Figure | Spec | Mock | Why |
| --- | --- | --- | --- |
| Employer LWF YTD | 6,200 | 2,868 | Gujarat LWF is ₹12 per employee in June; 6,200 needs 517 employees, June has 239. |
| Gross YTD | 3,58,20,000 | 3,58,23,332 | The LWF difference sits in gross, so Total CTC YTD (4,03,08,200) and every vertical YTD stay exact. |
| PF wage base (Sep) | 34,15,000 | 34,15,772 | Each PF wage is the smallest whole-rupee wage giving exactly 12 %, so PF stays exact at 4,10,000. |

Other mock-only shortcuts, invisible in the sample figures:

- **ESI employer share before Sep** is scaled to the sample totals (about 3.1 % instead of 3.25 %). The same applies to PF in Apr–Jul.
- **Balancing employees:** one per department carries larger gratuity / ex-gratia values that change month to month.
- **Apr–Jul "other earnings"** are paid to 6 employees per vertical.
- **One Vertical C employee** joins on 1 Jul 2026.

Report 6 PF breakup gap: payroll employer PF minus the rate-master figure (which adds EDLI 0.5 % and admin 0.5 %) is **−₹30,705.58**. It is reported, not hidden.

## Gujarat rules used (please confirm)

- **PT:** nil up to ₹12,000, ₹200 above, due the 15th of the next month.
  - Unconfirmed: the notification date (rate row dated 1 Apr 2023 as a placeholder), and whether exactly ₹12,000 pays. No mock employee earns exactly ₹12,000.
- **LWF:** employee ₹6 / employer ₹12 per half-year, deducted in June and December, due 15 Jul / 15 Jan.
  - Unconfirmed: the Act text still shows ₹3 / ₹6, and the raising notification could not be traced (rate rows dated 1 Jan 2023 as placeholders).
  - The managerial / supervisory exclusion is not applied: every employee is counted.
- **ESI:** 0.75 % / 3.25 % for gross up to ₹21,000.
- **PF:** 12 % / 12 %; EPS 8.33 % of up to ₹15,000; EDLI 0.5 %; admin 0.5 %.
- **TDS:** 64 employees, ₹3,20,000, due on the 7th.
  - March tax is actually due 30 April, which the calendar cannot express, so Mar 2026 shows 7 Apr.
- **Labour Codes** (in force from 21 Nov 2025) may change the PF / ESI wage definition; this is not modelled.

## On a staging database with real data

Real payment rows for other months also appear in Report 7, so its tiles will include them. The mock months must not overlap real salary months; the seed checks this.
