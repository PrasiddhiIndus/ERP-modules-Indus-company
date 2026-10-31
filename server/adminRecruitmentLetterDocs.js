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

/** Monthly CTC saved on the candidate (recruitment CTC calculator), else offer annual/12. */
function resolveMonthlyCtc(offer, candidate) {
  const fromCand = Number(candidate?.expected_ctc);
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

function annexureAmount(value) {
  const n = roundRupee(Number(value) || 0);
  return n > 0 ? String(n) : '';
}

function annexurePlaceholdersFromBreakup(breakup, wefIso) {
  if (!breakup) return {};
  const m = (key) => Number(breakup[key]) || 0;
  const pa = (key) => roundRupee(m(key) * 12);
  return {
    '{{SCHEME_YEAR}}': schemeYearLabel(wefIso),
    '{{WEF_SHORT}}': formatWefShort(wefIso),
    '{{BASIC_M}}': annexureAmount(m('basic')),
    '{{BASIC_PA}}': annexureAmount(pa('basic')),
    '{{HRA_M}}': annexureAmount(m('hra')),
    '{{HRA_PA}}': annexureAmount(pa('hra')),
    '{{CONVEYANCE_M}}': annexureAmount(m('conveyance')),
    '{{CONVEYANCE_PA}}': annexureAmount(pa('conveyance')),
    '{{BONUS_M}}': annexureAmount(m('bonus')),
    '{{BONUS_PA}}': annexureAmount(pa('bonus')),
    '{{MEDICAL_M}}': annexureAmount(m('medical')),
    '{{MEDICAL_PA}}': annexureAmount(pa('medical')),
    '{{GROSS_M}}': annexureAmount(m('gross')),
    '{{GROSS_PA}}': annexureAmount(pa('gross')),
    '{{EE_PF_M}}': annexureAmount(m('ee_pf')),
    '{{EE_PF_PA}}': annexureAmount(pa('ee_pf')),
    '{{PT_M}}': annexureAmount(m('pt')),
    '{{PT_PA}}': annexureAmount(pa('pt')),
    '{{EE_ESIC_M}}': annexureAmount(m('ee_esic')),
    '{{EE_ESIC_PA}}': annexureAmount(pa('ee_esic')),
    '{{TAKE_HOME_M}}': annexureAmount(m('take_home')),
    '{{TAKE_HOME_PA}}': annexureAmount(pa('take_home')),
    '{{ER_PF_M}}': annexureAmount(m('er_pf')),
    '{{ER_PF_PA}}': annexureAmount(pa('er_pf')),
    '{{ER_ESIC_M}}': annexureAmount(m('er_esic')),
    '{{ER_ESIC_PA}}': annexureAmount(pa('er_esic') || m('mediclaim') * 12),
    '{{GRATUITY_M}}': annexureAmount(m('gratuity')),
    '{{GRATUITY_PA}}': annexureAmount(pa('gratuity')),
    '{{EX_GRATIA_M}}': annexureAmount(m('ex_gratia')),
    '{{EX_GRATIA_PA}}': annexureAmount(pa('ex_gratia')),
    '{{TOTAL_B_M}}': annexureAmount(m('total_b')),
    '{{TOTAL_B_PA}}': annexureAmount(pa('total_b')),
    '{{CTC_M}}': annexureAmount(m('ctc')),
    '{{CTC_PA}}': annexureAmount(pa('ctc')),
  };
}

function buildOfferAnnexurePlaceholders(offer, candidate, rules = SEED_RULES_2026_27) {
  const monthlyCtc = resolveMonthlyCtc(offer, candidate);
  if (!monthlyCtc) return {};
  try {
    const breakup = calculateCtc(rules, {
      skill: SKILL_SKILLED,
      status: STATUS_PROBATION,
      monthlyCtc,
    });
    return annexurePlaceholdersFromBreakup(breakup, offer?.joining_date || todayIsoIst());
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
    '{{COMPANY_NAME_FULL}}': String(company || '')
      .replace(/\bPvt\.?\s*Ltd\.?/gi, 'Private Limited')
      .replace(/\bLtd\.?/gi, 'Limited')
      .replace(/\s+/g, ' ')
      .trim() || 'Indus Fire Safety Private Limited',
    '{{JOINING_DATE_LONG}}': formatLetterDate(joining),
    '{{LOCATION}}': String(appt?.location || '').trim() || 'the Head Office, Vadodara',
    '{{REPORTING_TO}}': String(appt?.reporting_to || '').trim() || 'HR Manager',
    '{{ANNUAL_CTC}}': formatInrAmount(annual),
    '{{CANDIDATE_NAME}}': name || 'Candidate',
    '{{AX_LOCATION}}': axLocation,
    '{{EMPLOYEE_CODE}}': String(candidate?.employee_code || appt?.employee_code || '').trim(),
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
    ['{{EE_ESIC_M}}', '{{EE_ESIC_PA}}'],
    ['{{ER_ESIC_M}}', '{{ER_ESIC_PA}}'],
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
 * LibreOffice PDF reflows the IFSPL offer details table when label columns are too
 * narrow / auto-sized (e.g. "Designatio|n"). Pin column widths and keep the
 * acceptance block together — content and placeholders are unchanged.
 */
function normalizeOfferLetterDocxLayout(docxBuffer) {
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return buf;
  try {
    const zip = new PizZip(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return buf;
    let xml = docFile.asText();
    // Offer-letter markers only (case-sensitive). Appointment letters mention
    // "date of joining" / "work location" in prose and must never be rewritten.
    if (
      !xml.includes('Designation') ||
      !xml.includes('Date of Joining') ||
      !xml.includes('Work Location') ||
      !xml.includes('I accept the above offer')
    ) {
      return buf;
    }

    const before = xml;
    xml = fixAnnexureAmountCells(xml);
    xml = tightenOfferAnnexurePageBreak(xml);

    const tableAlreadyPinned =
      xml.includes('w:gridCol w:w="2400"') && xml.includes('w:keepNext') && xml.includes('w:wordWrap');

    if (!tableAlreadyPinned) {
      const LABEL_W = 2400;
      const VALUE_W = 3200;
      const TABLE_W = LABEL_W + VALUE_W;

      xml = xml.replace(
        /<w:tblPr><w:tblW w:w="0" w:type="auto"\/>/,
        `<w:tblPr><w:tblW w:w="${TABLE_W}" w:type="dxa"/>`
      );
      xml = xml.replace(
        /<w:tblGrid><w:gridCol w:w="\d+"\/><w:gridCol w:w="\d+"\/><\/w:tblGrid>/,
        `<w:tblGrid><w:gridCol w:w="${LABEL_W}"/><w:gridCol w:w="${VALUE_W}"/></w:tblGrid>`
      );

      let tcIdx = 0;
      xml = xml.replace(/<w:tcW w:w="0" w:type="auto"\/>/g, () => {
        const w = tcIdx % 2 === 0 ? LABEL_W : VALUE_W;
        tcIdx += 1;
        return `<w:tcW w:w="${w}" w:type="dxa"/>`;
      });
      // Already-fixed cells from a prior pass / template
      xml = xml.replace(/<w:tcW w:w="(?:1437|2317)" w:type="dxa"\/>/g, () => {
        const w = tcIdx % 2 === 0 ? LABEL_W : VALUE_W;
        tcIdx += 1;
        return `<w:tcW w:w="${w}" w:type="dxa"/>`;
      });

      for (const label of ['Designation', 'Date of Joining', 'Work Location']) {
        const needle = `<w:spacing w:after="160" w:line="278" w:lineRule="auto"/></w:pPr><w:r w:rsidRPr="00404325"><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${label}</w:t>`;
        const repl = `<w:keepLines/><w:wordWrap w:val="0"/><w:spacing w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:r w:rsidRPr="00404325"><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${label}</w:t>`;
        if (xml.includes(needle)) xml = xml.replace(needle, repl);
      }

      if (!xml.includes('w:keepNext') && xml.includes('I accept the above offer')) {
        xml = xml.replace(
          /(<w:p[^>]*>)(\s*<w:r[^>]*>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>\s*)?<w:t>I accept the above offer)/,
          '$1<w:pPr><w:keepNext/><w:keepLines/></w:pPr>$2'
        );
      }
      if (
        xml.includes('Name: ____________________') &&
        !/<w:t>Name: ____________________<\/w:t>[\s\S]{0,40}<\/w:r>[\s\S]{0,80}<w:keepLines\/>/.test(xml)
      ) {
        xml = xml.replace(
          /(<w:p[^>]*>)(\s*<w:r[^>]*>\s*(?:<w:rPr>[\s\S]*?<\/w:rPr>\s*)?<w:t>Name: ____________________)/,
          (full, pOpen, rest) => (full.includes('w:keepLines') ? full : `${pOpen}<w:pPr><w:keepLines/></w:pPr>${rest}`)
        );
      }
    }

    if (xml === before) return buf;
    zip.file('word/document.xml', xml);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] offer layout normalize skipped:', err?.message || err);
    return buf;
  }
}

export async function buildOfferLetterDocx(offer, candidate, companyName) {
  const filled = await fillDocxTemplate(OFFER_TEMPLATE, offerPlaceholders(offer, candidate, companyName));
  return normalizeOfferLetterDocxLayout(filled);
}

/** Appointment-only: fix annexure amount cell packing. Does not touch offer table/page logic. */
function normalizeAppointmentLetterDocxLayout(docxBuffer) {
  const buf = Buffer.isBuffer(docxBuffer) ? docxBuffer : Buffer.from(docxBuffer || []);
  if (buf.length < 100) return buf;
  try {
    const zip = new PizZip(buf);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return buf;
    const before = docFile.asText();
    if (!before.includes('Annexure II') && !before.includes('{{CONVEYANCE_M}}')) return buf;
    const xml = fixAnnexureAmountCells(before);
    if (xml === before) return buf;
    zip.file('word/document.xml', xml);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] appointment layout normalize skipped:', err?.message || err);
    return buf;
  }
}

export async function buildAppointmentLetterDocx(appt, offer, candidate, companyName) {
  const filled = await fillDocxTemplate(APPOINTMENT_TEMPLATE, appointmentPlaceholders(appt, offer, candidate, companyName));
  return normalizeAppointmentLetterDocxLayout(filled);
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
  fs.mkdirSync(profileDir, { recursive: true });
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
        },
      });
    } catch (err) {
      // soffice often exits non-zero even when the PDF was written — check disk before failing.
      execErr = err;
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
 * Priority: Word COM (Windows) → Graph Word Online → LibreOffice (Linux/production).
 * Never rebuilds layout with pdf-lib. Email always attaches PDF (same as CTC details mail).
 */
export async function convertDocxBufferToPdf(docxBuffer, baseName = 'letter') {
  // Offer: table pin + annexure cell fix. Appointment: annexure cell fix only.
  // Never apply offer table/page-break rewrites to appointment PDFs.
  const name = String(baseName || '').toLowerCase();
  const isOfferLetter = /\boffer\b/.test(name);
  const isAppointmentLetter = /\bappointment\b/.test(name);
  const printBuffer = isOfferLetter
    ? normalizeOfferLetterDocxLayout(docxBuffer)
    : isAppointmentLetter
      ? normalizeAppointmentLetterDocxLayout(docxBuffer)
      : docxBuffer;

  if (process.platform === 'win32') {
    const viaWord = await convertDocxViaWord(printBuffer, baseName);
    if (viaWord) return viaWord;
  }

  try {
    const { convertDocxToPdfViaGraph } = await import('./mail/index.js');
    const viaGraph = await convertDocxToPdfViaGraph(printBuffer, baseName);
    if (viaGraph) return viaGraph;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[admin-recruitment] Graph Word→PDF unavailable:', err?.message || err);
  }

  // Linux/production: LibreOffice prints the filled .docx (same path used when Graph Word Online is unavailable).
  const viaLo = await convertDocxViaLibreOffice(printBuffer, baseName);
  if (viaLo) return viaLo;
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
