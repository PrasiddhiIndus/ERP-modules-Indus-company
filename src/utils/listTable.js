/** Detect existing serial-number column in a column config. */
const SERIAL_COL_KEY_RE = /^(s\.?\s*no|sr\.?\s*no\.?|srno|sl\.?\s*no|serial|#__sn)$/i;
const SERIAL_COL_LABEL_RE = /^(s\.?\s*no\.?|sr\.?\s*no\.?|sr\.?\s*no|sl\.?\s*no|serial\s*(no\.?|number)?|#)$/i;

export function columnsHaveSerialNumber(columns) {
  return (columns || []).some((col) => {
    const key = String(col?.key ?? "").trim();
    const label = String(col?.label ?? col?.header ?? "").trim();
    return SERIAL_COL_KEY_RE.test(key) || SERIAL_COL_LABEL_RE.test(label);
  });
}

export function createSerialColumn(label = "S.No", offset = 0) {
  return {
    key: "__sn",
    label,
    headerClassName: "text-center w-11 min-w-[2.75rem] max-w-[2.75rem]",
    cellClassName: "text-center text-gray-600 tabular-nums w-11 min-w-[2.75rem]",
    __serialOffset: offset,
  };
}

export function prependSerialColumn(columns, { label = "S.No", offset = 0, enabled = true } = {}) {
  if (!enabled || columnsHaveSerialNumber(columns)) return columns || [];
  return [createSerialColumn(label, offset), ...(columns || [])];
}

export function resolveSerialCellValue(col, rowIndex) {
  const offset = Number(col?.__serialOffset) || 0;
  return rowIndex + 1 + offset;
}

/** Add S.No to export rows (objects or arrays). */
export function prependSerialToExportObjects(rows, label = "S.No") {
  return (rows || []).map((row, idx) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { [label]: idx + 1, value: row };
    }
    if (label in row || "S.No" in row || "Sr.No" in row) return row;
    return { [label]: idx + 1, ...row };
  });
}

export function prependSerialToExportArrays(rows, label = "S.No") {
  return (rows || []).map((row, idx) => [idx + 1, ...(Array.isArray(row) ? row : [row])]);
}
