/**
 * Persist compliance statutory IDs (UAN / ESIC IP) and month filing snapshots.
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { MONTH_LINES_TABLE } from "../../adminOperations/salaryAdmin/salaryMonthProcessing";
import { digitsOnly, normalizeEmpCode } from "./complianceImport";

export const COMPLIANCE_FILINGS_TABLE = "admin_compliance_filings";

function errText(err) {
  return `${err?.message || ""} ${err?.details || ""} ${err?.code || ""}`;
}

function isMissingTable(err) {
  const msg = errText(err);
  return (
    err?.code === "PGRST205" ||
    err?.code === "42P01" ||
    /schema cache|does not exist|Could not find the table/i.test(msg)
  );
}

function compactRow(row = {}, kind) {
  if (kind === "epf") {
    return {
      employeeMasterId: row.employeeMasterId,
      employeeCode: row.employeeCode || "",
      uan: digitsOnly(row.uan),
      name: row.name || "",
      grossWages: Number(row.grossWages) || 0,
      epfWages: Number(row.epfWages) || 0,
      ncpDays: Number(row.ncpDays) || 0,
      refundOfAdvance: Number(row.refundOfAdvance) || 0,
      age58Plus: Boolean(row.age58Plus),
      epsWagesManual: Boolean(row.epsWagesManual),
      epsWages: Number(row.epsWages) || 0,
    };
  }
  return {
    employeeMasterId: row.employeeMasterId,
    employeeCode: row.employeeCode || "",
    ipNumber: digitsOnly(row.ipNumber),
    ipName: row.ipName || row.name || "",
    daysPaid: Number(row.daysPaid) || 0,
    monthlyWages: Number(row.monthlyWages) || 0,
    reasonCode: row.reasonCode ?? "",
    lastWorkingDay: row.lastWorkingDay || "",
  };
}

function buildIdMap(epfRows = [], esicRows = [], parsed = null) {
  const map = {};
  const put = (code, patch) => {
    const key = String(code || "").trim();
    if (!key) return;
    map[key] = { ...(map[key] || {}), ...patch };
  };
  if (parsed?.byCode) {
    for (const [code, row] of parsed.byCode) {
      const uan = digitsOnly(row.uan);
      const esicNo = digitsOnly(row.ipNumber);
      const patch = {};
      if (uan.length === 12) patch.uan = uan;
      if (esicNo.length === 10) patch.esic_no = esicNo;
      if (Object.keys(patch).length) put(row.employeeCode || code, patch);
    }
  }
  for (const row of epfRows) {
    const uan = digitsOnly(row.uan);
    if (uan.length === 12) put(row.employeeCode, { uan });
  }
  for (const row of esicRows) {
    const esicNo = digitsOnly(row.ipNumber);
    if (esicNo.length === 10) put(row.employeeCode, { esic_no: esicNo });
  }
  return map;
}

function collectIdPatches(epfRows = [], esicRows = []) {
  const byId = new Map();
  const touch = (row, patch) => {
    if (row?.employeeMasterId == null) return;
    const key = String(row.employeeMasterId);
    const cur = byId.get(key) || { id: row.employeeMasterId, lineId: row.lineId || null };
    byId.set(key, { ...cur, ...patch, lineId: cur.lineId || row.lineId || null });
  };
  for (const row of epfRows) {
    const uan = digitsOnly(row.uan);
    if (uan.length === 12) touch(row, { uan_no: uan });
  }
  for (const row of esicRows) {
    const esicNo = digitsOnly(row.ipNumber);
    if (esicNo.length === 10) touch(row, { esic_no: esicNo });
  }
  return [...byId.values()];
}

/** Write UAN / ESIC IP onto Employee Master so later months load the same IDs. */
export async function persistStatutoryIdsToMaster(epfRows = [], esicRows = []) {
  const patches = collectIdPatches(epfRows, esicRows);
  if (!patches.length) return 0;
  let saved = 0;
  const chunkSize = 25;
  for (let i = 0; i < patches.length; i += chunkSize) {
    const chunk = patches.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (patch) => {
        const body = {};
        if (patch.uan_no) body.uan_no = patch.uan_no;
        if (patch.esic_no) body.esic_no = patch.esic_no;
        if (!Object.keys(body).length) return false;
        const { error } = await supabase.from(EMPLOYEE_MASTER_TABLE).update(body).eq("id", patch.id);
        if (error) {
          console.warn("Compliance: could not save statutory ID for employee", patch.id, error);
          return false;
        }
        return true;
      })
    );
    saved += results.filter(Boolean).length;
  }
  return saved;
}

/** Save UAN / IP from every workbook sheet onto Employee Master by employee code. */
export async function persistWorkbookMapToMaster(parsed) {
  if (!parsed?.byCode?.size) return 0;
  const wanted = [];
  for (const [key, row] of parsed.byCode) {
    const uan = digitsOnly(row.uan);
    const esicNo = digitsOnly(row.ipNumber);
    if (uan.length !== 12 && esicNo.length !== 10) continue;
    wanted.push({
      keys: [...new Set([key, normalizeEmpCode(row.employeeCode)].filter(Boolean))],
      raw: String(row.employeeCode || key || "").trim(),
      uan: uan.length === 12 ? uan : "",
      esic_no: esicNo.length === 10 ? esicNo : "",
    });
  }
  if (!wanted.length) return 0;

  const lookup = [...new Set(wanted.flatMap((w) => [...w.keys, w.raw].filter(Boolean)))];
  const found = [];
  for (let i = 0; i < lookup.length; i += 200) {
    const chunk = lookup.slice(i, i + 200);
    const byCode = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("id, employee_code, employee_id, uan_no, esic_no")
      .in("employee_code", chunk);
    if (byCode.error) {
      console.warn("Compliance: could not match workbook employee codes", byCode.error);
    } else {
      found.push(...(byCode.data || []));
    }
    const byId = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("id, employee_code, employee_id, uan_no, esic_no")
      .in("employee_id", chunk);
    if (!byId.error) found.push(...(byId.data || []));
  }

  const byNorm = new Map();
  for (const emp of found) {
    for (const k of [normalizeEmpCode(emp.employee_code), normalizeEmpCode(emp.employee_id)].filter(Boolean)) {
      if (!byNorm.has(k)) byNorm.set(k, emp);
    }
  }

  const patches = [];
  for (const item of wanted) {
    let emp = null;
    for (const k of item.keys) {
      emp = byNorm.get(k);
      if (emp) break;
    }
    if (!emp?.id) continue;
    const body = { id: emp.id };
    if (item.uan && item.uan !== digitsOnly(emp.uan_no)) body.uan_no = item.uan;
    if (item.esic_no && item.esic_no !== digitsOnly(emp.esic_no)) body.esic_no = item.esic_no;
    if (!body.uan_no && !body.esic_no) continue;
    patches.push(body);
  }

  let extraSaved = 0;
  const chunkSize = 25;
  for (let i = 0; i < patches.length; i += chunkSize) {
    const chunk = patches.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (patch) => {
        const body = {};
        if (patch.uan_no) body.uan_no = patch.uan_no;
        if (patch.esic_no) body.esic_no = patch.esic_no;
        const { error } = await supabase.from(EMPLOYEE_MASTER_TABLE).update(body).eq("id", patch.id);
        if (error) {
          console.warn("Compliance: workbook ID save skipped", patch.id, error);
          return false;
        }
        return true;
      })
    );
    extraSaved += results.filter(Boolean).length;
  }
  return extraSaved;
}

/** Keep processed-month line JSON in sync so salary views show the same UAN / ESIC. */
export async function persistStatutoryIdsToMonthLines(runId, epfRows = [], esicRows = []) {
  if (!runId) return 0;
  const patches = collectIdPatches(epfRows, esicRows);
  if (!patches.length) return 0;

  const { data, error } = await supabase
    .from(MONTH_LINES_TABLE)
    .select("id, employee_master_id, computed_json, source_snapshot_json")
    .eq("run_id", runId);
  if (error) {
    console.warn("Compliance: could not load salary lines for ID save", error);
    return 0;
  }

  const byMaster = new Map((data || []).map((l) => [String(l.employee_master_id), l]));
  let saved = 0;
  for (const patch of patches) {
    const line = byMaster.get(String(patch.id));
    if (!line?.id) continue;
    const cj = line.computed_json && typeof line.computed_json === "object" ? { ...line.computed_json } : {};
    const snap =
      line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? { ...line.source_snapshot_json }
        : {};
    if (patch.uan_no) {
      cj.uan_no = patch.uan_no;
      snap.uan_no = patch.uan_no;
    }
    if (patch.esic_no) {
      cj.esic_no = patch.esic_no;
      snap.esic_no = patch.esic_no;
    }
    const { error: updErr } = await supabase
      .from(MONTH_LINES_TABLE)
      .update({ computed_json: cj, source_snapshot_json: snap })
      .eq("id", line.id);
    if (updErr) {
      console.warn("Compliance: could not save line statutory IDs", line.id, updErr);
      continue;
    }
    saved += 1;
  }
  return saved;
}

export async function loadComplianceFiling(monthKey) {
  const key = String(monthKey || "").trim();
  if (!key) return null;
  const { data, error } = await supabase
    .from(COMPLIANCE_FILINGS_TABLE)
    .select("*")
    .eq("month_key", key)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.warn("Compliance: filing load skipped", error);
    return null;
  }
  return data || null;
}

export async function upsertComplianceFiling({
  year,
  month,
  monthKey,
  runId,
  epfRows = [],
  esicRows = [],
  sourceFileName = "",
  parsed = null,
} = {}) {
  const key = String(monthKey || "").trim();
  if (!key) return null;
  const payload = {
    month_key: key,
    pay_year: Number(year) || null,
    pay_month: Number(month) || null,
    run_id: runId || null,
    id_map_json: buildIdMap(epfRows, esicRows, parsed),
    epf_rows_json: (epfRows || []).map((r) => compactRow(r, "epf")),
    esic_rows_json: (esicRows || []).map((r) => compactRow(r, "esic")),
    updated_at: new Date().toISOString(),
  };
  if (sourceFileName) {
    payload.source_file_name = sourceFileName;
    payload.uploaded_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from(COMPLIANCE_FILINGS_TABLE)
    .upsert(payload, { onConflict: "month_key" })
    .select("*")
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.warn("Compliance: filing save skipped", error);
    return null;
  }
  return data;
}

/** Overlay saved month edits (IDs, days, wages) onto freshly loaded processed rows. */
export function overlayFilingOnRows({ epfRows = [], esicRows = [], filing } = {}) {
  if (!filing) return { epfRows, esicRows };
  const epfSaved = new Map(
    (Array.isArray(filing.epf_rows_json) ? filing.epf_rows_json : []).map((r) => [
      String(r.employeeMasterId),
      r,
    ])
  );
  const esicSaved = new Map(
    (Array.isArray(filing.esic_rows_json) ? filing.esic_rows_json : []).map((r) => [
      String(r.employeeMasterId),
      r,
    ])
  );

  const nextEpf = epfRows.map((row) => {
    const saved = epfSaved.get(String(row.employeeMasterId));
    if (!saved) return row;
    return {
      ...row,
      uan: digitsOnly(saved.uan) || row.uan,
      ncpDays: saved.ncpDays ?? row.ncpDays,
      refundOfAdvance: saved.refundOfAdvance ?? row.refundOfAdvance,
    };
  });

  const nextEsic = esicRows.map((row) => {
    const saved = esicSaved.get(String(row.employeeMasterId));
    if (!saved) return row;
    return {
      ...row,
      ipNumber: digitsOnly(saved.ipNumber) || row.ipNumber,
      daysPaid: saved.daysPaid ?? row.daysPaid,
      monthlyWages: saved.monthlyWages ?? row.monthlyWages,
      reasonCode: saved.reasonCode ?? row.reasonCode,
      lastWorkingDay: saved.lastWorkingDay || row.lastWorkingDay,
    };
  });

  const existingEsic = new Set(nextEsic.map((r) => String(r.employeeMasterId)));
  for (const saved of esicSaved.values()) {
    const key = String(saved.employeeMasterId || "");
    if (!key || existingEsic.has(key)) continue;
    const ip = digitsOnly(saved.ipNumber);
    if (!ip) continue;
    const epf = epfRows.find((r) => String(r.employeeMasterId) === key);
    nextEsic.push({
      id: `esic_${saved.employeeMasterId}`,
      employeeMasterId: saved.employeeMasterId,
      lineId: epf?.lineId || null,
      employeeCode: saved.employeeCode || epf?.employeeCode || "",
      employeeId: epf?.employeeId || "",
      ipNumber: ip,
      ipName: saved.ipName || epf?.name || "",
      daysPaid: saved.daysPaid ?? (Number(epf?.presentDays) || 0),
      monthlyWages: saved.monthlyWages ?? (Number(epf?.grossWages) || 0),
      reasonCode: saved.reasonCode || "",
      lastWorkingDay: saved.lastWorkingDay || "",
      reasonNote: "",
    });
  }

  return { epfRows: nextEpf, esicRows: nextEsic };
}

export async function persistComplianceMonth({
  year,
  month,
  monthKey,
  runId,
  epfRows,
  esicRows,
  sourceFileName = "",
  parsed = null,
} = {}) {
  const masterSaved = await persistStatutoryIdsToMaster(epfRows, esicRows);
  if (parsed) {
    await persistWorkbookMapToMaster(parsed);
  }
  const linesSaved = await persistStatutoryIdsToMonthLines(runId, epfRows, esicRows);
  const filing = await upsertComplianceFiling({
    year,
    month,
    monthKey,
    runId,
    epfRows,
    esicRows,
    sourceFileName,
    parsed,
  });
  return { masterSaved, linesSaved, filing };
}
