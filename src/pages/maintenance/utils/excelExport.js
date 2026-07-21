// Utility function for Excel exports
import * as XLSX from "xlsx";
import { formatDatesInExportRows } from "../../../utils/dateDisplay";
import { prependSerialToExportObjects } from "../../../utils/listTable";

export const exportToExcel = (data, filename, sheetName = "Sheet1", options = {}) => {
  const {
    addSerialNumber = true,
    serialLabel = "S.No",
    formatDates = true,
  } = options;

  let rows = Array.isArray(data) ? data : [];
  if (formatDates) rows = formatDatesInExportRows(rows);
  if (addSerialNumber) rows = prependSerialToExportObjects(rows, serialLabel);

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportTableToExcel = (tableData, headers, filename, sheetName = "Sheet1", options = {}) => {
  const {
    addSerialNumber = true,
    serialLabel = "S.No",
    formatDates = true,
  } = options;

  const data = (tableData || []).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });

  exportToExcel(data, filename, sheetName, { addSerialNumber, serialLabel, formatDates });
};
