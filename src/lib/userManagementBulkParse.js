import * as XLSX from 'xlsx';
import { ROLES, MODULES, normalizeAppRole } from '../config/roles';
import {
  resolveDepartmentLabel,
  isKnownDepartment,
} from './employeeMasterDepartments';
import {
  BULK_IMPORT_COLUMNS,
  BULK_IMPORT_TEMPLATE_ROWS,
  BULK_DELETE_COLUMNS,
  BULK_DELETE_TEMPLATE_ROWS,
  BULK_USER_MAX_BATCH,
} from './userManagementBulkConstants';

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

function mapHeaders(headerRow, expectedColumns) {
  const normalized = headerRow.map((h) => normalizeHeader(h));
  const indexByKey = {};
  for (const col of expectedColumns) {
    const idx = normalized.findIndex((h) => h === normalizeHeader(col.label) || h === col.key);
    if (idx >= 0) indexByKey[col.key] = idx;
  }
  return indexByKey;
}

function cellValue(row, index) {
  if (index === undefined || index < 0) return '';
  const raw = row[index];
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function resolveTeamValue(raw, departments) {
  return resolveDepartmentLabel(raw, departments);
}

function parseAllowedModules(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateAllowedModules(mods, rowNum, errors) {
  const validKeys = new Set(MODULES.map((m) => m.value.toLowerCase()));
  const out = [];
  for (const mod of mods) {
    const key = mod.toLowerCase();
    if (!validKeys.has(key)) {
      errors.push(`Row ${rowNum}: invalid allowed_modules value "${mod}"`);
    } else {
      const exact = MODULES.find((m) => m.value.toLowerCase() === key);
      if (exact) out.push(exact.value);
    }
  }
  return out;
}

export function downloadBulkImportTemplate() {
  const ws = XLSX.utils.json_to_sheet(BULK_IMPORT_TEMPLATE_ROWS, {
    header: BULK_IMPORT_COLUMNS.map((c) => c.key),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Users');
  XLSX.writeFile(wb, 'user-import-template.xlsx');
}

export function downloadBulkDeleteTemplate() {
  const ws = XLSX.utils.json_to_sheet(BULK_DELETE_TEMPLATE_ROWS, {
    header: BULK_DELETE_COLUMNS.map((c) => c.key),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delete');
  XLSX.writeFile(wb, 'user-delete-template.xlsx');
}

export async function parseBulkImportFile(file, { departments = [] } = {}) {
  const matrix = await sheetToMatrix(file);
  if (!matrix.length) {
    return { rows: [], errors: ['File is empty.'], valid: false };
  }

  const headerRow = matrix[0];
  const indexByKey = mapHeaders(headerRow, BULK_IMPORT_COLUMNS);
  const missingRequired = BULK_IMPORT_COLUMNS.filter((c) => c.required && indexByKey[c.key] === undefined);
  if (missingRequired.length) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missingRequired.map((c) => c.label).join(', ')}`],
      valid: false,
    };
  }

  const errors = [];
  const rows = [];
  const seenEmail = new Set();
  const seenEmpCode = new Set();

  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;

    const rowNum = i + 1;
    const email = cellValue(line, indexByKey.email).toLowerCase();
    const password = cellValue(line, indexByKey.password);
    const employee_code = cellValue(line, indexByKey.employee_code);
    const username = cellValue(line, indexByKey.username);
    const teamRaw = cellValue(line, indexByKey.team);
    const roleRaw = cellValue(line, indexByKey.role) || ROLES.EXECUTIVE;
    const allowedRaw =
      indexByKey.allowed_modules !== undefined ? cellValue(line, indexByKey.allowed_modules) : '';
    const hasAssignedModules = String(allowedRaw || '').trim().length > 0;

    if (!email || !email.includes('@')) errors.push(`Row ${rowNum}: valid email is required`);
    if (password.length < 6) errors.push(`Row ${rowNum}: password must be at least 6 characters`);
    if (!employee_code) errors.push(`Row ${rowNum}: employee_code is required`);

    const teamResolved = teamRaw ? resolveTeamValue(teamRaw, departments) : '';
    const team = teamResolved || null;

    if (hasAssignedModules) {
      if (!teamRaw) errors.push(`Row ${rowNum}: team is required when allowed_modules is set`);
      if (teamRaw && departments.length && !isKnownDepartment(teamRaw, departments)) {
        errors.push(`Row ${rowNum}: unknown team/department "${teamRaw}" (use Employee Master department names)`);
      }
    } else if (teamRaw && departments.length && !isKnownDepartment(teamRaw, departments)) {
      errors.push(`Row ${rowNum}: unknown team/department "${teamRaw}"`);
    }

    const role = normalizeAppRole(roleRaw) || ROLES.EXECUTIVE;
    if (roleRaw && !normalizeAppRole(roleRaw)) {
      errors.push(`Row ${rowNum}: invalid role "${roleRaw}"`);
    }

    if (email) {
      if (seenEmail.has(email)) errors.push(`Row ${rowNum}: duplicate email "${email}" in file`);
      seenEmail.add(email);
    }
    if (employee_code) {
      if (seenEmpCode.has(employee_code.toLowerCase())) {
        errors.push(`Row ${rowNum}: duplicate employee_code "${employee_code}" in file`);
      }
      seenEmpCode.add(employee_code.toLowerCase());
    }

    const allowed_modules = hasAssignedModules
      ? validateAllowedModules(parseAllowedModules(allowedRaw), rowNum, errors)
      : [];

    rows.push({
      row: rowNum,
      email,
      password,
      employee_code,
      username: username || undefined,
      team,
      role,
      allowed_modules,
      no_module_access: !hasAssignedModules,
    });
  }

  if (!rows.length) {
    errors.push('No data rows found.');
  }
  if (rows.length > BULK_USER_MAX_BATCH) {
    errors.push(`Maximum ${BULK_USER_MAX_BATCH} users per import (found ${rows.length}).`);
  }

  return { rows, errors, valid: errors.length === 0 && rows.length > 0 };
}

export async function parseBulkDeleteFile(file) {
  const matrix = await sheetToMatrix(file);
  if (!matrix.length) {
    return { rows: [], errors: ['File is empty.'], valid: false };
  }

  const headerRow = matrix[0];
  const indexByKey = mapHeaders(headerRow, BULK_DELETE_COLUMNS);
  if (indexByKey.email === undefined && indexByKey.employee_code === undefined) {
    return {
      rows: [],
      errors: ['File must include an email or employee_code column.'],
      valid: false,
    };
  }

  const errors = [];
  const rows = [];

  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (!line || line.every((c) => String(c ?? '').trim() === '')) continue;

    const rowNum = i + 1;
    const email = cellValue(line, indexByKey.email).toLowerCase();
    const employee_code = cellValue(line, indexByKey.employee_code);

    if (!email && !employee_code) {
      errors.push(`Row ${rowNum}: email or employee_code is required`);
      continue;
    }

    rows.push({
      row: rowNum,
      ...(email ? { email } : {}),
      ...(employee_code ? { employee_code } : {}),
    });
  }

  if (!rows.length) errors.push('No data rows found.');
  if (rows.length > BULK_USER_MAX_BATCH) {
    errors.push(`Maximum ${BULK_USER_MAX_BATCH} users per batch (found ${rows.length}).`);
  }

  return { rows, errors, valid: errors.length === 0 && rows.length > 0 };
}

export function buildBulkErrorReportCsv(results) {
  const failed = (results || []).filter((r) => !r.ok);
  const lines = ['row,email,employee_code,error'];
  for (const r of failed) {
    const email = String(r.email ?? '').replace(/"/g, '""');
    const emp = String(r.employee_code ?? '').replace(/"/g, '""');
    const err = String(r.error ?? 'Failed').replace(/"/g, '""');
    lines.push(`${r.row ?? ''},"${email}","${emp}","${err}"`);
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

export function maskPassword(value) {
  const s = String(value || '');
  if (!s) return '';
  return '•'.repeat(Math.min(s.length, 8));
}
