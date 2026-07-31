import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectsTable } from '../../../services/quotationApi';

export function useQuotationDropdowns() {
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDropdowns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: kindRows, error: kErr } = await projectsTable('quotation_dropdown_kinds')
        .select('id, kind_key, label, sort_order')
        .order('sort_order', { ascending: true });
      if (kErr) throw kErr;

      const { data: optRows, error: oErr } = await projectsTable('quotation_dropdown_options')
        .select('id, kind_id, value, sort_order')
        .order('sort_order', { ascending: true });
      if (oErr) throw oErr;

      const byKind = new Map();
      for (const o of optRows || []) {
        if (!byKind.has(o.kind_id)) byKind.set(o.kind_id, []);
        byKind.get(o.kind_id).push(o);
      }

      setKinds(
        (kindRows || []).map((k) => ({
          ...k,
          options: byKind.get(k.id) || [],
        }))
      );
    } catch (err) {
      setError(err?.message || 'Failed to load quotation dropdowns.');
      setKinds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  const valuesForKindKey = useCallback(
    (kindKey) => {
      const kind = kinds.find((k) => k.kind_key === kindKey);
      return (kind?.options || []).map((o) => o.value);
    },
    [kinds]
  );

  const kindByKey = useMemo(() => {
    const map = {};
    for (const k of kinds) map[k.kind_key] = k;
    return map;
  }, [kinds]);

  return {
    kinds,
    kindByKey,
    loading,
    error,
    setError,
    fetchDropdowns,
    valuesForKindKey,
  };
}
