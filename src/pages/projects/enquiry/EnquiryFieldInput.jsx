import React from 'react';
import { MapPin } from 'lucide-react';
import { peInput } from './enquiryConstants';
import { resolveDropdownKindKey } from '../../../services/projectsApi';

export default function EnquiryFieldInput({
  field,
  value,
  onChange,
  disabled,
  valuesForKindKey,
  valuesForKindId,
  className = peInput,
}) {
  const kindKey = resolveDropdownKindKey(field);
  const dropdownValues = kindKey
    ? valuesForKindKey?.(kindKey) || []
    : field.dropdown_kind_id
      ? valuesForKindId?.(field.dropdown_kind_id) || []
      : [];

  if (field.field_type === 'dropdown') {
    return (
      <select
        className={className}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || field.read_only}
      >
        <option value="">Select…</option>
        {dropdownValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  if (field.field_type === 'date') {
    return (
      <input
        type="date"
        className={className}
        value={value ? String(value).slice(0, 10) : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || field.read_only}
      />
    );
  }

  if (field.field_type === 'textarea') {
    return (
      <textarea
        rows={field.field_key === 'scope_of_work' ? 4 : 2}
        className={className}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || field.read_only}
      />
    );
  }

  if (field.field_key === 'location') {
    return (
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          className={`${className} pl-9`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || field.read_only}
        />
      </div>
    );
  }

  const inputType =
    field.field_key === 'email_address' ? 'email' : field.field_key === 'phone_number' ? 'tel' : 'text';

  return (
    <input
      type={inputType}
      className={className}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || field.read_only}
    />
  );
}
