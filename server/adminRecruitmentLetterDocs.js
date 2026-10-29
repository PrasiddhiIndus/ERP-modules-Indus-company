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

async function findLibreOfficeBinary() {
  const known = [
    'soffice',
    'libreoffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    '/usr/lib/libreoffice/program/soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  ];
  for (const c of known) {
    if (c.includes('/') || c.includes('\\')) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    try {
      const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [c], {
        windowsHide: true,
        timeout: 5000,
      });
      const hit = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (hit && fs.existsSync(hit)) return hit;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function convertDocxViaLibreOffice(docxBuffer, baseName = 'letter') {
  const soffice = await findLibreOfficeBinary();
  if (!soffice) return null;
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifspl-lo-pdf-'));
  const docxPath = path.join(tmpDir, `${baseName}.docx`);
  const pdfPath = path.join(tmpDir, `${baseName}.pdf`);
  fs.writeFileSync(docxPath, buf);
  try {
    await execFileAsync(
      soffice,
      ['--headless', '--nologo', '--nofirststartwizard', '--norestore', '--convert-to', 'pdf', '--outdir', tmpDir, docxPath],
      { windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!fs.existsSync(pdfPath)) return null;
    const pdf = fs.readFileSync(pdfPath);
    if (pdf.length < 100 || String(pdf.slice(0, 4)) !== '%PDF') return null;
    return pdf;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] LibreOffice PDF convert unavailable:', err?.message || err);
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function convertDocxViaWord(docxBuffer, baseName = 'letter') {
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

/**
 * Convert a filled .docx buffer to PDF.
 * Order: Microsoft Word (Windows) → LibreOffice (Linux/prod) → null.
 */
export async function convertDocxBufferToPdf(docxBuffer, baseName = 'letter') {
  const viaWord = await convertDocxViaWord(docxBuffer, baseName);
  if (viaWord) return viaWord;
  const viaLo = await convertDocxViaLibreOffice(docxBuffer, baseName);
  if (viaLo) return viaLo;
  return null;
}

function pdfSafe(text) {
  return String(text ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

/**
 * Production-safe PDF of the IFSPL offer letter (no Word/LibreOffice required).
 * Uses the same letterhead + CTC signature assets as the Word template.
 */
export async function buildOfferLetterPdf(offer, candidate, companyName) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const p = offerPlaceholders(offer, candidate, companyName);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 841.89 - 40;

  const letterheadPath = path.join(TEMPLATE_DIR, 'offer-assets', 'letterhead.png');
  const signaturePath = path.join(TEMPLATE_DIR, 'offer-assets', 'signature.png');
  const annexureSig = path.join(__dirname, '../src/assets/annexure-signature.png');

  try {
    if (fs.existsSync(letterheadPath)) {
      const img = await pdf.embedPng(fs.readFileSync(letterheadPath));
      const w = 220;
      const h = (img.height / img.width) * w;
      page.drawImage(img, { x: (595.28 - w) / 2, y: y - h, width: w, height: h });
      y -= h + 18;
    }
  } catch {
    /* continue without letterhead */
  }

  const draw = (text, { f = font, size = 10.5, gap = 4, color = rgb(0.12, 0.12, 0.12) } = {}) => {
    const line = pdfSafe(text);
    const width = 595.28 - margin * 2;
    const words = line.split(/\s+/).filter(Boolean);
    let cur = '';
    const lines = [];
    for (const word of words.length ? words : ['']) {
      const next = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur || !words.length) lines.push(cur);
    for (const l of lines) {
      page.drawText(l, { x: margin, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  draw(`Date: ${p['{{OFFER_DATE}}']}`, { size: 10.5 });
  y -= 6;
  draw('Subject: Offer of Employment', { f: bold, size: 11 });
  y -= 8;
  draw(`Dear ${p['{{CANDIDATE_NAME}}']},`);
  y -= 6;
  draw(
    `We are pleased to offer you the position of ${String(p['{{DESIGNATION}}'] || '').trim()}${p['{{DEPARTMENT_CLAUSE}}'] || ''} at ${p['{{COMPANY_NAME}}']}. Based on your interview and credentials, we believe you will be a valuable addition to our organization.`
  );
  y -= 8;

  const facts = [
    ['Designation', String(offer?.designation || '').trim() || '—'],
    ['Date of Joining', p['{{JOINING_DATE_LONG}}'] || '—'],
    ['Work Location', p['{{LOCATION}}'] || '—'],
  ];
  for (const [label, value] of facts) {
    page.drawText(pdfSafe(label), { x: margin, y: y - 10.5, size: 10.5, font: bold });
    page.drawText(pdfSafe(value), { x: margin + 150, y: y - 10.5, size: 10.5, font });
    y -= 16;
  }
  y -= 6;
  draw('This offer is subject to verification of your educational and employment documents, and satisfactory reference checks.');
  y -= 4;
  draw(
    'Your detailed terms and conditions of employment will be shared in the Appointment Letter, which will be issued to you on the date of joining.'
  );
  y -= 4;
  draw(
    `Please confirm your acceptance by signing and returning a copy of this letter on or before ${p['{{VALID_UNTIL}}']}. This offer will lapse if your acceptance is not received on or before ${p['{{VALID_UNTIL}}']}, or if you fail to join on the agreed date (${p['{{JOINING_DATE_SHORT}}']}).`
  );
  y -= 4;
  draw('We look forward to having you with us.');
  y -= 10;
  draw('Yours sincerely,');
  y -= 6;

  try {
    const sigFile = fs.existsSync(signaturePath) ? signaturePath : annexureSig;
    if (fs.existsSync(sigFile)) {
      const sig = await pdf.embedPng(fs.readFileSync(sigFile));
      const sh = 42;
      const sw = (sig.width / sig.height) * sh;
      page.drawImage(sig, { x: margin, y: y - sh, width: sw, height: sh });
      y -= sh + 6;
    } else {
      y -= 36;
    }
  } catch {
    y -= 36;
  }

  draw('Shilpa Thakur', { f: bold, size: 10.5 });
  draw('Manager - Human Resources', { size: 10 });
  draw(p['{{COMPANY_NAME}}'], { size: 10 });
  y -= 16;
  draw('I accept the above offer and confirm that I will join on [DD/MM/YYYY]', { f: bold, size: 10 });
  y -= 10;
  draw('Name: ____________________');
  y -= 8;
  draw('Signature: ____________________');
  y -= 8;
  draw('Date: ____________');

  return Buffer.from(await pdf.save());
}

/** Appointment PDF fallback for Linux/production (no Word required). */
export async function buildAppointmentLetterPdf(appt, offer, candidate, companyName) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const p = appointmentPlaceholders(appt, offer, candidate, companyName);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 841.89 - 54;
  const draw = (text, { f = font, size = 10.5, gap = 3.5 } = {}) => {
    const line = pdfSafe(text);
    page.drawText(line.slice(0, 110), { x: margin, y: y - size, size, font: f, color: rgb(0.12, 0.12, 0.12) });
    y -= size + gap;
  };
  draw(p['{{APPOINTMENT_REF}}'], { f: bold });
  draw(p['{{LETTER_DATE}}']);
  y -= 8;
  draw('To,');
  draw(p['{{CANDIDATE_FULL}}'], { f: bold });
  if (p['{{ADDRESS_LINE1}}']) draw(p['{{ADDRESS_LINE1}}'], { size: 10 });
  if (p['{{ADDRESS_LINE2}}']) draw(p['{{ADDRESS_LINE2}}'], { size: 10 });
  if (p['{{ADDRESS_LINE3}}']) draw(p['{{ADDRESS_LINE3}}'], { size: 10 });
  y -= 10;
  draw('Appointment Letter', { f: bold, size: 13 });
  y -= 8;
  draw(`Dear ${p['{{FIRST_NAME}}']},`);
  y -= 4;
  draw('Welcome on board!');
  y -= 6;
  draw(
    `We are pleased to appoint you as "${p['{{DESIGNATION}}']}" with ${p['{{COMPANY_NAME}}']}, with effect from ${p['{{JOINING_DATE_LONG}}']}. You will be posted at ${p['{{LOCATION}}']}, and your reporting head will be the ${p['{{REPORTING_TO}}']}.`
  );
  y -= 8;
  draw('Compensation', { f: bold, size: 11 });
  draw(
    `Your total Cost to Company (CTC) will be INR ${p['{{ANNUAL_CTC}}']}/- per annum, payable as per the company's payroll cycle and structure. A detailed break-up of the remuneration is set out in Annexure II of this letter.`
  );
  y -= 12;
  draw(String(p['{{COMPANY_NAME}}'] || '').toUpperCase(), { f: bold });
  y -= 8;
  try {
    const sigFile = path.join(__dirname, '../src/assets/annexure-signature.png');
    if (fs.existsSync(sigFile)) {
      const sig = await pdf.embedPng(fs.readFileSync(sigFile));
      const sh = 42;
      const sw = (sig.width / sig.height) * sh;
      page.drawImage(sig, { x: margin, y: y - sh, width: sw, height: sh });
      y -= sh + 6;
    }
  } catch {
    y -= 36;
  }
  draw('CEO', { f: bold });
  y -= 16;
  draw('I hereby acknowledge and accept the appointment on the terms and conditions set forth in this letter.');
  y -= 20;
  draw(p['{{CANDIDATE_NAME}}'], { f: bold });
  return Buffer.from(await pdf.save());
}
