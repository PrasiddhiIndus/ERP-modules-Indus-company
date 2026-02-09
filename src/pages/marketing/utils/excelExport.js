// Utility function for Excel exports
import * as XLSX from 'xlsx';

export const exportToExcel = (data, filename, sheetName = 'Sheet1') => {
  // Convert data to worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Generate Excel file and download
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportTableToExcel = (tableData, headers, filename, sheetName = 'Sheet1') => {
  // Map table data to objects with headers
  const data = tableData.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
  
  exportToExcel(data, filename, sheetName);
};

