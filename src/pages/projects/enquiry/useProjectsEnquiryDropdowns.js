import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectsTable } from '../../../services/projectsApi';

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

      const optionsByKindId = {};
      for (const opt of optionsData || []) {
        if (!optionsByKindId[opt.kind_id]) optionsByKindId[opt.kind_id] = [];
        optionsByKindId[opt.kind_id].push(opt);
      }

      const enriched = (kindsData || []).map((k) => ({
        ...k,
        options: optionsByKindId[k.id] || [],
      }));

      setKinds(enriched);
    } catch (err) {
      setError(err?.message || 'Failed to load dropdown options.');
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
