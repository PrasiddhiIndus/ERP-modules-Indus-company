/**
 * Extraction-provider registry. Every provider turns one uploaded file into
 * the same normalized structure, so the preview / validation / save workflow
 * never depends on where the data came from.
 *
 * Provider contract:
 *   {
 *     id, version, label,
 *     accepts(fileName) → boolean,
 *     async extract(file, { site, cycleDays }) → {
 *       providerId, providerVersion,
 *       file: { name, size, sha256, kind },
 *       rows: [{ rowKey, sheet, sourceRow, otRow, rawCode, rawName, rawDesig,
 *                sheetTotals: { present?, ot?, leave?, weekoff?, nhph?, total? },
 *                cells: [{ date: "YYYY-MM-DD", rawMark, rawOt, col, confidence: 0..1 }] }],
 *       warnings: string[], errors: string[],
 *     }
 *   }
 *
 * Planned providers (later phases) register here without changing callers:
 *   pdf-text (pdf.js), local-ocr (tesseract.js), docx-tables (mammoth),
 *   and an optional vision-model provider that runs server-side only.
 */
import { excelLayoutProvider } from "./excelLayoutProvider";

const PROVIDERS = [excelLayoutProvider];

export function listExtractionProviders() {
  return PROVIDERS.slice();
}

export function getProviderForFile(fileName) {
  return PROVIDERS.find((p) => p.accepts(fileName)) || null;
}

export const IMPORT_ACCEPT_ATTR = ".xlsx,.xlsm,.csv";
