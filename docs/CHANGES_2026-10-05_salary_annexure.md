# Compensation Scheme 2026-27 (Annexure-I salary breakup) — change note

## Database
Migration `supabase/migrations/20261005180000_payroll_rule_master_annexure_ctc.sql` (additive):
- **New `admin_payroll_rule_versions`** — Payroll Rule Master, unique per scheme + Effective From, seeded for Old and New Scheme from 01-04-2026 with the 2026-27 values, footer note and signatory. A version is locked once a CTC record uses it (DB trigger); rates then change only via a new version.
- **`admin_salary_structures`** — new columns: `structure_version`, `skill_category`, `salary_scheme`, `employee_status`, `employee_category`, `salary_band`, `input_basis`, `input_amount`, `rule_version_id`, `validation_status`, `is_custom`, `custom_overrides_json`, `system_values_json`, `revision_type`, `conveyance_monthly`, `stat_bonus_monthly`, `medical_allowance_monthly`, `ex_gratia_monthly`, `pf_wage_monthly`. Rows saved earlier keep `structure_version = NULL` and calculate exactly as before.
- **`admin_salary_structure_revisions`** — `effective_to`.
- **New `admin_salary_ctc_audit`** — old/new values, user and time for every CTC and rule change (triggers).
- Access unchanged: same `admin_salary_user_has_access()` rule as the rest of Salary Admin.

## Code
| File | Change |
|---|---|
| `src/pages/adminOperations/salaryAdmin/ctcEngine.js` | **New.** Single calculation service (Gross → breakup, CTC → Gross exact solve, validation, Probation → Confirmed, custom override, categories, date overlap). |
| `src/pages/adminOperations/salaryAdmin/payrollRulesDb.js` | **New.** Rule versions: load, resolve by scheme + date, create, update. |
| `src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js` | **New.** Engine result ↔ CTC record, history with Effective To, payroll-line inputs. |
| `src/pages/adminOperations/salaryAdmin/annexurePrint.js` | **New.** Annexure-I print (employee copy, internal copy with Custom marker, Previous vs New). |
| `src/pages/adminOperations/salaryAdmin/PayrollRuleMaster.jsx` | **New.** Salary Admin → Payroll Rules (versions, derived limits, Annexure text). |
| `src/pages/adminOperations/salaryAdmin/CtcMigrationPanel.jsx` | **New.** Payroll Rules → Existing employees: reconciliation report and apply-selected. |
| `src/pages/adminOperations/salaryAdmin/AnnexureCtcPanel.jsx` | **New.** Employee Master → CTC details (inputs, live Annexure-I, Probation → Confirmed, Scenario Matrix, custom override, history, compare, print). |
| `src/pages/admin/IfspEmployeeMasterDetail.jsx` | CTC tab renders the new panel. |
| `src/pages/adminOperations/salaryAdmin/salaryDb.js` | Saves the new columns; refuses to drop them silently; sets Effective To on archive. |
| `src/pages/adminOperations/salaryAdmin/salaryData.js` | Month resolution keeps an older archived version on its own structure. |
| `src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js` | New-structure lines: Conveyance, Advance Bonus, Medical, Employee PF/ESIC and PT from the CTC record, prorated by the existing paid-days rule; PF wage seeded for the EPF challan. Older lines unchanged. |
| `src/pages/adminOperations/salaryAdmin/SalaryProcessing.jsx` | Register grid and employee statement show the three new earnings. |
| `src/lib/salaryProcessingExcel.js` | Register export: Conveyance, Adv. Statutory Bonus, Medical, Scheme, Status, Band, Custom, CTC W.E.F. appended (existing columns untouched). |
| `src/lib/salaryPayslips.js`, `src/pages/admin/employeeMaster/PayslipTemplate.jsx` | Payslip earnings rows per Annexure-I (non-zero only). |
| `src/pages/adminOperations/employee/OfficialLettersPage.jsx` | “Print Annexure-I” on appointment / confirmation / promotion letter preview. |
| `src/pages/adminOperations/salaryAdmin/SalaryAdminLayout.jsx`, `src/App.jsx`, `src/routes/lazyPages.jsx` | Payroll Rules tab and route. |
| `tests/ctcEngine.test.js`, `tests/annexurePayroll.test.js` | **New.** All Section 10 cases, both schemes, plus payroll-line and mapping tests. |

## Decisions taken / still open
- **Permissions:** unchanged per instruction — everyone with Salary Admin access can create, revise, override and edit rules.
- **Approval:** the ERP has no approval workflow, so saved records apply immediately.
- **Rounding (decided):** every component is rounded to the whole rupee (half up) where it is calculated; Gross, Take Home, Total B and CTC are sums of the rounded components. Allowances that fill the balance (Conveyance, Special, Medical) use the rounded Basic/HRA/Bonus, so Part A always equals Gross. Entering a CTC picks the whole-rupee Gross whose CTC is nearest; a gap of up to ₹1 is accepted (CHECK above ₹1). Minimum Gross is ₹20,151 (Skilled). All salary-admin screens, prints and exports show whole rupees.
- **Custom component values:** every component (Part A, Employee PF, P.Tax, Employee ESIC and all Part B lines) can be entered manually with a mandatory reason. Blank components keep their normal calculation (deductions and Part B follow the entered Basic). Totals cannot be entered and stay sums.
- **Minimum wage revision from 01-10-2026:** Basic benchmark Skilled 13,897 / Semi-skilled 13,637 (`20261007100000_payroll_rules_min_wage_2026_10.sql`, new rule version per scheme; all other rules unchanged). Bands and Gross limits unchanged; at the same Gross, Basic/HRA/Advance Bonus rise and Medical/Conveyance absorb it. Minimum Gross becomes 20,614 (Skilled) / 20,228 (Semi-skilled). Payroll Rules → Existing employees → "Apply updated payroll rules (Gross retained)" re-works saved new-structure CTCs after review; custom records are listed but revised on the employee's CTC tab.
- **Salary Admin access:** shilpa@indusfire.com and sharmavivekz683@gmail.com added to the app allowlist and to the database access check (`20261005190000_admin_salary_allowlist_shilpa_vivek.sql`).
- **Arrears:** no arrears process exists; back-dated revisions are flagged and need manual adjustment in Salary Processing. *Open.*
- **ESIC base:** Basic, as specified. *Open: confirm with HR.*
- **Migration defaults:** Old Scheme, Skilled, current W.E.F. (cut-over date optional) — editable per row before applying. *Open: confirm with HR.*
- **Mid-month revisions:** existing rule kept — the record in force for the pay month applies to the whole month.
- **Not changed (nothing to feed today):** Full & Final (reads no salary values), employee self-service (none), PT report (none), offer letter from Calling Master (candidate has no CTC record yet), site-employee CTC (`people_salary_*`) and the separate HR Salary Management module.
- **Probation → Confirmed** sets the employee's confirmation date only when it is blank; employment type is not changed (that would also change leave entitlements).
