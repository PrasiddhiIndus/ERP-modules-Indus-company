/**
 * Persist Axis bank payment format sheets in finance schema.
 */

import { supabase } from "../../../lib/supabase";

const SHEETS = "bank_format_sheets";
const LINES = "bank_format_lines";

function table(name) {
  return supabase.schema("finance").from(name);
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

export function rowFromDb(line) {
  if (!line) return null;
  return {
    id: line.id,
    salaryLineId: line.salary_line_id || null,
    employeeMasterId: line.employee_master_id || "",
    employeeCode: line.employee_code || "",
    paymentMethod: line.payment_method || "N",
    paymentAmount: Number(line.payment_amount) || 0,
    activationDate: line.activation_date || "",
    beneficiaryName: line.beneficiary_name || "",
    beneficiaryAccountNo: line.beneficiary_account_no || "",
    blank: line.blank || "",
    emailBody: line.email_body || "",
    debitAccountNo: line.debit_account_no || "",
    crnNo: line.crn_no || "",
    receiverIfsc: line.receiver_ifsc || "",
    receiverAccountType: line.receiver_account_type || "10",
    sortOrder: line.sort_order ?? 0,
  };
}

export function rowToDbPayload(row, sheetId, sortOrder) {
  return {
    sheet_id: sheetId,
    salary_line_id: row.salaryLineId || null,
    employee_master_id: row.employeeMasterId != null ? String(row.employeeMasterId) : null,
    employee_code: row.employeeCode || null,
    payment_method: row.paymentMethod || "N",
    payment_amount: Number(row.paymentAmount) || 0,
    activation_date: row.activationDate || null,
    beneficiary_name: row.beneficiaryName || null,
    beneficiary_account_no: row.beneficiaryAccountNo || null,
    blank: row.blank || null,
    email_body: row.emailBody || null,
    debit_account_no: row.debitAccountNo || null,
    crn_no: row.crnNo || null,
    receiver_ifsc: row.receiverIfsc || null,
    receiver_account_type: row.receiverAccountType || "10",
    sort_order: sortOrder,
  };
}

/** Load saved sheet + lines for a month key, or null if none. */
export async function fetchBankFormatSheet(monthKeyStr) {
  const key = String(monthKeyStr || "").trim();
  if (!key) return null;

  const { data: sheet, error } = await table(SHEETS).select("*").eq("month_key", key).maybeSingle();
  if (error) throw error;
  if (!sheet?.id) return null;

  const { data: lines, error: lineErr } = await table(LINES)
    .select("*")
    .eq("sheet_id", sheet.id)
    .order("sort_order", { ascending: true });
  if (lineErr) throw lineErr;

  return {
    sheet,
    rows: (lines || []).map(rowFromDb),
  };
}

/**
 * Upsert sheet header + replace all lines for the month.
 * @returns {{ sheetId: string }}
 */
export async function saveBankFormatSheet({
  monthKey: monthKeyStr,
  payYear,
  payMonth,
  salaryRunId,
  debitAccountNo,
  defaultAccountType = "10",
  rows = [],
} = {}) {
  const key = String(monthKeyStr || "").trim();
  if (!key) throw new Error("Select a salary month before saving.");

  const userId = await currentUserId();
  const now = new Date().toISOString();

  const header = {
    month_key: key,
    pay_year: Number(payYear),
    pay_month: Number(payMonth),
    salary_run_id: salaryRunId || null,
    debit_account_no: String(debitAccountNo || "").trim() || "920030061304640",
    default_account_type: String(defaultAccountType || "10").trim() || "10",
    updated_at: now,
    updated_by: userId,
  };

  const existing = await table(SHEETS).select("id").eq("month_key", key).maybeSingle();
  if (existing.error) throw existing.error;

  let sheetId = existing.data?.id || null;
  if (sheetId) {
    const { error } = await table(SHEETS).update(header).eq("id", sheetId);
    if (error) throw error;
  } else {
    const { data, error } = await table(SHEETS)
      .insert({ ...header, created_by: userId, created_at: now })
      .select("id")
      .single();
    if (error) throw error;
    sheetId = data.id;
  }

  const { error: delErr } = await table(LINES).delete().eq("sheet_id", sheetId);
  if (delErr) throw delErr;

  if (rows.length) {
    const payloads = rows.map((r, i) => rowToDbPayload(r, sheetId, i));
    const { error: insErr } = await table(LINES).insert(payloads);
    if (insErr) throw insErr;
  }

  return { sheetId };
}
