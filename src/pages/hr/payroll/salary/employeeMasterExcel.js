import * as XLSX from 'xlsx';

function normalizeHeader(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function mapHeaderToField(key) {
  const k = normalizeHeader(key);
  if (['name', 'full_name', 'employee_name', 'emp_name'].includes(k)) return 'name';
  if (['phone', 'mobile', 'personal_no', 'contact', 'phone_no', 'mobile_no'].includes(k)) return 'phone';
  if (['dob', 'date_of_birth', 'birth_date', 'birthdate'].includes(k)) return 'dob';
  return null;
}

function excelDateToIso(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${mm}-${dd}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const slash = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const dd = slash[1].padStart(2, '0');
    const mm = slash[2].padStart(2, '0');
    let yy = slash[3];
    if (yy.length === 2) yy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  return text;
}

export async function parseEmployeeMasterExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('No sheet found in file.');

  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Excel file is empty.');

  const rows = [];
  const skipped = [];

  raw.forEach((row, index) => {
    const mapped = { name: '', phone: '', dob: '' };
    Object.entries(row).forEach(([key, value]) => {
      const field = mapHeaderToField(key);
      if (!field) return;
      mapped[field] = field === 'dob' ? excelDateToIso(value) : String(value ?? '').trim();
    });
    if (!mapped.name && !mapped.phone && !mapped.dob) {
      skipped.push({ row: index + 2, reason: 'No name, phone, or DOB found' });
      return;
    }
    rows.push(mapped);
  });

  if (!rows.length) throw new Error('No valid employee rows found. Use columns: Name, Phone, DOB.');
  return { rows, skipped };
}

export function downloadEmployeeMasterTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Phone', 'DOB'],
    ['Deven Daroga', '9879987842', '02/06/1981'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'employee-master-template.xlsx');
}
