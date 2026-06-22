import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clearBillingFormDraft, loadBillingFormDraft, saveBillingFormDraft } from '../utils/billingFormAutosave';

/**
 * Persists billing form drafts to localStorage.
 * - Restore runs on every mount (not gated on saveEnabled).
 * - Pending debounced saves are flushed on unmount, page hide, and beforeunload.
 */
export function useBillingFormAutosave({
  key,
  snapshot,
  saveEnabled = true,
  delayMs = 400,
  onRestore,
  skipRestore = false,
}) {
  const skipSaveRef = useRef(true);
  const snapshotRef = useRef(snapshot);
  const saveTimerRef = useRef(null);
  const restoredOnMountRef = useRef(false);
  const [hint, setHint] = useState('');

  snapshotRef.current = snapshot;

  const flushSave = useCallback(() => {
    if (!key || !saveEnabled) return false;
    const payload = snapshotRef.current;
    if (payload == null) return false;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const ok = saveBillingFormDraft(key, { payload });
    return ok;
  }, [key, saveEnabled]);

  useLayoutEffect(() => {
    restoredOnMountRef.current = false;
  }, [key]);

  useLayoutEffect(() => {
    if (!key || skipRestore || typeof onRestore !== 'function' || restoredOnMountRef.current) return;
    restoredOnMountRef.current = true;
    const draft = loadBillingFormDraft(key);
    if (draft?.payload) {
      skipSaveRef.current = true;
      onRestore(draft.payload);
      setHint('Restored draft');
      const t = window.setTimeout(() => setHint(''), 2800);
      return () => window.clearTimeout(t);
    }
    skipSaveRef.current = false;
    return undefined;
  }, [key, onRestore, skipRestore]);

  useEffect(() => {
    if (!key || !saveEnabled) return undefined;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return undefined;
    }

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      if (flushSave()) {
        setHint('Saved');
        window.setTimeout(() => setHint(''), 1800);
      }
    }, delayMs);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushSave();
    };
  }, [key, saveEnabled, snapshot, delayMs, flushSave]);

  useEffect(() => {
    if (!key) return undefined;
    const onPageHide = () => flushSave();
    const onBeforeUnload = () => flushSave();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      flushSave();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [key, flushSave]);

  const clearDraft = useCallback(() => {
    if (key) clearBillingFormDraft(key);
    restoredOnMountRef.current = false;
  }, [key]);

  return { hint, clearDraft, flushSave };
}
