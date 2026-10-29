/**
 * Fill IFSPL offer / appointment Word templates (letterhead + CTC annexure signature).
 * On Windows with Word installed, fills via Word Find/Replace so layout stays intact.
 * Falls back to OOXML placeholder replace when Word is unavailable.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import PizZip from 'pizzip';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../public/templates/admin-recruitment');

const OFFER_TEMPLATE = path.join(TEMPLATE_DIR, 'offer-letter.docx');
const APPOINTMENT_TEMPLATE = path.join(TEMPLATE_DIR, 'appointment-letter.docx');

function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapePsSingleQuoted(value) {
  return String(value ?? '').replace(/'/g, "''");
}

/** Word drops leading/trailing spaces in <w:t> unless xml:space="preserve". */
function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || '');
  for (const [token, value] of Object.entries(placeholders)) {
    const raw = String(value ?? '');
    if (/^\s|\s$/.test(raw)) {
      out = out.replace(/<w:t([^>]*)>((?:(?!<\/w:t>)[\s\S])*?)<\/w:t>/g, (match, attrs, text) => {
        if (!text.includes(token)) return match;
        const nextAttrs = /\bxml:space=/.test(attrs)
          ? attrs.replace(/\bxml:space="[^"]*"/, 'xml:space="preserve"')
          : `${attrs} xml:space="preserve"`;
        return `<w:t${nextAttrs}>${text}</w:t>`;
      });
    }
    out = out.split(token).join(escapeXmlText(raw));
  }
  return out;
}

function fillDocxTemplateZip(templatePath, placeholders) {
  if (!fs.existsSync(templatePath)) {
    throw new Error('Letter template is missing. Contact support.');
  }
  const zip = new PizZip(fs.readFileSync(templatePath));
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) throw new Error('Invalid letter template.');
  zip.file('word/document.xml', applyPlaceholdersToXml(documentXml, placeholders));

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(header|footer)\d*\.xml$/i.test(name)) continue;
    const xml = zip.file(name)?.asText();
    if (!xml || !xml.includes('{{')) continue;
    zip.file(name, applyPlaceholdersToXml(xml, placeholders));
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Fill placeholders with Microsoft Word so tables, letterhead and text boxes keep their layout.
 * Returns null when Word/COM is unavailable.
 */
async function fillDocxTemplateWithWord(templatePath, placeholders) {
  if (process.platform !== 'win32') return null;
  if (!fs.existsSync(templatePath)) {
    throw new Error('Letter template is missing. Contact support.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifspl-letter-'));
  const srcPath = path.join(tmpDir, 'template.docx');
  const outPath = path.join(tmpDir, 'filled.docx');
  const scriptPath = path.join(tmpDir, 'fill.ps1');
  fs.copyFileSync(templatePath, srcPath);

  const pairs = Object.entries(placeholders).map(([find, replace]) => ({
    find: String(find),
    replace: String(replace ?? ''),
  }));

  const pairsPs = pairs
    .map(
      (p) =>
        `  @{ Find = '${escapePsSingleQuoted(p.find)}'; Replace = '${escapePsSingleQuoted(p.replace)}' }`
    )
    .join(",\n");

  const script = `
$ErrorActionPreference = 'Stop'
$src = '${escapePsSingleQuoted(srcPath)}'
$out = '${escapePsSingleQuoted(outPath)}'
$pairs = @(
${pairsPs}
)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($src, $false, $false)
  foreach ($p in $pairs) {
    $find = $doc.Content.Find
    $find.ClearFormatting() | Out-Null
    $find.Replacement.ClearFormatting() | Out-Null
    $null = $find.Execute(
      $p.Find,
      $false, $false, $false, $false, $false, $true, 1, $false,
      $p.Replace,
      2
    )
  }
  if (Test-Path $out) { Remove-Item $out -Force }
  $doc.SaveAs2($out, 16)
  $doc.Close($false)
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
if (-not (Test-Path $out)) { throw 'Word did not write the filled letter.' }
`;

  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    const buf = fs.readFileSync(outPath);
    if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error('Filled letter is not a valid Word document.');
    }
    return buf;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] Word fill unavailable, using OOXML fallback:', err?.message || err);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function fillDocxTemplate(templatePath, placeholders) {
  const viaWord = await fillDocxTemplateWithWord(templatePath, placeholders);
  if (viaWord) return viaWord;
  return fillDocxTemplateZip(templatePath, placeholders);
}

function ordinalDay(n) {
  const d = Number(n);
  const j = d % 10;
  const k = d % 100;
  if (j === 1 && k !== 11) return `${d}st`;
  if (j === 2 && k !== 12) return `${d}nd`;
  if (j === 3 && k !== 13) return `${d}rd`;
  return `${d}th`;
}

function parseIsoDate(value) {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. 19th Oct 2026 */
export function formatLetterDate(value, { shortMonth = false, doubleSpace = false } = {}) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const day = ordinalDay(d.getDate());
  const month = d.toLocaleDateString('en-GB', { month: shortMonth ? 'short' : 'long' });
  const gap = doubleSpace ? '  ' : ' ';
  return `${day}${gap}${month} ${d.getFullYear()}`;
}

/** e.g. 19th Nov 2026 */
export function formatLetterDateAbbrev(value) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const day = ordinalDay(d.getDate());
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).replace(/\.$/, '');
  return `${day} ${month} ${d.getFullYear()}`;
}

/** e.g. 05.10.2026 */
export function formatLetterDateDots(value) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function todayIsoIst() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function firstName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || fullName || 'Candidate';
}

function formatInrAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('en-IN');
}

/** Phrase after designation, without a leading space (space is kept on designation). */
function departmentClause(department) {
  const raw = String(department || '').trim();
  if (!raw) return '';
  if (/department$/i.test(raw)) return `in the ${raw}`;
  return `in the ${raw} Department`;
}

function splitAddress(candidate) {
  const line = [candidate?.current_location, candidate?.home_town].filter(Boolean).join(', ');
  if (!line) return { line1: '', line2: '', line3: '' };
  const parts = line.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { line1: line, line2: '', line3: '' };
  if (parts.length === 2) return { line1: parts[0], line2: parts[1], line3: '' };
  return {
    line1: parts[0],
    line2: parts.slice(1, -1).join(', '),
    line3: parts[parts.length - 1],
  };
}

function offerPlaceholders(offer, candidate, companyName) {
  const company = companyName || 'INDUS FIRE SAFETY PVT LTD';
  const offerDate = todayIsoIst();
  const designation = String(offer?.designation || '').trim() || '—';
  const deptClause = departmentClause(offer?.department);
  return {
    '{{OFFER_DATE}}': formatLetterDate(offerDate, { shortMonth: true, doubleSpace: true }),
    '{{CANDIDATE_NAME}}': String(candidate?.full_name || 'Candidate').trim(),
    '{{DESIGNATION}}': deptClause ? `${designation} ` : designation,
    '{{DEPARTMENT_CLAUSE}}': deptClause,
    '{{COMPANY_NAME}}': company,
    '{{JOINING_DATE_LONG}}': formatLetterDate(offer?.joining_date),
    '{{LOCATION}}': String(offer?.location || '').trim() || '—',
    '{{VALID_UNTIL}}': formatLetterDate(offer?.valid_until, { shortMonth: true }),
    '{{JOINING_DATE_SHORT}}': formatLetterDateAbbrev(offer?.joining_date),
  };
}

function appointmentPlaceholders(appt, offer, candidate, companyName) {
  const company = companyName || 'Indus Fire Safety Pvt Ltd.';
  const name = String(candidate?.full_name || '').trim();
  const address = splitAddress(candidate);
  const joining = appt?.joining_date;
  const annual = offer?.annual_ctc ?? appt?.annual_ctc;
  const letterDate = todayIsoIst();
  return {
    '{{APPOINTMENT_REF}}': String(appt?.appointment_ref || '').trim(),
    '{{LETTER_DATE}}': formatLetterDateDots(letterDate),
    '{{CANDIDATE_FULL}}': name ? `Mr./Ms. ${name}` : 'Mr./Ms.',
    '{{ADDRESS_LINE1}}': address.line1,
    '{{ADDRESS_LINE2}}': address.line2,
    '{{ADDRESS_LINE3}}': address.line3,
    '{{FIRST_NAME}}': firstName(name),
    '{{DESIGNATION}}': String(appt?.designation || offer?.designation || '').trim() || '—',
    '{{COMPANY_NAME}}': company,
    '{{JOINING_DATE_LONG}}': formatLetterDate(joining),
    '{{LOCATION}}': String(appt?.location || '').trim() || 'the Head Office, Vadodara',
    '{{REPORTING_TO}}': String(appt?.reporting_to || '').trim() || 'HR Manager',
    '{{ANNUAL_CTC}}': formatInrAmount(annual),
    '{{CANDIDATE_NAME}}': name || 'Candidate',
  };
}

export async function buildOfferLetterDocx(offer, candidate, companyName) {
  return fillDocxTemplate(OFFER_TEMPLATE, offerPlaceholders(offer, candidate, companyName));
}

export async function buildAppointmentLetterDocx(appt, offer, candidate, companyName) {
  return fillDocxTemplate(APPOINTMENT_TEMPLATE, appointmentPlaceholders(appt, offer, candidate, companyName));
}

/**
 * Convert a .docx buffer to PDF via Word (Windows). Returns null when unavailable.
 * Used for email so Gmail/Outlook preview cannot reflow the Word layout.
 */
export async function convertDocxBufferToPdf(docxBuffer, baseName = 'letter') {
  if (process.platform !== 'win32') return null;
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifspl-letter-pdf-'));
  const docxPath = path.join(tmpDir, `${baseName}.docx`);
  const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
  const scriptPath = path.join(tmpDir, 'to-pdf.ps1');
  fs.writeFileSync(docxPath, buf);

  const script = `
$ErrorActionPreference = 'Stop'
$src = '${escapePsSingleQuoted(docxPath)}'
$out = '${escapePsSingleQuoted(pdfPath)}'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($src, $false, $true)
  if (Test-Path $out) { Remove-Item $out -Force }
  # 17 = wdFormatPDF
  $doc.SaveAs2($out, 17)
  $doc.Close($false)
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
if (-not (Test-Path $out)) { throw 'Word did not write the PDF.' }
`;
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    const pdf = fs.readFileSync(pdfPath);
    if (pdf.length < 100 || String(pdf.slice(0, 4)) !== '%PDF') return null;
    return pdf;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] Word PDF convert unavailable:', err?.message || err);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
