/**
 * Smoke: node via vite-node
 *   npx vite-node scripts/smoke-boq-import.mjs [path-to-xlsx]
 *
 * Named samples 93/224/284/308.xlsx were not available in the workspace;
 * default path is a real FPS client BOQ from Downloads.
 */
import fs from 'fs';
import * as XLSX from 'xlsx';
import { detectBoqColumns, rankBoqSheets } from '../src/pages/projects/quotation/maker/boqImportDetect.js';
import { classifyBoqRows } from '../src/pages/projects/quotation/maker/boqImportClassify.js';
import { reviewRowsToMakerRows } from '../src/pages/projects/quotation/maker/boqImportToMakerRows.js';
import { computeTotals } from '../src/pages/projects/quotation/maker/quotationMakerModel.js';

const f =
  process.argv[2] ||
  'C:/Users/P1/Downloads/1028-BOQ-FPS-101-04 (FIRE FIGHTING SYSTEM).xlsx';
if (!fs.existsSync(f)) {
  console.error('File not found:', f);
  process.exit(1);
}
const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer' });
const sheets = wb.SheetNames.map((name) => ({
  name,
  grid: XLSX.utils
    .sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false })
    .map((r) => (r || []).map((c) => String(c ?? '').replace(/\u00a0/g, ' ').trim())),
}));
const ranked = rankBoqSheets(sheets);
console.log(
  'ranked sheets',
  ranked.slice(0, 5).map((s) => ({ name: s.name, score: s.score, recommended: s.recommended }))
);
const pick = ranked.find((s) => s.recommended) || ranked[0];
const sheet = sheets[pick.index];
const det = detectBoqColumns(sheet.grid);
console.log('sheet', sheet.name);
console.log('header', det.headerRowIndex, 'ambiguous', det.ambiguousRate);
console.log('fields', [...new Set(Object.values(det.columnMap))].filter((f) => f !== 'ignore').sort());
const classified = classifyBoqRows({
  grid: sheet.grid,
  headerRowIndex: det.headerRowIndex,
  columnMap: det.columnMap,
  sheetName: sheet.name,
});
console.log('summary', classified.summary);
const { rows: maker, importedCount, showMake } = reviewRowsToMakerRows(classified.rows);
console.log('imported', importedCount, 'showMake', showMake, 'makerRows', maker.length);
console.log('totals SI', computeTotals(maker, 'supply_installation'));
