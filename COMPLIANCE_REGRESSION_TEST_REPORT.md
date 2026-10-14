# Compliance Module — Regression Test Report

**Date:** 13 Oct 2026
**Scope:** Payroll Compliance (PF / EPF challan, ESIC return), Excel upload, Excel downloads, month save / reload, Compliance Forms (Code on Wages, Social Security, OSH-WC), access rules.
**Result:** 128 of 128 checks passed. Six problems found; three of them change the figures in the ESIC file.

## Ground rules followed

| Rule | How it was kept |
|---|---|
| No values entered in the database | Every database call went to an in-memory fake that lives only while the test runs. Database rules were checked in a throw-away in-memory Postgres (PGlite) that was deleted after the run. |
| Temp data only | Sample employees, sample salary lines and Excel files were built in memory. Nothing was uploaded or downloaded to disk. |
| No code changes | Application code was only read and called. `git status` shows only this report as new. |
| No migration changes | Migration files were only read. They were never edited or applied to Supabase. |

The temporary test files were in `tmp-compliance-regression/` and were deleted after the run. They can be recreated if a re-run is needed.

## Summary by area

| Area | Checks | Passed | Problems found |
|---|---|---|---|
| EPF calculation, rounding, age 58 rule, typed EPS amount, EPF and ESIC validation, ESIC dates and IP names | 72 | 72 | 1 (low) |
| Sample employees, processed salary month, attendance days, saved edits, saving a month | 16 | 16 | 1 (medium) |
| Excel upload, EPF challan download, ESIC return download | 16 | 16 | 3 (2 high, 1 medium) |
| Compliance Forms (catalogs, save / list / delete, Excel and PDF) and app access allowlist | 13 | 13 | — |
| Database access rules (in-memory copy) and migration folder check | 8 | 8 | 1 (medium) |
| Existing test `tests/complianceAccess.test.js` | 3 | 3 | — |
| **Total** | **128** | **128** | **6** |

Tests named "FINDING" pass because they confirm the current (wrong) behaviour. That proves the problem is real and repeatable.

---

## 1. EPF figures checked

### 1.1 Reference employees (challan format sheet), October 2026

| Employee | Age | EPF wages | EPS wages | EDLI wages | EPF 12% | EPS 8.33% | Balance | Result |
|---|---|---|---|---|---|---|---|---|
| VISHAL KUMAR MISHRA | 36 | 20,000 | 15,000 | 15,000 | 2,400 | 1,250 | 1,150 | Pass |
| RAVENDRA DWIVEDI | 59 | 15,000 | 0 | 15,000 | 1,800 | 0 | 1,800 | Pass |
| RISHI KUMAR | 31 | 10,000 | 10,000 | 10,000 | 1,200 | 833 | 367 | Pass |
| SATHEESH KUMAR V | 42 | 12,000 | 12,000 | 12,000 | 1,440 | 1,000 (999.6 rounded) | 440 | Pass |

### 1.2 Footer totals on the review screen (sample month)

| Gross | EPF wages | EPS wages | EDLI wages | EPF 12% | EPS 8.33% | Balance | NCP days | Present days | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1,38,000 | 57,000 | 37,000 | 52,000 | 6,840 | 3,083 | 3,757 | 2 | 104 | Pass |

The ESIC review totals for the sample month (104 days, ₹1,38,000) match the downloaded ESIC file.

### 1.3 Wage-cap boundaries (age 30)

| EPF wages | EPS | EDLI | EPF 12% | EPS 8.33% | Balance | Result |
|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 | Pass |
| 1 | 1 | 1 | 0 | 0 | 0 | Pass |
| 14,999 | 14,999 | 14,999 | 1,800 | 1,249 | 551 | Pass |
| 15,000 | 15,000 | 15,000 | 1,800 | 1,250 | 550 | Pass |
| 15,001 | 15,000 | 15,000 | 1,800 | 1,250 | 550 | Pass |
| 25,000 | 15,000 | 15,000 | 3,000 | 1,250 | 1,750 | Pass |
| 1,00,000 | 15,000 | 15,000 | 12,000 | 1,250 | 10,750 | Pass |

Negative or text wages are treated as 0, and amounts typed as text ("12000") are accepted. EPF 12% is worked out on full wages, not on the ₹15,000 cap. All of these passed.

### 1.4 Age 58 rule (EPF wages ₹20,000)

| Age | EPS wages | EDLI wages | Result |
|---|---|---|---|
| 57 | 15,000 | 15,000 | Pass |
| 58 | 0 | 15,000 | Pass |
| 59 | 0 | 15,000 | Pass |
| Blank | 15,000 | 15,000 | Pass |

Age is taken on the **last day of the pay month**. Someone born 31 Oct 1968 counts as 58 for October 2026. Someone born 1 Nov 1968 counts as 57. Leap-day birthdays are handled.

### 1.5 Rounding accuracy

- EPF 12% was compared with exact arithmetic for every whole rupee from ₹0 to ₹1,00,000. There were 0 differences.
- EPS 8.33% was compared with exact arithmetic for **every paisa** from ₹0.00 to ₹15,000.00 (15 lakh values). There were 0 differences.
- The on-screen figures therefore always match Excel's `ROUND` in the downloaded challan.

---

## 2. Validation checked

**EPF validation catches all of these:**
- Missing UAN.
- UAN that is not 12 digits.
- Duplicate UAN, reported with the first row number.
- Missing name.
- Negative gross wages or EPF wages.
- An age 58+ row that still has EPS wages.

Spaces and dashes inside a UAN are cleaned automatically.

**ESIC validation catches all of these:**
- Missing IP number.
- IP number that is not 10 digits.
- Missing IP name, or an IP name with digits or punctuation.
- Days outside 0–31.
- Negative wages.
- Zero days without a numeric reason code.
- A last working day that is not a real date, such as 31/02 or 29/02/2026.
- Duplicate IP number.

Half days (26.5) and 31 days are accepted.

**Date formats:** 2026-10-31, 31/10/2026 and 1-2-2024 are all converted to DD/MM/YYYY. 29/02/2024 is accepted and 29/02/2026 is rejected.

---

## 3. Processed salary month checked (sample salary lines)

| Check | Result |
|---|---|
| EPF wages use earned PF basic first, then PF basic | Pass |
| UAN from the salary line is cleaned to digits | Pass |
| ESIC list includes people with an ESIC number, an ESIC deduction, or gross up to ₹21,000. Gross of ₹45,000 with no ESIC number is left out | Pass |
| Rows are sorted by employee code in number order (9 before 101) | Pass |
| Attendance present days replace sheet days. Codes like 00101 match 101, and the name is used as a fallback | Pass |
| Attendance days are capped at the month's Monday-to-Saturday working days (27 in Oct 2026) | Pass |
| If attendance is unavailable, the salary sheet days are kept | Pass |
| A month with no salary run shows an empty month | Pass |
| Saved UAN, NCP days and refund come back after reload; salary-sheet wages are not overwritten | Pass |
| Sample employees keep every typed value after reload | Pass |
| A saved ESIC person missing from today's list is added back | Pass |
| Only valid 12-digit UAN and 10-digit IP of real employees are written back to Employee Master; sample people are never written | Pass |
| Salary month line details receive the same IDs | Pass |
| Saving the same month twice updates one record and never creates a duplicate | Pass |
| If month storage is unavailable, load and save quietly continue | Pass |

---

## 4. Excel downloads checked

**EPF challan:**
- The title is on row 1, the headers on row 2, the formula guide on row 3, and data starts on row 4.
- For every employee row, the formulas point at the **same row**:
  - EPS: `IF(N(L)>=58,0,MIN(D,15000))`
  - EDLI
  - EPF: `ROUND(D*12/100,0)`
  - EPS contribution: `ROUND(E*8.33/100,0)`
  - Balance: `G−H`
- A typed EPS amount is written as a plain value.
- The total row sums columns C to K over exactly the data rows.
- Working out the sheet formulas gives the same figures as the screen for all sample employees.

**ESIC return:**
- The portal column headings are correct.
- IP numbers are cleaned to digits and IP names to letters and spaces.
- Reason code 0 is written as "0".
- The last working day is in DD/MM/YYYY.
- The file names are `EPF_Challan_2026_10.xlsx` and `ESIC_Return_2026_10.xlsx`.

---

## 5. Compliance Forms checked

- **Form catalogs:** 3 wage forms (Form 1, Form IV, Form V), 1 social security form (Form III nomination) and 7 OSH-WC forms. Every form has a title and unique field keys.
- **New form pack:** blank header and starting rows for each form, with a new ID each time.
- **Saving:**
  - Save, list, update and delete work against the fake storage.
  - The saved label comes from the establishment name.
  - Saving twice updates rather than duplicating.
  - Forms saved only in this browser are uploaded on the next list.
  - If storage is unavailable, forms stay in the browser with no error shown.
- **Excel download:**
  - The index sheet counts filled rows per form.
  - There is one sheet per form.
  - Rows are numbered 1, 2, …
  - Dates are shown as DD/MM/YYYY.
  - Blank cells print as "________".
- **PDF download:** builds without errors for wage, social security and OSH-WC packs, including the nomination, leave register and identity card layouts.

## 6. Access checked

- The six allowed e-mails are identical in the app and in the database access function.
- Upper case and extra spaces in the e-mail are ignored.
- Super Admin, Admin and User Management grants do **not** open Compliance (existing test).
- **Database rules, in the in-memory copy:**
  - An allowed person can save and read month filings and forms.
  - An allowed person known only by sign-in e-mail can read.
  - A payroll salary user outside the allowlist cannot see or write either.
  - Someone not signed in sees nothing.
- **Month filing rules:**
  - One filing per month.
  - Month must be 1–12 and year 2000–2100.
  - Deleting a salary run keeps the filing.
- **Saved forms:** the form type is checked and the edit time is updated on change.

---

## 7. Problems found

### F1 — HIGH: ESIC wages taken from the PF sheet when one workbook has both sheets
**What happens:** If the uploaded workbook has a PF sheet with a "Gross Wages" column and an ESIC sheet with "Total Monthly Wages", each person's ESIC wages are set from the **PF sheet's gross**.

**Test evidence:**

| Employee | ESIC sheet says | ESIC file gets |
|---|---|---|
| AMIT SHARMA | ₹17,500 | ₹18,000 |
| BHARAT RAO (left, reason code 1) | 0 days, ₹0 | 0 days, **₹45,000** |

Uploading the ESIC sheet on its own gives the correct ₹17,500.

**Why:** Each sheet's values are merged correctly at first. When applied to an employee, the first exact-name row in the file (the PF row) is merged again last, so its gross wages win.

**Impact:** Wrong wages in the ESIC return, including wages reported for people who have left.

### F2 — HIGH: A similar name can replace the UAN matched by employee code
**What happens:** Employee 101 "AMIT SHARMA" is in the sheet as code 101, "AMIT KUMAR SHARMA", UAN 101247934235. Another row, code 205 "SHARMA AMIT", has UAN 555566667777. Employee 101 receives **555566667777**, which is employee 205's UAN.

**Why:** A name-similarity match is merged after the employee-code match, and its UAN wins.

**Impact:** A wrong UAN can be filled and then saved to Employee Master.

### F3 — MEDIUM: After an upload, the ESIC screen and the ESIC file show different days
**What happens:** After an ESIC upload sets days paid to 22, the review screen's "Present days" column and its total still show **26** (attendance), but the downloaded file has **22**. The column is read-only, so the user cannot see or correct the value that is actually filed.

### F4 — MEDIUM: Saved ESIC days are lost on reload
**What happens:** Days paid saved for a month (20) are replaced by attendance days (25) the next time the month is opened. Saved IP numbers, wages and reason codes are kept; only the days are overwritten.

### F5 — MEDIUM: Two migration files share version `20261013140000`
- `20261013140000_compliance_module_backend.sql`
- `20261013140000_projects_enquiry_completed_date_field.sql`

Supabase tracks migrations by this number. One of the two may be skipped, or the next database push may fail. Both files are already committed, and no migration was changed during this test.

### F6 — LOW: A typed EPS amount for someone aged 58+ is accepted without warning
**What happens:** For a 60-year-old with EPS typed as ₹15,000, the row passes validation and shows an EPS contribution of ₹1,250. This person is not eligible for pension. The warning only appears when the amount was not typed by hand.

## 8. Observations (not errors, for awareness)

1. EPF wages higher than gross wages are not flagged.
2. NCP days above the month length, for example 45, are not flagged.
3. Form V "Net wages" and the leave register totals are free-text fields. They are not calculated or checked; a net of 99,999 against a gross of 20,000 was accepted.
4. Downloaded EPF challan formulas carry no stored result. Excel and LibreOffice calculate on open, but some phone or mail previews may show blank cells.
5. When attendance later gives days to someone who had 0 days, the ESIC reason code stays "0". The portal accepts 0, so there is no impact.

## 9. Not covered

- Clicking through the screens in a browser. Logic and file output were tested directly; screen layout was not.
- Real employee data. Only temporary sample data was used.
- Upload of `.xls` (old Excel) files and very large workbooks.
