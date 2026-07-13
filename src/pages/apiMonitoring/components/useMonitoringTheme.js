import { useCallback, useEffect, useMemo, useState } from "react";

const THEME_KEY = "api-monitoring-ui-theme";

export function useMonitoringTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next === "dark" ? "dark" : "light");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const t = useMonitoringThemeClasses(theme);

  return { theme, setTheme, toggleTheme, t, reducedMotion };
}

export function useMonitoringThemeClasses(theme) {
  const dark = theme === "dark";
  return useMemo(
    () => ({
      dark,
      shell: dark
        ? "bg-slate-950 text-slate-100 min-h-full -m-4 sm:-m-6 p-4 sm:p-6 rounded-none"
        : "bg-slate-50/80 text-gray-900 min-h-full -m-4 sm:-m-6 p-4 sm:p-6 rounded-none",
      card: dark
        ? "bg-slate-900 border border-slate-700/80 shadow-lg shadow-black/20"
        : "bg-white border border-gray-100 shadow-sm",
      cardHover: dark
        ? "hover:border-slate-600 hover:shadow-xl hover:shadow-black/30"
        : "hover:border-gray-200 hover:shadow-md",
      muted: dark ? "text-slate-400" : "text-gray-500",
      text: dark ? "text-slate-100" : "text-gray-900",
      textSecondary: dark ? "text-slate-300" : "text-gray-700",
      border: dark ? "border-slate-700" : "border-gray-200",
      input: dark
        ? "bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
        : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
      tableHead: dark ? "bg-slate-800/90 text-slate-300" : "bg-gray-50 text-gray-600",
      tableRow: dark ? "hover:bg-slate-800/50" : "hover:bg-blue-50/50",
      tableRowExpanded: dark ? "bg-slate-800/40" : "bg-blue-50/30",
      accent: dark ? "text-blue-400" : "text-[#1F3A8A]",
      accentBg: dark ? "bg-blue-600 hover:bg-blue-500" : "bg-[#1F3A8A] hover:bg-[#1a3278]",
      accentSoft: dark ? "bg-blue-950/50 text-blue-300 border-blue-800" : "bg-blue-50 text-[#1F3A8A] border-blue-200",
      pillLive: dark ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200",
      pillPaused: dark ? "bg-amber-950 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200",
      pillChecking: dark ? "bg-slate-800 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-600 border-slate-200",
      errorBanner: dark ? "bg-red-950/60 border-red-800 text-red-200" : "bg-red-50 border-red-200 text-red-900",
      skeleton: dark ? "bg-slate-700/60" : "bg-gray-200/80",
      chartGrid: dark ? "#334155" : "#f0f0f0",
      chartTick: dark ? "#94a3b8" : "#6b7280",
      tooltipBg: dark ? "#1e293b" : "#ffffff",
      tooltipBorder: dark ? "#475569" : "#e5e7eb",
      drawerOverlay: "bg-black/40",
      drawerPanel: dark ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200",
      focusRing: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A8A] focus-visible:ring-offset-2",
      focusRingDark: dark ? "focus-visible:ring-offset-slate-950" : "focus-visible:ring-offset-white",
      statusOnline: dark ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-emerald-50 text-emerald-800 border-emerald-200",
      statusDegraded: dark ? "bg-amber-950 text-amber-300 border-amber-700" : "bg-amber-50 text-amber-900 border-amber-200",
      statusOffline: dark ? "bg-red-950 text-red-300 border-red-700" : "bg-red-50 text-red-900 border-red-200",
      progressTrack: dark ? "bg-slate-700" : "bg-gray-200",
      progressGreen: dark ? "bg-emerald-500" : "bg-emerald-500",
      progressAmber: dark ? "bg-amber-500" : "bg-amber-500",
      progressRed: dark ? "bg-red-500" : "bg-red-500",
      badgeNeutral: dark ? "bg-slate-800 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200",
      badgeViolet: dark ? "bg-violet-950 text-violet-300 border-violet-800" : "bg-violet-50 text-violet-800 border-violet-200",
      badgeBlue: dark ? "bg-blue-950 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200",
    }),
    [dark]
  );
}
