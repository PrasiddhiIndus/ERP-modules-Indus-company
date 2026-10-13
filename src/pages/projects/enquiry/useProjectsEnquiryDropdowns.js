import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsErrorMsg, projectsTable } from '../../../services/projectsApi';

export const ASSIGNEE_KIND_KEY = 'assigned_to_person';

/** Active Projects-department employees from Employee Master; null when unavailable. */
async function fetchAssigneeOptions() {
  try {
    const { data, error } = await supabase.schema(PROJECTS_SCHEMA).rpc('enquiry_assignee_names');
    if (error) throw error;
    if (!data?.length) return null;
    return data.map((row, i) => ({
      id: `employee:${row.employee_code || row.full_name}`,
      value: row.full_name,
      employee_code: row.employee_code,
      sort_order: i + 1,
    }));
  } catch (err) {
    console.warn('Assigned To Person: Employee Master list unavailable, using the dropdown list.', err);
    return null;
  }
}

export function useProjectsEnquiryDropdowns() {
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDropdowns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: kindsData, error: kindsErr } = await projectsTable('enquiry_dropdown_kinds')
        .select('*')
        .order('sort_order', { ascending: true });
      if (kindsErr) throw kindsErr;

      const { data: optionsData, error: optionsErr } = await projectsTable('enquiry_dropdown_options')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('value', { ascending: true });
      if (optionsErr) throw optionsErr;

      const assigneeOptions = await fetchAssigneeOptions();

      const optionsByKindId = {};
      for (const opt of optionsData || []) {
        if (!optionsByKindId[opt.kind_id]) optionsByKindId[opt.kind_id] = [];
        optionsByKindId[opt.kind_id].push(opt);
      }

      const enriched = (kindsData || []).map((k) =>
        k.kind_key === ASSIGNEE_KIND_KEY && assigneeOptions
          ? { ...k, options: assigneeOptions, fromEmployeeMaster: true }
          : { ...k, options: optionsByKindId[k.id] || [] }
      );

      setKinds(enriched);
    } catch (err) {
      setError(projectsErrorMsg(err, 'Load enquiry dropdowns'));
      setKinds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  const optionsByKindKey = useMemo(() => {
    const map = {};
    for (const k of kinds) {
      map[k.kind_key] = k.options || [];
    }
    return map;
  }, [kinds]);

  const valuesForKindKey = useCallback(
    (kindKey) => (optionsByKindKey[kindKey] || []).map((o) => o.value),
    [optionsByKindKey]
  );

  const valuesForKindId = useCallback(
    (kindId) => {
      const k = kinds.find((x) => x.id === kindId);
      return (k?.options || []).map((o) => o.value);
    },
    [kinds]
  );

  return {
    kinds,
    optionsByKindKey,
    valuesForKindKey,
    valuesForKindId,
    loading,
    error,
    fetchDropdowns,
    setError,
  };
}
