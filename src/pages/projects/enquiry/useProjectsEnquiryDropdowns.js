import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { PROJECTS_SCHEMA, projectsErrorMsg, projectsTable } from '../../../services/projectsApi';

export const ASSIGNEE_KIND_KEY = 'assigned_to_person';

/** Active Projects-department employees from Employee Master; null when unavailable. */
async function fetchAssigneeCandidates() {
  try {
    const { data, error } = await supabase.schema(PROJECTS_SCHEMA).rpc('enquiry_assignee_names');
    if (error) throw error;
    if (!data?.length) return [];
    return data.map((row) => ({
      full_name: String(row.full_name || '').trim(),
      employee_code: row.employee_code || '',
    })).filter((r) => r.full_name);
  } catch (err) {
    console.warn('Assigned To Person: Employee Master list unavailable.', err);
    return null;
  }
}

export function useProjectsEnquiryDropdowns() {
  const [kinds, setKinds] = useState([]);
  const [assigneeCandidates, setAssigneeCandidates] = useState([]);
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

      const candidates = await fetchAssigneeCandidates();
      if (candidates) setAssigneeCandidates(candidates);

      const optionsByKindId = {};
      for (const opt of optionsData || []) {
        if (!optionsByKindId[opt.kind_id]) optionsByKindId[opt.kind_id] = [];
        optionsByKindId[opt.kind_id].push(opt);
      }

      // Forms use only checked (saved) options — not the full Employee Master list.
      setKinds(
        (kindsData || []).map((k) => ({
          ...k,
          options: optionsByKindId[k.id] || [],
        }))
      );
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

  const assigneeNameSet = useMemo(
    () => new Set((assigneeCandidates || []).map((e) => String(e.full_name || '').trim().toLowerCase())),
    [assigneeCandidates]
  );

  const optionsByKindKey = useMemo(() => {
    const map = {};
    for (const k of kinds) {
      let opts = k.options || [];
      // Assigned to Person: only Projects-department employees (drop any manual leftovers).
      if (k.kind_key === ASSIGNEE_KIND_KEY && assigneeNameSet.size) {
        opts = opts.filter((o) => assigneeNameSet.has(String(o.value || '').trim().toLowerCase()));
      }
      map[k.kind_key] = opts;
    }
    return map;
  }, [kinds, assigneeNameSet]);

  const valuesForKindKey = useCallback(
    (kindKey) => (optionsByKindKey[kindKey] || []).map((o) => o.value),
    [optionsByKindKey]
  );

  const valuesForKindId = useCallback(
    (kindId) => {
      const k = kinds.find((x) => x.id === kindId);
      if (!k) return [];
      return (optionsByKindKey[k.kind_key] || []).map((o) => o.value);
    },
    [kinds, optionsByKindKey]
  );

  return {
    kinds,
    setKinds,
    assigneeCandidates,
    optionsByKindKey,
    valuesForKindKey,
    valuesForKindId,
    loading,
    error,
    fetchDropdowns,
    setError,
  };
}
