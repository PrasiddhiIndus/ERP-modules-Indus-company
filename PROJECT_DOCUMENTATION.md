# INDUS ERP CORE - Complete Technical Documentation

**Project:** ERP-modules-Indus-company  
**Audience:** Developers, IT Team, QA, Deployment/Support Engineers  
**Purpose:** Single source of truth for architecture, modules, workflows, data model, operations, and troubleshooting.

---

## 1) Executive Overview

INDUS ERP CORE is a modular ERP platform covering business workflows across:

- Authentication and role-based access
- HR and Compliance
- Admin and Employee Master
- Sales and Marketing
- Billing and E-Invoicing
- Operations and Vehicle/Fire Tender management
- Projects and Fire Tender workflows
- Procurement, AMC, Finance
- Store/Inventory intelligence architecture

The system is built as a React + Supabase application with route-level access control and module-wise data models.

---

## 2) Technology Stack

- **Frontend:** React 18, Vite, React Router
- **Styling/UI:** Tailwind CSS, Lucide React, React Icons
- **Backend Platform:** Supabase (PostgreSQL, Auth, Storage, RLS)
- **Document/Export:** jsPDF, jspdf-autotable, xlsx, papaparse
- **Security Model:** Supabase Auth + Row Level Security (RLS) + role/team/module checks

---

## 3) Access Control and Security

### 3.1 Role System

- **Admin:** Full module access
- **Manager:** Team/module scoped access
- **Executive:** Team-restricted access

Access is controlled by profile fields such as role, team, and allowed modules.

### 3.2 Core Security Controls

- Route guarding for protected paths
- Sidebar rendering based on user permissions
- RLS on key domain tables
- Auth-linked ownership (`auth.uid()`) for user-scoped records
- Secure backend mediation for external API integrations (e-invoice)

---

## 4) Module Inventory

### 4.1 Core Platform Modules

- Dashboard / Overview
- HR Management
- Compliance (IFSPL + General)
- Admin
- Sales
- Marketing
- Billing
- Operations
- Projects
- Fire Tender
- Procurement
- AMC
- Finance/Accounts
- Settings

### 4.2 Key Functional Highlights

- Multi-module ERP in one interface
- Shared auth/session context and role-aware navigation
- Operational workflows with auditability
- Billing lifecycle from WO/PO to invoice/e-invoice
- Vehicle and workforce data systems

---

## 5) Billing Module (Process + Data + Controls)

### 5.1 Functional Requirements Implemented

- OC number based data linking
- WO/PO-driven billing structure
- Quantity-edit-only controls (rate/tax locking by source)
- Billing method selection: Per Day / Monthly / Lump Sum
- Reverse traceability from invoice back to source contract data

### 5.2 Critical Controls

- Approval matrix for billing actions
- Senior approval gate for rate/method-sensitive changes
- Credit note action governance
- Billing history retention for cancelled flows
- Invoice-linked document attachment support

### 5.3 Billing Data Model (Schema: `billing`)

Core entities include:

- `billing.po_wo`
- `billing.po_rate_category`
- `billing.po_contact_log`
- `billing.invoice`
- `billing.invoice_line_item`
- `billing.invoice_attachment`
- `billing.credit_debit_note`
- `billing.payment_advice`

### 5.4 Billing Operational Flow

1. Commercial PO/WO preparation and approval state
2. Invoice creation from approved PO/WO source
3. Invoice management and validation
4. E-invoice generation (if applicable)
5. Tax invoice PDF and document outputs
6. Credit/debit note and payment tracking

### 5.5 Billing Security

- RLS enabled on billing tables
- Billing access helper policy function
- Access allowed based on profile role/team/modules and bootstrap-safe conditions

---

## 6) E-Invoice Integration (Government + ClearTax Path)

### 6.1 Integration Principles

- Do not call IRP/GSP directly from browser frontend
- Frontend calls secured backend endpoint
- Backend maps internal invoice -> valid e-invoice payload
- Backend handles auth token + IRN generation + cancellation flow
- Backend returns IRN/Ack/QR data to ERP

### 6.2 API Workflow

1. Generate payload from invoice + source data
2. Authenticate (GSP/direct IRP method)
3. Submit generate IRN request
4. Persist IRN response artifacts
5. Display in ERP generated e-invoice screens
6. Support cancel IRN endpoint as per policy window

### 6.3 Data Standards

- GST-compliant payload sections (seller, buyer, items, value, doc details)
- Consistent layout between invoice/e-invoice/credit-note display templates

---

## 7) Marketing and Quotation Revision System

### 7.1 Implemented Capabilities

- Quotation revision creation and tracking
- Follow-up planner synchronization
- Dashboard notification behavior for due revisions
- Revision history log visibility
- Date/status-based revision state management (Pending/Overdue/Completed)

### 7.2 Supporting Data Structures

- Quotation revisions history table
- Notifications table
- Follow-up date extensions on quotation records
- Index and policy setup for performance and access control

---

## 8) IFSPL Employee Master Module

### 8.1 Functional Scope

- Full employee master lifecycle with extensive fields
- Search, sort, filter, pagination, import/export workflows
- Status transitions (active/inactive) with reason capture
- Department and experience-oriented reporting views

### 8.2 Data Characteristics

- Rich employee profile records
- Optional history/audit tables for changes
- Role and ownership based data access
- Integration readiness with payroll/compliance/attendance

---

## 9) Vehicle and Fire Tender Management

### 9.1 Capabilities

- Vehicle master registry
- Driver management
- Trip tracking and utilization
- Documents with expiry monitoring
- Maintenance lifecycle and service tracking

### 9.2 Operational Benefits

- Fleet visibility and readiness tracking
- Compliance monitoring for expiring vehicle documents
- Service planning and maintenance history continuity

---

## 10) Store & Inventory Intelligence Architecture

Designed as enterprise, multi-layer inventory architecture:

1. Master layer (stores/items/categories/locations/policies)
2. Transaction layer (inward/outward/returns/adjustments)
3. Movement/transit layer (transfer + dispatch + receiving)
4. Lifecycle/control layer (repair/compliance/state control)
5. Predictive layer (forecast/reorder/risk)
6. Reporting/dashboard layer (operations + management + audit)

### 10.1 Enterprise Design Goals

- Multi-location stock visibility
- Traceable movement and ownership
- Safety-critical controls
- Predictive inventory intelligence and alerting

---

## 11) Environment and Setup

### 11.1 Required Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional integration variables for e-invoice backend endpoints and supplier defaults

### 11.2 Standard Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

### 11.3 Supabase Configuration Notes

- Ensure required schemas (e.g. `billing`) are exposed
- Ensure policies and tables are migrated before functional testing
- Validate storage bucket policies for document-heavy modules

---

## 12) Operational Troubleshooting Guide

### 12.1 Common Failure Categories

- Environment mismatch (.env missing/wrong)
- Network/DNS/firewall restrictions
- Supabase URL/redirect configuration mismatch
- RLS policy denial for authenticated user context
- Browser cache/site-data interference

### 12.2 Practical Troubleshooting Sequence

1. Validate `.env` keys and restart dev server
2. Confirm Supabase project reachability from affected machine
3. Verify auth URL configuration and redirect origins
4. Check browser console/network for API errors
5. Validate schema exposure and policy access in Supabase
6. Compare behavior on alternate network/DNS

---

## 13) Development and IT Handover Notes

### 13.1 For Developers

- Follow module boundaries and existing route conventions
- Preserve role-based restrictions in every new screen/API
- Keep data traceability for billing-sensitive modules
- Add migration-safe SQL (`IF NOT EXISTS`, idempotent constraints/policies)

### 13.2 For IT/Deployment Team

- Maintain environment variable consistency across systems
- Track Supabase policy/schema changes with release notes
- Validate critical workflows after each deployment:
  - Login and role access
  - Billing save/load
  - E-invoice generation path
  - Storage upload/read operations

### 13.3 For QA Team

- Run module smoke tests on each release
- Include permission tests per role
- Verify workflow integrity across linked modules
- Validate document/PDF outputs where business-critical

---

## 14) Current Documentation Policy

This file is the **single authoritative Markdown document** for the project.

Any future technical, process, or module documentation updates should be made here under appropriate sections to keep one unified source for engineering and IT teams.

---

## 15) Summary

INDUS ERP CORE is a comprehensive modular ERP with strong role-based architecture, operational workflows, and domain-specific modules for billing, marketing, HR, inventory, and fleet operations.

This document consolidates project context into one professional technical reference so new developers and IT teams can quickly understand:

- what the system does,
- how modules are structured,
- how critical flows operate,
- and how to run/support the platform reliably.

