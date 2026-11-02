/**
 * Warm the authenticated shell chunks after public pages load,
 * so post-login navigation does not wait on a cold Layout/Dashboard download.
 * Safe no-op if the imports fail (e.g. offline).
 */

import { prefetchAllDashboards, prefetchAllDashboardsNow } from "./prefetchDashboards";

let warmed = false;

export function prefetchAppShell() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;

  const run = () => {
    void import("../contexts/Layout").catch(() => {});
    void import("../pages/Dashboard").catch(() => {});
    prefetchAllDashboards();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1800 });
  } else {
    window.setTimeout(run, 250);
  }
}

/** Immediate warm (call right before navigating into /app). */
export function prefetchAppShellNow() {
  if (typeof window === "undefined") return;
  warmed = true;
  void import("../contexts/Layout").catch(() => {});
  void import("../pages/Dashboard").catch(() => {});
  prefetchAllDashboardsNow();
}
