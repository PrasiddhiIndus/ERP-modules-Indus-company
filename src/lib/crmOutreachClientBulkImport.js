import * as XLSX from 'xlsx';
import {
  BUSINESS_MODULES,
  BUSINESS_MODULE_IMPORT_LABELS,
  OUTREACH_STATUSES,
  SITE_STATUSES,
} from '../pages/crmOutreach/data/outreachConstants';

/** Fixed headers — must match bulk_import_sample_template.xlsx column order and names. */
export const CRM_OUTREACH_BULK_COLUMNS = [
  { key: 'clientName', label: 'Client/Site Name', required: true },
  { key: 'location', label: 'Location', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'adminFireSup', label: 'Admin-Fire Sup.', required: false },
  { key: 'designation', label: 'Designation', required: false },
  { key: 'mobile', label: 'Mobile', required: false },
  { key: 'mailId', label: 'mail id', required: false },
  { key: 'secondaryContactName', label: 'Secondary Contact Name', required: false },
  { key: 'secondaryContactDesignation', label: 'Secondary Contact Designation', required: false },
  { key: 'secondaryContactMobile', label: 'Secondary Contact Mobile', required: false },
  { key: 'secondaryContactEmail', label: 'Secondary Contact Email', required: false },
  { key: 'manpowerRequired', label: 'Manpower Required', required: false },
  { key: 'siteStatus', label: 'Site Status', required: false },
  { key: 'module', label: 'Module', required: false },
  { key: 'outreachStatus', label: 'Outreach Status', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
  { key: 'rawNotes', label: 'raw_notes', required: false },
];

export const CRM_OUTREACH_BULK_TEMPLATE_FILENAME = 'bulk_import_sample_template.xlsx';

export const CRM_OUTREACH_BULK_MAX_ROWS = 500;

const MODULE_LABEL_TO_ID = Object.fromEntries(
  Object.entries(BUSINESS_MODULE_IMPORT_LABELS).map(([id, label]) => [normalizeHeader(label), id])
);
Object.keys(BUSINESS_MODULES).forEach((id) => {
  MODULE_LABEL_TO_ID[normalizeHeader(id)] = id;
  MODULE_LABEL_TO_ID[normalizeHeader(BUSINESS_MODULES[id].label)] = id;
});

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\u00a0]/g, ' ')
    .replace(/\s+/g, ' ');
}

function sheetToMatrix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        resolve(matrix);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

function mapHeaders(headerRow) {
  const normalized = headerRow.map((h) => normalizeHeader(h));
  const indexByKey = {};
  const missing = [];

  for (const col of CRM_OUTREACH_BULK_COLUMNS) {
    const idx = normalized.findIndex((h) => h === normalizeHeader(col.label));
    if (idx >= 0) {
      indexByKey[col.key] = idx;
    } else if (col.required) {
      missing.push(col.label);
    }
  }

  return { indexByKey, missing };
}

function cellValue(row, index) {
  if (index === undefined || index < 0) return '';
  const raw = row[index];
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function isValidEmail(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function parseInteger(value) {
  const text = String(value ?? '').trim();
  if (!text) return { ok: true, value: null };
  const num = Number(text);
  if (!Number.isInteger(num) || num < 0) {
    return { ok: false, value: null };
  }
  return { ok: true, value: num };
}

function resolveModule(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: true, value: 'fire' };
  const key = normalizeHeader(text);
  const id = MODULE_LABEL_TO_ID[key];
  if (!id) return { ok: false, value: null };
  return { ok: true, value: id };
}

function resolveEnum(raw, allowed) {
  const text = String(raw || '').trim();
  if (!text) return { ok: true, value: null };
  const match = allowed.find((v) => normalizeHeader(v) === normalizeHeader(text));
  if (!match) return { ok: false, value: text };
  return { ok: true, value: match };
}

export function normalizeClientSiteName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function pickField(target, key, value) {
  if (value !== null && value !== undefined && String(value).trim() !== '') {
    target[key] = value;
  }
}

function mergeParsedRows(parsedRows) {
  const groups = new Map();

  for (const row of parsedRows) {
    const key = normalizeClientSiteName(row.clientName);
    if (!groups.has(key)) {
      groups.set(key, {
        clientName: row.clientName,
        location: null,
        state: null,
        adminFireSup: null,
        designation: null,
        mobile: null,
        mailId: null,
        secondaryContactName: null,
        secondaryContactDesignation: null,
        secondaryContactMobile: null,
        secondaryContactEmail: null,
        manpowerRequired: null,
        siteStatus: null,
        module: 'fire',
        outreachStatus: 'Active',
        remarks: null,
        rawNotes: null,
        extraEmails: [],
        sourceRows: [],
      });
    }

    const acc = groups.get(key);
    acc.sourceRows.push(row.row);

    pickField(acc, 'location', row.location);
    pickField(acc, 'state', row.state);
    pickField(acc, 'manpowerRequired', row.manpowerRequired);
    pickField(acc, 'siteStatus', row.siteStatus);
    pickField(acc, 'module', row.module);
    pickField(acc, 'outreachStatus', row.outreachStatus);
    pickField(acc, 'remarks', row.remarks);
    if (row.rawNotes) {
      acc.rawNotes = acc.rawNotes ? `${acc.rawNotes}\n${row.rawNotes}` : row.rawNotes;
    }

    const rowHasSecondary = Boolean(
      row.secondaryContactName ||
        row.secondaryContactDesignation ||
        row.secondaryContactMobile ||
        row.secondaryContactEmail
    );

    if (rowHasSecondary) {
      if (!acc.secondaryContactName) {
        pickField(acc, 'secondaryContactName', row.secondaryContactName);
        pickField(acc, 'secondaryContactDesignation', row.secondaryContactDesignation);
        pickField(acc, 'secondaryContactMobile', row.secondaryContactMobile);
        pickField(acc, 'secondaryContactEmail', row.secondaryContactEmail);
      } else if (row.secondaryContactEmail && row.secondaryContactEmail !== acc.secondaryContactEmail) {
        acc.extraEmails.push(row.secondaryContactEmail);
      }
      if (!acc.adminFireSup && row.adminFireSup) {
        pickField(acc, 'adminFireSup', row.adminFireSup);
        pickField(acc, 'designation', row.designation);
        pickField(acc, 'mobile', row.mobile);
        pickField(acc, 'mailId', row.mailId);
      }
    } else if (row.adminFireSup || row.mailId || row.mobile || row.designation) {
      if (!acc.adminFireSup && !acc.mailId) {
        pickField(acc, 'adminFireSup', row.adminFireSup);
        pickField(acc, 'designation', row.designation);
        pickField(acc, 'mobile', row.mobile);
        pickField(acc, 'mailId', row.mailId);
      } else if (!acc.secondaryContactName) {
        pickField(acc, 'secondaryContactName', row.adminFireSup);
        pickField(acc, 'secondaryContactDesignation', row.designation);
        pickField(acc, 'secondaryContactMobile', row.mobile);
        pickField(acc, 'secondaryContactEmail', row.mailId);
      } else if (row.mailId && row.mailId !== acc.mailId && row.mailId !== acc.secondaryContactEmail) {
        acc.extraEmails.push(row.mailId);
      }
    }
  }

  return [...groups.values()];
}

export function downloadOutreachClientBulkTemplate() {
  const headers = CRM_OUTREACH_BULK_COLUMNS.map((c) => c.label);
  const sampleRow = CRM_OUTREACH_BULK_COLUMNS.map((col) => {
    switch (col.key) {
      case 'clientName':
        return 'Sample Site — Gandhinagar';
      case 'location':
        return 'Gandhinagar';
      case 'state':
        return 'Gujarat';
      case 'adminFireSup':
        return 'Rajesh Kumar';
      case 'designation':
        return 'Admin-Fire Sup.';
      case 'mobile':
        return '9876543210';
      case 'mailId':
        return 'admin@example.com';
      case 'secondaryContactName':
        return 'Priya Shah';
      case 'secondaryContactDesignation':
        return 'Safety Officer';
      case 'secondaryContactMobile':
        return '9123456780';
      case 'secondaryContactEmail':
        return 'safety@example.com';
      case 'manpowerRequired':
        return 4;
      case 'siteStatus':
        return 'Active';
      case 'module':
        return BUSINESS_MODULE_IMPORT_LABELS.fire;
      case 'outreachStatus':
        return 'Active';
      case 'remarks':
        return 'Sample row — delete before import';
      case 'rawNotes':
        return '';
      default:
        return '';
    }
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  XLSX.writeFile(wb, CRM_OUTREACH_BULK_TEMPLATE_FILENAME);
}

export async function parseOutreachClientBulkFile(file) {
  const matrix = await sheetToMatrix(file);
  if (!matrix.length) {
    return { records: [], errors: ['File is empty.'], valid: false, rawRowCount: 0 };
  }

  const headerRow = matrix[0];
  const { indexByKey, missing } = mapHeaders(headerRow);
  if (missing.length) {
    return {
      records: [],
      errors: [
        `Missing required columns: ${missing.join(', ')}. Download the sample template and do not rename headers.`,
      ],
      valid: false,
      rawRowCount: 0,
    };
  }

  const errors = [];
  const parsedRows = [];

  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;

    const rowNum = i + 1;
    const clientName = cellValue(line, indexByKey.clientName);
    if (!clientName) {
      errors.push(`Row ${rowNum}: Client/Site Name is required.`);
      continue;
    }

    const mailId = cellValue(line, indexByKey.mailId);
    const secondaryEmail = cellValue(line, indexByKey.secondaryContactEmail);
    if (!isValidEmail(mailId)) errors.push(`Row ${rowNum}: invalid mail id "${mailId}".`);
    if (!isValidEmail(secondaryEmail)) {
      errors.push(`Row ${rowNum}: invalid Secondary Contact Email "${secondaryEmail}".`);
    }

    const manpowerRaw = cellValue(line, indexByKey.manpowerRequired);
    const manpowerParsed = parseInteger(manpowerRaw);
    if (!manpowerParsed.ok) {
      errors.push(`Row ${rowNum}: Manpower Required must be a whole number (got "${manpowerRaw}").`);
    }

    const moduleRaw = cellValue(line, indexByKey.module);
    const moduleParsed = resolveModule(moduleRaw);
    if (!moduleParsed.ok) {
      errors.push(`Row ${rowNum}: invalid Module "${moduleRaw}".`);
    }

    const outreachRaw = cellValue(line, indexByKey.outreachStatus);
    const outreachParsed = resolveEnum(outreachRaw, OUTREACH_STATUSES);
    if (!outreachParsed.ok) {
      errors.push(`Row ${rowNum}: invalid Outreach Status "${outreachRaw}".`);
    }

    const siteStatusRaw = cellValue(line, indexByKey.siteStatus);
    const siteStatusParsed = resolveEnum(siteStatusRaw, SITE_STATUSES);
    if (!siteStatusParsed.ok) {
      errors.push(`Row ${rowNum}: invalid Site Status "${siteStatusRaw}".`);
    }

    parsedRows.push({
      row: rowNum,
      clientName,
      location: cellValue(line, indexByKey.location) || null,
      state: cellValue(line, indexByKey.state) || null,
      adminFireSup: cellValue(line, indexByKey.adminFireSup) || null,
      designation: cellValue(line, indexByKey.designation) || null,
      mobile: cellValue(line, indexByKey.mobile) || null,
      mailId: mailId || null,
      secondaryContactName: cellValue(line, indexByKey.secondaryContactName) || null,
      secondaryContactDesignation: cellValue(line, indexByKey.secondaryContactDesignation) || null,
      secondaryContactMobile: cellValue(line, indexByKey.secondaryContactMobile) || null,
      secondaryContactEmail: secondaryEmail || null,
      manpowerRequired: manpowerParsed.value,
      siteStatus: siteStatusParsed.value,
      module: moduleParsed.value || 'fire',
      outreachStatus: outreachParsed.value || 'Active',
      remarks: cellValue(line, indexByKey.remarks) || null,
      rawNotes: cellValue(line, indexByKey.rawNotes) || null,
    });
  }

  if (!parsedRows.length) {
    errors.push('No data rows found.');
    return { records: [], errors, valid: false, rawRowCount: 0 };
  }

  if (parsedRows.length > CRM_OUTREACH_BULK_MAX_ROWS) {
    errors.push(`Maximum ${CRM_OUTREACH_BULK_MAX_ROWS} rows per import (found ${parsedRows.length}).`);
  }

  const records = mergeParsedRows(parsedRows);
  const valid = errors.length === 0 && records.length > 0;

  return {
    records,
    errors,
    valid,
    rawRowCount: parsedRows.length,
  };
}

export function buildOutreachImportErrorReportCsv(results) {
  const failed = (results || []).filter((r) => !r.ok);
  const lines = ['client_site_name,source_rows,action,error'];
  for (const r of failed) {
    const name = String(r.clientName ?? '').replace(/"/g, '""');
    const rows = String((r.sourceRows || []).join('; ')).replace(/"/g, '""');
    const action = String(r.action ?? '').replace(/"/g, '""');
    const err = String(r.error ?? 'Failed').replace(/"/g, '""');
    lines.push(`"${name}","${rows}","${action}","${err}"`);
  }
  return lines.join('\n');
}

export function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function outreachImportRecordToPayload(record) {
  const emails = [];
  if (record.mailId) emails.push(record.mailId);
  if (record.secondaryContactEmail && record.secondaryContactEmail !== record.mailId) {
    emails.push(record.secondaryContactEmail);
  }
  for (const extra of record.extraEmails || []) {
    if (extra && !emails.includes(extra)) emails.push(extra);
  }

  return {
    name: record.clientName,
    contact: record.adminFireSup || '',
    email: record.mailId || emails[0] || '',
    emails,
    city: record.location || '',
    state: record.state || '',
    primaryDesignation: record.designation || '',
    primaryMobile: record.mobile || '',
    secondaryName: record.secondaryContactName || '',
    secondaryDesignation: record.secondaryContactDesignation || '',
    secondaryMobile: record.secondaryContactMobile || '',
    secondaryEmail: record.secondaryContactEmail || '',
    manpowerRequired: record.manpowerRequired,
    siteStatus: record.siteStatus || '',
    module: record.module || 'fire',
    status: record.outreachStatus || 'Active',
    remarks: record.remarks || '',
    rawNotes: record.rawNotes || '',
    sourceRows: record.sourceRows,
  };
}
