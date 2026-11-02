import { useEffect, useState } from "react";

/**
 * Shared route-level loading UI.
 * Delays the spinner briefly so fast chunk loads do not flash a loader (flicker).
 */
export default function PageLoader({
  fullScreen = false,
  label = "Loading module…",
  delayMs = 140,
}) {
  const [showSpinner, setShowSpinner] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setShowSpinner(true);
      return undefined;
    }
    const id = window.setTimeout(() => setShowSpinner(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  const shellClass = fullScreen
    ? "min-h-screen min-h-dvh bg-canvas"
    : "min-h-[12rem] py-12 bg-transparent";

  if (!showSpinner) {
    return (
      <div className={`${shellClass}`} aria-hidden="true" />
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center text-ink-secondary ${shellClass}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-border border-t-accent animate-spin mb-3"
        aria-hidden
      />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
