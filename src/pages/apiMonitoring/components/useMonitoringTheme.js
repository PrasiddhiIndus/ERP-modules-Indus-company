import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../contexts/ThemeContext";

export function useMonitoringTheme() {
  /* API Monitoring follows the ERP-wide theme (single source of truth: ThemeContext). */
  const { theme, setTheme, toggleTheme } = useTheme();

  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const t = useMonitoringThemeClasses();

  return { theme, setTheme, toggleTheme, t, reducedMotion };
}

/**
 * Class map for API Monitoring. Classes are design-token utilities, which
 * follow the ERP light/dark theme on their own — so there is a single set and
 * `dark` stays false (legacy `t.dark ? rawPalette : token` branches pick tokens).
 */
export function useMonitoringThemeClasses() {
  return useMemo(
    () => ({
      dark: false,
      shell: "bg-slate-50/80 text-gray-900 min-h-full -m-4 sm:-m-6 p-4 sm:p-6 rounded-none",
      card: "bg-white border border-gray-100 shadow-sm",
      cardHover: "hover:border-gray-200 hover:shadow-md",
      muted: "text-gray-500",
      text: "text-gray-900",
      textSecondary: "text-gray-700",
      border: "border-gray-200",
      input: "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
      tableHead: "bg-gray-50 text-gray-600",
      tableRow: "hover:bg-blue-50/50",
      tableRowExpanded: "bg-blue-50/30",
      accent: "text-accent",
      accentBg: "bg-accent hover:bg-accent-deep",
      accentSoft: "bg-blue-50 text-accent border-blue-200",
      pillLive: "bg-emerald-50 text-emerald-800 border-emerald-200",
      pillPaused: "bg-amber-50 text-amber-800 border-amber-200",
      pillChecking: "bg-slate-100 text-slate-600 border-slate-200",
      errorBanner: "bg-red-50 border-red-200 text-red-900",
      skeleton: "bg-gray-200/80",
      chartGrid: "var(--chart-grid)",
      chartTick: "var(--text-muted)",
      tooltipBg: "var(--surface)",
      tooltipBorder: "var(--border)",
      drawerOverlay: "bg-black/40",
      drawerPanel: "bg-white border-gray-200",
      focusRing: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
      focusRingDark: "focus-visible:ring-offset-white",
      statusOnline: "bg-emerald-50 text-emerald-800 border-emerald-200",
      statusDegraded: "bg-amber-50 text-amber-900 border-amber-200",
      statusOffline: "bg-red-50 text-red-900 border-red-200",
      progressTrack: "bg-gray-200",
      progressGreen: "bg-emerald-500",
      progressAmber: "bg-amber-500",
      progressRed: "bg-red-500",
      badgeNeutral: "bg-slate-100 text-slate-700 border-slate-200",
      badgeViolet: "bg-violet-50 text-violet-800 border-violet-200",
      badgeBlue: "bg-blue-50 text-blue-800 border-blue-200",
    }),
    []
  );
}
