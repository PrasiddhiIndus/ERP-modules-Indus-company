import * as XLSX from 'xlsx';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';

/** Excel / form fields. Labels match the lead sheet the team uploads. */
export const LEAD_FIELDS = [
  {
    key: 'company',
    label: 'Company',
    sheet: 'Company',
    required: true,
    aliases: ['company', 'company name', 'organisation', 'organization', 'client', 'client name'],
  },
  {
    key: 'project',
    label: 'Project',
    sheet: 'Project',
    aliases: ['project', 'project name', 'project description'],
  },
  {
    key: 'project_type',
    label: 'Project type',
    sheet: 'Project Type',
    aliases: ['project type', 'project t', 'type', 'projecttype'],
  },
  {
    key: 'ownership',
    label: 'Ownership',
    sheet: 'Ownership',
    aliases: ['ownership', 'owner', 'ownership type'],
  },
  {
    key: 'industry',
    label: 'Industry',
    sheet: 'Industry',
    aliases: ['industry', 'industry type'],
  },
  {
    key: 'project_cost',
    label: 'Project cost',
    sheet: 'Project Cost',
    aliases: ['project cost', 'project c', 'cost', 'projectcost', 'capex'],
  },
  {
    key: 'project_stage',
    label: 'Project stage',
    sheet: 'Project Stage',
    aliases: ['project stage', 'stage', 'project status'],
  },
  {
    key: 'location',
    label: 'Location',
    sheet: 'Location',
    aliases: ['location', 'site', 'site location', 'place'],
  },
  {
    key: 'district',
    label: 'District',
    sheet: 'District',
    aliases: ['district'],
  },
  {
    key: 'project_state',
    label: 'Project state',
    sheet: 'Project State',
    aliases: ['project state', 'proj state', 'state of project'],
  },
  {
    key: 'address_state',
    label: 'Address state',
    sheet: 'Addr. State',
    aliases: ['addr state', 'address state', 'mailing state', 'addrstat', 'addressstate'],
  },
  {
    key: 'telephone',
    label: 'Telephone',
    sheet: 'Telephone',
    aliases: ['telephone', 'teleph', 'phone', 'tel', 'mobile', 'contact no', 'contact number'],
  },
  {
    key: 'email',
    label: 'Email',
    sheet: 'Email',
    aliases: ['email', 'e mail', 'mail', 'mail id', 'email id'],
  },
  {
    key: 'contact_person',
    label: 'Person',
    sheet: 'Person',
    aliases: ['person', 'contact person', 'contact', 'contact name', 'primary person'],
  },
  {
    key: 'contact_person_2',
    label: 'Person 2',
    sheet: 'Person 2',
    aliases: ['person 2', 'person2', '2nd person', 'second person', 'secondary person', 'person two'],
  },
  {
    key: 'sheet_updated_on',
    label: 'Updated on',
    sheet: 'Updated On',
    aliases: ['updated on', 'updated', 'update date', 'last updated'],
  },
  {
    key: 'remarks',
    label: 'Remarks',
    sheet: 'REMARKS',
    aliases: ['remarks', 'remark', 'notes', 'comments', 'note'],
  },
];

export const PROJECT_TYPE_OPTIONS = ['New', 'Expansion'];
export const OWNERSHIP_OPTIONS = [
  'Private Sector',
  'State Government',
  'Central Government',
  'PSU',
  'Joint Venture',
];
export const PROJECT_STAGE_OPTIONS = [
  'Announcement Stage',
  'Environment Clearance Stage',
  'Pre Project Stage',
  'Under Implementation',
  'Commissioned',
];

export const LEAD_TEMPLATE_FILENAME = 'lead-master-template.xlsx';
export const LEAD_IMPORT_MAX_ROWS = 2000;
const IMPORT_CHUNK = 80;

const SERIAL_HEADERS = new Set(['sno', 's no', 'sr no', 'srno', 'sl no', 'serial', 'serial no', 'serial number']);
const BLANK_TOKENS = new Set(['', '-', '--', 'na', 'n/a', 'nil', 'none', 'null']);

export function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u00a0]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBlankLeadValue(value) {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return BLANK_TOKENS.has(text.toLowerCase());
}

export function normalizeLeadText(value) {
  if (isBlankLeadValue(value)) return '';
  return String(value).trim();
}

function excelSerialToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return '';
  const utc = Date.UTC(1899, 11, 30) + Math.round(n * 86400 * 1000);
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLeadDate(value) {
  if (isBlankLeadValue(value)) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeToIsoDate(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialToIso(value);
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = excelSerialToIso(text);
    if (serial) return serial;
  }
  const monthName = text.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (monthName) {
    const parsed = new Date(`${monthName[1]} ${monthName[2]} ${monthName[3].length === 2 ? `20${monthName[3]}` : monthName[3]}`);
    if (!Number.isNaN(parsed.getTime())) return normalizeToIsoDate(parsed);
  }
  return normalizeToIsoDate(text);
}

export function parseLeadCost(value) {
  if (isBlankLeadValue(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function formatLeadCost(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function emptyLeadForm() {
  return {
    company: '',
    project: '',
    project_type: '',
    ownership: '',
    industry: '',
    project_cost: '',
    project_stage: '',
    location: '',
    district: '',
    project_state: '',
    address_state: '',
    telephone: '',
    email: '',
    contact_person: '',
    contact_person_2: '',
    sheet_updated_on: '',
    remarks: '',
  };
}

export function leadToForm(lead) {
  const empty = emptyLeadForm();
  if (!lead) return empty;
  return {
    ...empty,
    company: lead.company || '',
    project: lead.project || '',
    project_type: lead.project_type || '',
    ownership: lead.ownership || '',
    industry: lead.industry || '',
    project_cost: lead.project_cost == null || lead.project_cost === '' ? '' : String(lead.project_cost),
    project_stage: lead.project_stage || '',
    location: lead.location || '',
    district: lead.district || '',
    project_state: lead.project_state || '',
    address_state: lead.address_state || '',
    telephone: lead.telephone || '',
    email: lead.email || '',
    contact_person: lead.contact_person || '',
    contact_person_2: lead.contact_person_2 || '',
    sheet_updated_on: lead.sheet_updated_on || '',
    remarks: lead.remarks || '',
  };
}

export function formToPayload(form) {
  const company = normalizeLeadText(form?.company);
  if (!company) {
    return { error: 'Company is required.', payload: null };
  }
  const cost = parseLeadCost(form?.project_cost);
  const updatedOn = parseLeadDate(form?.sheet_updated_on) || null;
  return {
    error: null,
    payload: {
      company,
      project: normalizeLeadText(form?.project) || null,
      project_type: normalizeLeadText(form?.project_type) || null,
      ownership: normalizeLeadText(form?.ownership) || null,
      industry: normalizeLeadText(form?.industry) || null,
      project_cost: cost,
      project_stage: normalizeLeadText(form?.project_stage) || null,
      location: normalizeLeadText(form?.location) || null,
      district: normalizeLeadText(form?.district) || null,
      project_state: normalizeLeadText(form?.project_state) || null,
      address_state: normalizeLeadText(form?.address_state) || null,
      telephone: normalizeLeadText(form?.telephone) || null,
      email: normalizeLeadText(form?.email) || null,
      contact_person: normalizeLeadText(form?.contact_person) || null,
      contact_person_2: normalizeLeadText(form?.contact_person_2) || null,
      sheet_updated_on: updatedOn,
      remarks: normalizeLeadText(form?.remarks) || null,
    },
  };
}

export function leadMatchKey(row) {
  const company = normalizeLeadText(row?.company).toLowerCase();
  const project = normalizeLeadText(row?.project).toLowerCase();
  const location = normalizeLeadText(row?.location).toLowerCase();
  if (!company) return '';
  if (project) return `${company}|${project}`;
  return `${company}||${location}`;
}

function matchFieldKey(normalized, used) {
  let best = null;
  let bestLen = -1;
  for (const field of LEAD_FIELDS) {
    if (used.has(field.key)) continue;
    for (const alias of field.aliases) {
      if (normalized === alias && alias.length >= bestLen) {
        best = field.key;
        bestLen = alias.length;
      }
    }
  }
  if (best) return best;

  for (const field of LEAD_FIELDS) {
    if (used.has(field.key)) continue;
    for (const alias of field.aliases) {
      if (alias.length < 8) continue;
      if (normalized.length >= 7 && alias.startsWith(normalized) && normalized.length > bestLen) {
        best = field.key;
        bestLen = normalized.length;
      }
    }
  }
  return best;
}

export function mapLeadHeaders(headerRow) {
  const indexByKey = {};
  const used = new Set();
  const leftoverPersonIndexes = [];

  (headerRow || []).forEach((cell, idx) => {
    const normalized = normalizeHeader(cell);
    if (!normalized || SERIAL_HEADERS.has(normalized)) return;

    if (normalized === 'state') {
      if (!used.has('project_state')) {
        used.add('project_state');
        indexByKey.project_state = idx;
        return;
      }
      if (!used.has('address_state')) {
        used.add('address_state');
        indexByKey.address_state = idx;
        return;
      }
    }

    const key = matchFieldKey(normalized, used);
    if (key) {
      used.add(key);
      indexByKey[key] = idx;
      return;
    }

    if (normalized === 'person' || normalized === 'contact person' || normalized === 'contact') {
      leftoverPersonIndexes.push(idx);
    }
  });

  leftoverPersonIndexes.forEach((idx) => {
    if (indexByKey.contact_person == null) {
      indexByKey.contact_person = idx;
    } else if (indexByKey.contact_person_2 == null) {
      indexByKey.contact_person_2 = idx;
    }
  });

  return indexByKey;
}

function cellToText(raw) {
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (Number.isInteger(raw) && Math.abs(raw) >= 1e10) return String(raw);
    return raw;
  }
  return String(raw).trim();
}

export function rowFromCells(row, indexByKey) {
  const read = (key) => {
    const idx = indexByKey[key];
    if (idx == null) return '';
    return cellToText(row?.[idx]);
  };

  const form = emptyLeadForm();
  form.company = normalizeLeadText(read('company'));
  form.project = normalizeLeadText(read('project'));
  form.project_type = normalizeLeadText(read('project_type'));
  form.ownership = normalizeLeadText(read('ownership'));
  form.industry = normalizeLeadText(read('industry'));
  const costRaw = read('project_cost');
  const cost = parseLeadCost(costRaw);
  form.project_cost = cost == null ? normalizeLeadText(costRaw) : String(cost);
  form.project_stage = normalizeLeadText(read('project_stage'));
  form.location = normalizeLeadText(read('location'));
  form.district = normalizeLeadText(read('district'));
  form.project_state = normalizeLeadText(read('project_state'));
  form.address_state = normalizeLeadText(read('address_state'));
  form.telephone = normalizeLeadText(read('telephone'));
  form.email = normalizeLeadText(read('email'));
  form.contact_person = normalizeLeadText(read('contact_person'));
  form.contact_person_2 = normalizeLeadText(read('contact_person_2'));
  form.sheet_updated_on = parseLeadDate(read('sheet_updated_on'));
  form.remarks = normalizeLeadText(read('remarks'));
  return form;
}

export function parseLeadMatrix(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  let headerIndex = 0;
  let indexByKey = {};
  const scan = Math.min(rows.length, 8);
  for (let i = 0; i < scan; i += 1) {
    const mapped = mapLeadHeaders(rows[i] || []);
    if (mapped.company != null) {
      headerIndex = i;
      indexByKey = mapped;
      break;
    }
  }

  if (indexByKey.company == null) {
    return {
      ok: false,
      error: 'This sheet does not look like a lead list. Use a Company column, then Project, Stage, Location, and contact details.',
      records: [],
      skipped: 0,
    };
  }

  const records = [];
  let skipped = 0;
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const hasAny = row.some((cell) => !isBlankLeadValue(cell));
    if (!hasAny) continue;
    const form = rowFromCells(row, indexByKey);
    const parsed = formToPayload(form);
    if (parsed.error || !parsed.payload) {
      skipped += 1;
      continue;
    }
    records.push(parsed.payload);
    if (records.length >= LEAD_IMPORT_MAX_ROWS) break;
  }

  return { ok: true, error: null, records, skipped, headerIndex };
}

function readWorkbookMatrix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: true,
          cellDates: true,
        });
        resolve(matrix);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseLeadWorkbook(file) {
  if (!file) {
    return { ok: false, error: 'Choose an Excel file first.', records: [], skipped: 0 };
  }
  const matrix = await readWorkbookMatrix(file);
  return parseLeadMatrix(matrix);
}

export function downloadLeadTemplate() {
  const headers = ['S.No', ...LEAD_FIELDS.map((f) => f.sheet)];
  const sample = [
    1,
    'ITC Hotels Ltd',
    'New hotel project, Bengaluru',
    'New',
    'Private Sector',
    'Hospitality and Healthcare',
    180.428,
    'Announcement Stage',
    'Bengaluru',
    'Bengaluru Urban',
    'Karnataka',
    'Karnataka',
    '08012345678',
    'info@example.com',
    'Mr. Sanjay',
    '',
    '21-Aug-26',
    'Mailed dtd 22.08.2025',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, LEAD_TEMPLATE_FILENAME);
}

export function leadToExportRow(lead) {
  return {
    Company: lead.company || '',
    Project: lead.project || '',
    'Project Type': lead.project_type || '',
    Ownership: lead.ownership || '',
    Industry: lead.industry || '',
    'Project Cost': lead.project_cost ?? '',
    'Project Stage': lead.project_stage || '',
    Location: lead.location || '',
    District: lead.district || '',
    'Project State': lead.project_state || '',
    'Addr. State': lead.address_state || '',
    Telephone: lead.telephone || '',
    Email: lead.email || '',
    Person: lead.contact_person || '',
    'Person 2': lead.contact_person_2 || '',
    'Updated On': lead.sheet_updated_on || '',
    REMARKS: lead.remarks || '',
  };
}

export async function persistLeadRecords(supabase, records, userId) {
  const existing = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('marketing_leads')
      .select('id, company, project, location')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    existing.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const byKey = new Map();
  existing.forEach((row) => {
    const key = leadMatchKey(row);
    if (key && !byKey.has(key)) byKey.set(key, row.id);
  });

  const toInsert = [];
  const toUpdate = [];
  records.forEach((payload) => {
    const key = leadMatchKey(payload);
    const id = key ? byKey.get(key) : null;
    if (id) toUpdate.push({ id, payload });
    else toInsert.push(payload);
  });

  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < toInsert.length; i += IMPORT_CHUNK) {
    const chunk = toInsert.slice(i, i + IMPORT_CHUNK).map((payload) => ({
      ...payload,
      created_by: userId || null,
      updated_by: userId || null,
    }));
    const { error } = await supabase.from('marketing_leads').insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  for (const item of toUpdate) {
    const { error } = await supabase
      .from('marketing_leads')
      .update({
        ...item.payload,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    if (error) throw error;
    updated += 1;
  }

  return { inserted, updated, skippedDuplicates: 0 };
}
