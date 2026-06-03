const STORAGE_KEY = 'hr-salary-employee-master-details';

export const DEMO_EMPLOYEES = [
  {
    id: 'demo-emp-001',
    employeeCode: '0008',
    name: 'Deven Daroga',
    middleName: '',
    lastName: '',
    phone: '9879987842',
    dob: '1981-06-02',
    gender: 'Male',
    dateOfJoining: '2005-01-05',
    address: '',
    location: 'Gujarat',
    email: '',
    salary: '',
  },
  {
    id: 'demo-emp-002',
    employeeCode: '0009',
    name: 'Priya Sharma',
    middleName: '',
    lastName: '',
    phone: '9823456710',
    dob: '1990-03-15',
    gender: 'Female',
    dateOfJoining: '',
    address: '',
    location: 'Maharashtra',
    email: '',
    salary: '',
  },
];

export function nextEmployeeCode() {
  const all = [...loadEmployeeMasterList(), ...DEMO_EMPLOYEES];
  const nums = all
    .map((e) => parseInt(String(e.employeeCode || '').replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(4, '0');
}

export function newEmployeeId() {
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadEmployeeMasterList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveEmployeeMasterList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getEmployeeMasterById(id) {
  const saved = loadEmployeeMasterList().find((e) => String(e.id) === String(id));
  if (saved) return saved;
  return DEMO_EMPLOYEES.find((e) => String(e.id) === String(id)) || null;
}

export function upsertEmployeeMaster(record) {
  const list = loadEmployeeMasterList();
  const idx = list.findIndex((e) => String(e.id) === String(record.id));
  const next = { ...record, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = next;
  else list.unshift({ ...next, createdAt: new Date().toISOString() });
  saveEmployeeMasterList(list);
  return next;
}

export function appendEmployeeMasterRows(rows) {
  const list = loadEmployeeMasterList();
  const appended = rows.map((row, index) => ({
    id: newEmployeeId(),
    employeeCode: row.employeeCode || String(loadEmployeeMasterList().length + index + 1).padStart(4, '0'),
    name: row.name || '',
    phone: row.phone || '',
    dob: row.dob || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  saveEmployeeMasterList([...appended, ...list]);
  return appended.length;
}

export function formatDobDisplay(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return value;
}

export function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
