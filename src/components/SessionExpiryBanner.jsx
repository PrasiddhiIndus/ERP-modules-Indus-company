import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { ensureFreshCachedSession, getCachedAccessTokenExpiresAt } from '../lib/authSessionUtils';

/** Warn when the access token will expire within this many seconds. */
const WARN_WITHIN_SECONDS = 5 * 60;
/** How often to re-check expiry while signed in. */
const POLL_MS = 15_000;

/**
 * Fixed banner when the login session is about to expire.
 * Offers "Stay signed in" so open forms are not lost to a sudden redirect.
 */
export default function SessionExpiryBanner() {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tick = useCallback(() => {
    const exp = getCachedAccessTokenExpiresAt();
    if (exp == null) {
      setSecondsLeft(null);
      return;
    }
    const left = Math.floor(exp - Date.now() / 1000);
    setSecondsLeft(left);
  }, []);

  useEffect(() => {
    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tick]);

  const staySignedIn = async () => {
    setBusy(true);
    setError('');
    try {
      const fresh = await ensureFreshCachedSession({ forceRefresh: true });
      if (!fresh?.access_token) {
        setError('Could not renew your session. Save your work, then sign in again.');
        return;
      }
      tick();
    } catch (err) {
      setError(err?.message || 'Could not renew your session.');
    } finally {
      setBusy(false);
    }
  };

  if (secondsLeft == null) return null;
  if (secondsLeft > WARN_WITHIN_SECONDS) return null;

  const expired = secondsLeft <= 0;
  const mins = Math.max(1, Math.ceil(Math.abs(secondsLeft) / 60));

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-[950] w-[min(440px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-amber-950">
            {expired ? 'Your session has expired' : 'Your session is about to expire'}
          </p>
          <p className="mt-0.5 m-0 text-xs text-amber-900/90">
            {expired
              ? 'Save any open work if you can, then sign in again. Unsaved edits may be lost.'
              : `You will be signed out in about ${mins} minute${mins === 1 ? '' : 's'}. Click Stay signed in to keep working.`}
          </p>
          {error ? <p className="mt-1 m-0 text-xs text-rose-700">{error}</p> : null}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void staySignedIn()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Stay signed in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
