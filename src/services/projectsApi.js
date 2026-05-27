/**
 * Projects module — Supabase `projects` schema.
 * Tables: enquiry_dropdown_kinds, enquiry_dropdown_options, enquiry_field_definitions, enquiries
 * In Supabase Dashboard → Settings → API → Exposed schemas, add: projects
 */

import { supabase } from '../lib/supabase';

export const PROJECTS_SCHEMA = 'projects';

export function projectsTable(name) {
  return supabase.schema(PROJECTS_SCHEMA).from(name);
}

/** Read a field value from an enquiry row (serial_number is top-level; rest in data jsonb). */
export function getEnquiryFieldValue(row, fieldKey) {
  if (!row) return '';
  if (fieldKey === 'serial_number') return row.serial_number ?? '';
  return row.data?.[fieldKey] ?? '';
}

/** Build empty form state from field definitions. */
export function buildEmptyFormFromFields(entryFields, { receiptDateDefault } = {}) {
  const form = {};
  for (const f of entryFields) {
    if (f.field_key === 'enquiry_receipt_date' && receiptDateDefault) {
      form[f.field_key] = receiptDateDefault;
    } else {
      form[f.field_key] = f.default_value ?? '';
    }
  }
  return form;
}

/** Build jsonb payload for insert/update from form + entry field defs. */
export function buildEnquiryDataPayload(form, entryFields) {
  const data = {};
  for (const f of entryFields) {
    if (f.field_key === 'serial_number') continue;
    let v = form[f.field_key];
    if (typeof v === 'string') v = v.trim();
    data[f.field_key] = v === '' ? null : v;
  }
  return data;
}

/** Apply database-only defaults (e.g. current_status) not shown on entry form. */
export function applyEnquiryDefaults(data, allFields) {
  const out = { ...data };
  for (const f of allFields) {
    if (f.show_in_entry) continue;
    if (out[f.field_key] == null || out[f.field_key] === '') {
      if (f.default_value) out[f.field_key] = f.default_value;
      else if (f.field_type === 'dropdown' && f.dropdown_kind_id) {
        // leave null; UI may set first option later
      }
    }
  }
  return out;
}

/** Flatten row for edit/search: { serial_number, ...data keys } */
export function flattenEnquiryRow(row) {
  if (!row) return {};
  return {
    id: row.id,
    serial_number: row.serial_number,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(row.data || {}),
  };
}

/** Merge flat edit draft back to { data } for update. */
export function packEnquiryUpdate(flat, databaseFields) {
  const data = {};
  for (const f of databaseFields) {
    if (f.field_key === 'serial_number') continue;
    let v = flat[f.field_key];
    if (typeof v === 'string') v = v.trim();
    data[f.field_key] = v === '' ? null : v;
  }
  return { data };
}

export function resolveDropdownKindKey(field) {
  return field?.enquiry_dropdown_kinds?.kind_key ?? field?.dropdown_kind_key ?? null;
}
