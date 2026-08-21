/**
 * Salary sheet reference — one number per processing batch (bulk / dept / select), not per employee.
 * Format: IFSPL/SAL/ADM/YYYY/MM/NNN[-Rn]
 */

export function resolveCompanyCode({ company } = {}) {
  const c = String(company || "").trim().toUpperCase();
  if (c === "IEVPL" || c === "IFSPL") return c;
  return "IFSPL";
}

/** e.g. IFSPL/SAL/ADM/2026/08/001-R2 */
export function formatRunSheetNo({
  companyCode = "IFSPL",
  year,
  month,
  sequence = 1,
  revision = 1,
}) {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, "0");
  const seq = String(Math.max(1, Number(sequence) || 1)).padStart(3, "0");
  let no = `${companyCode}/SAL/ADM/${y}/${m}/${seq}`;
  const rev = Number(revision);
  if (rev > 1) no += `-R${rev}`;
  return no;
}

export function getRunSheetNo(run) {
  if (!run) return "";
  const sj = run.summary_json && typeof run.summary_json === "object" ? run.summary_json : {};
  if (sj.salary_sheet_no) return sj.salary_sheet_no;
  const batches = Array.isArray(sj.batches) ? sj.batches : [];
  if (batches.length) {
    const last = batches[batches.length - 1];
    return last.sheet_no || "";
  }
  return formatRunSheetNo({
    year: run.pay_year,
    month: run.pay_month,
    sequence: sj.sheet_sequence || 1,
    revision: run.revision_no || 1,
  });
}

export function nextSheetSequenceForRun(existingRun) {
  const sj = existingRun?.summary_json && typeof existingRun.summary_json === "object" ? existingRun.summary_json : {};
  const batches = Array.isArray(sj.batches) ? sj.batches : [];
  if (batches.length) {
    return Math.max(...batches.map((b) => Number(b.sequence) || 0)) + 1;
  }
  if (sj.sheet_sequence) return Number(sj.sheet_sequence) + 1;
  return existingRun ? 2 : 1;
}

export function processModeLabel(mode, summary = {}) {
  const m = String(mode || "").toLowerCase();
  if (m === "dept") {
    const depts = summary.departments || summary.dept_names || [];
    if (depts.length === 1) return `Department · ${depts[0]}`;
    if (depts.length > 1) return `Departments · ${depts.length}`;
    return "By department";
  }
  if (m === "select") return "Selected employees";
  return "Bulk";
}

/**
 * Record one processing batch on the month run (bulk, department, or selected employees).
 */
export function appendProcessBatch(existingSummary, {
  year,
  month,
  processMode,
  revisionNo = 1,
  employeeCount = 0,
  departments,
  companyCode = "IFSPL",
  sequence,
  processedOn,
  employeeIds,
}) {
  const sj = existingSummary && typeof existingSummary === "object" ? { ...existingSummary } : {};
  const seq = sequence ?? nextSheetSequenceForRun({ summary_json: sj });
  const sheetNo = formatRunSheetNo({
    companyCode,
    year,
    month,
    sequence: seq,
    revision: revisionNo,
  });
  const processDay =
    processedOn && /^\d{4}-\d{2}-\d{2}$/.test(String(processedOn))
      ? String(processedOn).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const batch = {
    sequence: seq,
    sheet_no: sheetNo,
    process_mode: processMode,
    employee_count: employeeCount,
    departments: departments?.filter(Boolean)?.length ? departments.filter(Boolean) : undefined,
    employee_ids: Array.isArray(employeeIds) ? employeeIds.map(String) : undefined,
    processed_on: processDay,
    processed_at: new Date().toISOString(),
    revision_no: revisionNo,
  };
  const batches = [...(Array.isArray(sj.batches) ? sj.batches : []), batch];
  return {
    ...sj,
    sheet_sequence: seq,
    salary_sheet_no: sheetNo,
    process_mode: processMode,
    departments: batch.departments,
    processed_on: processDay,
    batches,
  };
}

/** Flatten run batches for the Processed sheets grid (one row per bulk/dept/select run). */
export function flattenProcessedSheetRows(runs) {
  const rows = [];
  for (const run of runs || []) {
    const sj = run.summary_json && typeof run.summary_json === "object" ? run.summary_json : {};
    const batches = Array.isArray(sj.batches) ? sj.batches : [];
    if (batches.length) {
      for (const batch of batches) {
        rows.push({
          id: `${run.id}_${batch.sequence}`,
          run_id: run.id,
          salary_sheet_no: batch.sheet_no,
          process_mode: batch.process_mode,
          process_label: processModeLabel(batch.process_mode, batch),
          employee_count: batch.employee_count ?? run.employee_count,
          pay_year: run.pay_year,
          pay_month: run.pay_month,
          revision_no: batch.revision_no ?? run.revision_no,
          total_net: run.total_net,
          status: run.status,
          updated_at: batch.processed_at || run.updated_at,
          month_days: run.month_days,
        });
      }
    } else {
      rows.push({
        id: run.id,
        run_id: run.id,
        salary_sheet_no: getRunSheetNo(run),
        process_mode: sj.process_mode || "bulk",
        process_label: processModeLabel(sj.process_mode || "bulk", sj),
        employee_count: run.employee_count,
        pay_year: run.pay_year,
        pay_month: run.pay_month,
        revision_no: run.revision_no,
        total_net: run.total_net,
        status: run.status,
        updated_at: run.updated_at,
        month_days: run.month_days,
      });
    }
  }
  return rows.sort((a, b) => {
    if ((b.pay_year || 0) !== (a.pay_year || 0)) return (b.pay_year || 0) - (a.pay_year || 0);
    if ((b.pay_month || 0) !== (a.pay_month || 0)) return (b.pay_month || 0) - (a.pay_month || 0);
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
}

/** After save / full reprocess — refresh sheet no with revision suffix on latest batch. */
export function applyRevisionToRunSheet(summary, { year, month, revisionNo, companyCode = "IFSPL" }) {
  const sj = summary && typeof summary === "object" ? { ...summary } : {};
  const seq = sj.sheet_sequence || (sj.batches?.length ? sj.batches[sj.batches.length - 1].sequence : 1);
  const sheetNo = formatRunSheetNo({ companyCode, year, month, sequence: seq, revision: revisionNo });
  sj.salary_sheet_no = sheetNo;
  if (Array.isArray(sj.batches) && sj.batches.length) {
    const batches = [...sj.batches];
    const last = { ...batches[batches.length - 1], sheet_no: sheetNo, revision_no: revisionNo };
    batches[batches.length - 1] = last;
    sj.batches = batches;
  }
  return sj;
}
