# Indus ERP — Complete UI Route Inventory

_Generated: 2026-10-31T11:32:55.107056+00:00_

## 1. System overview

- **Stack:** React (Vite) + React Router v6 (v7 future flags), Supabase, Tailwind-like utility tokens.
- **Shell:** Public auth routes → `ProtectedRoute` + `Layout` (`src/contexts/Layout.jsx`) for all `/app/*`.
- **Code-splitting:** `src/routes/lazyPages.jsx` via `lazyWithRetry`.
- **Design system:** Admin Ops `AdminUi.jsx` primitives; shared `src/components/erpUi` (partial adoption). Nav/ACL: `NAV_MODULE_TREE` in `src/config/roles.js`.
- **Declared routes in App.jsx:** 330
- **Lazy export mappings:** 218
- **Page .jsx under src/pages:** 519
- **Routes with erpUi import:** 66

## 2. Sidebar modules

### 2a. NAV_MODULE_TREE (roles.js — ACL + intended nav)

#### HR (`hr`)
- **Dashboard** → `/app/hr/dashboard` (`hr.dashboard`)
- **HR Management** → `/app/hr/employee-master` (`hr.employee-master`)
- **Recruitment** → `/app/hr/calling-master` (`hr.calling-master`)
- **Attendance** → `/app/attendance` (`hr.attendance`)
- **Salary Management** → `/app/hr/payroll/salary` (`hr.salary-management`)
- **People Management** → `/app/people-management` (`hr.people-management`)
- **Site Attendance** → `/app/hr/site-attendance` (`hr.site-attendance`)

#### Compliance (`compliance`)
- **IFSPL Employee Compliance** → `/app/ifsp-employee-compliance` (`compliance.ifspl`)
- **General Compliance** → `/app/general-compliance` (`compliance.general`)
- **Payroll Compliance** → `/app/compliance` (`compliance.payroll`)

#### Admin (`admin`)
- **Dashboard** → `/app/admin/dashboard` (`admin.dashboard`)
- **Recruitment** → `/app/admin/recruitment` (`admin.recruitment`)
- **Employee Master** → `/app/admin/employee/master` (`admin.employee-master`)
- **Employee Administration** → `/app/admin/employee` (`admin.employee`)
- **Salary Admin** → `/app/admin/salary-admin` (`admin.salary-admin`)
- **Rules Console** → `/app/admin/rules-console` (`admin.rules-console`)
- **Store & Issue Control** → `/app/admin/store` (`admin.store`)
- **Gate Pass & Movement** → `/app/admin/gate` (`admin.gate`)
- **Miscellaneous Admin** → `/app/admin/misc` (`admin.misc`)
- **Alerts & Notifications** → `/app/admin/alerts-notifications` (`admin.alerts`)
- **Reports & Analytics** → `/app/admin/reports-analytics` (`admin.reports`)
- **Settings / Masters** → `/app/admin/settings-masters` (`admin.settings`)

#### Commercial — Manpower / Training (`commercialMt`)
- **Dashboard** → `/app/commercial/manpower-training/dashboard` (`commercialMt.dashboard`)
- **Enquiry** → `/app/manpower` (`commercialMt.enquiry`)
- **Internal Quotation** → `/app/manpower/internal-quotation` (`commercialMt.internal-quotation`)
- **Quotation** → `/app/manpower/quotation` (`commercialMt.quotation`)
- **Manpower Configuration** → `/app/manpower/configuration` (`commercialMt.configuration`)
- **Contract Management** → `/app/commercial/manpower-training/po-entry` (`commercialMt.po-entry`)
- **Contact Log** → `/app/commercial/manpower-training/contact-log` (`commercialMt.contact-log`)

#### Commercial — R&M / AMC / IEV (`commercialRm`)
- **Dashboard** → `/app/commercial/rm-mm-amc-iev/dashboard` (`commercialRm.dashboard`)
- **Enquiry** → `/app/commercial/rm-mm-amc-iev/manpower-management` (`commercialRm.enquiry`)
- **Internal Quotation** → `/app/commercial/rm-mm-amc-iev/internal-quotation` (`commercialRm.internal-quotation`)
- **PO Entry** → `/app/commercial/rm-mm-amc-iev/po-entry` (`commercialRm.po-entry`)
- **Contact Log** → `/app/commercial/rm-mm-amc-iev/contact-log` (`commercialRm.contact-log`)

#### Marketing (`marketing`)
- **Marketing Dashboard** → `/app/marketing` (`marketing.dashboard`)
- **Lead Dashboard** → `/app/marketing/lead-dashboard` (`marketing.lead-dashboard`)
- **Lead Master** → `/app/marketing/lead-master` (`marketing.lead-master`)
- **Client Master** → `/app/marketing/client-master` (`marketing.client-master`)
- **Enquiry Master** → `/app/marketing/enquiry-master` (`marketing.enquiry-master`)
- **Quotation Tracker** → `/app/marketing/quotation-tracker` (`marketing.quotation`)
- **Purchase Orders** → `/app/marketing/purchase-orders` (`marketing.purchase-orders`)
- **Follow-up Planner** → `/app/marketing/follow-up-planner` (`marketing.follow-up`)
- **Product Catalogs** → `/app/marketing/product-catalog` (`marketing.product-catalog`)
- **Expo & Seminar** → `/app/marketing/expo-seminar` (`marketing.expo-seminar`)
- **GST Documents** → `/app/marketing/gst-upload` (`marketing.gst`)
- **Marketing Mail Template** → `/app/marketing/mail-templates` (`marketing.mail-template`)
- **Reports & Analytics** → `/app/marketing/reports-analytics` (`marketing.reports`)

#### Maintenance (`maintenance`)
- **Maintenance Dashboard** → `/app/maintenance` (`maintenance.dashboard`)
- **Enquiry Master** → `/app/maintenance/enquiry-master` (`maintenance.enquiry-master`)
- **Quotation Tracker** → `/app/maintenance/quotation-tracker` (`maintenance.quotation`)
- **Follow-up Planner** → `/app/maintenance/follow-up-planner` (`maintenance.follow-up`)
- **Client Master** → `/app/maintenance/client-master` (`maintenance.client-master`)
- **Product Catalog** → `/app/maintenance/product-catalog` (`maintenance.product-catalog`)
- **Purchase Orders** → `/app/maintenance/purchase-orders` (`maintenance.purchase-orders`)
- **M&M PO Entry** → `/app/maintenance/mm-po-entry` (`maintenance.mm-po-entry`)
- **Expo & Seminar** → `/app/maintenance/expo-seminar` (`maintenance.expo-seminar`)
- **GST Documents** → `/app/maintenance/gst-upload` (`maintenance.gst`)
- **Mail Template** → `/app/maintenance/mail-templates` (`maintenance.mail-template`)
- **Reports & Analytics** → `/app/maintenance/reports-analytics` (`maintenance.reports`)

#### Billing (`billing`)
- **Billing Dashboard** → `/app/billing` (`billing.dashboard`)
- **Create Invoice** → `/app/billing/create-invoice` (`billing.create`)
- **Add-On Invoices** → `/app/billing/add-on-invoices` (`billing.add-on`)
- **Manage Invoices** → `/app/billing/manage-invoices` (`billing.manage`)
- **Generated E-Invoice** → `/app/billing/generated-e-invoice` (`billing.e-invoice`)
- **Credit/Debit Notes** → `/app/billing/credit-notes` (`billing.credit-notes`)
- **Reports** → `/app/billing/reports` (`billing.reports`)
- **Tracking** → `/app/billing/tracking` (`billing.tracking`)
- **Notifications** → `/app/billing/notifications` (`billing.notifications`)

#### Operations (`operations`)
- **Fleet Management** → `/app/fire-tender-vehicle-management` (`operations.fleet`)
- **Manpower Operations** → `/app/operations` (`operations.manpower`)

#### Projects (`projects`)
- **Projects Management** → `/app/projects-management` (`projects.management`)
- **Projects Billing** → `/app/projects-billing` (`projects.billing`)
- **Enquiry Master** → `/app/projects/enquiry` (`projects.enquiry`)
- **Quotation Maker** → `/app/projects/quotation` (`projects.quotation-master`)
- **PO / WO Entry** → `/app/projects/po` (`projects.po`)

#### Procurement (`procurement`)
- _(no subModules)_

#### AMC Management (`amc`)
- **Dashboard** → `/app/amc` (`amc.dashboard`)
- **Customers** → `/app/amc/customers` (`amc.customers`)
- **Contracts** → `/app/amc/contracts` (`amc.contracts`)
- **Covered Sites** → `/app/amc/sites` (`amc.sites`)
- **Covered Assets** → `/app/amc/assets` (`amc.assets`)
- **PM Schedule** → `/app/amc/pm-schedule` (`amc.pm-schedule`)
- **Complaint Calls** → `/app/amc/complaints` (`amc.complaints`)
- **Service Visits** → `/app/amc/visits` (`amc.visits`)
- **Technician Allocation** → `/app/amc/technicians` (`amc.technicians`)
- **Service Reports** → `/app/amc/service-reports` (`amc.service-reports`)
- **Alerts & SLA** → `/app/amc/alerts` (`amc.alerts`)
- **Reports** → `/app/amc/reports` (`amc.reports`)
- **Settings** → `/app/amc/settings` (`amc.settings`)

#### Finance/Accounts (`finance`)
- **P&L** → `/app/accounts-finance` (`finance.pl`)

#### IEV (`fireTender`)
- **IEV Dashboard** → `/app/fire-tender` (`fireTender.dashboard`)
- **IEV Costing** → `/app/fire-tender/costing-hub` (`fireTender.costing`)
- **IEV Manufacturing** → `/app/fire-tender-manufacturing` (`fireTender.manufacturing`)

#### IT/IS (`itIs`)
- **Software Subscriptions (View / Update / Delete)** → `/app/software-subscriptions-reminders` (`itIs.subscriptions`)
- **API Health** → `/app/api-health` (`itIs.api-health`)

#### Client/In-House Mail Outreach (`crmOutreach`)
- **Client Mail Outreach** → `/app/crm-outreach` (`crmOutreach.client`)
- **In-House Mail Outreach** → `/app/crm-outreach` (`crmOutreach.inhouse`)

### 2b. Layout.jsx NavLink inventory (live links)

| Sidebar label | Path |
|---|---|
| Dashboard | `/app/dashboard` |
| Dashboard | `/app/hr/dashboard` |
| HR Management | `/app/hr/employee-master` |
| Attendance | `/app/attendance` |
| Site Attendance | `/app/hr/site-attendance` |
| People Management | `/app/people-management` |
| Dashboard | `/app/compliance/dashboard` |
| Compliance Forms | `/app/compliance/forms` |
| Payroll Compliance | `/app/compliance/payroll-process` |
| IFSPL Employee Compliance | `/app/ifsp-employee-compliance` |
| General Compliance | `/app/general-compliance` |
| Payroll reports | `/app/admin/payroll-mis` |
| Dashboard | `/app/admin/dashboard` |
| Employee Master | `/app/admin/employee/master` |
| Onboarding | `/app/admin/employee/onboarding` |
| Policies & Terms | `/app/admin/employee/policies` |
| Official Letters | `/app/admin/employee/official-letters` |
| Raw Attendance Data | `/app/admin/employee/attendance-inputs` |
| Daily Attendance Register | `/app/admin/employee/attendance-daily` |
| National / Public Holidays | `/app/admin/employee/national-holidays` |
| Leave Approvals | `/app/admin/employee/leaves-permissions` |
| Tour Approvals | `/app/admin/employee/tour-approvals` |
| Leave Management | `/app/admin/employee/leave-management` |
| Inactive Employees | `/app/admin/employee/inactive` |
| F & F | `/app/admin/employee/exit-ff` |
| Salary Admin | `/app/admin/salary-admin/dashboard` |
| Rules Console | `/app/admin/rules-console` |
| Item Master | `/app/admin/store/item-master` |
| Store Master | `/app/admin/store/store-master` |
| Site Stock | `/app/admin/store/site-stock` |
| Issue Entry | `/app/admin/store/issue-entry` |
| Return Entry | `/app/admin/store/return-entry` |
| Transfer / Transit | `/app/admin/store/transfer-transit` |
| Requirement Planner | `/app/admin/store/requirement-planner` |
| Reconciliation | `/app/admin/store/reconciliation` |
| Employee Movement | `/app/admin/gate/employee-movement` |
| Goods In / Out | `/app/admin/gate/goods-in-out` |
| Visitor / Guest Passes | `/app/admin/gate/visitor-guest-passes` |
| Vehicle Passes | `/app/admin/gate/vehicle-passes` |
| Delivery / Courier / Post | `/app/admin/gate/delivery-courier-post` |
| Security Console | `/app/admin/gate/security-console` |
| Events Coordination | `/app/admin/misc/events-coordination` |
| Tour / Travel Details | `/app/admin/misc/tour-travel-details` |
| Admin Tasks / Other Requests | `/app/admin/misc/admin-tasks-other-requests` |
| Alerts & Notifications | `/app/admin/alerts-notifications` |
| Reports & Analytics | `/app/admin/reports-analytics` |
| Settings / Masters | `/app/admin/settings-masters` |
| Dashboard | `/app/commercial/manpower-training/dashboard` |
| Enquiry | `/app/manpower` |
| Internal Quotation | `/app/manpower/internal-quotation` |
| Quotation | `/app/manpower/quotation` |
| Roles | `/app/manpower/configuration/roles` |
| Price Master | `/app/manpower/configuration/price-master` |
| Mail Template | `/app/manpower/configuration/mail-template` |
| Employee Type | `/app/manpower/configuration/employee-type` |
| Departments | `/app/manpower/configuration/departments` |
| Contract Management | `/app/commercial/manpower-training/po-entry` |
| Contact Log | `/app/commercial/manpower-training/contact-log` |
| Dashboard | `/app/commercial/rm-mm-amc-iev/dashboard` |
| Enquiry (R&M / AMC / IEV) | `/app/commercial/rm-mm-amc-iev/manpower-management` |
| Internal Quotation | `/app/commercial/rm-mm-amc-iev/internal-quotation` |
| PO Entry | `/app/commercial/rm-mm-amc-iev/po-entry` |
| Contact Log | `/app/commercial/rm-mm-amc-iev/contact-log` |
| Maintenance Dashboard | `/app/maintenance` |
| Enquiry Master | `/app/maintenance/enquiry-master` |
| Quotation Tracker | `/app/maintenance/quotation-tracker` |
| Follow-up Planner | `/app/maintenance/follow-up-planner` |
| Client Master | `/app/maintenance/client-master` |
| Product Catalog | `/app/maintenance/product-catalog` |
| Purchase Orders | `/app/maintenance/purchase-orders` |
| PO Entry | `/app/maintenance/mm-po-entry` |
| Expo & Seminar | `/app/maintenance/expo-seminar` |
| GST Documents | `/app/maintenance/gst-upload` |
| Maintenance Mail Template | `/app/maintenance/mail-templates` |
| Reports & Analytics | `/app/maintenance/reports-analytics` |
| Billing Dashboard | `/app/billing` |
| Create Invoice | `/app/billing/create-invoice` |
| Add-On Invoices | `/app/billing/add-on-invoices` |
| Manage Invoices | `/app/billing/manage-invoices` |
| Generated E-Invoice | `/app/billing/generated-e-invoice` |
| Credit/Debit Notes | `/app/billing/credit-notes` |
| Reports | `/app/billing/reports` |
| Tracking | `/app/billing/tracking` |
| Notifications | `/app/billing/notifications` |
| Billing Tracker | `/app/billing/tracker` |
| Fleet Management | `/app/fire-tender-vehicle-management` |
| Manpower Operations | `/app/operations` |
| Projects Management | `/app/projects-management` |
| Projects Billing | `/app/projects-billing` |
| Quotation Maker | `/app/projects/quotation` |
| PO / WO Entry | `/app/projects/po` |
| PO Contact Log | `/app/projects/po/contact-log` |
| Procurement | `/app/procurement` |
| Dashboard | `/app/amc` |
| Customers | `/app/amc/customers` |
| Contracts | `/app/amc/contracts` |
| Covered Sites | `/app/amc/sites` |
| Covered Assets | `/app/amc/assets` |
| PM Schedule | `/app/amc/pm-schedule` |
| Complaint Calls | `/app/amc/complaints` |
| Service Visits | `/app/amc/visits` |
| Technician Allocation | `/app/amc/technicians` |
| Service Reports | `/app/amc/service-reports` |
| Alerts & SLA | `/app/amc/alerts` |
| Reports | `/app/amc/reports` |
| Settings | `/app/amc/settings` |
| P&L | `/app/accounts-finance/reports/site-ledger` |
| Bank formats | `/app/accounts-finance/bank-formats` |
| Indus LMS / trainings | `/app/indus-lms-trainings` |
| IEV Dashboard | `/app/fire-tender` |
| IEV Manufacturing | `/app/fire-tender-manufacturing` |
| All Employees | `/app/all-employees` |
| Client/In-House Mail Outreach | `/app/crm-outreach` |
| User Management | `/app/user-management` |
| Software subscriptions/reminders | `/app/software-subscriptions-reminders` |
| API Health | `/app/api-health` |
| Settings | `/app/settings` |

_Total live NavLinks: 117_

**Note:** Admin Store / Gate / Misc / Settings / Attendance Sheets NavLinks may still render for permitted users, but several matching App routes are redirects to `/app/admin/dashboard` (NAV_HIDDEN).

**Also in Layout (dynamic `to={...}`):** HR Recruitment landing, Admin Recruitment landing, HR Salary Management child links (`/app/hr/payroll/salary/...`), Marketing module links, Projects Enquiry child pages, IEV Costing hub tabs — driven by helpers / maps rather than static `to="..."`.

## 3. FULL flat route table

| Path | Page component | Source file | Lines | erpUi | Notes | UI kind |
|---|---|---|---:|:---:|---|---|
| `/` | Login | `src/pages/Login.jsx` | 692 | N |  | auth |
| `/register` | Register | `src/pages/Register.jsx` | 196 | N |  | auth |
| `/forgot-password` | ForgotPassword | `src/pages/ForgotPassword.jsx` | 119 | N |  | auth |
| `/reset-password` | ResetPassword | `src/pages/ResetPassword.jsx` | 258 | N |  | auth |
| `/candidate-portal/:token` | CandidatePortal | `src/pages/adminOperations/recruitment/CandidatePortalPage.jsx` | 269 | N |  | portal |
| `/r/:token` | CandidatePortal | `src/pages/adminOperations/recruitment/CandidatePortalPage.jsx` | 269 | N |  | portal |
| `/app` | Layout | `src/contexts/Layout.jsx` | 1684 | N |  | screen |
| `/app` | Navigate | `—` | — | N | redirect → /app/dashboard; index | redirect |
| `/app/dashboard` | Dashboard | `src/pages/Dashboard.jsx` | 1196 | N |  | dashboard |
| `/app/fire-tender` | FireTenderDashboard | `src/pages/projects/FireTenderDashboard.jsx` | 385 | N |  | dashboard |
| `/app/fire-tender/costing-hub` | Navigate | `—` | — | N | redirect → /app/fire-tender/costing-hub/tender | redirect |
| `/app/fire-tender/costing-hub/:tab` | FireTenderCostingHub | `src/pages/projects/FireTenderCostingHub.jsx` | 60 | N |  | screen |
| `/app/fire-tender/new` | Navigate | `—` | — | N | redirect → /app/fire-tender/costing-hub/tender | redirect |
| `/app/fire-tender/list` | Navigate | `—` | — | N | redirect → /app/fire-tender/costing-hub/tender | redirect |
| `/app/fire-tender/costing` | Navigate | `—` | — | N | redirect → /app/fire-tender/costing-hub/costing | redirect |
| `/app/fire-tender/costing/:id` | CostingSheet | `src/pages/projects/CostingSheet.jsx` | 209 | N |  | screen |
| `/app/fire-tender/quotation` | Navigate | `—` | — | N | redirect → /app/fire-tender/costing-hub/quotation | redirect |
| `/app/fire-tender/:id` | FireTender | `src/pages/projects/FireTender.jsx` | 1179 | N |  | screen |
| `/app/fire-tender/quotation/:id` | QuotationDetail | `src/pages/projects/QuotationDetail.jsx` | 1240 | N |  | form |
| `/app/fire-tender/configuration/main-component` | MainComponentPage | `src/pages/projects/configurationTender/MainComponentPage.jsx` | 425 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/manual-sub-category` | ManualSubCategoryPage | `src/pages/projects/configurationTender/ManualSubCategoryPage.jsx` | 116 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/fire-tender-mail-template` | FireTenderMailTemplatePage | `src/pages/projects/configurationTender/FireTenderMailTemplatePage.jsx` | 418 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/price-master` | PriceMasterPage | `src/pages/projects/configurationTender/PriceMasterPage.jsx` | 626 | N | guard: IevConfigGuard | list |
| `/app/fire-tender/configuration/accessories` | AccessoriesPage | `src/pages/projects/configurationTender/AccessoriesPage.jsx` | 344 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/final-components` | FinalComponentsPage | `src/pages/projects/configurationTender/FinalComponentsPage.jsx` | 205 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/vehicle-type` | VehicleTypePage | `src/pages/projects/configurationTender/VehicleTypePage.jsx` | 86 | N | guard: IevConfigGuard | settings |
| `/app/fire-tender/configuration/oc-sign-off` | OcSignoffAssignmentPage | `src/pages/projects/configurationTender/OcSignoffAssignmentPage.jsx` | 174 | N | guard: IevConfigGuard | settings |
| `/app/manpower` | ManpowerManagement | `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |  | screen |
| `/app/manpower/list` | Navigate | `—` | — | N | redirect → /app/manpower | redirect |
| `/app/manpower/internal-quotation` | InternalQuotationList | `src/pages/manpowerProject/enquiryProjects/InternalQuotationList.jsx` | 165 | N |  | list |
| `/app/manpower/internal-quotation/:id` | InternalQuotationForm | `src/pages/manpowerProject/enquiryProjects/InternalQuotationForm.jsx` | 1766 | N |  | form |
| `/app/manpower/quotation` | ManpowerQuotationList | `src/pages/manpowerProject/quotation/ManpowerQuotationList.jsx` | 63 | N |  | list |
| `/app/manpower/configuration` | Navigate | `—` | — | N | redirect → /app/manpower/configuration/roles | redirect |
| `/app/manpower/configuration/:section` | ManpowerConfiguration | `src/pages/manpowerProject/configuration/ManpowerConfiguration.jsx` | 219 | N |  | settings |
| `/app/manpower/:id` | ManpowerManagement | `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |  | screen |
| `/app/commercial/manpower-training/manpower-management/dashboard` | ManpowerManagement | `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |  | dashboard |
| `/app/commercial/manpower-training/manpower-management` | ManpowerManagement | `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |  | screen |
| `/app/commercial/manpower-training/manpower-management/:id` | ManpowerManagement | `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |  | screen |
| `/app/commercial/manpower-training/internal-quotation` | InternalQuotationList | `src/pages/manpowerProject/enquiryProjects/InternalQuotationList.jsx` | 165 | N |  | list |
| `/app/commercial/manpower-training/internal-quotation/:id` | InternalQuotationForm | `src/pages/manpowerProject/enquiryProjects/InternalQuotationForm.jsx` | 1766 | N |  | form |
| `/app/hr/dashboard` | HrDashboard | `src/pages/hr/HrDashboard.jsx` | 142 | Y |  | dashboard |
| `/app/hr/calling-master` | HrCallingMaster | `src/pages/hr/callingMaster/CallingMasterLayout.jsx` | 187 | N |  | list |
| `/app/hr/calling-master` | HrCallingMasterEntry | `src/pages/hr/callingMaster/CallingMasterEntry.jsx` | 45 | N | index | list |
| `/app/hr/calling-master/candidates` | HrCallingMasterCandidates | `src/pages/hr/callingMaster/CallingMasterPage.jsx` | 1526 | Y |  | list |
| `/app/hr/calling-master/referral` | HrCallingMasterReferral | `src/pages/hr/callingMaster/CallingMasterReferralPage.jsx` | 423 | Y |  | list |
| `/app/hr/calling-master/offer-generation` | HrCallingMasterOffers | `src/pages/hr/callingMaster/CallingMasterOfferPage.jsx` | 685 | Y |  | list |
| `/app/hr/calling-master/offer-response` | HrCallingMasterOfferResponse | `src/pages/hr/callingMaster/CallingMasterOfferResponsePage.jsx` | 375 | Y |  | list |
| `/app/hr/calling-master/joining` | HrCallingMasterJoining | `src/pages/hr/callingMaster/CallingMasterJoiningPage.jsx` | 553 | Y |  | list |
| `/app/hr/calling-master/iom` | HrCallingMasterIom | `src/pages/hr/callingMaster/CallingMasterIomPage.jsx` | 782 | Y |  | list |
| `/app/hr/calling-master/conversion` | HrCallingMasterConversion | `src/pages/hr/callingMaster/CallingMasterConversionPage.jsx` | 270 | Y |  | list |
| `/app/hr/calling-master/dropdown-master` | HrCallingMasterDropdowns | `src/pages/hr/callingMaster/CallingMasterDropdownPage.jsx` | 380 | Y |  | list |
| `/app/hr/calling-master/database` | Navigate | `—` | — | N | redirect → /app/hr/calling-master | redirect |
| `/app/hr` | HR | `src/pages/hr/HR.jsx` | 22 | N |  | screen |
| `/app/hr` | Navigate | `—` | — | N | redirect → employee-master; index | redirect |
| `/app/hr/employee-master` | HrEmployeeMaster | `src/pages/hr/HrEmployeeMaster.jsx` | 74 | Y |  | list |
| `/app/hr/salary-inputs` | Navigate | `—` | — | N | redirect → /app/hr/employee-master | redirect |
| `/app/attendance` | Attendance | `src/pages/attendance/Attendance.jsx` | 734 | Y |  | screen |
| `/app/salary` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/payroll` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll/dashboard` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll/entry` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll/year` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll/formula` | Navigate | `—` | — | N | redirect → /app/hr/payroll/salary/dashboard | redirect |
| `/app/hr/payroll/salary` | SalaryManagementLayout | `src/pages/hr/payroll/salary/SalaryLayout.jsx` | 16 | N |  | screen |
| `/app/hr/payroll/salary` | Navigate | `—` | — | N | redirect → dashboard; index | redirect |
| `/app/hr/payroll/salary/dashboard` | SalaryManagementDashboard | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | dashboard |
| `/app/hr/payroll/salary/components` | SalaryComponentsPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | screen |
| `/app/hr/payroll/salary/sites` | SalarySiteSetupPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | screen |
| `/app/hr/payroll/salary/employees` | SalaryEmployeesPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | list |
| `/app/hr/payroll/salary/employees/:id` | SalaryEmployeeDetailPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | list |
| `/app/hr/payroll/salary/process` | SalaryProcessPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | form |
| `/app/hr/payroll/salary/slips` | SalarySlipsPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | screen |
| `/app/hr/payroll/salary/revisions` | SalaryRevisionsPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | screen |
| `/app/hr/payroll/salary/reports` | SalaryReportsPage | `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |  | list |
| `/app/hr/payroll/salary/site-master` | Navigate | `—` | — | N | redirect → ../sites | redirect |
| `/app/hr/payroll/salary/formula-library` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/payroll-package-builder` | Navigate | `—` | — | N | redirect → ../sites | redirect |
| `/app/hr/payroll/salary/people-master` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/people-master/new` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/people-master/:id` | RedirectEmployeeMasterId | `src/App.jsx` | 812 | N |  | list |
| `/app/hr/payroll/salary/attendance-integration` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/compliance-management` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/compliance/pf` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/compliance/esic` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/compliance/pt` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/compliance/tds` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/compliance/loans` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/payroll-processing` | Navigate | `—` | — | N | redirect → ../process | redirect |
| `/app/hr/payroll/salary/payroll-approval` | Navigate | `—` | — | N | redirect → ../process | redirect |
| `/app/hr/payroll/salary/payslips` | Navigate | `—` | — | N | redirect → ../slips | redirect |
| `/app/hr/payroll/salary/reports-exports` | Navigate | `—` | — | N | redirect → ../reports | redirect |
| `/app/hr/payroll/salary/employee-exit` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/full-final-settlement` | Navigate | `—` | — | N | redirect → ../revisions | redirect |
| `/app/hr/payroll/salary/settings` | Navigate | `—` | — | N | redirect → ../dashboard | redirect |
| `/app/hr/payroll/salary/employee-master` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/employee-master/new` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/employee-master/:id` | RedirectEmployeeMasterId | `src/App.jsx` | 812 | N |  | list |
| `/app/hr/payroll/salary/run` | Navigate | `—` | — | N | redirect → ../process | redirect |
| `/app/hr/payroll/salary/site-formulas` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/manual-inputs` | Navigate | `—` | — | N | redirect → ../employees | redirect |
| `/app/hr/payroll/salary/pf` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/esic` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/pt` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/tds` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/loans` | Navigate | `—` | — | N | redirect → ../components | redirect |
| `/app/hr/payroll/salary/register` | Navigate | `—` | — | N | redirect → ../reports | redirect |
| `/app/hr/payroll/salary/outputs` | Navigate | `—` | — | N | redirect → ../slips | redirect |
| `/app/hr/site-attendance` | HrSiteAttendance | `src/pages/hr/siteAttendance/SiteAttendanceLayout.jsx` | 188 | Y |  | screen |
| `/app/hr/site-attendance` | Navigate | `—` | — | N | redirect → dashboard; index | redirect |
| `/app/hr/site-attendance/dashboard` | HrSiteAttendanceDashboard | `src/pages/hr/siteAttendance/DashboardPage.jsx` | 166 | Y |  | dashboard |
| `/app/hr/site-attendance/sites` | HrSiteAttendanceSites | `src/pages/hr/siteAttendance/SiteMasterPage.jsx` | 718 | Y |  | list |
| `/app/hr/site-attendance/people` | HrSiteAttendancePeople | `src/pages/hr/siteAttendance/PeopleMasterPage.jsx` | 792 | Y |  | list |
| `/app/hr/site-attendance/attendance` | HrSiteAttendanceEntry | `src/pages/hr/siteAttendance/AttendanceEntryPage.jsx` | 467 | Y |  | form |
| `/app/hr/site-attendance/admin-view` | HrSiteAttendanceAdminView | `src/pages/hr/siteAttendance/AdminAttendanceViewPage.jsx` | 6 | N |  | screen |
| `/app/hr/site-attendance/summary` | HrSiteAttendanceSummary | `src/pages/hr/siteAttendance/SummaryPage.jsx` | 237 | Y |  | screen |
| `/app/hr/site-attendance/hr-managers` | Navigate | `—` | — | N | redirect → sites | redirect |
| `/app/people-management` | PeopleManagement | `src/pages/peopleManagement/PeopleManagement.jsx` | 338 | Y |  | screen |
| `/app/people-management/:personId` | PeoplePersonProfile | `src/pages/peopleManagement/PersonProfile.jsx` | 692 | Y |  | form |
| `/app/ifsp-employee-compliance` | IfspEmployeeCompliance | `src/pages/compliance/IfspEmployeeCompliance.jsx` | 22 | N | guard: ComplianceGuard | screen |
| `/app/general-compliance` | GeneralCompliance | `src/pages/compliance/GeneralCompliance.jsx` | 22 | N | guard: ComplianceGuard | screen |
| `/app/compliance` | CompliancePayrollLayoutPage | `src/pages/compliance/payroll/CompliancePayrollLayout.jsx` | 14 | N | guard: ComplianceGuard | screen |
| `/app/compliance` | Navigate | `—` | — | N | redirect → dashboard; index | redirect |
| `/app/compliance/dashboard` | ComplianceDashboardPage | `src/pages/compliance/payroll/ComplianceDashboard.jsx` | 368 | Y |  | dashboard |
| `/app/compliance/forms` | ComplianceFormsPage | `src/pages/compliance/payroll/ComplianceForms.jsx` | 95 | Y |  | form |
| `/app/compliance/forms/:formKey` | WageStatutoryFormPage | `src/pages/compliance/payroll/WageStatutoryForm.jsx` | 273 | Y |  | form |
| `/app/compliance/payroll-process` | CompliancePayrollProcessPage | `src/pages/compliance/payroll/CompliancePayrollProcess.jsx` | 1143 | Y |  | form |
| `/app/admin/compliance/*` | Navigate | `—` | — | N | redirect → /app/compliance/dashboard; splat | redirect |
| `/app/ifsp-employee-master` | IfspEmployeeMaster | `src/pages/admin/IfspEmployeeMaster.jsx` | 2100 | Y |  | list |
| `/app/ifsp-employee-attendance` | IfspEmployeeAttendance | `src/pages/admin/IfspEmployeeAttendance.jsx` | 22 | N |  | screen |
| `/app/ifsp-employee-payroll` | IfspEmployeePayroll | `src/pages/admin/IfspEmployeePayroll.jsx` | 7 | N |  | screen |
| `/app/ifsp-employee-leaves` | IfspEmployeeLeaves | `src/pages/admin/IfspEmployeeLeaves.jsx` | 22 | N |  | screen |
| `/app/store-inventory` | StoreInventory | `src/pages/store/StoreInventory.jsx` | 122 | Y |  | screen |
| `/app/gate-pass` | GatePass | `src/pages/admin/GatePass.jsx` | 22 | N |  | screen |
| `/app/admin` | Navigate | `—` | — | N | redirect → /app/admin/dashboard | redirect |
| `/app/admin/dashboard` | AdminOpsDashboard | `src/pages/adminOperations/AdminOpsDashboard.jsx` | 1273 | Y |  | dashboard |
| `/app/admin/recruitment` | AdminRecruitmentLayout | `src/pages/adminOperations/recruitment/RecruitmentLayout.jsx` | 113 | N |  | screen |
| `/app/admin/recruitment` | AdminRecruitmentDashboard | `src/pages/adminOperations/recruitment/RecruitmentDashboard.jsx` | 161 | N | index | dashboard |
| `/app/admin/recruitment/requisitions` | AdminRecruitmentRequisitions | `src/pages/adminOperations/recruitment/RequisitionsPage.jsx` | 512 | Y |  | screen |
| `/app/admin/recruitment/candidates` | AdminRecruitmentCandidates | `src/pages/adminOperations/recruitment/CandidatesPage.jsx` | 436 | N |  | list |
| `/app/admin/recruitment/candidates/:candidateId` | AdminRecruitmentCandidate360 | `src/pages/adminOperations/recruitment/Candidate360Page.jsx` | 833 | N |  | list |
| `/app/admin/recruitment/interviews` | AdminRecruitmentInterviews | `src/pages/adminOperations/recruitment/InterviewsPage.jsx` | 268 | N |  | screen |
| `/app/admin/recruitment/offers` | AdminRecruitmentOffers | `src/pages/adminOperations/recruitment/OffersPage.jsx` | 424 | Y |  | screen |
| `/app/admin/recruitment/documents` | AdminRecruitmentDocuments | `src/pages/adminOperations/recruitment/DocumentsPage.jsx` | 179 | N |  | screen |
| `/app/admin/recruitment/joining` | AdminRecruitmentJoining | `src/pages/adminOperations/recruitment/JoiningPage.jsx` | 152 | N |  | screen |
| `/app/admin/recruitment/conversion` | AdminRecruitmentConversion | `src/pages/adminOperations/recruitment/ConversionPage.jsx` | 112 | N |  | screen |
| `/app/admin/recruitment/communication` | AdminRecruitmentCommunication | `src/pages/adminOperations/recruitment/CommunicationPage.jsx` | 269 | Y |  | screen |
| `/app/admin/recruitment/reports` | AdminRecruitmentReports | `src/pages/adminOperations/recruitment/ReportsPage.jsx` | 189 | N |  | list |
| `/app/admin/recruitment/settings` | AdminRecruitmentSettings | `src/pages/adminOperations/recruitment/SettingsPage.jsx` | 304 | N |  | settings |
| `/app/admin/recruitment/referral` | Navigate | `—` | — | N | redirect → /app/admin/recruitment/candidates | redirect |
| `/app/admin/recruitment/offer-generation` | Navigate | `—` | — | N | redirect → /app/admin/recruitment/offers | redirect |
| `/app/admin/recruitment/offer-response` | Navigate | `—` | — | N | redirect → /app/admin/recruitment/offers | redirect |
| `/app/admin/recruitment/iom` | Navigate | `—` | — | N | redirect → /app/admin/recruitment/joining | redirect |
| `/app/admin/recruitment/dropdown-master` | Navigate | `—` | — | N | redirect → /app/admin/recruitment/settings | redirect |
| `/app/admin/recruitment/classic/*` | Navigate | `—` | — | N | redirect → /app/admin/recruitment; splat | redirect |
| `/app/admin/payroll/*` | Navigate | `—` | — | N | redirect → /app/admin/dashboard; splat | redirect |
| `/app/admin/employee/master` | IfspEmployeeMaster | `src/pages/admin/IfspEmployeeMaster.jsx` | 2100 | Y |  | list |
| `/app/admin/employee/master/:employeeId` | IfspEmployeeMasterDetail | `src/pages/admin/IfspEmployeeMasterDetail.jsx` | 586 | Y |  | list |
| `/app/admin/employee/all` | Navigate | `—` | — | N | redirect → /app/all-employees | redirect |
| `/app/admin/employee/onboarding` | EmployeeOnboardingPage | `src/pages/adminOperations/employee/EmployeeOnboardingPage.jsx` | 1168 | Y |  | screen |
| `/app/admin/employee/attendance-inputs` | EmployeeAttendanceInputsPage | `src/pages/adminOperations/employee/EmployeeAdminPages.jsx` | 1022 | Y |  | screen |
| `/app/admin/employee/attendance-daily` | EmployeeAttendanceDailyPage | `src/pages/adminOperations/employee/EmployeeAttendanceDailyPage.jsx` | 2375 | Y |  | screen |
| `/app/admin/employee/national-holidays` | NationalPublicHolidaysPage | `src/pages/adminOperations/employee/NationalPublicHolidaysPage.jsx` | 589 | Y |  | screen |
| `/app/admin/employee/leave-management` | EmployeeLeaveManagementPage | `src/pages/adminOperations/employee/EmployeeLeaveManagementPage.jsx` | 1277 | Y |  | screen |
| `/app/admin/employee/attendance-sheets` | Navigate | `—` | — | N | redirect → /app/admin/dashboard | redirect |
| `/app/admin/employee/leaves-permissions` | EmployeeLeavesPage | `src/pages/adminOperations/employee/EmployeeLeaveInboxPage.jsx` | 588 | Y |  | screen |
| `/app/admin/employee/tour-approvals` | EmployeeTourApprovalsPage | `src/pages/adminOperations/employee/EmployeeTourInboxPage.jsx` | 546 | Y |  | screen |
| `/app/admin/employee/compliance-documents` | Navigate | `—` | — | N | redirect → /app/admin/dashboard | redirect |
| `/app/admin/employee/salary-inputs` | Navigate | `—` | — | N | redirect → /app/admin/dashboard | redirect |
| `/app/admin/employee/exit-ff` | EmployeeFnfPage | `src/pages/adminOperations/employee/EmployeeFnfPage.jsx` | 505 | Y |  | screen |
| `/app/admin/employee/policies` | EmployeePoliciesPage | `src/pages/adminOperations/employee/EmployeePoliciesPage.jsx` | 1070 | Y |  | screen |
| `/app/admin/employee/official-letters` | OfficialLettersPage | `src/pages/adminOperations/employee/OfficialLettersPage.jsx` | 1821 | Y |  | screen |
| `/app/admin/employee/inactive` | InactiveEmployeesPage | `src/pages/adminOperations/employee/InactiveEmployeesPage.jsx` | 789 | Y |  | list |
| `/app/admin/store/*` | Navigate | `—` | — | N | redirect → /app/admin/dashboard; splat | redirect |
| `/app/admin/gate/*` | Navigate | `—` | — | N | redirect → /app/admin/dashboard; splat | redirect |
| `/app/admin/salary-admin` | SalaryAdminLayoutPage | `src/pages/adminOperations/salaryAdmin/SalaryAdminLayout.jsx` | 120 | N | guard: SalaryAdminGuard | screen |
| `/app/admin/salary-admin` | Navigate | `—` | — | N | redirect → dashboard; index | redirect |
| `/app/admin/salary-admin/dashboard` | SalaryDashboardPage | `src/pages/adminOperations/salaryAdmin/SalaryDashboard.jsx` | 466 | Y |  | dashboard |
| `/app/admin/salary-admin/salary-components` | SalaryComponentsMasterPage | `src/pages/adminOperations/salaryAdmin/SalaryComponentsMaster.jsx` | 831 | Y |  | list |
| `/app/admin/salary-admin/payroll-rules` | PayrollRuleMasterPage | `src/pages/adminOperations/salaryAdmin/PayrollRuleMaster.jsx` | 502 | Y |  | list |
| `/app/admin/salary-admin/ctc-calculator` | CtcCalculatorPage | `src/pages/adminOperations/salaryAdmin/CtcCalculator.jsx` | 555 | Y |  | form |
| `/app/admin/salary-admin/salary-processing` | SalaryProcessingPage | `src/pages/adminOperations/salaryAdmin/SalaryProcessing.jsx` | 3187 | Y |  | form |
| `/app/admin/salary-admin/reports` | SalaryProcessReportPage | `src/pages/adminOperations/salaryAdmin/SalaryProcessReport.jsx` | 435 | Y |  | list |
| `/app/admin/salary-admin/mis` | PayrollMisRoutePage | `src/pages/adminOperations/salaryAdmin/mis/PayrollMisRoute.jsx` | 50 | N |  | screen |
| `/app/admin/payroll-mis` | PayrollMisRoutePage | `src/pages/adminOperations/salaryAdmin/mis/PayrollMisRoute.jsx` | 50 | N |  | screen |
| `/app/admin/salary-admin/salary-master` | Navigate | `—` | — | N | redirect → /app/admin/salary-admin/dashboard | redirect |
| `/app/admin/salary-admin/salary-master/:employeeId` | SalaryMasterCtcRedirect | `src/App.jsx` | 812 | N | guard: SalaryAdminGuard | list |
| `/app/admin/rules-console` | RulesConsolePage | `src/pages/adminOperations/rulesConsole/RulesConsolePage.jsx` | 166 | Y | guard: RulesConsoleGuard | settings |
| `/app/admin/misc/*` | Navigate | `—` | — | N | redirect → /app/admin/dashboard; splat | redirect |
| `/app/admin/alerts-notifications` | AdminOpsAlerts | `src/pages/adminOperations/AdminOpsAlerts.jsx` | 269 | Y |  | screen |
| `/app/admin/reports-analytics` | AdminOpsReports | `src/pages/adminOperations/AdminOpsReports.jsx` | 617 | Y |  | list |
| `/app/admin/settings-masters` | Navigate | `—` | — | N | redirect → /app/admin/dashboard | redirect |
| `/app/admin-operations/*` | Navigate | `—` | — | N | redirect → /app/admin/dashboard; splat | redirect |
| `/app/commercial/manpower-training` | Commercial | `src/pages/sales/Commercial.jsx` | 94 | N |  | screen |
| `/app/commercial/manpower-training/dashboard` | Commercial | `src/pages/sales/Commercial.jsx` | 94 | N |  | dashboard |
| `/app/commercial/manpower-training/po-entry` | Commercial | `src/pages/sales/Commercial.jsx` | 94 | N |  | form |
| `/app/commercial/manpower-training/contact-log` | Commercial | `src/pages/sales/Commercial.jsx` | 94 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev` | CommercialRmMmAmcIev | `src/pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev.jsx` | 117 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev/dashboard` | CommercialRmMmAmcIev | `src/pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev.jsx` | 117 | N |  | dashboard |
| `/app/commercial/rm-mm-amc-iev/po-entry` | CommercialRmMmAmcIev | `src/pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev.jsx` | 117 | N |  | form |
| `/app/commercial/rm-mm-amc-iev/contact-log` | CommercialRmMmAmcIev | `src/pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev.jsx` | 117 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev/manpower-management` | CommercialRmManpowerManagement | `src/pages/commercial-rm-mm-amc-iev/ManpowerManagement.jsx` | 1 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev/manpower-management/:id` | CommercialRmManpowerManagement | `src/pages/commercial-rm-mm-amc-iev/ManpowerManagement.jsx` | 1 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev/internal-quotation` | CommercialRmInternalQuotation | `src/pages/commercial-rm-mm-amc-iev/InternalQuotation.jsx` | 11 | N |  | screen |
| `/app/commercial/rm-mm-amc-iev/internal-quotation/:id` | CommercialRmInternalQuotation | `src/pages/commercial-rm-mm-amc-iev/InternalQuotation.jsx` | 11 | N |  | screen |
| `/app/commercial` | Navigate | `—` | — | N | redirect → /app/commercial/manpower-training/po-entry | redirect |
| `/app/commercial/dashboard` | Navigate | `—` | — | N | redirect → /app/commercial/manpower-training/dashboard | redirect |
| `/app/commercial/po-entry` | Navigate | `—` | — | N | redirect → /app/commercial/manpower-training/po-entry | redirect |
| `/app/commercial/contact-log` | Navigate | `—` | — | N | redirect → /app/commercial/manpower-training/contact-log | redirect |
| `/app/billing/*` | Billing | `src/pages/billing/Billing.jsx` | 179 | N | splat | screen |
| `/app/tracking` | Navigate | `—` | — | N | redirect → /app/billing/tracking | redirect |
| `/app/tracking/pa-worklist` | Navigate | `—` | — | N | redirect → /app/billing/tracking/pa-worklist | redirect |
| `/app/tracking/penalty-logs` | Navigate | `—` | — | N | redirect → /app/billing/tracking/penalty-logs | redirect |
| `/app/reports` | Navigate | `—` | — | N | redirect → /app/billing/reports | redirect |
| `/app/reports/outstanding` | Navigate | `—` | — | N | redirect → /app/billing/reports | redirect |
| `/app/reports/deduction-analysis` | Navigate | `—` | — | N | redirect → /app/billing/reports | redirect |
| `/app/operations` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/expenses` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/expenses/summary` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/expenses/site-dashboard` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | dashboard |
| `/app/operations/advances` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/advances/approval` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/advances/settlement` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/advances/outstanding` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/medical` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/medical/due` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/medical/centers` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/medical/:id` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/accommodation` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/accommodation/rent-entry` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | form |
| `/app/operations/accommodation/dashboard` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | dashboard |
| `/app/operations/accommodation/history` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/accommodation/:id` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/dahej-expenses` | Navigate | `—` | — | N | redirect → /app/operations/dahej-expenses/register | redirect |
| `/app/operations/dahej-expenses/register` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | auth |
| `/app/operations/dahej-expenses/dashboard` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | dashboard |
| `/app/operations/dahej-expenses/monthly-register` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | auth |
| `/app/operations/dahej-expenses/vehicle-master` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | list |
| `/app/operations/dahej-expenses/booking-locations` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | screen |
| `/app/operations/dahej-expenses/reports` | Operations | `src/pages/operations/Operations.jsx` | 135 | N |  | list |
| `/app/fire-tender-vehicle-management` | FireTenderVehicleManagement | `src/pages/fireTenderVehicle/FireTenderVehicleManagement.jsx` | 105 | N |  | screen |
| `/app/projects-management` | ProjectsManagement | `src/pages/projectsManagement/ProjectsManagement.jsx` | 22 | N |  | screen |
| `/app/projects-billing` | ProjectsBilling | `src/pages/projectsBilling/ProjectsBilling.jsx` | 22 | N |  | screen |
| `/app/projects/po` | ProjectsPoHub | `src/pages/projects/ProjectsPoHub.jsx` | 93 | N |  | screen |
| `/app/projects/po/po-entry` | ProjectsPoHub | `src/pages/projects/ProjectsPoHub.jsx` | 93 | N |  | form |
| `/app/projects/po/contact-log` | ProjectsPoHub | `src/pages/projects/ProjectsPoHub.jsx` | 93 | N |  | screen |
| `/app/projects/enquiry` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | screen |
| `/app/projects/enquiry/enquiry-dashboard` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | dashboard |
| `/app/projects/enquiry/enquiry-entry` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | form |
| `/app/projects/enquiry/enquiry-database` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | list |
| `/app/projects/enquiry/enquiry-kpi` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | screen |
| `/app/projects/enquiry/enquiry-dropdown` | ProjectsEnquiryHub | `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |  | screen |
| `/app/projects/quotation` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | screen |
| `/app/projects/quotation/quotation-dashboard` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | dashboard |
| `/app/projects/quotation/quotation-entry` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | form |
| `/app/projects/quotation/quotation-summary` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | screen |
| `/app/projects/quotation/quotation-list` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | list |
| `/app/projects/quotation/quotation-board` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | screen |
| `/app/projects/quotation/quotation-dropdown` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | screen |
| `/app/projects/quotation/quotation-templates` | ProjectsQuotationHub | `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |  | screen |
| `/app/procurement` | Procurement | `src/pages/procurement/Procurement.jsx` | 22 | N |  | screen |
| `/app/fire-tender-manufacturing` | FireTenderManufacturing | `src/pages/fireTenderManufacturing/FireTenderManufacturing.jsx` | 22 | N |  | screen |
| `/app/amc` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/customers` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/contracts` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/sites` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/assets` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/pm-schedule` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/complaints` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/visits` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/technicians` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/service-reports` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | list |
| `/app/amc/alerts` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | screen |
| `/app/amc/reports` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | list |
| `/app/amc/settings` | AMC | `src/pages/amc/AMC.jsx` | 87 | N |  | settings |
| `/app/accounts-finance` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/sites` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/revenue-heads` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/expense-heads` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/budget-versions` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/revenue` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/expenses` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/budget-vs-actual` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/cost-allocation` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/import-export` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | screen |
| `/app/accounts-finance/reports` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | list |
| `/app/accounts-finance/reports/site-ledger` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | list |
| `/app/accounts-finance/bank-formats` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | form |
| `/app/accounts-finance/settings` | AccountsFinance | `src/pages/finance/Finance.jsx` | 104 | N |  | settings |
| `/app/indus-lms-trainings` | IndusLmsTrainings | `src/pages/IndusLmsTrainings.jsx` | 143 | N |  | screen |
| `/app/marketing` | MarketingDashboard | `src/pages/marketing/MarketingDashboard.jsx` | 716 | N |  | dashboard |
| `/app/marketing/lead-dashboard` | LeadDashboard | `src/pages/marketing/LeadDashboard.jsx` | 376 | Y |  | dashboard |
| `/app/marketing/lead-master` | LeadMaster | `src/pages/marketing/LeadMaster.jsx` | 780 | Y |  | list |
| `/app/marketing/enquiry-master` | EnquiryMaster | `src/pages/marketing/EnquiryMaster.jsx` | 1980 | N |  | list |
| `/app/marketing/quotation-tracker` | QuotationTracker | `src/pages/marketing/QuotationTracker.jsx` | 2900 | Y |  | tracker |
| `/app/marketing/quotation-tracker/costing` | CostingSheetList | `src/pages/marketing/CostingSheetList.jsx` | 114 | N |  | tracker |
| `/app/marketing/quotation-tracker/costing/:id` | CostingSheetDetail | `src/pages/marketing/CostingSheetDetail.jsx` | 101 | N |  | tracker |
| `/app/marketing/quotation-tracker/internal-quotation` | MarketingInternalQuotationList | `src/pages/marketing/InternalQuotationList.jsx` | 285 | N |  | tracker |
| `/app/marketing/quotation-tracker/internal-quotation/:id` | MarketingInternalQuotationForm | `src/pages/marketing/InternalQuotationForm.jsx` | 572 | N |  | tracker |
| `/app/marketing/mail-templates` | QuotationTemplatePage | `src/pages/marketing/QuotationTemplatePage.jsx` | 497 | N |  | screen |
| `/app/marketing/follow-up-planner` | FollowUpPlanner | `src/pages/marketing/FollowUpPlanner.jsx` | 1617 | N |  | screen |
| `/app/marketing/client-master` | ClientMaster | `src/pages/marketing/ClientMaster.jsx` | 718 | N |  | list |
| `/app/marketing/product-catalog` | ProductCatalog | `src/pages/marketing/ProductCatalog.jsx` | 1587 | N |  | screen |
| `/app/marketing/purchase-orders` | PurchaseOrders | `src/pages/marketing/PurchaseOrders.jsx` | 641 | N |  | screen |
| `/app/marketing/expo-seminar` | ExpoSeminar | `src/pages/marketing/ExpoSeminar.jsx` | 2357 | N |  | screen |
| `/app/marketing/gst-upload` | GSTUpload | `src/pages/marketing/GSTUpload.jsx` | 828 | N |  | screen |
| `/app/marketing/reports-analytics` | MarketingReports | `src/pages/marketing/MarketingReports.jsx` | 600 | N |  | list |
| `/app/maintenance` | MaintenanceDashboard | `src/pages/maintenance/MaintenanceDashboard.jsx` | 716 | N |  | dashboard |
| `/app/maintenance/enquiry-master` | MaintenanceEnquiryMaster | `src/pages/maintenance/EnquiryMaster.jsx` | 1815 | N |  | list |
| `/app/maintenance/quotation-tracker` | MaintenanceQuotationTracker | `src/pages/maintenance/QuotationTracker.jsx` | 2717 | Y |  | tracker |
| `/app/maintenance/quotation-tracker/costing` | MaintenanceCostingSheetList | `src/pages/maintenance/CostingSheetList.jsx` | 114 | N |  | tracker |
| `/app/maintenance/quotation-tracker/costing/:id` | MaintenanceCostingSheetDetail | `src/pages/maintenance/CostingSheetDetail.jsx` | 101 | N |  | tracker |
| `/app/maintenance/quotation-tracker/internal-quotation` | MaintenanceInternalQuotationList | `src/pages/maintenance/InternalQuotationList.jsx` | 285 | N |  | tracker |
| `/app/maintenance/quotation-tracker/internal-quotation/:id` | MaintenanceInternalQuotationForm | `src/pages/maintenance/InternalQuotationForm.jsx` | 572 | N |  | tracker |
| `/app/maintenance/mail-templates` | MaintenanceQuotationTemplatePage | `src/pages/maintenance/QuotationTemplatePage.jsx` | 497 | N |  | screen |
| `/app/maintenance/follow-up-planner` | MaintenanceFollowUpPlanner | `src/pages/maintenance/FollowUpPlanner.jsx` | 1617 | N |  | screen |
| `/app/maintenance/client-master` | MaintenanceClientMaster | `src/pages/maintenance/ClientMaster.jsx` | 713 | N |  | list |
| `/app/maintenance/product-catalog` | MaintenanceProductCatalog | `src/pages/maintenance/ProductCatalog.jsx` | 1587 | N |  | screen |
| `/app/maintenance/purchase-orders` | MaintenancePurchaseOrders | `src/pages/maintenance/PurchaseOrders.jsx` | 641 | N |  | screen |
| `/app/maintenance/mm-po-entry` | MaintenanceMmPoEntry | `src/pages/maintenance/MaintenanceMmPoEntry.jsx` | 52 | N |  | form |
| `/app/maintenance/expo-seminar` | MaintenanceExpoSeminar | `src/pages/maintenance/ExpoSeminar.jsx` | 2357 | N |  | screen |
| `/app/maintenance/gst-upload` | MaintenanceGSTUpload | `src/pages/maintenance/GSTUpload.jsx` | 828 | N |  | screen |
| `/app/maintenance/reports-analytics` | MaintenanceReports | `src/pages/maintenance/MaintenanceReports.jsx` | 600 | N |  | list |
| `/app/crm-outreach` | CrmOutreach | `src/pages/crmOutreach/CrmOutreach.jsx` | 174 | Y |  | screen |
| `/app/user-management` | UserManagement | `src/pages/userAccess/UserManagementHub.jsx` | 43 | N |  | screen |
| `/app/all-employees` | AllEmployeesDirectoryPage | `src/pages/adminOperations/employee/AllEmployeesDirectoryPage.jsx` | 607 | Y |  | list |
| `/app/software-subscriptions-reminders` | SoftwareSubscriptions | `src/pages/SoftwareSubscriptions.jsx` | 1500 | N |  | screen |
| `/app/api-health` | ApiHealthDashboard | `src/pages/apiMonitoring/ApiHealthDashboard.jsx` | 371 | N |  | dashboard |
| `/app/settings` | Settings | `src/pages/Settings.jsx` | 81 | N |  | settings |
| `/*` | Navigate | `—` | — | N | redirect → /; splat | redirect |

## 4. Module-by-module page files (`src/pages`)

### `accountsFinance` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/accountsFinance/AccountsFinance.jsx` | 22 | N |

### `admin` — 23 .jsx (16 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/admin/GatePass.jsx` | 22 | N |
| `src/pages/admin/IfspEmployeeAttendance.jsx` | 22 | N |
| `src/pages/admin/IfspEmployeeLeaves.jsx` | 22 | N |
| `src/pages/admin/IfspEmployeeMaster.jsx` | 2100 | Y |
| `src/pages/admin/IfspEmployeeMasterDetail.jsx` | 586 | Y |
| `src/pages/admin/IfspEmployeePayroll.jsx` | 7 | N |
| `src/pages/admin/employeeMaster/EmployeeAssignedPoliciesPanel.jsx` | 124 | Y |
| `src/pages/admin/employeeMaster/EmployeeLeavesTab.jsx` | 521 | Y |
| `src/pages/admin/employeeMaster/EmployeeMasterHistoryDrawer.jsx` | 108 | Y |
| `src/pages/admin/employeeMaster/EmployeeMasterImportModal.jsx` | 248 | Y |
| `src/pages/admin/employeeMaster/EmployeeMasterPersonalForm.jsx` | 1222 | N |
| `src/pages/admin/employeeMaster/EmployeePayslipsTab.jsx` | 236 | N |
| `src/pages/admin/employeeMaster/EmployeeSalaryHistoryTab.jsx` | 239 | Y |
| `src/pages/admin/employeeMaster/EmployeeSalaryRevisionsTab.jsx` | 117 | Y |
| `src/pages/admin/employeeMaster/EmployeeToursTab.jsx` | 189 | Y |
| `src/pages/admin/employeeMaster/PayslipPreviewModal.jsx` | 146 | Y |
| `src/pages/admin/employeeMaster/PayslipTemplate.jsx` | 656 | N |
| `src/pages/admin/employeeMaster/deductions/EmployeeForm16Tab.jsx` | 378 | Y |
| `src/pages/admin/employeeMaster/deductions/EmployeeLoanTab.jsx` | 500 | Y |
| `src/pages/admin/employeeMaster/deductions/EmployeeSalAdvTab.jsx` | 501 | Y |
| `src/pages/admin/employeeMaster/deductions/EmployeeTdsTab.jsx` | 241 | Y |
| `src/pages/admin/employeeMaster/deductions/EmployeeUnpaidPaidTab.jsx` | 589 | Y |
| `src/pages/admin/employeeMaster/deductions/deductionsUi.jsx` | 105 | Y |

### `adminOperations` — 78 .jsx (52 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/adminOperations/AdminOperationsLayout.jsx` | 241 | Y |
| `src/pages/adminOperations/AdminOpsAlerts.jsx` | 269 | Y |
| `src/pages/adminOperations/AdminOpsDashboard.jsx` | 1273 | Y |
| `src/pages/adminOperations/AdminOpsReports.jsx` | 617 | Y |
| `src/pages/adminOperations/AdminOpsSettings.jsx` | 68 | Y |
| `src/pages/adminOperations/components/AdminUi.jsx` | 26 | Y |
| `src/pages/adminOperations/employee/AllEmployeesDirectoryPage.jsx` | 607 | Y |
| `src/pages/adminOperations/employee/BulkMarkEmployeePicker.jsx` | 190 | Y |
| `src/pages/adminOperations/employee/EmployeeAdminPages.jsx` | 1022 | Y |
| `src/pages/adminOperations/employee/EmployeeAttendanceDailyPage.jsx` | 2375 | Y |
| `src/pages/adminOperations/employee/EmployeeCoBalanceTab.jsx` | 435 | Y |
| `src/pages/adminOperations/employee/EmployeeFnfPage.jsx` | 505 | Y |
| `src/pages/adminOperations/employee/EmployeeLeaveInboxPage.jsx` | 588 | Y |
| `src/pages/adminOperations/employee/EmployeeLeaveManagementPage.jsx` | 1277 | Y |
| `src/pages/adminOperations/employee/EmployeeOnboardingPage.jsx` | 1168 | Y |
| `src/pages/adminOperations/employee/EmployeePoliciesPage.jsx` | 1070 | Y |
| `src/pages/adminOperations/employee/EmployeeTourInboxPage.jsx` | 546 | Y |
| `src/pages/adminOperations/employee/InactiveEmployeesPage.jsx` | 789 | Y |
| `src/pages/adminOperations/employee/LeaveBalanceImportModal.jsx` | 222 | Y |
| `src/pages/adminOperations/employee/NationalPublicHolidaysPage.jsx` | 589 | Y |
| `src/pages/adminOperations/employee/OfficialLettersPage.jsx` | 1821 | Y |
| `src/pages/adminOperations/employee/RegisterDepartmentFilter.jsx` | 204 | N |
| `src/pages/adminOperations/employee/RegisterMarkPicker.jsx` | 396 | N |
| `src/pages/adminOperations/gate/GateAdminPages.jsx` | 270 | Y |
| `src/pages/adminOperations/misc/MiscAdminPages.jsx` | 136 | Y |
| `src/pages/adminOperations/payroll/PayrollFormulaPage.jsx` | 268 | Y |
| `src/pages/adminOperations/payroll/PayrollLayout.jsx` | 51 | N |
| `src/pages/adminOperations/payroll/PayrollViews.jsx` | 1294 | Y |
| `src/pages/adminOperations/payroll/payrollScope.jsx` | 25 | N |
| `src/pages/adminOperations/recruitment/ActivityTimeline.jsx` | 86 | N |
| `src/pages/adminOperations/recruitment/Candidate360Page.jsx` | 833 | N |
| `src/pages/adminOperations/recruitment/CandidatePortalPage.jsx` | 269 | N |
| `src/pages/adminOperations/recruitment/CandidatesPage.jsx` | 436 | N |
| `src/pages/adminOperations/recruitment/CommunicationPage.jsx` | 269 | Y |
| `src/pages/adminOperations/recruitment/ConversionPage.jsx` | 112 | N |
| `src/pages/adminOperations/recruitment/DocumentsPage.jsx` | 179 | N |
| `src/pages/adminOperations/recruitment/InterviewDetailDrawer.jsx` | 329 | Y |
| `src/pages/adminOperations/recruitment/InterviewsPage.jsx` | 268 | N |
| `src/pages/adminOperations/recruitment/JoiningPage.jsx` | 152 | N |
| `src/pages/adminOperations/recruitment/OffersPage.jsx` | 424 | Y |
| `src/pages/adminOperations/recruitment/RecruitmentDashboard.jsx` | 161 | N |
| `src/pages/adminOperations/recruitment/RecruitmentForms.jsx` | 929 | N |
| `src/pages/adminOperations/recruitment/RecruitmentLayout.jsx` | 113 | N |
| `src/pages/adminOperations/recruitment/RecruitmentUi.jsx` | 820 | Y |
| `src/pages/adminOperations/recruitment/ReportsPage.jsx` | 189 | N |
| `src/pages/adminOperations/recruitment/RequisitionsPage.jsx` | 512 | Y |
| `src/pages/adminOperations/recruitment/ScheduleInterviewModal.jsx` | 343 | N |
| `src/pages/adminOperations/recruitment/SettingsPage.jsx` | 304 | N |
| `src/pages/adminOperations/rulesConsole/RulesConsoleGuard.jsx` | 37 | N |
| `src/pages/adminOperations/rulesConsole/RulesConsolePage.jsx` | 166 | Y |
| `src/pages/adminOperations/rulesConsole/components/RuleDrawer.jsx` | 448 | N |
| `src/pages/adminOperations/rulesConsole/components/RulesUi.jsx` | 139 | Y |
| `src/pages/adminOperations/salaryAdmin/AnnexureCtcPanel.jsx` | 2204 | Y |
| `src/pages/adminOperations/salaryAdmin/CtcCalculator.jsx` | 555 | Y |
| `src/pages/adminOperations/salaryAdmin/CtcFormulaPanel.jsx` | 241 | Y |
| `src/pages/adminOperations/salaryAdmin/CtcMigrationPanel.jsx` | 400 | Y |
| `src/pages/adminOperations/salaryAdmin/CtcRuleUpdatePanel.jsx` | 320 | Y |
| `src/pages/adminOperations/salaryAdmin/PayrollRuleMaster.jsx` | 502 | Y |
| `src/pages/adminOperations/salaryAdmin/PersonSalaryComponentsPanel.jsx` | 464 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryAdminGuard.jsx` | 38 | N |
| `src/pages/adminOperations/salaryAdmin/SalaryAdminLayout.jsx` | 120 | N |
| `src/pages/adminOperations/salaryAdmin/SalaryBankImportModal.jsx` | 284 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryComponentsMaster.jsx` | 831 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryDashboard.jsx` | 466 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryEmployeeCtc.jsx` | 3036 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryGeneratePayslips.jsx` | 784 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryMaster.jsx` | 368 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryProcessReport.jsx` | 435 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryProcessing.jsx` | 3187 | Y |
| `src/pages/adminOperations/salaryAdmin/SalaryRevisionHistory.jsx` | 163 | N |
| `src/pages/adminOperations/salaryAdmin/mis/EmployeePayrollTagsSection.jsx` | 65 | N |
| `src/pages/adminOperations/salaryAdmin/mis/MisCharts.jsx` | 76 | N |
| `src/pages/adminOperations/salaryAdmin/mis/MisReports.jsx` | 570 | Y |
| `src/pages/adminOperations/salaryAdmin/mis/MisSetup.jsx` | 619 | Y |
| `src/pages/adminOperations/salaryAdmin/mis/PayrollMisPage.jsx` | 473 | Y |
| `src/pages/adminOperations/salaryAdmin/mis/PayrollMisRoute.jsx` | 50 | N |
| `src/pages/adminOperations/salaryAdmin/mis/TagFields.jsx` | 31 | Y |
| `src/pages/adminOperations/store/StoreAdminPages.jsx` | 351 | Y |

### `amc` — 20 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/amc/AMC.jsx` | 87 | N |
| `src/pages/amc/Alerts.jsx` | 84 | N |
| `src/pages/amc/Assets.jsx` | 93 | N |
| `src/pages/amc/Complaints.jsx` | 102 | N |
| `src/pages/amc/Contracts.jsx` | 134 | N |
| `src/pages/amc/Customers.jsx` | 132 | N |
| `src/pages/amc/Dashboard.jsx` | 221 | N |
| `src/pages/amc/PMSchedule.jsx` | 154 | N |
| `src/pages/amc/Reports.jsx` | 95 | N |
| `src/pages/amc/ServiceReports.jsx` | 55 | N |
| `src/pages/amc/Settings.jsx` | 48 | N |
| `src/pages/amc/Sites.jsx` | 113 | N |
| `src/pages/amc/TechnicianAllocation.jsx` | 61 | N |
| `src/pages/amc/Visits.jsx` | 116 | N |
| `src/pages/amc/components/AmcFilterBar.jsx` | 29 | N |
| `src/pages/amc/components/AmcUi.jsx` | 133 | Y |
| `src/pages/amc/components/EntityListPage.jsx` | 75 | N |
| `src/pages/amc/components/LinkedRecord.jsx` | 21 | N |
| `src/pages/amc/components/RelatedRecordsTable.jsx` | 65 | N |
| `src/pages/amc/contexts/AmcContext.jsx` | 273 | N |

### `apiMonitoring` — 6 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/apiMonitoring/ApiHealthDashboard.jsx` | 371 | N |
| `src/pages/apiMonitoring/components/ApiDetailPanel.jsx` | 223 | N |
| `src/pages/apiMonitoring/components/ApiHealthCharts.jsx` | 127 | N |
| `src/pages/apiMonitoring/components/ApiHealthTable.jsx` | 416 | N |
| `src/pages/apiMonitoring/components/ApiMonitoringUi.jsx` | 924 | Y |
| `src/pages/apiMonitoring/components/DbUsageQuotaPanel.jsx` | 465 | N |

### `attendance` — 4 .jsx (2 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/attendance/Attendance.jsx` | 734 | Y |
| `src/pages/attendance/AttendanceFilters.jsx` | 168 | Y |
| `src/pages/attendance/AttendanceRegisterTable.jsx` | 126 | N |
| `src/pages/attendance/attendanceTableHelpers.jsx` | 231 | N |

### `billing` — 22 .jsx (4 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/billing/AddOnInvoices.jsx` | 533 | N |
| `src/pages/billing/Billing.jsx` | 179 | N |
| `src/pages/billing/BillingDashboard.jsx` | 1464 | Y |
| `src/pages/billing/BillingNotifications.jsx` | 234 | N |
| `src/pages/billing/BillingReports.jsx` | 760 | N |
| `src/pages/billing/BillingTracker.jsx` | 550 | Y |
| `src/pages/billing/BillingTracking.jsx` | 64 | N |
| `src/pages/billing/CreateInvoice.jsx` | 4782 | Y |
| `src/pages/billing/CreditNotes.jsx` | 679 | N |
| `src/pages/billing/EInvoice.jsx` | 137 | N |
| `src/pages/billing/GenerateEInvoiceModal.jsx` | 110 | N |
| `src/pages/billing/GeneratedEInvoice.jsx` | 388 | N |
| `src/pages/billing/ManageInvoices.jsx` | 2419 | Y |
| `src/pages/billing/ManagePAModal.jsx` | 133 | N |
| `src/pages/billing/WOPOManagement.jsx` | 1000 | N |
| `src/pages/billing/components/BillingFlowNav.jsx` | 116 | N |
| `src/pages/billing/components/BillingKeepAlivePanels.jsx` | 32 | N |
| `src/pages/billing/components/BillingPlainEnglishGuide.jsx` | 117 | N |
| `src/pages/billing/components/BillingPoNotificationBar.jsx` | 79 | N |
| `src/pages/billing/components/BillingScopeFilters.jsx` | 124 | N |
| `src/pages/billing/components/InvoiceHtmlPreview.jsx` | 644 | N |
| `src/pages/billing/components/RequestCnDnApprovalSection.jsx` | 391 | N |

### `commercial` — 3 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/commercial/Commercial.jsx` | 77 | N |
| `src/pages/commercial/ContactLog.jsx` | 233 | N |
| `src/pages/commercial/POEntry.jsx` | 1027 | Y |

### `commercial-rm-mm-amc-iev` — 13 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev.jsx` | 117 | N |
| `src/pages/commercial-rm-mm-amc-iev/ContactLog.jsx` | 1 | N |
| `src/pages/commercial-rm-mm-amc-iev/InternalQuotation.jsx` | 11 | N |
| `src/pages/commercial-rm-mm-amc-iev/ManpowerManagement.jsx` | 1 | N |
| `src/pages/commercial-rm-mm-amc-iev/POEntry.jsx` | 1 | N |
| `src/pages/commercial-rm-mm-amc-iev/contact-log/ContactLogRm.jsx` | 237 | N |
| `src/pages/commercial-rm-mm-amc-iev/dashboard/CommercialDashboardRmMmAmcIev.jsx` | 156 | N |
| `src/pages/commercial-rm-mm-amc-iev/internal-quotation/InternalQuotationFormRm.jsx` | 202 | N |
| `src/pages/commercial-rm-mm-amc-iev/internal-quotation/InternalQuotationListRm.jsx` | 115 | N |
| `src/pages/commercial-rm-mm-amc-iev/manpower-management/ManpowerManagementRm.jsx` | 415 | N |
| `src/pages/commercial-rm-mm-amc-iev/manpower-management/ManpowerNavbarRm.jsx` | 73 | N |
| `src/pages/commercial-rm-mm-amc-iev/manpower-management/components/ManpowerEnquiryFormPanelRm.jsx` | 879 | N |
| `src/pages/commercial-rm-mm-amc-iev/po-entry/POEntryRm.jsx` | 2308 | N |

### `compliance` — 11 .jsx (5 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/compliance/GeneralCompliance.jsx` | 22 | N |
| `src/pages/compliance/IfspEmployeeCompliance.jsx` | 22 | N |
| `src/pages/compliance/payroll/ComplianceDashboard.jsx` | 368 | Y |
| `src/pages/compliance/payroll/ComplianceForms.jsx` | 95 | Y |
| `src/pages/compliance/payroll/ComplianceGuard.jsx` | 20 | N |
| `src/pages/compliance/payroll/CompliancePayrollLayout.jsx` | 14 | N |
| `src/pages/compliance/payroll/CompliancePayrollProcess.jsx` | 1143 | Y |
| `src/pages/compliance/payroll/NominationDocument.jsx` | 425 | N |
| `src/pages/compliance/payroll/OshSpecialForms.jsx` | 241 | N |
| `src/pages/compliance/payroll/StatutoryCodePanel.jsx` | 463 | Y |
| `src/pages/compliance/payroll/WageStatutoryForm.jsx` | 273 | Y |

### `crmOutreach` — 25 .jsx (15 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/crmOutreach/CampaignLog.jsx` | 59 | Y |
| `src/pages/crmOutreach/CrmOutreach.jsx` | 174 | Y |
| `src/pages/crmOutreach/MailTemplates.jsx` | 48 | Y |
| `src/pages/crmOutreach/OutreachClientMaster.jsx` | 436 | Y |
| `src/pages/crmOutreach/SenderMailboxes.jsx` | 93 | Y |
| `src/pages/crmOutreach/components/ComposeSendModal.jsx` | 346 | Y |
| `src/pages/crmOutreach/components/EmailBodyEditor.jsx` | 167 | N |
| `src/pages/crmOutreach/components/EmailPreviewFrame.jsx` | 29 | N |
| `src/pages/crmOutreach/components/MergeTokenChips.jsx` | 19 | N |
| `src/pages/crmOutreach/components/OutreachClientBulkImportModal.jsx` | 280 | Y |
| `src/pages/crmOutreach/components/OutreachClientEditorModal.jsx` | 255 | N |
| `src/pages/crmOutreach/components/OutreachTabBar.jsx` | 46 | N |
| `src/pages/crmOutreach/components/SenderEditorModal.jsx` | 164 | N |
| `src/pages/crmOutreach/components/TemplateEditorModal.jsx` | 190 | N |
| `src/pages/crmOutreach/contexts/CrmOutreachContext.jsx` | 310 | N |
| `src/pages/crmOutreach/inHouse/EmployeePicker.jsx` | 207 | N |
| `src/pages/crmOutreach/inHouse/InHouseComposeModal.jsx` | 406 | Y |
| `src/pages/crmOutreach/inHouse/InHouseEmployees.jsx` | 74 | Y |
| `src/pages/crmOutreach/inHouse/InHouseGroupEditorModal.jsx` | 127 | Y |
| `src/pages/crmOutreach/inHouse/InHouseGroups.jsx` | 80 | Y |
| `src/pages/crmOutreach/inHouse/InHouseMailHistory.jsx` | 146 | Y |
| `src/pages/crmOutreach/inHouse/InHouseOutreach.jsx` | 107 | Y |
| `src/pages/crmOutreach/inHouse/InHouseOutreachContext.jsx` | 265 | N |
| `src/pages/crmOutreach/inHouse/InHouseTemplateEditorModal.jsx` | 152 | Y |
| `src/pages/crmOutreach/inHouse/InHouseTemplates.jsx` | 46 | Y |

### `dashboard` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/dashboard/components/CommandCenterUi.jsx` | 350 | N |

### `Dashboard.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/Dashboard.jsx` | 1196 | N |

### `finance` — 25 .jsx (3 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/finance/BudgetVersions.jsx` | 161 | N |
| `src/pages/finance/BudgetVsActual.jsx` | 159 | N |
| `src/pages/finance/CostAllocation.jsx` | 156 | N |
| `src/pages/finance/ExpenseEntries.jsx` | 144 | N |
| `src/pages/finance/ExpenseHeads.jsx` | 197 | N |
| `src/pages/finance/Finance.jsx` | 104 | N |
| `src/pages/finance/FinanceReports.jsx` | 39 | N |
| `src/pages/finance/ImportExport.jsx` | 128 | N |
| `src/pages/finance/PlDashboard.jsx` | 525 | N |
| `src/pages/finance/RevenueEntries.jsx` | 118 | N |
| `src/pages/finance/RevenueHeads.jsx` | 103 | N |
| `src/pages/finance/Settings.jsx` | 101 | N |
| `src/pages/finance/SiteLedgerApp.jsx` | 5834 | Y |
| `src/pages/finance/SitesMaster.jsx` | 207 | N |
| `src/pages/finance/bankFormats/BankFormats.jsx` | 488 | Y |
| `src/pages/finance/components/FinanceDashboardStyles.jsx` | 79 | N |
| `src/pages/finance/components/FinanceDateInput.jsx` | 41 | N |
| `src/pages/finance/components/FinanceTabNav.jsx` | 126 | N |
| `src/pages/finance/components/FinanceTypographyStyles.jsx` | 105 | N |
| `src/pages/finance/components/FinanceUi.jsx` | 111 | Y |
| `src/pages/finance/components/PeriodDateSelect.jsx` | 33 | N |
| `src/pages/finance/components/PeriodMonthSelect.jsx` | 77 | N |
| `src/pages/finance/components/PlAuditPanel.jsx` | 32 | N |
| `src/pages/finance/components/SiteClientAutocomplete.jsx` | 123 | N |
| `src/pages/finance/contexts/FinanceContext.jsx` | 284 | N |

### `fireTenderManufacturing` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/fireTenderManufacturing/FireTenderManufacturing.jsx` | 22 | N |

### `fireTenderVehicle` — 8 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/fireTenderVehicle/DriverManagement.jsx` | 783 | N |
| `src/pages/fireTenderVehicle/FireTenderVehicleManagement.jsx` | 105 | N |
| `src/pages/fireTenderVehicle/FleetAttachmentUploader.jsx` | 181 | N |
| `src/pages/fireTenderVehicle/VehicleDocuments.jsx` | 812 | N |
| `src/pages/fireTenderVehicle/VehicleMaintenance.jsx` | 685 | N |
| `src/pages/fireTenderVehicle/VehicleManagementDashboard.jsx` | 357 | N |
| `src/pages/fireTenderVehicle/VehicleMaster.jsx` | 1149 | N |
| `src/pages/fireTenderVehicle/VehicleTrips.jsx` | 2398 | N |

### `ForgotPassword.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/ForgotPassword.jsx` | 119 | N |

### `hr` — 68 .jsx (46 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/hr/HR.jsx` | 22 | N |
| `src/pages/hr/HrDashboard.jsx` | 142 | Y |
| `src/pages/hr/HrEmployeeMaster.jsx` | 74 | Y |
| `src/pages/hr/HrSalaryInputs.jsx` | 13 | N |
| `src/pages/hr/callingMaster/CallingMasterConversionPage.jsx` | 270 | Y |
| `src/pages/hr/callingMaster/CallingMasterDatabasePage.jsx` | 649 | Y |
| `src/pages/hr/callingMaster/CallingMasterDropdownPage.jsx` | 380 | Y |
| `src/pages/hr/callingMaster/CallingMasterEntry.jsx` | 45 | N |
| `src/pages/hr/callingMaster/CallingMasterIomPage.jsx` | 782 | Y |
| `src/pages/hr/callingMaster/CallingMasterJoiningPage.jsx` | 553 | Y |
| `src/pages/hr/callingMaster/CallingMasterLayout.jsx` | 187 | N |
| `src/pages/hr/callingMaster/CallingMasterOfferPage.jsx` | 685 | Y |
| `src/pages/hr/callingMaster/CallingMasterOfferResponsePage.jsx` | 375 | Y |
| `src/pages/hr/callingMaster/CallingMasterPage.jsx` | 1526 | Y |
| `src/pages/hr/callingMaster/CallingMasterReferralPage.jsx` | 423 | Y |
| `src/pages/hr/callingMaster/CallingTableActions.jsx` | 160 | N |
| `src/pages/hr/callingMaster/OfferDetailsFields.jsx` | 233 | Y |
| `src/pages/hr/callingMaster/recruitmentUiContext.jsx` | 31 | N |
| `src/pages/hr/payroll/HrPayrollFormulaPage.jsx` | 268 | Y |
| `src/pages/hr/payroll/HrPayrollLayout.jsx` | 50 | N |
| `src/pages/hr/payroll/HrPayrollViews.jsx` | 1294 | Y |
| `src/pages/hr/payroll/hrPayrollScope.jsx` | 23 | N |
| `src/pages/hr/payroll/salary/AttendanceIntegration.jsx` | 147 | Y |
| `src/pages/hr/payroll/salary/ComplianceManagement.jsx` | 37 | Y |
| `src/pages/hr/payroll/salary/Dashboard.jsx` | 331 | Y |
| `src/pages/hr/payroll/salary/DatawizardReport.jsx` | 551 | N |
| `src/pages/hr/payroll/salary/EmployeeExit.jsx` | 45 | Y |
| `src/pages/hr/payroll/salary/EmployeeMaster.jsx` | 190 | N |
| `src/pages/hr/payroll/salary/EmployeeMasterProfile.jsx` | 330 | N |
| `src/pages/hr/payroll/salary/EmployeePayrollList.jsx` | 142 | Y |
| `src/pages/hr/payroll/salary/EmployeePayrollProfile.jsx` | 186 | Y |
| `src/pages/hr/payroll/salary/FormulaLibrary.jsx` | 309 | Y |
| `src/pages/hr/payroll/salary/FullFinalSettlement.jsx` | 38 | Y |
| `src/pages/hr/payroll/salary/HRSalaryModule.jsx` | 2147 | N |
| `src/pages/hr/payroll/salary/LoansRecoveries.jsx` | 51 | Y |
| `src/pages/hr/payroll/salary/ManualInputs.jsx` | 94 | Y |
| `src/pages/hr/payroll/salary/Outputs.jsx` | 36 | Y |
| `src/pages/hr/payroll/salary/PayrollApproval.jsx` | 227 | Y |
| `src/pages/hr/payroll/salary/PayrollPackageBuilder.jsx` | 45 | Y |
| `src/pages/hr/payroll/salary/PayrollRun.jsx` | 117 | Y |
| `src/pages/hr/payroll/salary/Register.jsx` | 104 | Y |
| `src/pages/hr/payroll/salary/ReportsExports.jsx` | 45 | Y |
| `src/pages/hr/payroll/salary/SalaryLayout.jsx` | 16 | N |
| `src/pages/hr/payroll/salary/Settings.jsx` | 53 | Y |
| `src/pages/hr/payroll/salary/SiteCalculationFormulas.jsx` | 377 | Y |
| `src/pages/hr/payroll/salary/SiteFormulaSetup.jsx` | 1 | N |
| `src/pages/hr/payroll/salary/SiteMaster.jsx` | 350 | Y |
| `src/pages/hr/payroll/salary/components/ActiveEmployeesModal.jsx` | 157 | N |
| `src/pages/hr/payroll/salary/components/CompliancePageHeader.jsx` | 23 | N |
| `src/pages/hr/payroll/salary/components/FormulaBuilder.jsx` | 409 | N |
| `src/pages/hr/payroll/salary/components/SalaryPageHeader.jsx` | 13 | N |
| `src/pages/hr/payroll/salary/components/SiteMasterSetupForm.jsx` | 345 | N |
| `src/pages/hr/payroll/salary/module/SalaryModuleContext.jsx` | 222 | N |
| `src/pages/hr/payroll/salary/module/chrome.jsx` | 132 | N |
| `src/pages/hr/payroll/salary/module/screens.jsx` | 1210 | Y |
| `src/pages/hr/payroll/salary/statutory/ESIC.jsx` | 50 | Y |
| `src/pages/hr/payroll/salary/statutory/PF.jsx` | 55 | Y |
| `src/pages/hr/payroll/salary/statutory/PT.jsx` | 24 | Y |
| `src/pages/hr/payroll/salary/statutory/TDS.jsx` | 24 | Y |
| `src/pages/hr/siteAttendance/AdminAttendanceViewPage.jsx` | 6 | N |
| `src/pages/hr/siteAttendance/AttendanceEntryPage.jsx` | 467 | Y |
| `src/pages/hr/siteAttendance/DashboardPage.jsx` | 166 | Y |
| `src/pages/hr/siteAttendance/PeopleMasterPage.jsx` | 792 | Y |
| `src/pages/hr/siteAttendance/SiteAttendanceLayout.jsx` | 188 | Y |
| `src/pages/hr/siteAttendance/SiteMasterPage.jsx` | 718 | Y |
| `src/pages/hr/siteAttendance/SummaryPage.jsx` | 237 | Y |
| `src/pages/hr/siteAttendance/TablePager.jsx` | 57 | Y |
| `src/pages/hr/siteAttendance/import/AttendanceImportModal.jsx` | 430 | Y |

### `IndusLmsTrainings.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/IndusLmsTrainings.jsx` | 143 | N |

### `Login.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/Login.jsx` | 692 | N |

### `maintenance` — 26 .jsx (2 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/maintenance/ClientMaster.jsx` | 713 | N |
| `src/pages/maintenance/CostingSheetDetail.jsx` | 101 | N |
| `src/pages/maintenance/CostingSheetList.jsx` | 114 | N |
| `src/pages/maintenance/EnquiryMaster.jsx` | 1815 | N |
| `src/pages/maintenance/ExpoSeminar.jsx` | 2357 | N |
| `src/pages/maintenance/FollowUpPlanner.jsx` | 1617 | N |
| `src/pages/maintenance/GSTUpload.jsx` | 828 | N |
| `src/pages/maintenance/InternalQuotationForm.jsx` | 572 | N |
| `src/pages/maintenance/InternalQuotationList.jsx` | 285 | N |
| `src/pages/maintenance/MaintenanceDashboard.jsx` | 716 | N |
| `src/pages/maintenance/MaintenanceMmPoEntry.jsx` | 52 | N |
| `src/pages/maintenance/MaintenanceReports.jsx` | 600 | N |
| `src/pages/maintenance/ProductCatalog.jsx` | 1587 | N |
| `src/pages/maintenance/PurchaseOrders.jsx` | 641 | N |
| `src/pages/maintenance/QuotationTemplatePage.jsx` | 497 | N |
| `src/pages/maintenance/QuotationTracker.jsx` | 2717 | Y |
| `src/pages/maintenance/QuotationTrackerNavbar.jsx` | 94 | N |
| `src/pages/maintenance/components/CostingSheet.jsx` | 240 | N |
| `src/pages/maintenance/components/CostingSheetForm.jsx` | 399 | N |
| `src/pages/maintenance/components/DateRangeCalendar.jsx` | 219 | N |
| `src/pages/maintenance/components/ExcelCostingSheet.jsx` | 1345 | N |
| `src/pages/maintenance/components/InternalQuotationFormModal.jsx` | 1181 | N |
| `src/pages/maintenance/components/MaintenanceNavbar.jsx` | 63 | N |
| `src/pages/maintenance/components/MaintenanceReportsUi.jsx` | 11 | Y |
| `src/pages/maintenance/components/NumberInput.jsx` | 79 | N |
| `src/pages/maintenance/components/QuotationForm.jsx` | 1025 | N |

### `manpowerProject` — 12 .jsx (2 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/manpowerProject/CommercialMtDashboard.jsx` | 658 | Y |
| `src/pages/manpowerProject/ManpowerEnquiry.jsx` | 1 | N |
| `src/pages/manpowerProject/ManpowerEnquiryDashboard.jsx` | 606 | Y |
| `src/pages/manpowerProject/ManpowerManagement.jsx` | 1098 | N |
| `src/pages/manpowerProject/ManpowerNavbar.jsx` | 128 | N |
| `src/pages/manpowerProject/components/ManpowerEnquiryFormPanel.jsx` | 1626 | N |
| `src/pages/manpowerProject/components/ManpowerEnquiryPreviewModal.jsx` | 610 | N |
| `src/pages/manpowerProject/configuration/ManpowerConfiguration.jsx` | 219 | N |
| `src/pages/manpowerProject/enquiryProjects/InternalQuotationForm.jsx` | 1766 | N |
| `src/pages/manpowerProject/enquiryProjects/InternalQuotationList.jsx` | 165 | N |
| `src/pages/manpowerProject/enquiryProjects/ManpowerEnquiryList.jsx` | 199 | N |
| `src/pages/manpowerProject/quotation/ManpowerQuotationList.jsx` | 63 | N |

### `marketing` — 30 .jsx (4 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/marketing/ClientMaster.jsx` | 718 | N |
| `src/pages/marketing/CostingSheetDetail.jsx` | 101 | N |
| `src/pages/marketing/CostingSheetList.jsx` | 114 | N |
| `src/pages/marketing/EnquiryMaster.jsx` | 1980 | N |
| `src/pages/marketing/ExpoSeminar.jsx` | 2357 | N |
| `src/pages/marketing/FollowUpPlanner.jsx` | 1617 | N |
| `src/pages/marketing/GSTUpload.jsx` | 828 | N |
| `src/pages/marketing/InternalQuotationForm.jsx` | 572 | N |
| `src/pages/marketing/InternalQuotationList.jsx` | 285 | N |
| `src/pages/marketing/LeadDashboard.jsx` | 376 | Y |
| `src/pages/marketing/LeadMaster.jsx` | 780 | Y |
| `src/pages/marketing/MarketingDashboard.jsx` | 716 | N |
| `src/pages/marketing/MarketingReports.jsx` | 600 | N |
| `src/pages/marketing/ProductCatalog.jsx` | 1587 | N |
| `src/pages/marketing/PurchaseOrders.jsx` | 641 | N |
| `src/pages/marketing/QuotationTemplatePage.jsx` | 497 | N |
| `src/pages/marketing/QuotationTracker.jsx` | 2900 | Y |
| `src/pages/marketing/QuotationTrackerNavbar.jsx` | 94 | N |
| `src/pages/marketing/components/ColumnFilterMenu.jsx` | 202 | N |
| `src/pages/marketing/components/CostingSheet.jsx` | 240 | N |
| `src/pages/marketing/components/CostingSheetForm.jsx` | 399 | N |
| `src/pages/marketing/components/DateRangeCalendar.jsx` | 219 | N |
| `src/pages/marketing/components/ExcelCostingSheet.jsx` | 1438 | N |
| `src/pages/marketing/components/InternalQuotationFormModal.jsx` | 1181 | N |
| `src/pages/marketing/components/LeadCompanyAutocomplete.jsx` | 178 | N |
| `src/pages/marketing/components/MarketingNavbar.jsx` | 42 | N |
| `src/pages/marketing/components/MarketingReportsUi.jsx` | 11 | Y |
| `src/pages/marketing/components/NumberInput.jsx` | 79 | N |
| `src/pages/marketing/components/QuotationForm.jsx` | 1107 | N |
| `src/pages/marketing/components/WorkingCostSheetFilter.jsx` | 46 | N |

### `operations` — 29 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/operations/Operations.jsx` | 135 | N |
| `src/pages/operations/components/OperationsUi.jsx` | 570 | Y |
| `src/pages/operations/contexts/OperationsContext.jsx` | 184 | N |
| `src/pages/operations/dahej/components/DahejExpenseGrid.jsx` | 256 | N |
| `src/pages/operations/dahej/contexts/DahejExpensesContext.jsx` | 273 | N |
| `src/pages/operations/dahej/pages/DahejBookingLocationMaster.jsx` | 104 | N |
| `src/pages/operations/dahej/pages/DahejDashboard.jsx` | 106 | N |
| `src/pages/operations/dahej/pages/DahejExpenseRegister.jsx` | 193 | N |
| `src/pages/operations/dahej/pages/DahejExpensesHub.jsx` | 86 | N |
| `src/pages/operations/dahej/pages/DahejMonthlyRegister.jsx` | 92 | N |
| `src/pages/operations/dahej/pages/DahejReports.jsx` | 166 | N |
| `src/pages/operations/dahej/pages/DahejVehicleMaster.jsx` | 102 | N |
| `src/pages/operations/pages/Dashboard.jsx` | 173 | N |
| `src/pages/operations/pages/accommodation/PropertyDetails.jsx` | 114 | N |
| `src/pages/operations/pages/accommodation/PropertyList.jsx` | 77 | N |
| `src/pages/operations/pages/accommodation/RentMonthlyDashboard.jsx` | 83 | N |
| `src/pages/operations/pages/accommodation/RentPaymentEntry.jsx` | 114 | N |
| `src/pages/operations/pages/accommodation/RentPaymentHistory.jsx` | 91 | N |
| `src/pages/operations/pages/advances/AdvanceApproval.jsx` | 128 | N |
| `src/pages/operations/pages/advances/AdvanceList.jsx` | 153 | N |
| `src/pages/operations/pages/advances/AdvanceOutstandingDashboard.jsx` | 88 | N |
| `src/pages/operations/pages/advances/AdvanceSettlement.jsx` | 125 | N |
| `src/pages/operations/pages/expenses/ExpenseList.jsx` | 259 | N |
| `src/pages/operations/pages/expenses/ExpenseMonthlySummary.jsx` | 107 | N |
| `src/pages/operations/pages/expenses/ExpenseSiteDashboard.jsx` | 97 | N |
| `src/pages/operations/pages/medical/MedicalCenterSelect.jsx` | 93 | N |
| `src/pages/operations/pages/medical/MedicalRecordDetails.jsx` | 105 | N |
| `src/pages/operations/pages/medical/PmeDueDashboard.jsx` | 68 | N |
| `src/pages/operations/pages/medical/PmeTracker.jsx` | 88 | N |

### `payroll` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/payroll/Payroll.jsx` | 22 | N |

### `peopleManagement` — 8 .jsx (7 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/peopleManagement/CreateSiteLoginModal.jsx` | 255 | Y |
| `src/pages/peopleManagement/HrLeadsAssignModal.jsx` | 133 | Y |
| `src/pages/peopleManagement/LoginAccessSection.jsx` | 218 | Y |
| `src/pages/peopleManagement/PeopleManagement.jsx` | 338 | Y |
| `src/pages/peopleManagement/PeopleMasterList.jsx` | 568 | Y |
| `src/pages/peopleManagement/PersonProfile.jsx` | 692 | Y |
| `src/pages/peopleManagement/SiteAssignmentsFilters.jsx` | 125 | Y |
| `src/pages/peopleManagement/siteAssignmentsTableHelpers.jsx` | 92 | N |

### `procurement` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/procurement/Procurement.jsx` | 22 | N |

### `projects` — 70 .jsx (4 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/projects/AccessoriesTable.jsx` | 735 | N |
| `src/pages/projects/CostingList.jsx` | 267 | N |
| `src/pages/projects/CostingSheet.jsx` | 209 | N |
| `src/pages/projects/CostingSummary.jsx` | 1163 | N |
| `src/pages/projects/CostingTable.jsx` | 1196 | N |
| `src/pages/projects/DuplicateCostingSheetModal.jsx` | 216 | N |
| `src/pages/projects/FireTender.jsx` | 1179 | N |
| `src/pages/projects/FireTenderCostingHub.jsx` | 60 | N |
| `src/pages/projects/FireTenderDashboard.jsx` | 385 | N |
| `src/pages/projects/FireTenderNavbar.jsx` | 137 | N |
| `src/pages/projects/MocTable.jsx` | 184 | N |
| `src/pages/projects/ProjectsPoHub.jsx` | 93 | N |
| `src/pages/projects/QuotationDetail.jsx` | 1240 | N |
| `src/pages/projects/QuotationDocument.jsx` | 190 | N |
| `src/pages/projects/QuotationList.jsx` | 197 | N |
| `src/pages/projects/configurationTender/AccessoriesPage.jsx` | 344 | N |
| `src/pages/projects/configurationTender/ExcelUploadPage.jsx` | 102 | N |
| `src/pages/projects/configurationTender/FinalComponentsPage.jsx` | 205 | N |
| `src/pages/projects/configurationTender/FireTenderMailTemplatePage.jsx` | 418 | N |
| `src/pages/projects/configurationTender/IevConfigGuard.jsx` | 24 | N |
| `src/pages/projects/configurationTender/MainComponentPage.jsx` | 425 | N |
| `src/pages/projects/configurationTender/MainContainer.jsx` | 60 | N |
| `src/pages/projects/configurationTender/ManualSubCategoryPage.jsx` | 116 | N |
| `src/pages/projects/configurationTender/OcSignoffAssignmentPage.jsx` | 174 | N |
| `src/pages/projects/configurationTender/PriceMasterPage.jsx` | 626 | N |
| `src/pages/projects/configurationTender/VehicleTypePage.jsx` | 86 | N |
| `src/pages/projects/demoTenders.jsx` | 34 | N |
| `src/pages/projects/enquiry/EnquiryChangeHistory.jsx` | 110 | Y |
| `src/pages/projects/enquiry/EnquiryCompletedPopup.jsx` | 126 | N |
| `src/pages/projects/enquiry/EnquiryDashboard.jsx` | 800 | N |
| `src/pages/projects/enquiry/EnquiryDatabase.jsx` | 897 | Y |
| `src/pages/projects/enquiry/EnquiryDeletionRequests.jsx` | 90 | Y |
| `src/pages/projects/enquiry/EnquiryDropdown.jsx` | 473 | N |
| `src/pages/projects/enquiry/EnquiryDueSoonPopup.jsx` | 141 | N |
| `src/pages/projects/enquiry/EnquiryEditRequests.jsx` | 112 | Y |
| `src/pages/projects/enquiry/EnquiryEntry.jsx` | 253 | N |
| `src/pages/projects/enquiry/EnquiryExportModal.jsx` | 106 | N |
| `src/pages/projects/enquiry/EnquiryFieldInput.jsx` | 96 | N |
| `src/pages/projects/enquiry/EnquiryImportPanel.jsx` | 190 | N |
| `src/pages/projects/enquiry/EnquiryKpi.jsx` | 332 | N |
| `src/pages/projects/enquiry/EnquiryOverduePopup.jsx` | 145 | N |
| `src/pages/projects/enquiry/ProjectsEnquiryHub.jsx` | 92 | N |
| `src/pages/projects/oc/OcCreationForm.jsx` | 820 | N |
| `src/pages/projects/oc/OcCreationTab.jsx` | 168 | N |
| `src/pages/projects/quotation/ConvertToProjectModal.jsx` | 112 | N |
| `src/pages/projects/quotation/FetchFromSummaryModal.jsx` | 280 | N |
| `src/pages/projects/quotation/FollowupModal.jsx` | 109 | N |
| `src/pages/projects/quotation/ProjectsQuotationHub.jsx` | 83 | N |
| `src/pages/projects/quotation/QuotationBoard.jsx` | 224 | N |
| `src/pages/projects/quotation/QuotationDashboard.jsx` | 397 | N |
| `src/pages/projects/quotation/QuotationDetailDrawer.jsx` | 739 | N |
| `src/pages/projects/quotation/QuotationDraftContext.jsx` | 143 | N |
| `src/pages/projects/quotation/QuotationDropdown.jsx` | 255 | N |
| `src/pages/projects/quotation/QuotationEntry.jsx` | 1140 | N |
| `src/pages/projects/quotation/QuotationImportPanel.jsx` | 202 | N |
| `src/pages/projects/quotation/QuotationList.jsx` | 587 | N |
| `src/pages/projects/quotation/QuotationPreview.jsx` | 122 | N |
| `src/pages/projects/quotation/QuotationSummary.jsx` | 384 | N |
| `src/pages/projects/quotation/QuotationTemplates.jsx` | 284 | N |
| `src/pages/projects/quotation/StatusBadge.jsx` | 15 | N |
| `src/pages/projects/quotation/maker/BoqImportModal.jsx` | 618 | N |
| `src/pages/projects/quotation/maker/QuotationMaker.jsx` | 1251 | N |
| `src/pages/projects/quotation/maker/QuotationMakerList.jsx` | 280 | N |
| `src/pages/projects/quotation/maker/QuotationMakerPreview.jsx` | 351 | N |
| `src/pages/projects/quotation/summary/ChildHeadSection.jsx` | 144 | N |
| `src/pages/projects/quotation/summary/ItemRow.jsx` | 165 | N |
| `src/pages/projects/quotation/summary/MainHeadSection.jsx` | 173 | N |
| `src/pages/projects/quotation/summary/export/ExportPreviewLayouts.jsx` | 191 | N |
| `src/pages/projects/quotation/summary/export/mainHeadExport.jsx` | 152 | N |
| `src/pages/projects/quotation/summary/export/overallSummaryExport.jsx` | 103 | N |

### `projectsBilling` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/projectsBilling/ProjectsBilling.jsx` | 22 | N |

### `projectsManagement` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/projectsManagement/ProjectsManagement.jsx` | 22 | N |

### `Register.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/Register.jsx` | 196 | N |

### `reports` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/reports/Reports.jsx` | 180 | N |

### `ResetPassword.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/ResetPassword.jsx` | 258 | N |

### `salary` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/salary/Salary.jsx` | 81 | N |

### `sales` — 3 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/sales/Commercial.jsx` | 94 | N |
| `src/pages/sales/ContactLog.jsx` | 228 | N |
| `src/pages/sales/POEntry.jsx` | 4868 | Y |

### `Settings.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/Settings.jsx` | 81 | N |

### `SoftwareSubscriptions.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/SoftwareSubscriptions.jsx` | 1500 | N |

### `store` — 11 .jsx (11 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/store/StoreInventory.jsx` | 122 | Y |
| `src/pages/store/components/StoreUi.jsx` | 22 | Y |
| `src/pages/store/pages/AlertsPage.jsx` | 31 | Y |
| `src/pages/store/pages/DashboardPage.jsx` | 150 | Y |
| `src/pages/store/pages/ItemMasterPage.jsx` | 81 | Y |
| `src/pages/store/pages/PlannerPage.jsx` | 92 | Y |
| `src/pages/store/pages/ReconciliationPage.jsx` | 67 | Y |
| `src/pages/store/pages/ReportsPage.jsx` | 100 | Y |
| `src/pages/store/pages/SiteStockPage.jsx` | 71 | Y |
| `src/pages/store/pages/StoreMasterPage.jsx` | 75 | Y |
| `src/pages/store/pages/TransactionPages.jsx` | 151 | Y |

### `tracking` — 3 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/tracking/PAWorklist.jsx` | 146 | N |
| `src/pages/tracking/PenaltyLogs.jsx` | 73 | N |
| `src/pages/tracking/Tracking.jsx` | 68 | N |

### `userAccess` — 2 .jsx (1 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/userAccess/SiteEmployeeLoginsPanel.jsx` | 237 | Y |
| `src/pages/userAccess/UserManagementHub.jsx` | 43 | N |

### `userManagement` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/userManagement/UserManagementBulkImportModal.jsx` | 225 | N |

### `UserManagement.jsx` — 1 .jsx (0 erpUi)

| File | Lines | erpUi |
|---|---:|:---:|
| `src/pages/UserManagement.jsx` | 2585 | N |

## 5. Module-by-module screen summaries (routed)

### Public / auth
- **Routes:** 7 (6 screens / layouts, 1 redirects)
- **UI mix:** auth=4, portal=2
  - `/` → **Login** (auth)
  - `/register` → **Register** (auth)
  - `/forgot-password` → **ForgotPassword** (auth)
  - `/reset-password` → **ResetPassword** (auth)
  - `/candidate-portal/:token` → **CandidatePortal** (portal)
  - `/r/:token` → **CandidatePortal** (portal)
- **Redirects (1):**
  - `/*` redirect → /; splat

### App shell
- **Routes:** 3 (2 screens / layouts, 1 redirects)
- **UI mix:** dashboard=1, screen=1
  - `/app` → **Layout** (screen)
  - `/app/dashboard` → **Dashboard** (dashboard)
- **Redirects (1):**
  - `/app` redirect → /app/dashboard; index

### IEV / Fire tender
- **Routes:** 18 (13 screens / layouts, 5 redirects)
- **UI mix:** dashboard=1, form=1, list=1, screen=3, settings=7
  - `/app/fire-tender` → **FireTenderDashboard** (dashboard)
  - `/app/fire-tender/costing-hub/:tab` → **FireTenderCostingHub** (screen)
  - `/app/fire-tender/costing/:id` → **CostingSheet** (screen)
  - `/app/fire-tender/:id` → **FireTender** (screen)
  - `/app/fire-tender/quotation/:id` → **QuotationDetail** (form)
  - `/app/fire-tender/configuration/main-component` → **MainComponentPage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/manual-sub-category` → **ManualSubCategoryPage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/fire-tender-mail-template` → **FireTenderMailTemplatePage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/price-master` → **PriceMasterPage** (list; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/accessories` → **AccessoriesPage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/final-components` → **FinalComponentsPage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/vehicle-type` → **VehicleTypePage** (settings; guard: IevConfigGuard)
  - `/app/fire-tender/configuration/oc-sign-off` → **OcSignoffAssignmentPage** (settings; guard: IevConfigGuard)
- **Redirects (5):**
  - `/app/fire-tender/costing-hub` redirect → /app/fire-tender/costing-hub/tender
  - `/app/fire-tender/new` redirect → /app/fire-tender/costing-hub/tender
  - `/app/fire-tender/list` redirect → /app/fire-tender/costing-hub/tender
  - `/app/fire-tender/costing` redirect → /app/fire-tender/costing-hub/costing
  - `/app/fire-tender/quotation` redirect → /app/fire-tender/costing-hub/quotation

### Fire tender manufacturing
- **Routes:** 1 (1 screens / layouts, 0 redirects)
- **UI mix:** screen=1
  - `/app/fire-tender-manufacturing` → **FireTenderManufacturing** (screen)

### Fleet / vehicle mgmt
- **Routes:** 1 (1 screens / layouts, 0 redirects)
- **UI mix:** screen=1
  - `/app/fire-tender-vehicle-management` → **FireTenderVehicleManagement** (screen)

### Manpower enquiry
- **Routes:** 8 (6 screens / layouts, 2 redirects)
- **UI mix:** form=1, list=2, screen=2, settings=1
  - `/app/manpower` → **ManpowerManagement** (screen)
  - `/app/manpower/internal-quotation` → **InternalQuotationList** (list)
  - `/app/manpower/internal-quotation/:id` → **InternalQuotationForm** (form)
  - `/app/manpower/quotation` → **ManpowerQuotationList** (list)
  - `/app/manpower/configuration/:section` → **ManpowerConfiguration** (settings)
  - `/app/manpower/:id` → **ManpowerManagement** (screen)
- **Redirects (2):**
  - `/app/manpower/list` redirect → /app/manpower
  - `/app/manpower/configuration` redirect → /app/manpower/configuration/roles

### Commercial MT
- **Routes:** 13 (9 screens / layouts, 4 redirects)
- **UI mix:** dashboard=2, form=2, list=1, screen=4
  - `/app/commercial/manpower-training/manpower-management/dashboard` → **ManpowerManagement** (dashboard)
  - `/app/commercial/manpower-training/manpower-management` → **ManpowerManagement** (screen)
  - `/app/commercial/manpower-training/manpower-management/:id` → **ManpowerManagement** (screen)
  - `/app/commercial/manpower-training/internal-quotation` → **InternalQuotationList** (list)
  - `/app/commercial/manpower-training/internal-quotation/:id` → **InternalQuotationForm** (form)
  - `/app/commercial/manpower-training` → **Commercial** (screen)
  - `/app/commercial/manpower-training/dashboard` → **Commercial** (dashboard)
  - `/app/commercial/manpower-training/po-entry` → **Commercial** (form)
  - `/app/commercial/manpower-training/contact-log` → **Commercial** (screen)
- **Redirects (4):**
  - `/app/commercial` redirect → /app/commercial/manpower-training/po-entry
  - `/app/commercial/dashboard` redirect → /app/commercial/manpower-training/dashboard
  - `/app/commercial/po-entry` redirect → /app/commercial/manpower-training/po-entry
  - `/app/commercial/contact-log` redirect → /app/commercial/manpower-training/contact-log

### Commercial RM/AMC/IEV
- **Routes:** 8 (8 screens / layouts, 0 redirects)
- **UI mix:** dashboard=1, form=1, screen=6
  - `/app/commercial/rm-mm-amc-iev` → **CommercialRmMmAmcIev** (screen)
  - `/app/commercial/rm-mm-amc-iev/dashboard` → **CommercialRmMmAmcIev** (dashboard)
  - `/app/commercial/rm-mm-amc-iev/po-entry` → **CommercialRmMmAmcIev** (form)
  - `/app/commercial/rm-mm-amc-iev/contact-log` → **CommercialRmMmAmcIev** (screen)
  - `/app/commercial/rm-mm-amc-iev/manpower-management` → **CommercialRmManpowerManagement** (screen)
  - `/app/commercial/rm-mm-amc-iev/manpower-management/:id` → **CommercialRmManpowerManagement** (screen)
  - `/app/commercial/rm-mm-amc-iev/internal-quotation` → **CommercialRmInternalQuotation** (screen)
  - `/app/commercial/rm-mm-amc-iev/internal-quotation/:id` → **CommercialRmInternalQuotation** (screen)

### HR (+ nested calling-master, payroll, site-attendance)
- **Routes:** 74 (32 screens / layouts, 42 redirects)
- **UI mix:** dashboard=3, form=2, list=18, screen=9
  - `/app/hr/dashboard` → **HrDashboard** (dashboard)
  - `/app/hr/calling-master` → **HrCallingMaster** (list)
  - `/app/hr/calling-master` → **HrCallingMasterEntry** (list; index)
  - `/app/hr/calling-master/candidates` → **HrCallingMasterCandidates** (list)
  - `/app/hr/calling-master/referral` → **HrCallingMasterReferral** (list)
  - `/app/hr/calling-master/offer-generation` → **HrCallingMasterOffers** (list)
  - `/app/hr/calling-master/offer-response` → **HrCallingMasterOfferResponse** (list)
  - `/app/hr/calling-master/joining` → **HrCallingMasterJoining** (list)
  - `/app/hr/calling-master/iom` → **HrCallingMasterIom** (list)
  - `/app/hr/calling-master/conversion` → **HrCallingMasterConversion** (list)
  - `/app/hr/calling-master/dropdown-master` → **HrCallingMasterDropdowns** (list)
  - `/app/hr` → **HR** (screen)
  - `/app/hr/employee-master` → **HrEmployeeMaster** (list)
  - `/app/hr/payroll/salary` → **SalaryManagementLayout** (screen)
  - `/app/hr/payroll/salary/dashboard` → **SalaryManagementDashboard** (dashboard)
  - `/app/hr/payroll/salary/components` → **SalaryComponentsPage** (screen)
  - `/app/hr/payroll/salary/sites` → **SalarySiteSetupPage** (screen)
  - `/app/hr/payroll/salary/employees` → **SalaryEmployeesPage** (list)
  - `/app/hr/payroll/salary/employees/:id` → **SalaryEmployeeDetailPage** (list)
  - `/app/hr/payroll/salary/process` → **SalaryProcessPage** (form)
  - `/app/hr/payroll/salary/slips` → **SalarySlipsPage** (screen)
  - `/app/hr/payroll/salary/revisions` → **SalaryRevisionsPage** (screen)
  - `/app/hr/payroll/salary/reports` → **SalaryReportsPage** (list)
  - `/app/hr/payroll/salary/people-master/:id` → **RedirectEmployeeMasterId** (list)
  - `/app/hr/payroll/salary/employee-master/:id` → **RedirectEmployeeMasterId** (list)
  - `/app/hr/site-attendance` → **HrSiteAttendance** (screen)
  - `/app/hr/site-attendance/dashboard` → **HrSiteAttendanceDashboard** (dashboard)
  - `/app/hr/site-attendance/sites` → **HrSiteAttendanceSites** (list)
  - `/app/hr/site-attendance/people` → **HrSiteAttendancePeople** (list)
  - `/app/hr/site-attendance/attendance` → **HrSiteAttendanceEntry** (form)
  - `/app/hr/site-attendance/admin-view` → **HrSiteAttendanceAdminView** (screen)
  - `/app/hr/site-attendance/summary` → **HrSiteAttendanceSummary** (screen)
- **Redirects (42):**
  - `/app/hr/calling-master/database` redirect → /app/hr/calling-master
  - `/app/hr` redirect → employee-master; index
  - `/app/hr/salary-inputs` redirect → /app/hr/employee-master
  - `/app/hr/payroll` redirect → /app/hr/payroll/salary/dashboard
  - `/app/hr/payroll/dashboard` redirect → /app/hr/payroll/salary/dashboard
  - `/app/hr/payroll/entry` redirect → /app/hr/payroll/salary/dashboard
  - `/app/hr/payroll/year` redirect → /app/hr/payroll/salary/dashboard
  - `/app/hr/payroll/formula` redirect → /app/hr/payroll/salary/dashboard
  - `/app/hr/payroll/salary` redirect → dashboard; index
  - `/app/hr/payroll/salary/site-master` redirect → ../sites
  - `/app/hr/payroll/salary/formula-library` redirect → ../components
  - `/app/hr/payroll/salary/payroll-package-builder` redirect → ../sites
  - `/app/hr/payroll/salary/people-master` redirect → ../employees
  - `/app/hr/payroll/salary/people-master/new` redirect → ../employees
  - `/app/hr/payroll/salary/attendance-integration` redirect → ../employees
  - `/app/hr/payroll/salary/compliance-management` redirect → ../components
  - `/app/hr/payroll/salary/compliance/pf` redirect → ../components
  - `/app/hr/payroll/salary/compliance/esic` redirect → ../components
  - `/app/hr/payroll/salary/compliance/pt` redirect → ../components
  - `/app/hr/payroll/salary/compliance/tds` redirect → ../components
  - `/app/hr/payroll/salary/compliance/loans` redirect → ../components
  - `/app/hr/payroll/salary/payroll-processing` redirect → ../process
  - `/app/hr/payroll/salary/payroll-approval` redirect → ../process
  - `/app/hr/payroll/salary/payslips` redirect → ../slips
  - `/app/hr/payroll/salary/reports-exports` redirect → ../reports
  - `/app/hr/payroll/salary/employee-exit` redirect → ../employees
  - `/app/hr/payroll/salary/full-final-settlement` redirect → ../revisions
  - `/app/hr/payroll/salary/settings` redirect → ../dashboard
  - `/app/hr/payroll/salary/employee-master` redirect → ../employees
  - `/app/hr/payroll/salary/employee-master/new` redirect → ../employees
  - `/app/hr/payroll/salary/run` redirect → ../process
  - `/app/hr/payroll/salary/site-formulas` redirect → ../components
  - `/app/hr/payroll/salary/manual-inputs` redirect → ../employees
  - `/app/hr/payroll/salary/pf` redirect → ../components
  - `/app/hr/payroll/salary/esic` redirect → ../components
  - `/app/hr/payroll/salary/pt` redirect → ../components
  - `/app/hr/payroll/salary/tds` redirect → ../components
  - `/app/hr/payroll/salary/loans` redirect → ../components
  - `/app/hr/payroll/salary/register` redirect → ../reports
  - `/app/hr/payroll/salary/outputs` redirect → ../slips
  - `/app/hr/site-attendance` redirect → dashboard; index
  - `/app/hr/site-attendance/hr-managers` redirect → sites

### Attendance
- **Routes:** 3 (1 screens / layouts, 2 redirects)
- **UI mix:** screen=1
  - `/app/attendance` → **Attendance** (screen)
- **Redirects (2):**
  - `/app/salary` redirect → /app/hr/payroll/salary/dashboard
  - `/app/payroll` redirect → /app/hr/payroll/salary/dashboard

### People management
- **Routes:** 2 (2 screens / layouts, 0 redirects)
- **UI mix:** form=1, screen=1
  - `/app/people-management` → **PeopleManagement** (screen)
  - `/app/people-management/:personId` → **PeoplePersonProfile** (form)

### Compliance
- **Routes:** 8 (7 screens / layouts, 1 redirects)
- **UI mix:** dashboard=1, form=3, screen=3
  - `/app/ifsp-employee-compliance` → **IfspEmployeeCompliance** (screen; guard: ComplianceGuard)
  - `/app/general-compliance` → **GeneralCompliance** (screen; guard: ComplianceGuard)
  - `/app/compliance` → **CompliancePayrollLayoutPage** (screen; guard: ComplianceGuard)
  - `/app/compliance/dashboard` → **ComplianceDashboardPage** (dashboard)
  - `/app/compliance/forms` → **ComplianceFormsPage** (form)
  - `/app/compliance/forms/:formKey` → **WageStatutoryFormPage** (form)
  - `/app/compliance/payroll-process` → **CompliancePayrollProcessPage** (form)
- **Redirects (1):**
  - `/app/compliance` redirect → dashboard; index

### Admin ops
- **Routes:** 67 (47 screens / layouts, 20 redirects)
- **UI mix:** dashboard=3, form=2, list=12, screen=28, settings=2
  - `/app/ifsp-employee-compliance` → **IfspEmployeeCompliance** (screen; guard: ComplianceGuard)
  - `/app/ifsp-employee-master` → **IfspEmployeeMaster** (list)
  - `/app/ifsp-employee-attendance` → **IfspEmployeeAttendance** (screen)
  - `/app/ifsp-employee-payroll` → **IfspEmployeePayroll** (screen)
  - `/app/ifsp-employee-leaves` → **IfspEmployeeLeaves** (screen)
  - `/app/store-inventory` → **StoreInventory** (screen)
  - `/app/gate-pass` → **GatePass** (screen)
  - `/app/admin/dashboard` → **AdminOpsDashboard** (dashboard)
  - `/app/admin/recruitment` → **AdminRecruitmentLayout** (screen)
  - `/app/admin/recruitment` → **AdminRecruitmentDashboard** (dashboard; index)
  - `/app/admin/recruitment/requisitions` → **AdminRecruitmentRequisitions** (screen)
  - `/app/admin/recruitment/candidates` → **AdminRecruitmentCandidates** (list)
  - `/app/admin/recruitment/candidates/:candidateId` → **AdminRecruitmentCandidate360** (list)
  - `/app/admin/recruitment/interviews` → **AdminRecruitmentInterviews** (screen)
  - `/app/admin/recruitment/offers` → **AdminRecruitmentOffers** (screen)
  - `/app/admin/recruitment/documents` → **AdminRecruitmentDocuments** (screen)
  - `/app/admin/recruitment/joining` → **AdminRecruitmentJoining** (screen)
  - `/app/admin/recruitment/conversion` → **AdminRecruitmentConversion** (screen)
  - `/app/admin/recruitment/communication` → **AdminRecruitmentCommunication** (screen)
  - `/app/admin/recruitment/reports` → **AdminRecruitmentReports** (list)
  - `/app/admin/recruitment/settings` → **AdminRecruitmentSettings** (settings)
  - `/app/admin/employee/master` → **IfspEmployeeMaster** (list)
  - `/app/admin/employee/master/:employeeId` → **IfspEmployeeMasterDetail** (list)
  - `/app/admin/employee/onboarding` → **EmployeeOnboardingPage** (screen)
  - `/app/admin/employee/attendance-inputs` → **EmployeeAttendanceInputsPage** (screen)
  - `/app/admin/employee/attendance-daily` → **EmployeeAttendanceDailyPage** (screen)
  - `/app/admin/employee/national-holidays` → **NationalPublicHolidaysPage** (screen)
  - `/app/admin/employee/leave-management` → **EmployeeLeaveManagementPage** (screen)
  - `/app/admin/employee/leaves-permissions` → **EmployeeLeavesPage** (screen)
  - `/app/admin/employee/tour-approvals` → **EmployeeTourApprovalsPage** (screen)
  - `/app/admin/employee/exit-ff` → **EmployeeFnfPage** (screen)
  - `/app/admin/employee/policies` → **EmployeePoliciesPage** (screen)
  - `/app/admin/employee/official-letters` → **OfficialLettersPage** (screen)
  - `/app/admin/employee/inactive` → **InactiveEmployeesPage** (list)
  - `/app/admin/salary-admin` → **SalaryAdminLayoutPage** (screen; guard: SalaryAdminGuard)
  - `/app/admin/salary-admin/dashboard` → **SalaryDashboardPage** (dashboard)
  - `/app/admin/salary-admin/salary-components` → **SalaryComponentsMasterPage** (list)
  - `/app/admin/salary-admin/payroll-rules` → **PayrollRuleMasterPage** (list)
  - `/app/admin/salary-admin/ctc-calculator` → **CtcCalculatorPage** (form)
  - `/app/admin/salary-admin/salary-processing` → **SalaryProcessingPage** (form)
  - `/app/admin/salary-admin/reports` → **SalaryProcessReportPage** (list)
  - `/app/admin/salary-admin/mis` → **PayrollMisRoutePage** (screen)
  - `/app/admin/payroll-mis` → **PayrollMisRoutePage** (screen)
  - `/app/admin/salary-admin/salary-master/:employeeId` → **SalaryMasterCtcRedirect** (list; guard: SalaryAdminGuard)
  - `/app/admin/rules-console` → **RulesConsolePage** (settings; guard: RulesConsoleGuard)
  - `/app/admin/alerts-notifications` → **AdminOpsAlerts** (screen)
  - `/app/admin/reports-analytics` → **AdminOpsReports** (list)
- **Redirects (20):**
  - `/app/admin/compliance/*` redirect → /app/compliance/dashboard; splat
  - `/app/admin` redirect → /app/admin/dashboard
  - `/app/admin/recruitment/referral` redirect → /app/admin/recruitment/candidates
  - `/app/admin/recruitment/offer-generation` redirect → /app/admin/recruitment/offers
  - `/app/admin/recruitment/offer-response` redirect → /app/admin/recruitment/offers
  - `/app/admin/recruitment/iom` redirect → /app/admin/recruitment/joining
  - `/app/admin/recruitment/dropdown-master` redirect → /app/admin/recruitment/settings
  - `/app/admin/recruitment/classic/*` redirect → /app/admin/recruitment; splat
  - `/app/admin/payroll/*` redirect → /app/admin/dashboard; splat
  - `/app/admin/employee/all` redirect → /app/all-employees
  - `/app/admin/employee/attendance-sheets` redirect → /app/admin/dashboard
  - `/app/admin/employee/compliance-documents` redirect → /app/admin/dashboard
  - `/app/admin/employee/salary-inputs` redirect → /app/admin/dashboard
  - `/app/admin/store/*` redirect → /app/admin/dashboard; splat
  - `/app/admin/gate/*` redirect → /app/admin/dashboard; splat
  - `/app/admin/salary-admin` redirect → dashboard; index
  - `/app/admin/salary-admin/salary-master` redirect → /app/admin/salary-admin/dashboard
  - `/app/admin/misc/*` redirect → /app/admin/dashboard; splat
  - `/app/admin/settings-masters` redirect → /app/admin/dashboard
  - `/app/admin-operations/*` redirect → /app/admin/dashboard; splat

### Billing (+ legacy tracking/reports redirects)
- **Routes:** 7 (1 screens / layouts, 6 redirects)
- **UI mix:** screen=1
  - `/app/billing/*` → **Billing** (screen; splat)
- **Redirects (6):**
  - `/app/tracking` redirect → /app/billing/tracking
  - `/app/tracking/pa-worklist` redirect → /app/billing/tracking/pa-worklist
  - `/app/tracking/penalty-logs` redirect → /app/billing/tracking/penalty-logs
  - `/app/reports` redirect → /app/billing/reports
  - `/app/reports/outstanding` redirect → /app/billing/reports
  - `/app/reports/deduction-analysis` redirect → /app/billing/reports

### Operations
- **Routes:** 24 (23 screens / layouts, 1 redirects)
- **UI mix:** auth=2, dashboard=3, form=1, list=2, screen=15
  - `/app/operations` → **Operations** (screen)
  - `/app/operations/expenses` → **Operations** (screen)
  - `/app/operations/expenses/summary` → **Operations** (screen)
  - `/app/operations/expenses/site-dashboard` → **Operations** (dashboard)
  - `/app/operations/advances` → **Operations** (screen)
  - `/app/operations/advances/approval` → **Operations** (screen)
  - `/app/operations/advances/settlement` → **Operations** (screen)
  - `/app/operations/advances/outstanding` → **Operations** (screen)
  - `/app/operations/medical` → **Operations** (screen)
  - `/app/operations/medical/due` → **Operations** (screen)
  - `/app/operations/medical/centers` → **Operations** (screen)
  - `/app/operations/medical/:id` → **Operations** (screen)
  - `/app/operations/accommodation` → **Operations** (screen)
  - `/app/operations/accommodation/rent-entry` → **Operations** (form)
  - `/app/operations/accommodation/dashboard` → **Operations** (dashboard)
  - `/app/operations/accommodation/history` → **Operations** (screen)
  - `/app/operations/accommodation/:id` → **Operations** (screen)
  - `/app/operations/dahej-expenses/register` → **Operations** (auth)
  - `/app/operations/dahej-expenses/dashboard` → **Operations** (dashboard)
  - `/app/operations/dahej-expenses/monthly-register` → **Operations** (auth)
  - `/app/operations/dahej-expenses/vehicle-master` → **Operations** (list)
  - `/app/operations/dahej-expenses/booking-locations` → **Operations** (screen)
  - `/app/operations/dahej-expenses/reports` → **Operations** (list)
- **Redirects (1):**
  - `/app/operations/dahej-expenses` redirect → /app/operations/dahej-expenses/register

### Projects hubs
- **Routes:** 19 (19 screens / layouts, 0 redirects)
- **UI mix:** dashboard=2, form=3, list=2, screen=12
  - `/app/projects-management` → **ProjectsManagement** (screen)
  - `/app/projects-billing` → **ProjectsBilling** (screen)
  - `/app/projects/po` → **ProjectsPoHub** (screen)
  - `/app/projects/po/po-entry` → **ProjectsPoHub** (form)
  - `/app/projects/po/contact-log` → **ProjectsPoHub** (screen)
  - `/app/projects/enquiry` → **ProjectsEnquiryHub** (screen)
  - `/app/projects/enquiry/enquiry-dashboard` → **ProjectsEnquiryHub** (dashboard)
  - `/app/projects/enquiry/enquiry-entry` → **ProjectsEnquiryHub** (form)
  - `/app/projects/enquiry/enquiry-database` → **ProjectsEnquiryHub** (list)
  - `/app/projects/enquiry/enquiry-kpi` → **ProjectsEnquiryHub** (screen)
  - `/app/projects/enquiry/enquiry-dropdown` → **ProjectsEnquiryHub** (screen)
  - `/app/projects/quotation` → **ProjectsQuotationHub** (screen)
  - `/app/projects/quotation/quotation-dashboard` → **ProjectsQuotationHub** (dashboard)
  - `/app/projects/quotation/quotation-entry` → **ProjectsQuotationHub** (form)
  - `/app/projects/quotation/quotation-summary` → **ProjectsQuotationHub** (screen)
  - `/app/projects/quotation/quotation-list` → **ProjectsQuotationHub** (list)
  - `/app/projects/quotation/quotation-board` → **ProjectsQuotationHub** (screen)
  - `/app/projects/quotation/quotation-dropdown` → **ProjectsQuotationHub** (screen)
  - `/app/projects/quotation/quotation-templates` → **ProjectsQuotationHub** (screen)

### Procurement
- **Routes:** 1 (1 screens / layouts, 0 redirects)
- **UI mix:** screen=1
  - `/app/procurement` → **Procurement** (screen)

### AMC
- **Routes:** 13 (13 screens / layouts, 0 redirects)
- **UI mix:** list=2, screen=10, settings=1
  - `/app/amc` → **AMC** (screen)
  - `/app/amc/customers` → **AMC** (screen)
  - `/app/amc/contracts` → **AMC** (screen)
  - `/app/amc/sites` → **AMC** (screen)
  - `/app/amc/assets` → **AMC** (screen)
  - `/app/amc/pm-schedule` → **AMC** (screen)
  - `/app/amc/complaints` → **AMC** (screen)
  - `/app/amc/visits` → **AMC** (screen)
  - `/app/amc/technicians` → **AMC** (screen)
  - `/app/amc/service-reports` → **AMC** (list)
  - `/app/amc/alerts` → **AMC** (screen)
  - `/app/amc/reports` → **AMC** (list)
  - `/app/amc/settings` → **AMC** (settings)

### Finance
- **Routes:** 14 (14 screens / layouts, 0 redirects)
- **UI mix:** form=1, list=2, screen=10, settings=1
  - `/app/accounts-finance` → **AccountsFinance** (screen)
  - `/app/accounts-finance/sites` → **AccountsFinance** (screen)
  - `/app/accounts-finance/revenue-heads` → **AccountsFinance** (screen)
  - `/app/accounts-finance/expense-heads` → **AccountsFinance** (screen)
  - `/app/accounts-finance/budget-versions` → **AccountsFinance** (screen)
  - `/app/accounts-finance/revenue` → **AccountsFinance** (screen)
  - `/app/accounts-finance/expenses` → **AccountsFinance** (screen)
  - `/app/accounts-finance/budget-vs-actual` → **AccountsFinance** (screen)
  - `/app/accounts-finance/cost-allocation` → **AccountsFinance** (screen)
  - `/app/accounts-finance/import-export` → **AccountsFinance** (screen)
  - `/app/accounts-finance/reports` → **AccountsFinance** (list)
  - `/app/accounts-finance/reports/site-ledger` → **AccountsFinance** (list)
  - `/app/accounts-finance/bank-formats` → **AccountsFinance** (form)
  - `/app/accounts-finance/settings` → **AccountsFinance** (settings)

### Marketing
- **Routes:** 17 (17 screens / layouts, 0 redirects)
- **UI mix:** dashboard=2, list=4, screen=6, tracker=5
  - `/app/marketing` → **MarketingDashboard** (dashboard)
  - `/app/marketing/lead-dashboard` → **LeadDashboard** (dashboard)
  - `/app/marketing/lead-master` → **LeadMaster** (list)
  - `/app/marketing/enquiry-master` → **EnquiryMaster** (list)
  - `/app/marketing/quotation-tracker` → **QuotationTracker** (tracker)
  - `/app/marketing/quotation-tracker/costing` → **CostingSheetList** (tracker)
  - `/app/marketing/quotation-tracker/costing/:id` → **CostingSheetDetail** (tracker)
  - `/app/marketing/quotation-tracker/internal-quotation` → **MarketingInternalQuotationList** (tracker)
  - `/app/marketing/quotation-tracker/internal-quotation/:id` → **MarketingInternalQuotationForm** (tracker)
  - `/app/marketing/mail-templates` → **QuotationTemplatePage** (screen)
  - `/app/marketing/follow-up-planner` → **FollowUpPlanner** (screen)
  - `/app/marketing/client-master` → **ClientMaster** (list)
  - `/app/marketing/product-catalog` → **ProductCatalog** (screen)
  - `/app/marketing/purchase-orders` → **PurchaseOrders** (screen)
  - `/app/marketing/expo-seminar` → **ExpoSeminar** (screen)
  - `/app/marketing/gst-upload` → **GSTUpload** (screen)
  - `/app/marketing/reports-analytics` → **MarketingReports** (list)

### Maintenance
- **Routes:** 16 (16 screens / layouts, 0 redirects)
- **UI mix:** dashboard=1, form=1, list=3, screen=6, tracker=5
  - `/app/maintenance` → **MaintenanceDashboard** (dashboard)
  - `/app/maintenance/enquiry-master` → **MaintenanceEnquiryMaster** (list)
  - `/app/maintenance/quotation-tracker` → **MaintenanceQuotationTracker** (tracker)
  - `/app/maintenance/quotation-tracker/costing` → **MaintenanceCostingSheetList** (tracker)
  - `/app/maintenance/quotation-tracker/costing/:id` → **MaintenanceCostingSheetDetail** (tracker)
  - `/app/maintenance/quotation-tracker/internal-quotation` → **MaintenanceInternalQuotationList** (tracker)
  - `/app/maintenance/quotation-tracker/internal-quotation/:id` → **MaintenanceInternalQuotationForm** (tracker)
  - `/app/maintenance/mail-templates` → **MaintenanceQuotationTemplatePage** (screen)
  - `/app/maintenance/follow-up-planner` → **MaintenanceFollowUpPlanner** (screen)
  - `/app/maintenance/client-master` → **MaintenanceClientMaster** (list)
  - `/app/maintenance/product-catalog` → **MaintenanceProductCatalog** (screen)
  - `/app/maintenance/purchase-orders` → **MaintenancePurchaseOrders** (screen)
  - `/app/maintenance/mm-po-entry` → **MaintenanceMmPoEntry** (form)
  - `/app/maintenance/expo-seminar` → **MaintenanceExpoSeminar** (screen)
  - `/app/maintenance/gst-upload` → **MaintenanceGSTUpload** (screen)
  - `/app/maintenance/reports-analytics` → **MaintenanceReports** (list)

### CRM outreach
- **Routes:** 1 (1 screens / layouts, 0 redirects)
- **UI mix:** screen=1
  - `/app/crm-outreach` → **CrmOutreach** (screen)

### IT/IS + LMS + admin tools
- **Routes:** 6 (6 screens / layouts, 0 redirects)
- **UI mix:** dashboard=1, list=1, screen=3, settings=1
  - `/app/indus-lms-trainings` → **IndusLmsTrainings** (screen)
  - `/app/user-management` → **UserManagement** (screen)
  - `/app/all-employees` → **AllEmployeesDirectoryPage** (list)
  - `/app/software-subscriptions-reminders` → **SoftwareSubscriptions** (screen)
  - `/app/api-health` → **ApiHealthDashboard** (dashboard)
  - `/app/settings` → **Settings** (settings)

### Billing client-side tab paths (from Billing.jsx string literals)
- `/app/billing/tracking`
