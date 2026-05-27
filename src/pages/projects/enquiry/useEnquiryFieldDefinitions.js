import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectsTable } from '../../../services/projectsApi';

export function useEnquiryFieldDefinitions() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFields = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await projectsTable('enquiry_field_definitions')
        .select(
          `
          *,
          enquiry_dropdown_kinds ( id, kind_key, label )
        `
        )
        .order('sort_order', { ascending: true });
      if (e) throw e;
      setFields(data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load field definitions.');
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const entryFields = useMemo(
    () => fields.filter((f) => f.show_in_entry && f.field_key !== 'serial_number'),
    [fields]
  );

  const databaseFields = useMemo(
    () => fields.filter((f) => f.show_in_database),
    [fields]
  );

  const fieldsBySection = useMemo(() => {
    const groups = {};
    for (const f of entryFields) {
      const sec = f.section || 'main';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(f);
    }
    return groups;
  }, [entryFields]);

  return {
    fields,
    entryFields,
    databaseFields,
    fieldsBySection,
    loading,
    error,
    fetchFields,
  };
}
