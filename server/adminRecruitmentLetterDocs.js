/**
 * Fill IFSPL offer / appointment Word templates (letterhead + CTC annexure signature).
 * On Windows with Word installed, fills via Word Find/Replace so layout stays intact.
 * Falls back to OOXML placeholder replace when Word is unavailable.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { promisify } from 'util';
import PizZip from 'pizzip';
import {
  annexurePaValue,
  calculateCtc,
  roundRupee,
  SEED_RULES_2026_27,
  SKILL_SKILLED,
  STATUS_PROBATION,
} from '../src/pages/adminOperations/salaryAdmin/ctcEngine.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '../public/templates/admin-recruitment');

const OFFER_TEMPLATE = path.join(TEMPLATE_DIR, 'offer-letter.docx');
const APPOINTMENT_TEMPLATE = path.join(TEMPLATE_DIR, 'appointment-letter.docx');
/** Metric-compatible OFL/Apache fonts staged into LibreOffice for Word-like pagination. */
const LETTER_FONTS_DIR = path.join(__dirname, 'assets', 'letter-fonts');

/**
 * Microsoft fonts used in the letter templates are often missing on Linux.
 * LibreOffice then substitutes DejaVu (different widths) and the PDF grows
 * from 4 → 6 pages. Remap only for the LibreOffice convert buffer.
 * Longer names first so "Aptos Narrow" is not partially rewritten as "Aptos".
 */
const LIBREOFFICE_FONT_REMAP = [
  ['Aptos Narrow', 'Liberation Sans Narrow'],
  ['Aptos Display', 'Liberation Sans'],
  ['Aptos', 'Liberation Sans'],
  ['Cambria Math', 'Liberation Serif'],
  ['Cambria', 'Caladea'],
  ['Calibri Light', 'Carlito'],
  ['Calibri', 'Carlito'],
];

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
/** Meta key: monthly tokens whose annexure rows are dropped (exact 0 only). */
const ANNEXURE_EXCLUDE_MONTHLY_TOKENS = '__annexureExcludeMonthlyTokens';

function splitAnnexurePlaceholders(placeholders) {
  const excluded = Array.isArray(placeholders?.[ANNEXURE_EXCLUDE_MONTHLY_TOKENS])
    ? placeholders[ANNEXURE_EXCLUDE_MONTHLY_TOKENS]
    : [];
  const clean = { ...(placeholders || {}) };
  delete clean[ANNEXURE_EXCLUDE_MONTHLY_TOKENS];
  return { clean, excluded };
}

/** Drop annexure table rows for excluded monthly tokens (exact-0 components). */
function removeAnnexureRowsByMonthlyTokens(xml, tokens) {
  let out = String(xml || '');
  for (const tok of tokens || []) {
    if (!tok) continue;
    let guard = 0;
    while (out.includes(tok) && guard < 20) {
      guard += 1;
      const idx = out.indexOf(tok);
      let trStart = out.lastIndexOf('<w:tr ', idx);
      if (trStart < 0) trStart = out.lastIndexOf('<w:tr>', idx);
      const trEnd = out.indexOf('</w:tr>', idx);
      if (trStart < 0 || trEnd < 0) break;
      out = `${out.slice(0, trStart)}${out.slice(trEnd + 7)}`;
    }
  }
  return out;
}

function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || '');
  for (const [token, value] of Object.entries(placeholders)) {
    if (token === ANNEXURE_EXCLUDE_MONTHLY_TOKENS) continue;
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
  const { clean, excluded } = splitAnnexurePlaceholders(placeholders);
  const zip = new PizZip(fs.readFileSync(templatePath));
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) throw new Error('Invalid letter template.');
  zip.file(
    'word/document.xml',
    applyPlaceholdersToXml(removeAnnexureRowsByMonthlyTokens(documentXml, excluded), clean)
  );

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(header|footer)\d*\.xml$/i.test(name)) continue;
    const xml = zip.file(name)?.asText();
    if (!xml || !xml.includes('{{')) continue;
    zip.file(
      name,
      applyPlaceholdersToXml(removeAnnexureRowsByMonthlyTokens(xml, excluded), clean)
    );
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

  const { clean, excluded } = splitAnnexurePlaceholders(placeholders);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifspl-letter-'));
  const srcPath = path.join(tmpDir, 'template.docx');
  const outPath = path.join(tmpDir, 'filled.docx');
  const scriptPath = path.join(tmpDir, 'fill.ps1');
  fs.copyFileSync(templatePath, srcPath);
  if (excluded.length) {
    const zip = new PizZip(fs.readFileSync(srcPath));
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      zip.file('word/document.xml', removeAnnexureRowsByMonthlyTokens(docFile.asText(), excluded));
      fs.writeFileSync(srcPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
    }
  }

  const pairs = Object.entries(clean).map(([find, replace]) => ({
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
  // Production Linux has no Word COM — force zip fill locally with ADMIN_RECRUITMENT_FORCE_ZIP_FILL=1.
  const forceZip = String(process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL || '').trim() === '1';
  if (!forceZip) {
    const viaWord = await fillDocxTemplateWithWord(templatePath, placeholders);
    if (viaWord) return viaWord;
  }
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

/** e.g. 05/11/2026 — acceptance block “join on …” */
export function formatLetterDateDdMmYyyy(value) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
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

/**
 * Letter header address under To,. Prefer Employee Master current address when
 * enrichAppointmentCandidate attached it; else recruitment location/hometown.
 * Splits on newlines then commas into at most 3 template lines (empty lines omitted).
 */
function splitAddress(candidate) {
  const raw = String(
    candidate?.current_address ||
      candidate?.address ||
      [candidate?.current_location, candidate?.home_town].filter(Boolean).join(', ') ||
      ''
  ).trim();
  if (!raw) return { line1: '', line2: '', line3: '' };

  const parts = [];
  for (const chunk of raw.split(/\r?\n+/)) {
    const line = String(chunk || '').trim();
    if (!line) continue;
    if (/,/.test(line)) {
      for (const bit of line.split(/,\s*/)) {
        const p = String(bit || '').trim();
        if (p) parts.push(p);
      }
    } else {
      parts.push(line);
    }
  }
  if (!parts.length) return { line1: raw, line2: '', line3: '' };
  if (parts.length === 1) return { line1: parts[0], line2: '', line3: '' };
  if (parts.length === 2) return { line1: parts[0], line2: parts[1], line3: '' };
  if (parts.length === 3) return { line1: parts[0], line2: parts[1], line3: parts[2] };
  return {
    line1: parts[0],
    line2: parts.slice(1, -1).join(', '),
    line3: parts[parts.length - 1],
  };
}

/** Monthly CTC from calculator snapshot / expected_ctc, else offer annual/12. */
function resolveMonthlyCtc(offer, candidate) {
  const fromBreakup = Number(savedCtcBreakup(candidate)?.ctc);
  if (Number.isFinite(fromBreakup) && fromBreakup > 0) return fromBreakup;
  const fromCand = Number(candidate?.expected_ctc ?? candidate?.expectedCtc);
  if (Number.isFinite(fromCand) && fromCand > 0) return fromCand;
  const fromAnnual = Number(offer?.annual_ctc);
  if (Number.isFinite(fromAnnual) && fromAnnual > 0) return fromAnnual / 12;
  const fromGross = Number(offer?.monthly_gross);
  if (Number.isFinite(fromGross) && fromGross > 0) return fromGross;
  return null;
}

function formatWefShort(value) {
  const d = parseIsoDate(value) || parseIsoDate(todayIsoIst());
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function schemeYearLabel(value) {
  const d = parseIsoDate(value) || parseIsoDate(todayIsoIst());
  if (!d) return '2026-27';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 4) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

/** Empty/null → blank cell (row kept). Exact 0 is filtered out at the line-item level. */
function annexureAmount(value) {
  if (value == null || value === '') return '';
  const n = roundRupee(Number(value));
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n);
}

function isEmptyAnnexureAmount(value) {
  return value == null || value === '';
}

function isExactZeroAnnexureAmount(value) {
  if (isEmptyAnnexureAmount(value)) return false;
  const n = roundRupee(Number(value));
  return Number.isFinite(n) && n === 0;
}

/** Keep empty/null lines; drop a line only when its amount(s) are exactly 0. */
function shouldIncludeAnnexureLine(monthly, pa) {
  if (isEmptyAnnexureAmount(monthly) && isEmptyAnnexureAmount(pa)) return true;
  const mZero = isExactZeroAnnexureAmount(monthly);
  const pZero = isExactZeroAnnexureAmount(pa);
  if ((mZero || isEmptyAnnexureAmount(monthly)) && (pZero || isEmptyAnnexureAmount(pa)) && (mZero || pZero)) {
    return false;
  }
  return true;
}

function readAnnexureMonthly(breakup, key) {
  if (!breakup || typeof breakup !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(breakup, key)) return null;
  const v = breakup[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readAnnexurePa(breakup, key) {
  const pa = annexurePaValue(breakup, key);
  if (pa == null || pa === '') return null;
  const n = Number(pa);
  if (!Number.isFinite(n)) return null;
  // annexurePaValue yields 0 for a missing monthly; treat that as empty so null/empty
  // lines stay included. Explicit monthly 0 still yields pa 0 and is excluded.
  const monthly = readAnnexureMonthly(breakup, key);
  if (isEmptyAnnexureAmount(monthly) && n === 0) return null;
  return n;
}

/** CTC Calculator annexure lines in display order (monthly + P.A. tokens). */
const ANNEXURE_LINE_SPECS = Object.freeze([
  ['basic', '{{BASIC_M}}', '{{BASIC_PA}}'],
  ['hra', '{{HRA_M}}', '{{HRA_PA}}'],
  ['conveyance', '{{CONVEYANCE_M}}', '{{CONVEYANCE_PA}}'],
  ['bonus', '{{BONUS_M}}', '{{BONUS_PA}}'],
  ['medical', '{{MEDICAL_M}}', '{{MEDICAL_PA}}'],
  ['special', '{{SPECIAL_M}}', '{{SPECIAL_PA}}'],
  ['gross', '{{GROSS_M}}', '{{GROSS_PA}}'],
  ['ee_pf', '{{EE_PF_M}}', '{{EE_PF_PA}}'],
  ['pt', '{{PT_M}}', '{{PT_PA}}'],
  ['ee_esic', '{{EE_ESIC_M}}', '{{EE_ESIC_PA}}'],
  ['take_home', '{{TAKE_HOME_M}}', '{{TAKE_HOME_PA}}'],
  ['er_pf', '{{ER_PF_M}}', '{{ER_PF_PA}}'],
  ['er_esic', '{{ER_ESIC_M}}', '{{ER_ESIC_PA}}'],
  ['mediclaim', '{{MEDICLAIM_M}}', '{{MEDICLAIM_PA}}'],
  ['leave_encashment', '{{LEAVE_ENCASHMENT_M}}', '{{LEAVE_ENCASHMENT_PA}}'],
  ['gratuity', '{{GRATUITY_M}}', '{{GRATUITY_PA}}'],
  ['ex_gratia', '{{EX_GRATIA_M}}', '{{EX_GRATIA_PA}}'],
  ['perf_incentive', '{{PERF_INCENTIVE_M}}', '{{PERF_INCENTIVE_PA}}'],
  ['total_b', '{{TOTAL_B_M}}', '{{TOTAL_B_PA}}'],
  ['ctc', '{{CTC_M}}', '{{CTC_PA}}'],
]);

function annexurePlaceholdersFromBreakup(breakup, wefIso) {
  if (!breakup || typeof breakup !== 'object') return {};
  const out = {
    '{{SCHEME_YEAR}}': schemeYearLabel(wefIso),
    '{{WEF_SHORT}}': formatWefShort(wefIso),
  };
  const excluded = [];
  for (const [key, mTok, paTok] of ANNEXURE_LINE_SPECS) {
    const monthly = readAnnexureMonthly(breakup, key);
    const pa = readAnnexurePa(breakup, key);
    if (!shouldIncludeAnnexureLine(monthly, pa)) {
      excluded.push(mTok);
      continue;
    }
    out[mTok] = annexureAmount(monthly);
    out[paTok] = annexureAmount(pa);
  }
  if (excluded.length) out[ANNEXURE_EXCLUDE_MONTHLY_TOKENS] = excluded;
  return out;
}

function savedCtcBreakup(candidate) {
  const raw = candidate?.expected_ctc_breakup ?? candidate?.expectedCtcBreakup ?? null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const ctc = Number(raw.ctc);
  if (!Number.isFinite(ctc) || ctc <= 0) return null;
  return raw;
}

function buildOfferAnnexurePlaceholders(offer, candidate, rules = SEED_RULES_2026_27) {
  const wefIso = offer?.joining_date || todayIsoIst();
  const saved = savedCtcBreakup(candidate);
  if (saved) {
    return annexurePlaceholdersFromBreakup(saved, wefIso);
  }
  const monthlyCtc = resolveMonthlyCtc(offer, candidate);
  if (!monthlyCtc) return {};
  try {
    // Legacy candidates without a calculator snapshot — keep previous behaviour.
    const breakup = calculateCtc(rules, {
      skill: SKILL_SKILLED,
      status: STATUS_PROBATION,
      monthlyCtc,
    });
    return annexurePlaceholdersFromBreakup(breakup, wefIso);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] CTC annexure calc skipped:', err?.message || err);
    return {};
  }
}

function offerPlaceholders(offer, candidate, companyName, { rules } = {}) {
  const company = companyName || 'INDUS FIRE SAFETY PVT LTD';
  const offerDate = todayIsoIst();
  const designation = String(offer?.designation || '').trim() || '—';
  const deptClause = departmentClause(offer?.department);
  return {
    '{{OFFER_DATE}}': formatLetterDate(offerDate, { shortMonth: true, doubleSpace: true }),
    '{{CANDIDATE_NAME}}': String(candidate?.full_name || 'Candidate').trim(),
    '{{DESIGNATION}}': deptClause ? `${designation} ` : designation,
    '{{DESIGNATION_PLAIN}}': designation,
    '{{DEPARTMENT_CLAUSE}}': deptClause,
    '{{COMPANY_NAME}}': company,
    '{{JOINING_DATE_LONG}}': formatLetterDate(offer?.joining_date),
    '{{LOCATION}}': String(offer?.location || '').trim() || '—',
    '{{VALID_UNTIL}}': formatLetterDate(offer?.valid_until || offer?.respond_by, {
      shortMonth: true,
    }),
    '{{JOINING_DATE_SHORT}}': formatLetterDateAbbrev(offer?.joining_date),
    '{{JOINING_DATE_DDMMYYYY}}': formatLetterDateDdMmYyyy(offer?.joining_date),
    ...buildOfferAnnexurePlaceholders(offer, candidate, rules || SEED_RULES_2026_27),
  };
}

function formatDobShort(value) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).replace(/\.$/, '');
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${yy}`;
}

function formatDojShort(value) {
  const d = parseIsoDate(value);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).replace(/\.$/, '');
  const yy = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${yy}`;
}

function appointmentPlaceholders(appt, offer, candidate, companyName) {
  const company = companyName || 'Indus Fire Safety Pvt Ltd.';
  // Prefer Employee Master full name (enrichAppointmentCandidate), else candidate.
  const name = String(candidate?.full_name || '').trim();
  const address = splitAddress(candidate);
  const joining = appt?.joining_date;
  const monthlyCtc = resolveMonthlyCtc(offer, candidate);
  const annual =
    monthlyCtc != null
      ? monthlyCtc * 12
      : offer?.annual_ctc ?? appt?.annual_ctc;
  const letterDate = todayIsoIst();
  const axLocation =
    [candidate?.current_location, candidate?.home_town].filter(Boolean).join(',') ||
    String(appt?.location || '')
      .replace(/^the\s+/i, '')
      .trim() ||
    'Dashrath,Vadodara';
  const employeeCode = String(candidate?.employee_code || appt?.employee_code || '').trim();
  return {
    '{{APPOINTMENT_REF}}': String(appt?.appointment_ref || '').trim(),
    '{{LETTER_DATE}}': formatLetterDateDots(letterDate),
    '{{CANDIDATE_FULL}}': name ? `Mr./Ms. ${name}` : 'Mr./Ms.',
    '{{ADDRESS_LINE1}}': address.line1,
    '{{ADDRESS_LINE2}}': address.line2,
    '{{ADDRESS_LINE3}}': address.line3,
    // Attached format uses the complete name after Dear (not first name only).
    '{{CANDIDATE_NAME}}': name || 'Candidate',
    '{{FIRST_NAME}}': name || firstName(name) || 'Candidate',
    '{{DESIGNATION}}': String(appt?.designation || offer?.designation || '').trim() || '—',
    '{{COMPANY_NAME}}': company,
    '{{COMPANY_NAME_FULL}}': String(company || '')
      .replace(/\bPvt\.?\s*Ltd\.?/gi, 'Private Limited')
      .replace(/\bLtd\.?/gi, 'Limited')
      .replace(/\s+/g, ' ')
      .trim() || 'Indus Fire Safety Private Limited',
    '{{JOINING_DATE_LONG}}': formatLetterDate(joining),
    '{{LOCATION}}': String(appt?.location || '').trim() || 'the Head Office, Vadodara',
    '{{REPORTING_TO}}': String(appt?.reporting_to || '').trim() || 'HR Manager',
    '{{ANNUAL_CTC}}': formatInrAmount(annual),
    '{{AX_LOCATION}}': axLocation,
    '{{EMPLOYEE_CODE}}': employeeCode,
    '{{DEPARTMENT}}': String(appt?.department || offer?.department || '').trim() || '—',
    '{{SEGMENT}}': String(appt?.segment || 'IFSPL, HO').trim(),
    '{{DOB}}': formatDobShort(candidate?.date_of_birth || candidate?.dob),
    '{{DOJ_SHORT}}': formatDojShort(joining),
    ...buildOfferAnnexurePlaceholders(
      { ...(offer || {}), joining_date: joining || offer?.joining_date },
      candidate
    ),
  };
}

/**
 * Annexure CTC rows must be Label | Monthly | P.A. with one paragraph per cell.
 * A bad prepare pass put M+PA into the monthly cell (and left empties), which
 * inflated row height and pushed later line items onto the next page.
 */
function fixAnnexureAmountCells(xml) {
  let out = String(xml || '');
  const pairs = [
    ['{{CONVEYANCE_M}}', '{{CONVEYANCE_PA}}'],
    ['{{BONUS_M}}', '{{BONUS_PA}}'],
    ['{{MEDICAL_M}}', '{{MEDICAL_PA}}'],
    ['{{SPECIAL_M}}', '{{SPECIAL_PA}}'],
    ['{{EE_ESIC_M}}', '{{EE_ESIC_PA}}'],
    ['{{ER_ESIC_M}}', '{{ER_ESIC_PA}}'],
    ['{{MEDICLAIM_M}}', '{{MEDICLAIM_PA}}'],
    ['{{LEAVE_ENCASHMENT_M}}', '{{LEAVE_ENCASHMENT_PA}}'],
    ['{{PERF_INCENTIVE_M}}', '{{PERF_INCENTIVE_PA}}'],
  ];

  for (const [mTok, paTok] of pairs) {
    let searchFrom = 0;
    while (true) {
      const mIdx = out.indexOf(mTok, searchFrom);
      if (mIdx < 0) break;
      const trStart = out.lastIndexOf('<w:tr ', mIdx);
      const trEnd = out.indexOf('</w:tr>', mIdx);
      if (trStart < 0 || trEnd < 0) {
        searchFrom = mIdx + mTok.length;
        continue;
      }
      const row = out.slice(trStart, trEnd + 7);
      const cells = [];
      const cellRe = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
      let cm;
      while ((cm = cellRe.exec(row))) cells.push(cm[0]);
      if (cells.length < 3) {
        searchFrom = trEnd + 7;
        continue;
      }

      const paraCount = (row.match(/<w:p\b/g) || []).length;
      const healthy =
        paraCount <= 3 && cells[1].includes(mTok) && cells[2].includes(paTok) && !cells[1].includes(paTok);
      if (healthy) {
        searchFrom = trEnd + 7;
        continue;
      }

      const pPrMatch = cells[1].match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
      const rPrInner = cells[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
      const pPr =
        pPrMatch?.[0] ||
        '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>';
      const rPr = rPrInner?.[0] || '<w:rPr/>';
      const tcPr = (idx) => {
        const m = cells[idx].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
        return m ? m[0] : '<w:tcPr/>';
      };
      const makeCell = (idx, token) =>
        `<w:tc>${tcPr(idx)}<w:p>${pPr}<w:r>${rPr}<w:t>${token}</w:t></w:r></w:p></w:tc>`;
      const rowHead = row.slice(0, row.indexOf('<w:tc'));
      const rebuilt = `${rowHead}${cells[0]}${makeCell(1, mTok)}${makeCell(2, paTok)}</w:tr>`;
      out = `${out.slice(0, trStart)}${rebuilt}${out.slice(trEnd + 7)}`;
      searchFrom = trStart + rebuilt.length;
    }
  }
  return out;
}

/**
 * Drop blank paragraphs between the acceptance block and the Annexure A heading,
 * and start Annexure A on a fresh page. Those empties were leaving a large white
 * gap at the bottom of page 1 and the top of page 2 (DOCX + PDF).
 */
function tightenOfferAnnexurePageBreak(xml) {
  let out = String(xml || '');
  const emptyPara =
    '(?:<w:p\\b[^>]*/>|<w:p\\b[^>]*>\\s*(?:<w:pPr>[\\s\\S]*?</w:pPr>\\s*)?</w:p>)';

  // acceptance Name line → blank paras → centered "Annexure A" heading
  const boundary = new RegExp(
    `(<w:t>Name: ____________________[\\s\\S]*?</w:p>)` +
      `((?:\\s*${emptyPara})+)` +
      `(\\s*<w:p\\b[^>]*>\\s*<w:pPr>)` +
      `([\\s\\S]*?<w:jc w:val="center"/>[\\s\\S]*?<w:t>Annexure A</w:t>[\\s\\S]*?</w:p>)`
  );

  if (boundary.test(out)) {
    out = out.replace(boundary, (_, nameBlock, _empties, annexOpen, annexRest) => {
      const open = /w:pageBreakBefore/.test(annexOpen + annexRest)
        ? annexOpen
        : annexOpen.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>');
      return `${nameBlock}${open}${annexRest}`;
    });
  } else if (
    out.includes('<w:jc w:val="center"/>') &&
    out.includes('<w:t>Annexure A</w:t>') &&
    !out.includes('w:pageBreakBefore')
  ) {
    // Fallback: page-break the first centered Annexure A heading.
    out = out.replace(
      /(<w:p\b[^>]*>\s*<w:pPr>)([\s\S]*?<w:jc w:val="center"\/>[\s\S]*?<w:t>Annexure A<\/w:t>[\s\S]*?<\/w:p>)/,
      (full, open, rest) => (/w:pageBreakBefore/.test(full) ? full : `${open}<w:pageBreakBefore/>${rest}`)
    );
  }
  return out;
}

/**
 * Keep the offer letter layout exactly as prepared from the IFSPL Word sample.
 * Do not rewrite spacing, table widths, or annexure page breaks at generate/send.
 */
function normalizeOfferLetterDocxLayout(docxBuffer) {
  return Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
}

export async function buildOfferLetterDocx(offer, candidate, companyName) {
  const filled = await fillDocxTemplate(OFFER_TEMPLATE, offerPlaceholders(offer, candidate, companyName));
  return normalizeOfferLetterDocxLayout(filled);
}

const APPOINTMENT_COMPACT_SPACING =
  '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';

/**
 * Word's built-in "No Spacing" is incomplete in the exported styles.xml (rPr only).
 * Word still applies compact spacing; LibreOffice/Graph fall back to Normal and inflate
 * empty lines — pushing CEO/ack/name onto later pages (blank page before Annexure).
 */
function fixAppointmentNoSpacingStyle(stylesXml) {
  let out = String(stylesXml || '');
  if (!out.includes('w:styleId="NoSpacing"')) return out;
  out = out.replace(
    /<w:style([^>]*w:styleId="NoSpacing"[^>]*)>([\s\S]*?)<\/w:style>/,
    (_full, attrs, body) => {
      let next = body;
      if (!/<w:basedOn\b/.test(next)) {
        next = `<w:basedOn w:val="Normal"/>${next}`;
      }
      if (/<w:pPr>/.test(next)) {
        if (!/<w:spacing\b/.test(next)) {
          next = next.replace(/<w:pPr>/, `<w:pPr>${APPOINTMENT_COMPACT_SPACING}`);
        }
      } else {
        next = `<w:pPr>${APPOINTMENT_COMPACT_SPACING}</w:pPr>${next}`;
      }
      return `<w:style${attrs}>${next}</w:style>`;
    }
  );
  return out;
}

/**
 * LibreOffice often ignores style-level No Spacing. Pin compact spacing on every
 * NoSpacing paragraph that lacks a local w:spacing (including empty spacers).
 */
function pinAppointmentNoSpacingParagraphs(xml) {
  return String(xml || '').replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    if (!/w:val="NoSpacing"/.test(p)) return p;
    if (/<w:spacing\b/.test(p)) return p;
    if (/<w:pPr>/.test(p)) {
      return p.replace(/<w:pPr>/, `<w:pPr>${APPOINTMENT_COMPACT_SPACING}`);
    }
    return p.replace(/<w:p\b[^>]*>/, (open) => `${open}<w:pPr>${APPOINTMENT_COMPACT_SPACING}</w:pPr>`);
  });
}

/**
 * Match Word sample pagination:
 * - Candidate name stays on the signature/ack page (NOT a page break).
 * - Keep sample tab-indent on the name (slightly right) — do not center/strip tabs.
 * - Strip ALL blanks (including tab-only) between name and Annexure - I (LibreOffice blank page).
 * - "Annexure - I" starts the next page.
 */
function paragraphAt(xml, textIdx) {
  if (textIdx < 0) return null;
  const pStart = xml.lastIndexOf('<w:p ', textIdx);
  const pEnd = xml.indexOf('</w:p>', textIdx);
  if (pStart < 0 || pEnd < pStart) return null;
  return { start: pStart, end: pEnd + 6, xml: xml.slice(pStart, pEnd + 6) };
}

function paragraphPlainText(p) {
  // Do not use /<w:t[^>]*>/ — that also matches <w:tab .../> and swallows XML into "text".
  return [...String(p || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((t) => t[1])
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInsideTableCell(docXml, abs) {
  const lastTc = docXml.lastIndexOf('<w:tc', abs);
  const lastTcEnd = docXml.lastIndexOf('</w:tc>', abs);
  return lastTc > lastTcEnd;
}

function fixAppointmentAnnexureIPagination(xml) {
  let out = String(xml || '');
  const annexIdx = out.indexOf('<w:t>Annexure - I</w:t>');
  if (annexIdx < 0) return out;

  // 1) Signature-page candidate name = last non-empty body paragraph before Annexure - I
  //    (not the Employee Name cell inside Annexure II).
  const beforeAnnex = out.slice(0, annexIdx);
  const paras = [...beforeAnnex.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  let nameHit = null;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    if (isInsideTableCell(beforeAnnex, abs)) continue;
    const text = paragraphPlainText(p);
    if (!text) continue;
    if (text === 'Annexure - I' || text === 'CODE OF CONDUCT') continue;
    nameHit = { start: abs, xml: p, text, length: p.length };
    break;
  }

  // Keep sample alignment/tabs; only strip a mistaken page-break on the name.
  if (nameHit && /w:pageBreakBefore/.test(nameHit.xml)) {
    const fixed = nameHit.xml.replace(/<w:pageBreakBefore\s*\/>/g, '');
    out = `${out.slice(0, nameHit.start)}${fixed}${out.slice(nameHit.start + nameHit.length)}`;
    nameHit = { ...nameHit, xml: fixed, length: fixed.length };
  }

  // 2) Remove every empty / tab-only body paragraph between name and Annexure - I.
  //    Keeping those spacers + pageBreakBefore created a fully blank PDF page under LibreOffice.
  const annexNow = out.indexOf('<w:t>Annexure - I</w:t>');
  if (nameHit && annexNow > nameHit.start) {
    const nameEnd = nameHit.start + (out.slice(nameHit.start).indexOf('</w:p>') + 6);
    const annexParaStart = out.lastIndexOf('<w:p ', annexNow);
    if (nameEnd > 0 && annexParaStart > nameEnd) {
      const mid = out.slice(nameEnd, annexParaStart);
      const stripped = mid.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>\s*/g, (p) => {
        if (paragraphPlainText(p)) return p;
        if (/w:pageBreakBefore|w:drawing|w:pict|v:imagedata/.test(p)) return p;
        return '';
      });
      if (stripped !== mid) {
        out = `${out.slice(0, nameEnd)}${stripped}${out.slice(annexParaStart)}`;
      }
    }
  }

  // 3) Also tighten empties between the acknowledgment line and the signature name
  //    so LibreOffice does not push the name alone onto the next page.
  const ackNeedle = out.indexOf('I hereby acknowledge');
  const annexForName = out.indexOf('<w:t>Annexure - I</w:t>');
  if (ackNeedle >= 0 && annexForName > ackNeedle) {
    const before = out.slice(0, annexForName);
    const bodyParas = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
    let name = null;
    for (let i = bodyParas.length - 1; i >= 0; i--) {
      const p = bodyParas[i][0];
      const abs = bodyParas[i].index;
      if (abs < ackNeedle) break;
      if (isInsideTableCell(before, abs)) continue;
      if (!paragraphPlainText(p)) continue;
      name = { start: abs, length: p.length };
      break;
    }
    if (name) {
      const ackParaEnd = before.indexOf('</w:p>', ackNeedle) + 6;
      if (ackParaEnd > 6 && name.start > ackParaEnd) {
        // Keep a single compact spacer so the name is not glued to the ack sentence.
        const spacer = `<w:p><w:pPr><w:pStyle w:val="NoSpacing"/>${APPOINTMENT_COMPACT_SPACING}</w:pPr></w:p>`;
        out = `${out.slice(0, ackParaEnd)}${spacer}${out.slice(name.start)}`;
      }
    }
  }

  // 4) Page-break the Annexure - I paragraph only (Word sample: name on prior page).
  const annexAfter = out.indexOf('<w:t>Annexure - I</w:t>');
  const annexPara = paragraphAt(out, annexAfter);
  if (annexPara && !/w:pageBreakBefore/.test(annexPara.xml)) {
    const fixed = /<w:pPr>/.test(annexPara.xml)
      ? annexPara.xml.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>')
      : annexPara.xml.replace(/<w:p\b[^>]*>/, (open) => `${open}<w:pPr><w:pageBreakBefore/></w:pPr>`);
    out = `${out.slice(0, annexPara.start)}${fixed}${out.slice(annexPara.end)}`;
  }

  return out;
}

/**
 * LibreOffice-only prep: compact No Spacing, annexure page break, strip blank name page, font remap.
 * Exported for regression tests. Does not change the stored Word template.
 */
export function prepareAppointmentDocxForLibreOffice(docxBuffer) {
  return remapDocxFontsForLibreOffice(normalizeAppointmentLetterDocxLayout(docxBuffer));
}

/** Appointment-only layout fixes for Word-faithful PDF. Does not touch offer table/page logic. */
function normalizeAppointmentLetterDocxLayout(docxBuffer) {
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return buf;
  try {
    const zip = new PizZip(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return buf;
    const beforeDoc = docFile.asText();
    if (
      !beforeDoc.includes('Annexure II') &&
      !beforeDoc.includes('Annexure - I') &&
      !beforeDoc.includes('{{CONVEYANCE_M}}')
    ) {
      return buf;
    }

    let docXml = beforeDoc;
    docXml = fixAnnexureAmountCells(docXml);
    // Do not collapse body empty runs globally — Word sample uses them for rhythm.
    // Benefits on page 2 + tighten signature→Annexure gap (LibreOffice blank page).
    docXml = ensureAppointmentBenefitsPageBreak(docXml);
    docXml = fixAppointmentAnnexureIPagination(docXml);
    docXml = pinAppointmentNoSpacingParagraphs(docXml);

    const stylesFile = zip.file('word/styles.xml');
    const beforeStyles = stylesFile?.asText() || '';
    const stylesXml = beforeStyles ? fixAppointmentNoSpacingStyle(beforeStyles) : beforeStyles;

    if (docXml === beforeDoc && stylesXml === beforeStyles) return buf;
    zip.file('word/document.xml', docXml);
    if (stylesFile && stylesXml !== beforeStyles) zip.file('word/styles.xml', stylesXml);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] appointment layout normalize skipped:', err?.message || err);
    return buf;
  }
}

/**
 * Post-fill Word cleanup for appointment letters:
 * - Repair broken CTC amount cells (no margin/font changes).
 * - Remove empty/tab-only paragraphs between the signature name and "Annexure - I"
 *   so a blank page does not appear; Benefits starts on page 2.
 * Does not remap fonts or rewrite body spacing (LibreOffice-only path handles that).
 * Applied for both local Word COM fill and production zip fill so Word/PDF stay aligned.
 */
/**
 * Attached appointment format shows only populated address lines under To,.
 * Keep ADDRESS_LINE2/3 placeholders for multi-line addresses, but drop empty
 * paragraphs in that header block so blank lines do not inflate pagination.
 */
function stripEmptyAppointmentAddressLines(xml) {
  let out = String(xml || '');
  const titleIdx = out.indexOf('>Appointment Letter<');
  const toIdx = out.lastIndexOf('>To,<', titleIdx);
  if (titleIdx < 0 || toIdx < 0) return out;
  const titleParaStart = out.lastIndexOf('<w:p ', titleIdx);
  if (titleParaStart <= toIdx) return out;
  const head = out.slice(0, toIdx);
  const region = out.slice(toIdx, titleParaStart);
  const tail = out.slice(titleParaStart);
  const cleaned = region.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    if (paragraphPlainText(p)) return p;
    if (/w:pict|w:drawing|w:pageBreakBefore/.test(p)) return p;
    return '';
  });
  return `${head}${cleaned}${tail}`;
}

/**
 * Benefits heading must start at the top of page 2 with no preceding blank page.
 * Empty spacer paragraphs before Benefits + pageBreakBefore overflow into a blank
 * page when page-1 body is taller (e.g. multi-line address). Strip those spacers,
 * then ensure pageBreakBefore on Benefits. Used by finalize (local + production).
 */
function ensureAppointmentBenefitsPageBreak(xml) {
  let out = String(xml || '');
  let benefitsIdx = out.indexOf('<w:t>Benefits</w:t>');
  if (benefitsIdx < 0) return out;
  let para = paragraphAt(out, benefitsIdx);
  if (!para) return out;

  // Drop trailing empty body paragraphs immediately before Benefits.
  const before = out.slice(0, para.start);
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  let cutFrom = para.start;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    if (isInsideTableCell(before, abs)) break;
    if (paragraphPlainText(p)) break;
    if (/w:pict|w:drawing|w:pageBreakBefore/.test(p)) break;
    cutFrom = abs;
  }
  if (cutFrom < para.start) {
    out = `${out.slice(0, cutFrom)}${out.slice(para.start)}`;
    benefitsIdx = out.indexOf('<w:t>Benefits</w:t>');
    para = paragraphAt(out, benefitsIdx);
    if (!para) return out;
  }

  if (/w:pageBreakBefore/.test(para.xml)) return out;
  const fixed = /<w:pPr>/.test(para.xml)
    ? para.xml.replace(/<w:pPr>/, '<w:pPr><w:pageBreakBefore/>')
    : para.xml.replace(/<w:p\b[^>]*>/, (open) => `${open}<w:pPr><w:pageBreakBefore/></w:pPr>`);
  return `${out.slice(0, para.start)}${fixed}${out.slice(para.end)}`;
}

export function finalizeAppointmentLetterDocx(docxBuffer) {
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return buf;
  try {
    const zip = new PizZip(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return buf;
    const before = docFile.asText();
    let after = fixAnnexureAmountCells(before);
    after = stripEmptyAppointmentAddressLines(after);
    after = ensureAppointmentBenefitsPageBreak(after);
    after = fixAppointmentAnnexureIPagination(after);
    if (after === before) return buf;
    zip.file('word/document.xml', after);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] appointment finalize skipped:', err?.message || err);
    return buf;
  }
}

/** @deprecated use finalizeAppointmentLetterDocx — kept for call sites that only need cell repair + blank-page strip. */
function applyAppointmentAnnexureCellFixOnly(docxBuffer) {
  return finalizeAppointmentLetterDocx(docxBuffer);
}

export async function buildAppointmentLetterDocx(appt, offer, candidate, companyName) {
  const filled = await fillDocxTemplate(
    APPOINTMENT_TEMPLATE,
    appointmentPlaceholders(appt, offer, candidate, companyName)
  );
  // Keep margins/fonts/xy from the Word template. Only repair CTC cells and strip the
  // blank page between the signature name and Annexure - I (Employee Code / DOB fill
  // must not change alignment — those tokens live in Annexure II cells only).
  return finalizeAppointmentLetterDocx(filled);
}

/**
 * Rewrite template font names in a temporary DOCX so LibreOffice picks staged
 * metric-compatible families (Caladea≈Cambria, Carlito≈Calibri, Liberation Sans Narrow≈Aptos Narrow).
 * Does not modify the stored template or the Word/Graph conversion path.
 */
function remapDocxFontsForLibreOffice(docxBuffer) {
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return buf;
  try {
    const zip = new PizZip(buf);
    let changed = false;
    for (const name of Object.keys(zip.files)) {
      if (!/^word\/.+\.xml$/i.test(name) || zip.files[name].dir) continue;
      const before = zip.file(name)?.asText();
      if (!before) continue;
      let after = before;
      for (const [from, to] of LIBREOFFICE_FONT_REMAP) {
        if (!after.includes(from)) continue;
        after = after.split(from).join(to);
      }
      if (after !== before) {
        zip.file(name, after);
        changed = true;
      }
    }
    return changed ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) : buf;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] LibreOffice font remap skipped:', err?.message || err);
    return buf;
  }
}

/** Copy bundled letter fonts into the private LibreOffice profile + fontconfig path. */
function stageLibreOfficeLetterFonts(profileDir, fontConfigDir) {
  const fontDest = path.join(profileDir, 'user', 'fonts');
  fs.mkdirSync(fontDest, { recursive: true });
  fs.mkdirSync(fontConfigDir, { recursive: true });
  let staged = 0;
  if (fs.existsSync(LETTER_FONTS_DIR)) {
    for (const name of fs.readdirSync(LETTER_FONTS_DIR)) {
      if (!/\.(ttf|otf)$/i.test(name)) continue;
      const src = path.join(LETTER_FONTS_DIR, name);
      try {
        fs.copyFileSync(src, path.join(fontDest, name));
        fs.copyFileSync(src, path.join(fontConfigDir, name));
        staged += 1;
      } catch {
        /* skip unreadable font */
      }
    }
  }
  const confPath = path.join(fontConfigDir, 'fonts.conf');
  const fontsDirXml = fontConfigDir.replace(/\\/g, '/');
  fs.writeFileSync(
    confPath,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDirXml}</dir>
  <cachedir>${fontsDirXml}/cache</cachedir>
</fontconfig>
`,
    'utf8'
  );
  return { staged, confPath, fontDest };
}

async function findLibreOfficeBinary() {
  // Prefer absolute paths first — PM2 often has a minimal PATH.
  const known = [
    '/usr/lib/libreoffice/program/soffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'soffice',
    'libreoffice',
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readConvertedPdf(tmpDir, preferredPdfPath) {
  const candidates = [];
  if (preferredPdfPath && fs.existsSync(preferredPdfPath)) candidates.push(preferredPdfPath);
  try {
    for (const name of fs.readdirSync(tmpDir)) {
      if (!name.toLowerCase().endsWith('.pdf')) continue;
      const full = path.join(tmpDir, name);
      if (!candidates.includes(full)) candidates.push(full);
    }
  } catch {
    /* ignore */
  }
  for (const pdfPath of candidates) {
    try {
      const pdf = fs.readFileSync(pdfPath);
      if (pdf.length >= 100 && String(pdf.slice(0, 4)) === '%PDF') return pdf;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * True print of the Word file via LibreOffice (Linux/production).
 * This keeps letterhead, tables and spacing identical to the .docx.
 */
async function convertDocxViaLibreOffice(docxBuffer, baseName = 'letter') {
  const soffice = await findLibreOfficeBinary();
  if (!soffice) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] LibreOffice binary not found (soffice/libreoffice)');
    return null;
  }
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] LibreOffice convert skipped: empty/invalid docx buffer');
    return null;
  }

  const safeBase = String(baseName || 'letter')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'letter';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ifspl-lo-pdf-'));
  const profileDir = path.join(tmpDir, 'lo-profile');
  const fontConfigDir = path.join(tmpDir, 'fc-fonts');
  fs.mkdirSync(profileDir, { recursive: true });
  const { staged, confPath } = stageLibreOfficeLetterFonts(profileDir, fontConfigDir);
  const docxPath = path.join(tmpDir, `${safeBase}.docx`);
  const pdfPath = path.join(tmpDir, `${safeBase}.pdf`);
  fs.writeFileSync(docxPath, buf);

  // Must be a real file:// URI. LibreOffice flag is `-env:` (one dash), not `--env:`.
  // Without a private UserInstallation, headless soffice often fails under PM2 (profile lock).
  const profileUri = pathToFileURL(profileDir).href;

  const loArgs = [
    '-env:UserInstallation=' + profileUri,
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--norestore',
    '--nodefault',
    '--nolockcheck',
    '--convert-to',
    'pdf:writer_pdf_Export',
    '--outdir',
    tmpDir,
    docxPath,
  ];

  try {
    let execErr = null;
    try {
      await execFileAsync(soffice, loArgs, {
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 20 * 1024 * 1024,
        env: {
          ...process.env,
          HOME: tmpDir,
          TMPDIR: tmpDir,
          TMP: tmpDir,
          TEMP: tmpDir,
          // Headless / no X11 on servers
          SAL_USE_VCLPLUGIN: 'svp',
          LANG: process.env.LANG || 'en_US.UTF-8',
          // Prefer bundled metric-compatible fonts over DejaVu substitution.
          FONTCONFIG_FILE: confPath,
          FONTCONFIG_PATH: fontConfigDir,
        },
      });
    } catch (err) {
      // soffice often exits non-zero even when the PDF was written — check disk before failing.
      execErr = err;
    }
    if (staged > 0) {
      // eslint-disable-next-line no-console
      console.log('[admin-recruitment] LibreOffice staged letter fonts:', staged);
    }

    // soffice can return before the PDF flush completes
    let pdf = null;
    for (let i = 0; i < 40 && !pdf; i += 1) {
      pdf = readConvertedPdf(tmpDir, pdfPath);
      if (pdf) break;
      await sleep(150);
    }

    if (pdf) return pdf;

    const stderr = String(execErr?.stderr || execErr?.message || '').slice(0, 800);
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] LibreOffice PDF convert failed:', {
      soffice,
      profileUri,
      docxBytes: buf.length,
      tmpFiles: fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : [],
      stderr: stderr || '(none)',
    });
    return null;
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
 * Convert a filled .docx buffer to PDF by printing the real Word file.
 * Priority for exact margins/spacing/xy: Word COM (Windows) → Graph Word Online.
 * LibreOffice is last resort only (Linux). Set FORCE_LIBREOFFICE_PDF=1 to test that path.
 * Never rebuilds layout with pdf-lib.
 */
export async function convertDocxBufferToPdf(docxBuffer, baseName = 'letter') {
  const name = String(baseName || '').toLowerCase();
  const isOfferLetter = /\boffer\b/.test(name);
  const isAppointmentLetter = /\bappointment\b/.test(name);
  const forceLibreOffice = String(process.env.FORCE_LIBREOFFICE_PDF || '').trim() === '1';

  // Word / Graph print the filled template; appointment buffer is re-finalized so
  // production email PDF matches the stored 4-page Word letter (blank page stripped).
  const exactBuffer = isOfferLetter
    ? normalizeOfferLetterDocxLayout(docxBuffer)
    : isAppointmentLetter
      ? finalizeAppointmentLetterDocx(docxBuffer)
      : docxBuffer;

  if (!forceLibreOffice && process.platform === 'win32') {
    const viaWord = await convertDocxViaWord(exactBuffer, baseName);
    if (viaWord) {
      // eslint-disable-next-line no-console
      console.log('[admin-recruitment] PDF via Word COM:', baseName);
      return viaWord;
    }
  }

  if (!forceLibreOffice) {
    try {
      const { convertDocxToPdfViaGraph } = await import('./mail/index.js');
      const viaGraph = await convertDocxToPdfViaGraph(exactBuffer, baseName);
      if (viaGraph) {
        // eslint-disable-next-line no-console
        console.log('[admin-recruitment] PDF via Graph Word Online:', baseName);
        return viaGraph;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[admin-recruitment] Graph Word→PDF unavailable:', err?.message || err);
    }
  }

  // LibreOffice: pin spacing/page breaks, remap missing Microsoft fonts, stage OFL substitutes.
  const loBuffer = isAppointmentLetter
    ? prepareAppointmentDocxForLibreOffice(exactBuffer)
    : remapDocxFontsForLibreOffice(exactBuffer);
  if (isAppointmentLetter || forceLibreOffice) {
    // eslint-disable-next-line no-console
    console.warn(
      '[admin-recruitment] PDF via LibreOffice fallback — enable Graph Files.ReadWrite.All for Word-exact layout'
    );
  }
  const viaLo = await convertDocxViaLibreOffice(loBuffer, baseName);
  if (viaLo) {
    // eslint-disable-next-line no-console
    console.log('[admin-recruitment] PDF via LibreOffice:', baseName);
    return viaLo;
  }
  return null;
}

/** True when a Word-faithful PDF path exists (Word COM, Graph mail config, or LibreOffice). */
export async function isExactDocxPdfConversionAvailable() {
  if (process.platform === 'win32') return true;
  try {
    const { isMicrosoftGraphMailConfigured } = await import('./mail/index.js');
    if (isMicrosoftGraphMailConfigured()) return true;
  } catch {
    /* ignore */
  }
  return Boolean(await findLibreOfficeBinary());
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
  draw('You are requested to accept or decline within 24 hours from the date and time of issuance');
  y -= 4;
  draw('A detailed salary breakup is below as Annexure A.');
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
  draw(
    `I accept the offer and confirm that I will join on ${p['{{JOINING_DATE_DDMMYYYY}}'] || '[DD/MM/YYYY]'}`,
    { f: bold, size: 10 }
  );
  y -= 10;
  draw('Name: ____________________');
  y -= 8;
  draw('Signature: ____________________');
  y -= 8;
  draw('Date: ____________');

  return Buffer.from(await pdf.save());
}

/** Appointment PDF fallback for Linux/production (no Word required). Body layout unchanged; letterhead matches Letterhead.doc / offer pad. */
export async function buildAppointmentLetterPdf(appt, offer, candidate, companyName) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const p = appointmentPlaceholders(appt, offer, candidate, companyName);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  let y = 841.89 - 40;

  const letterheadPath = path.join(TEMPLATE_DIR, 'offer-assets', 'letterhead.png');
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
