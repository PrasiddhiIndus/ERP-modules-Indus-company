/**
 * Official HR letters — HTML print preview + DOCX placeholder fill (offer-letter style).
 */
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { normalizeToIsoDate } from '../utils/dateDisplay';
import {
  formatOfferDateLong,
  formatOfferDateDdMmYyyy,
  sanitizeOfferFileNamePart,
} from './offerLetterDocuments';

export const OFFICIAL_LETTER_TEMPLATE_PATH = '/templates/official-letters/official-letter.docx';

export const OFFICIAL_LETTER_TYPES = [
  { value: 'warning', label: 'Warning letter' },
  { value: 'show_cause', label: 'Show-cause notice' },
  { value: 'appointment', label: 'Appointment letter' },
  { value: 'experience', label: 'Experience letter' },
  { value: 'confirmation', label: 'Confirmation letter' },
  { value: 'promotion', label: 'Promotion letter' },
  { value: 'other', label: 'Other official letter' },
];

export function officialLetterTypeLabel(value) {
  return OFFICIAL_LETTER_TYPES.find((t) => t.value === value)?.label || 'Official letter';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function defaultSubject(letterType) {
  switch (letterType) {
    case 'warning':
      return 'Warning Letter';
    case 'show_cause':
      return 'Show-Cause Notice';
    case 'appointment':
      return 'Appointment Letter';
    case 'experience':
      return 'Experience Letter';
    case 'confirmation':
      return 'Confirmation of Employment';
    case 'promotion':
      return 'Promotion Letter';
    default:
      return 'Official Letter';
  }
}

function defaultLetterBody(letterType, placeholders) {
  const name = placeholders['{{EMP_NAME}}'] || 'Employee';
  const designation = placeholders['{{DESIGNATION}}'] || 'your designation';
  const doj = placeholders['{{DOJ}}'] || 'your date of joining';
  const effective = placeholders['{{EFFECTIVE_DATE}}'] || 'the effective date';
  const newDesig = placeholders['{{NEW_DESIGNATION}}'] || designation;

  switch (letterType) {
    case 'warning':
      return `This letter is issued as a formal warning regarding the matter stated below. You are advised to take corrective action immediately and ensure that such instances are not repeated. Continued non-compliance may lead to further disciplinary action as per company policy.`;
    case 'show_cause':
      return `You are hereby required to show cause in writing within the stipulated time why disciplinary action should not be taken against you for the matter stated below. Your written explanation should be submitted to the undersigned.`;
    case 'appointment':
      return `We are pleased to confirm your appointment as ${designation}. Your employment with the company shall be governed by the terms and conditions of employment and applicable company policies, with effect from ${doj}.`;
    case 'experience':
      return `This is to certify that ${name} was employed with Indus Fire Safety Pvt. Ltd. in the capacity of ${designation}. During the tenure, the employee performed duties assigned from time to time. We wish ${name} success in future endeavours.`;
    case 'confirmation':
      return `Pursuant to satisfactory completion of the probation period and review(s), we are pleased to confirm your employment as ${designation} with effect from ${effective}. All other terms and conditions of your employment remain unchanged unless otherwise communicated in writing.`;
    case 'promotion':
      return `We are pleased to inform you that you have been promoted to the position of ${newDesig} with effect from ${effective}. We appreciate your contribution and look forward to your continued performance in the new role.`;
    default:
      return `Please find this official communication regarding the subject stated above. Kindly acknowledge receipt and take note of the particulars mentioned herein.`;
  }
}

/**
 * Build placeholder map for official letter templates.
 * @param {object} letter
 */
export function buildOfficialLetterPlaceholders(letter) {
  const letterDateIso = normalizeToIsoDate(letter?.letterDate) || normalizeToIsoDate(new Date());
  const dojIso = normalizeToIsoDate(letter?.dateOfJoining) || '';
  const effectiveIso = normalizeToIsoDate(letter?.effectiveDate) || '';
  const letterType = String(letter?.letterType || 'other').trim();
  const subject = String(letter?.subject || '').trim() || defaultSubject(letterType);

  const base = {
    '{{REF_NO}}': String(letter?.referenceNo || '').trim(),
    '{{LETTER_DATE}}': formatOfferDateLong(letterDateIso),
    '{{LETTER_DATE_SHORT}}': formatOfferDateDdMmYyyy(letterDateIso),
    '{{EMP_CODE}}': String(letter?.employeeCode || '').trim(),
    '{{EMP_NAME}}': String(letter?.employeeName || letter?.fullName || '').trim(),
    '{{DESIGNATION}}': String(letter?.designation || '').trim(),
    '{{DEPARTMENT}}': String(letter?.department || '').trim(),
    '{{DOJ}}': formatOfferDateDdMmYyyy(dojIso),
    '{{SUBJECT}}': subject,
    '{{REASON}}': String(letter?.reason || '').trim(),
    '{{EFFECTIVE_DATE}}': formatOfferDateDdMmYyyy(effectiveIso) || formatOfferDateLong(letterDateIso),
    '{{NEW_DESIGNATION}}': String(letter?.newDesignation || letter?.designation || '').trim(),
    '{{NOTES}}': String(letter?.notes || '').trim(),
    '{{LETTER_TYPE}}': officialLetterTypeLabel(letterType),
  };

  const customBody = String(letter?.letterBody || '').trim();
  base['{{LETTER_BODY}}'] = customBody || defaultLetterBody(letterType, base);
  return base;
}

function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || '');
  for (const [token, value] of Object.entries(placeholders)) {
    out = out.split(token).join(escapeXmlText(value));
  }
  return out;
}

async function fetchTemplateArrayBuffer(templatePath) {
  const res = await fetch(templatePath);
  if (!res.ok) {
    throw new Error(`Could not load official letter template (${res.status}).`);
  }
  return res.arrayBuffer();
}

export async function buildOfficialLetterBlob(letter) {
  const buffer = await fetchTemplateArrayBuffer(OFFICIAL_LETTER_TEMPLATE_PATH);
  const zip = new PizZip(buffer);
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) {
    throw new Error('Invalid official letter template.');
  }
  const placeholders = buildOfficialLetterPlaceholders(letter);
  zip.file('word/document.xml', applyPlaceholdersToXml(documentXml, placeholders));
  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export function officialLetterFileName(letter) {
  const name = sanitizeOfferFileNamePart(letter?.employeeName || letter?.fullName || 'Employee');
  const type = sanitizeOfferFileNamePart(officialLetterTypeLabel(letter?.letterType));
  const code = sanitizeOfferFileNamePart(letter?.employeeCode || 'letter');
  return `${name} - ${type} (${code}).docx`;
}

export async function downloadOfficialLetter(letter) {
  const blob = await buildOfficialLetterBlob(letter);
  const fileName = officialLetterFileName(letter);
  // Prefer an <a download> click — FileSaver's last-resort fallback opens a blank tab.
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    saveAs(blob, fileName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 40_000);
  }
  return fileName;
}

/** Build print HTML for an official letter (used by popup + in-app preview). */
export function buildOfficialLetterHtml(letter) {
  const p = buildOfficialLetterPlaceholders(letter);
  const typeLabel = officialLetterTypeLabel(letter?.letterType);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(typeLabel)} — ${escapeHtml(p['{{EMP_NAME}}'])}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111; max-width: 720px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 14pt; text-align: center; margin: 18px 0; text-transform: uppercase; letter-spacing: 0.02em; }
    .meta { margin-bottom: 8px; }
    .clause { margin: 12px 0; white-space: pre-wrap; }
    .muted { color: #444; font-size: 11pt; }
    @media print { body { margin: 0; max-width: none; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="meta"><strong>Ref No:</strong> ${escapeHtml(p['{{REF_NO}}']) || '—'}</div>
  <div class="meta"><strong>Date:</strong> ${escapeHtml(p['{{LETTER_DATE}}'])}</div>
  <p>To,<br/>
  ${escapeHtml(p['{{EMP_NAME}}'])}<br/>
  Emp Code: ${escapeHtml(p['{{EMP_CODE}}'])}<br/>
  Designation: ${escapeHtml(p['{{DESIGNATION}}'])}<br/>
  Department: ${escapeHtml(p['{{DEPARTMENT}}'])}<br/>
  Date of Joining: ${escapeHtml(p['{{DOJ}}']) || '—'}
  </p>
  <h1>${escapeHtml(p['{{SUBJECT}}'])}</h1>
  <p>Dear ${escapeHtml(p['{{EMP_NAME}}'])},</p>
  <p class="clause">${escapeHtml(p['{{LETTER_BODY}}'])}</p>
  ${p['{{REASON}}'] ? `<p><strong>Particulars:</strong> ${escapeHtml(p['{{REASON}}'])}</p>` : ''}
  ${letter?.letterType === 'promotion' && p['{{NEW_DESIGNATION}}'] ? `<p><strong>New designation:</strong> ${escapeHtml(p['{{NEW_DESIGNATION}}'])}</p>` : ''}
  ${p['{{EFFECTIVE_DATE}}'] ? `<p><strong>Effective date:</strong> ${escapeHtml(p['{{EFFECTIVE_DATE}}'])}</p>` : ''}
  ${p['{{NOTES}}'] ? `<p class="muted"><strong>Notes:</strong> ${escapeHtml(p['{{NOTES}}'])}</p>` : ''}
  <p><br/>For Indus Fire Safety Pvt. Ltd.</p>
  <p><br/>Authorized Signatory</p>
  <p class="muted">Employee acknowledgement<br/>
  Signature: __________________________ &nbsp;&nbsp; Date: ____________________</p>
</body>
</html>`;
}

/**
 * Open letter HTML in a new tab (optional). Prefer in-app preview via buildOfficialLetterHtml.
 * Does not auto-print (printing a blob tab before load shows a blank page).
 */
export function openOfficialLetterPrintPreview(letter) {
  const html = buildOfficialLetterHtml(letter);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked. Use Preview in the form instead.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

/** Payload shape stored in body_fields jsonb / used for re-preview. */
export function letterPayloadFromEmployeeAndForm(employee, form) {
  return {
    letterType: form.letterType,
    subject: form.subject,
    reason: form.reason,
    notes: form.notes,
    referenceNo: form.referenceNo,
    letterDate: form.letterDate,
    effectiveDate: form.effectiveDate,
    newDesignation: form.newDesignation,
    letterBody: form.letterBody,
    employeeCode: employee?.employee_code,
    employeeName: employee?.full_name,
    fullName: employee?.full_name,
    designation: employee?.designation,
    department: employee?.department,
    dateOfJoining: employee?.date_of_joining,
  };
}
