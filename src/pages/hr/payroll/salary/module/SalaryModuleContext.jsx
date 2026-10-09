import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import { createSeedState, processSites, validateFormula } from "./model";

const SalaryModuleContext = createContext(null);

export function SalaryModuleProvider({ children }) {
  const [state, setState] = useState(createSeedState);
  const [month, setMonth] = useState("2026-10");
  const [siteId, setSiteId] = useState("s1");
  const [siteFilter, setSiteFilter] = useState("all");
  const [compScope, setCompScope] = useState("master");
  const [selection, setSelection] = useState({});
  const [reportMonth, setReportMonth] = useState("all");
  const [reportSite, setReportSite] = useState("all");
  const stateRef = useRef(state);
  const monthRef = useRef(month);
  stateRef.current = state;
  monthRef.current = month;

  const api = useMemo(() => {
    const current = () => stateRef.current;

    return {
      state,
      month,
      setMonth,
      siteId,
      setSiteId,
      siteFilter,
      setSiteFilter,
      compScope,
      setCompScope,
      reportMonth,
      setReportMonth,
      reportSite,
      setReportSite,
      selectedSites: selection[month] || {},
      toggleSite(id, checked) {
        const activeMonth = monthRef.current;
        setSelection((prev) => ({
          ...prev,
          [activeMonth]: { ...(prev[activeMonth] || {}), [id]: checked },
        }));
      },
      clearMonthSelection() {
        const activeMonth = monthRef.current;
        setSelection((prev) => ({ ...prev, [activeMonth]: {} }));
      },
      renameMain(code, name) {
        const next = name.trim();
        if (!next) return "Enter a name";
        setState((prev) => ({
          ...prev,
          comps: prev.comps.map((item) => (item.c === code ? { ...item, n: next } : item)),
        }));
        return null;
      },
      setMainFormula(code, formula) {
        const next = formula.trim();
        try {
          validateFormula(current(), next);
        } catch (error) {
          return error.message || "Invalid formula";
        }
        setState((prev) => ({
          ...prev,
          comps: prev.comps.map((item) => (item.c === code ? { ...item, f: next } : item)),
        }));
        return null;
      },
      addComponent({ code, name, type, formula }) {
        const nextCode = String(code || "").toUpperCase().trim();
        const nextName = String(name || "").trim();
        const nextFormula = String(formula || "").trim();
        if (!nextCode || !nextName || !nextFormula) return "Fill all fields";
        if (current().comps.some((item) => item.c === nextCode)) return "Code already exists";
        try {
          validateFormula(current(), nextFormula, { [nextCode]: 1 });
        } catch (error) {
          return error.message || "Invalid formula";
        }
        setState((prev) => ({
          ...prev,
          comps: [...prev.comps, { c: nextCode, n: nextName, t: type === "D" ? "D" : "E", f: nextFormula }],
        }));
        return null;
      },
      setIncluded(site, code, on) {
        setState((prev) => {
          const config = prev.cfg[site];
          if (!config) return prev;
          const inc = config.inc.filter((item) => item !== code);
          if (on) inc.push(code);
          return { ...prev, cfg: { ...prev.cfg, [site]: { ...config, inc } } };
        });
      },
      setSiteName(site, code, name) {
        const next = name.trim();
        setState((prev) => {
          const config = prev.cfg[site];
          const master = prev.comps.find((item) => item.c === code);
          if (!config || !master) return prev;
          const names = { ...config.names };
          if (!next || next === master.n) delete names[code];
          else names[code] = next;
          return { ...prev, cfg: { ...prev.cfg, [site]: { ...config, names } } };
        });
      },
      setSiteFormula(site, code, formula) {
        const next = formula.trim();
        const snapshot = current();
        const master = snapshot.comps.find((item) => item.c === code);
        if (!master) return "Component not found";
        if (!next || next === master.f) {
          setState((prev) => {
            const config = prev.cfg[site];
            if (!config) return prev;
            const fm = { ...config.fm };
            delete fm[code];
            return { ...prev, cfg: { ...prev.cfg, [site]: { ...config, fm } } };
          });
          return null;
        }
        try {
          validateFormula(snapshot, next);
        } catch (error) {
          return error.message || "Invalid formula";
        }
        setState((prev) => {
          const config = prev.cfg[site];
          if (!config) return prev;
          return {
            ...prev,
            cfg: { ...prev.cfg, [site]: { ...config, fm: { ...config.fm, [code]: next } } },
          };
        });
        return null;
      },
      resetSiteOverride(site, code) {
        setState((prev) => {
          const config = prev.cfg[site];
          if (!config) return prev;
          const names = { ...config.names };
          const fm = { ...config.fm };
          delete names[code];
          delete fm[code];
          return { ...prev, cfg: { ...prev.cfg, [site]: { ...config, names, fm } } };
        });
      },
      addSite({ name, client, loc }) {
        const nextName = String(name || "").trim();
        if (!nextName) return "Enter a site name";
        const id = `s${current().sites.length + 1}`;
        setState((prev) => ({
          ...prev,
          sites: [...prev.sites, { id, name: nextName, client: String(client || "").trim(), loc: String(loc || "").trim() }],
          cfg: { ...prev.cfg, [id]: { inc: [], names: {}, fm: {} } },
        }));
        setSiteId(id);
        return null;
      },
      transferEmployee(id, toSite) {
        setState((prev) => {
          const employee = prev.emps.find((item) => item.id === id);
          if (!employee || employee.site === toSite) return prev;
          const from = prev.sites.find((site) => site.id === employee.site)?.name || "";
          const to = prev.sites.find((site) => site.id === toSite)?.name || "";
          return {
            ...prev,
            emps: prev.emps.map((item) =>
              item.id === id
                ? {
                    ...item,
                    site: toSite,
                    tr: [...item.tr, { d: new Date().toISOString().slice(0, 10), from, to }],
                  }
                : item
            ),
          };
        });
      },
      reviseSalary(id, { amount, effectiveMonth, reason }) {
        const nextAmount = Number(amount);
        const nextReason = String(reason || "").trim();
        if (!nextAmount || !nextReason) return "Enter amount and reason";
        const snapshot = current();
        const employee = snapshot.emps.find((item) => item.id === id);
        if (!employee) return "Employee not found";
        if (snapshot.paid[effectiveMonth]?.[employee.site]) return "That month is already disbursed";
        setState((prev) => ({
          ...prev,
          rev: [
            {
              emp: id,
              date: `${effectiveMonth}-01`,
              old: employee.basic,
              nw: nextAmount,
              reason: nextReason,
              by: "HR Admin",
            },
            ...prev.rev,
          ],
          emps: prev.emps.map((item) => (item.id === id ? { ...item, basic: nextAmount } : item)),
        }));
        return null;
      },
      disburse(siteIds) {
        const activeMonth = monthRef.current;
        setState((prev) => processSites(prev, activeMonth, siteIds));
        setSelection((prev) => ({ ...prev, [activeMonth]: {} }));
      },
    };
  }, [state, month, siteId, siteFilter, compScope, selection, reportMonth, reportSite]);

  return <SalaryModuleContext.Provider value={api}>{children}</SalaryModuleContext.Provider>;
}

export function useSalaryModule() {
  const value = useContext(SalaryModuleContext);
  if (!value) throw new Error("Salary module is not available on this screen");
  return value;
}
