/**
 * Billing Cycle Tracker — Supabase RPCs against billing schema.
 * Invoice link/unlink runs in DB triggers on billing.invoice (same transaction).
 * Client also reconciles existing tax invoices so months with bills show as raised.
 */

import { supabase } from '../lib/supabase';
import { fetchInvoices } from './billingApi';
import { enrichTrackerPeriodsWithInvoices } from '../utils/billingCycleTracker';

const BILLING_SCHEMA = 'billing';

function billingRpc(fn, args = {}) {
  return supabase.schema(BILLING_SCHEMA).rpc(fn, args);
}

function mapTrackerRow(r) {
  if (!r) return null;
  return {
    periodId: r.period_id,
    configId: r.config_id,
    siteId: r.site_id,
    vertical: r.vertical,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    dueDate: r.due_date,
    invoiceId: r.invoice_id,
    raisedDate: r.raised_date,
    manuallyRaised: !!r.manually_raised,
    manualRaisedDate: r.manual_raised_date,
    manualRaisedReason: r.manual_raised_reason,
    manualRaisedAt: r.manual_raised_at,
    manualRaisedBy: r.manual_raised_by,
    autoConfirmedAt: r.auto_confirmed_at,
    cycleType: r.cycle_type,
    cycleDeadlineOffsetDays: r.cycle_deadline_offset_days,
    configActive: r.config_active,
    clientLegalName: r.client_legal_name,
    locationName: r.location_name,
    ocNumber: r.oc_number,
    poWoNumber: r.po_wo_number,
    refCode: r.ref_code,
    poId: r.po_id,
    onboardedOn: r.onboarded_on,
    taxInvoiceNumber: r.tax_invoice_number,
    invoiceIssueDate: r.invoice_issue_date,
    derivedStatus: r.derived_status,
  };
}

/**
 * Sync cyclic configs, ensure period rows, return derived-status rows
 * enriched from created tax invoices (month / site match → raised).
 */
export async function fetchBillingCycleTracker({
  vertical = null,
  status = null,
  search = '',
  from = null,
  to = null,
} = {}) {
  const { data, error } = await billingRpc('list_billing_cycle_tracker', {
    p_vertical: vertical && vertical !== 'all' ? vertical : null,
    p_status: status || null,
    p_search: search || null,
    p_from: from || null,
    p_to: to || null,
  });
  if (error) throw error;

  const periods = (data || []).map(mapTrackerRow);
  let invoices = [];
  try {
    invoices = await fetchInvoices();
  } catch (invErr) {
    console.warn('Billing tracker: could not load invoices for raised enrichment', invErr);
  }
  return enrichTrackerPeriodsWithInvoices(periods, invoices);
}

/** Legacy/paper only — requires date + reason. Real invoice later overwrites link but keeps manual audit. */
export async function markBillingCyclePeriodManual(periodId, raisedDate, reason) {
  const { data, error } = await billingRpc('mark_billing_cycle_period_manual', {
    p_period_id: periodId,
    p_raised_date: raisedDate,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function syncBillingCycleConfigsFromPos() {
  const { data, error } = await billingRpc('sync_billing_cycle_configs_from_pos');
  if (error) throw error;
  return data;
}
