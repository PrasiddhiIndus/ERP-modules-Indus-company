import { useEffect, useState } from "react";
import { CALLING_MASTER_DROPDOWNS_EVENT } from "./callingMasterConfig";
import { getCallingMasterSelectOptions } from "./callingMasterStorage";

/** Live dropdown option map for Calling Master forms and filters. */
export function useCallingMasterDropdowns() {
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await getCallingMasterSelectOptions();
        if (cancelled) return;
        setOptions(next);
        setError("");
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Unable to load dropdown options.");
        setOptions({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    window.addEventListener(CALLING_MASTER_DROPDOWNS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(CALLING_MASTER_DROPDOWNS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { options, loading, error };
}
