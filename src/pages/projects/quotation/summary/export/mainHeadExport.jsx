import React from 'react';
import * as XLSX from 'xlsx';
import { MainHeadDetailPreview } from './ExportPreviewLayouts';
import {
  captureReactNodeToPdf,
  childHeadTotal,
  formatExportNumber,
  itemTotals,
  mainHeadTotal,
  numberedTree,
  sanitizeFilePart,
  sanitizeSheetName,
} from './exportShared';

/**
 * Build per–Main-Head detail rows matching workbook category sheets.
 */
export function buildMainHeadRows(mainHead) {
  const [numbered] = numberedTree(mainHead ? [mainHead] : []);
  if (!numbered) return [];

  const rows = [];
  for (const child of numbered.childHeads || []) {
    rows.push({
      kind: 'childHeader',
      srNo: child.displayLetter,
      description: child.label || '(Untitled)',
    });
    for (const item of child.items || []) {
      const t = itemTotals(item);
      rows.push({
        kind: 'item',
        srNo: item.srNo,
        description: item.description || '',
        note: item.note || '',
        unit: item.unit || '',
        qty: Number(item.qty) || 0,
        supplyRate: Number(item.supplyRate) || 0,
        supplyTotal: t.supplyTotal,
        installationRate: Number(item.installationRate) || 0,
        installationTotal: t.installationTotal,
        make: item.make || '',
      });
    }
    const ct = childHeadTotal(child);
    rows.push({
      kind: 'childTotal',
      supplyTotal: ct.supplyTotal,
      installationTotal: ct.installationTotal,
    });
  }

  const mt = mainHeadTotal(numbered);
  rows.push({
    kind: 'grandTotal',
    supplyTotal: mt.supplyTotal,
    installationTotal: mt.installationTotal,
  });

  return rows;
}

function rowsToAoa(rows) {
  const aoa = [
    [
      'Sr. No.',
      'Description',
      'Unit',
      'Qty',
      'Rate (Supply)',
      'Total (Supply)',
      'Rate (Installation)',
      'Total (Installation)',
      'Make',
    ],
  ];
  for (const row of rows) {
    if (row.kind === 'childHeader') {
      aoa.push([row.srNo, row.description, '', '', '', '', '', '', '']);
    } else if (row.kind === 'item') {
      const desc = row.note ? `${row.description}\n${row.note}` : row.description;
      aoa.push([
        row.srNo,
        desc,
        row.unit,
        formatExportNumber(row.qty),
        formatExportNumber(row.supplyRate),
        formatExportNumber(row.supplyTotal),
        formatExportNumber(row.installationRate),
        formatExportNumber(row.installationTotal),
        row.make,
      ]);
    } else if (row.kind === 'childTotal') {
      aoa.push([
        '',
        'Total',
        '',
        '',
        '',
        formatExportNumber(row.supplyTotal),
        '',
        formatExportNumber(row.installationTotal),
        '',
      ]);
    } else if (row.kind === 'grandTotal') {
      aoa.push([
        '',
        'Grand Total',
        '',
        '',
        '',
        formatExportNumber(row.supplyTotal),
        '',
        formatExportNumber(row.installationTotal),
        '',
      ]);
    }
  }
  return aoa;
}

export async function exportMainHeadPdf(mainHead, { offerToken, subtitle } = {}) {
  const rows = buildMainHeadRows(mainHead);
  const title = mainHead?.label || 'Main Head';
  const fileName = `${sanitizeFilePart(title, 'MainHead')}-${sanitizeFilePart(offerToken || 'Draft')}.pdf`;
  await captureReactNodeToPdf(
    <MainHeadDetailPreview title={title} rows={rows} meta={{ subtitle }} />,
    fileName
  );
}

export function exportMainHeadExcel(mainHead, { offerToken } = {}) {
  const rows = buildMainHeadRows(mainHead);
  const aoa = rowsToAoa(rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 10 },
    { wch: 48 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  const sheetName = sanitizeSheetName(mainHead?.label || 'Main Head');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fileName = `${sanitizeFilePart(mainHead?.label || 'MainHead', 'MainHead')}-${sanitizeFilePart(offerToken || 'Draft')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
