export const BULK_USER_MAX_BATCH = 100;
export const BULK_IMPORT_PREVIEW_ROWS = 20;

export const BULK_IMPORT_COLUMNS = [
  { key: 'email', label: 'email', required: true },
  { key: 'password', label: 'password', required: true },
  { key: 'employee_code', label: 'employee_code', required: true },
  { key: 'username', label: 'username', required: false },
  { key: 'team', label: 'team', required: false },
  { key: 'role', label: 'role', required: false },
  { key: 'allowed_modules', label: 'allowed_modules', required: false },
];

export const BULK_DELETE_COLUMNS = [
  { key: 'email', label: 'email', required: false },
  { key: 'employee_code', label: 'employee_code', required: false },
];

export const BULK_IMPORT_TEMPLATE_ROWS = [
  {
    email: 'user@example.com',
    password: 'TempPass1',
    employee_code: 'EMP001',
    username: 'user',
    team: 'HR',
    role: 'executive',
    allowed_modules: '',
  },
  {
    email: 'pending@example.com',
    password: 'TempPass2',
    employee_code: 'EMP002',
    username: 'pending',
    team: '',
    role: 'executive',
    allowed_modules: '',
  },
];

export const BULK_DELETE_TEMPLATE_ROWS = [
  { email: 'user@example.com', employee_code: '' },
  { employee_code: 'EMP001', email: '' },
];
