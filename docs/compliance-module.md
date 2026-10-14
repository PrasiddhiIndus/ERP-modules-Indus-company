# Compliance module

Compliance Forms and Payroll Compliance are limited to Vivek, Vaisakh / Vaishak, and Rahul.

Allowed sign-in emails:

- rahul.ifspl@gmail.com
- vivek@indusfire.com
- sharmavivekz683@gmail.com
- vaisakh@indusfire.com
- vaishak@indusfire.com
- vaisakh_fire@yahoo.co.in

The screen check is `canAccessCompliance` in `src/pages/compliance/payroll/complianceAccess.js`. The database check is `compliance_module_user_has_access()`.

## What is stored

| Table | What it holds |
| --- | --- |
| `admin_compliance_form_packs` | Saved statutory forms. `code` is `wages` (Code on Wage), `social` (Code on Social security), `osh` (Code on OSH-WC), or `wage-sheet` (one wage form opened by link). The full form is `payload_json`. |
| `admin_compliance_filings` | One row per salary month for PF / EPF and ESIC review: UAN, wages, contributions, ESIC IP, days, and last working day. |

Apply `supabase/migrations/20261014100000_compliance_module_backend.sql` before the form list is shared across browsers. Until that migration is applied, a save stays in the browser that made it.

## Payroll Compliance

1. Choose the month that was processed in salary.
2. Review opens those employees.
3. Present days on PF / EPF are that month’s attendance total for the same employee. ESIC days paid start from the same attendance. A saved or uploaded days-paid value is kept when the month is opened again.
4. PF / EPF uses the challan formulas (EPS cap 15,000, age 58 or above forces EPS wages to 0, EPF 12%, EPS 8.33%, balance is the difference). EPF wages above gross, or NCP days above 31, are flagged before download.
5. An Excel upload matches by employee code. ESIC monthly wages come from the ESIC sheet. PF gross wages are not copied onto ESIC. A similar name does not replace a UAN already matched by code.
6. ESIC last working day is stored as DD/MM/YYYY.
7. Download writes the EPF challan workbook or the ESIC return workbook. The ESIC days in that file are the days paid shown on the review screen.

## Compliance Forms

Each code is one saved record with every form in that code.

- Code on Wage: Form 1, Form IV, Form V
- Code on Social security: Form I nomination
- Code on OSH-WC: Forms 13, 14, 17, 18, 19, 20, and 27

Excel download is one workbook. The first sheet is an index of the forms. Each form is its own sheet, with the form title, the establishment details, column headings, and the entered rows. Nomination, leave, and identity cards keep their own sheet layout. PDF download is the same record.
