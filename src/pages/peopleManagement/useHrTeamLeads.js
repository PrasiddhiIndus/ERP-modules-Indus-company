import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { listHrTeamLeads } from "../../lib/peopleDirectoryApi";
import { normalizeManagerCode } from "../../lib/employeeHierarchy";

/** Active HR team (Employee Master) used as L1/L2 lead candidates. */
export function useHrTeamLeads() {
  const [hrTeam, setHrTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listHrTeamLeads(supabase);
        if (!cancelled) setHrTeam(rows);
      } catch (err) {
        console.error("HR team leads load failed", err);
        if (!cancelled) setError("Could not load the HR team list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCodes = useMemo(() => {
    const set = new Set();
    for (const row of hrTeam) {
      if (row.employee_code) set.add(normalizeManagerCode(row.employee_code));
      if (row.employee_id) set.add(normalizeManagerCode(row.employee_id));
    }
    return set;
  }, [hrTeam]);

  const isActiveLead = (code) => !code || activeCodes.has(normalizeManagerCode(code));

  return { hrTeam, loading, error, isActiveLead };
}
