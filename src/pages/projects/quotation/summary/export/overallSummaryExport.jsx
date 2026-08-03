import React from 'react';
import * as XLSX from 'xlsx';
import { OverallSummaryPreview } from './ExportPreviewLayouts';
import {
  captureReactNodeToPdf,
  childHeadTotal,
  formatExportNumber,
  grandTotal,
  numberedTree,
  resolveOfferToken,
  sanitizeFilePart,
} from './exportShared';

/**
 * Build Overall Summary rows matching the workbook SUMMARY sheet.
 * @returns {Array<{kind:string, srNo?:string, description?:string, hsnCode?:string, supply?:number, installation?:number, combined?:number}>}
 */
export function buildOverallSummaryRows(mainHeads) {
  const numbered = numberedTree(mainHeads);
  const rows = [];

  for (const main of numbered) {
    rows.push({
      kind: 'main',
      srNo: main.displayNo,
      description: main.label || '(Untitled)',
      hsnCode: '',
    });
    for (const child of main.childHeads || []) {
      const t = childHeadTotal(child);
      rows.push({
        kind: 'child',
        srNo: child.displayLetter,
        description: child.label || '(Untitled)',
        hsnCode: '',
        supply: t.supplyTotal,
        installation: t.installationTotal,
      });
    }
  }

  const g = grandTotal(numbered);
  rows.push({
    kind: 'total',
    description: 'Total',
    supply: g.supplyTotal,
    installation: g.installationTotal,
  });
  rows.push({
    kind: 'grtotal',
    description: 'GRTOTAL',
    combined: g.supplyTotal + g.installationTotal,
  });

  return rows;
}

function rowsToAoa(rows) {
  const aoa = [['SR NO', 'JOB DESCRIPTION', 'HSN CODE', 'SUPPLY', 'INSTALLATION']];
  for (const row of rows) {
    if (row.kind === 'main') {
      aoa.push([row.srNo, row.description, row.hsnCode || '', '', '']);
    } else if (row.kind === 'child') {
      aoa.push([
        row.srNo,
        `  ${row.description}`,
        row.hsnCode || '',
        formatExportNumber(row.supply),
        formatExportNumber(row.installation),
      ]);
    } else if (row.kind === 'total') {
      aoa.push(['', 'Total', '', formatExportNumber(row.supply), formatExportNumber(row.installation)]);
    } else if (row.kind === 'grtotal') {
      aoa.push(['', 'GRTOTAL', '', formatExportNumber(row.combined), '']);
    }
  }
  return aoa;
}

export async function exportOverallSummaryPdf(mainHeads, { offerToken, subtitle } = {}) {
  const rows = buildOverallSummaryRows(mainHeads);
  const token = sanitizeFilePart(offerToken || 'Draft');
  const fileName = `Quotation-Summary-${token}.pdf`;
  await captureReactNodeToPdf(
    <OverallSummaryPreview rows={rows} meta={{ subtitle }} />,
    fileName
  );
}

export function exportOverallSummaryExcel(mainHeads, { offerToken } = {}) {
  const rows = buildOverallSummaryRows(mainHeads);
  const aoa = rowsToAoa(rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 10 }, { wch: 48 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  const token = sanitizeFilePart(offerToken || 'Draft');
  XLSX.writeFile(wb, `Quotation-Summary-${token}.xlsx`);
}

export function getOfferTokenFromDraft({ activeQuotationId, label } = {}) {
  return resolveOfferToken({ activeQuotationId, label });
}
