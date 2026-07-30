import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronDown, History, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import FormDateInput from "../../../components/FormDateInput";
import { Drawer } from "../components/AdminUi";
import {
  computeCtcStructure,
  currentCompensationYear,
  defaultPtForGross,
  emptyCtcStructure,
  formatINR,
  formatSalaryDate,
  getSalaryStructure,
  hraFromBasic,
  HRA_MODE_CUSTOM,
  HRA_MODE_PERCENT,
  normalizeHraMode,
  paFromMonthly,
  parseRupeeInput,
  reviseSalaryStructure,
  saveSalaryStructure,
  suggestedPfFromBasic,
  todayInputDate,
} from "./salaryData";
import SalaryRevisionHistory from "./SalaryRevisionHistory";

const amountInput =
  "w-[9rem] h-9 px-2.5 text-right text-[15px] tabular-nums border border-[#d4d0c8] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/25 focus:border-[#1F3A8A]";
const dateInput =
  "w-full max-w-[12rem] h-9 text-sm border border-[#d4d0c8] rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/25 focus:border-[#1F3A8A]";
const fieldLabel = "text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a857c]";

function HraModeSelect({ value, onChange, disabled = false }) {
  return (
    <div className="relative inline-flex shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="HRA calculation mode"
        className={[
          "appearance-none h-8 pl-2.5 pr-8 text-[12px] font-medium tracking-tight",
          "rounded-md border border-[#d4d0c8] shadow-[0_1px_0_rgba(40,35,25,0.03)]",
          "focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/20 focus:border-[#1F3A8A]",
          disabled
            ? "bg-[#f3f1ec] text-[#6b665e] cursor-default"
            : "bg-[#faf9f6] text-[#2a2a2a] hover:border-[#c4bfb6] cursor-pointer",
        ].join(" ")}
      >
        <option value={HRA_MODE_PERCENT}>40% of Basic</option>
        <option value={HRA_MODE_CUSTOM}>Custom amount</option>
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8a857c]"
        aria-hidden
      />
    </div>
  );
}

function MoneyCell({ value, strong = false }) {
  if (value == null || value === "") {
    return <span className="text-[#d0cbc3] tabular-nums">—</span>;
  }
  return (
    <span
      className={`tabular-nums text-[15px] ${
        strong ? "font-semibold text-[#1a1a1a]" : "font-medium text-[#2a2a2a]"
      }`}
    >
      {formatINR(value)}
    </span>
  );
}

function ProfileField({ label, children }) {
  return (
    <div className="min-w-0">
      <p className={fieldLabel}>{label}</p>
      <div className="mt-1.5 text-[15px] text-[#1a1a1a] font-medium leading-snug">{children}</div>
    </div>
  );
}

function SheetRow({ label, monthly, pa, tone = "default", labelClass = "" }) {
  const toneClass =
    tone === "gross"
      ? "bg-[#f3f1ec]"
      : tone === "takehome"
        ? "bg-[#e8f3ef]"
        : tone === "ctc"
          ? "bg-[#f3ebe0]"
          : tone === "total"
            ? "bg-[#f7f5f1]"
            : "bg-white";

  const labelWeight =
    tone === "gross" || tone === "takehome" || tone === "ctc" || tone === "total"
      ? "font-semibold text-[#1a1a1a]"
      : "font-medium text-[#2a2a2a]";

  return (
    <div
      className={`grid grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.7fr)_minmax(9rem,0.55fr)] gap-3 items-center px-6 sm:px-8 lg:px-10 py-3.5 border-b border-[#eceae4] ${toneClass}`}
    >
      <div className={`text-[15px] ${labelWeight} ${labelClass}`}>{label}</div>
      <div className="flex justify-end">{monthly}</div>
      <div className="flex justify-end">
        <MoneyCell value={pa} strong={tone !== "default"} />
      </div>
    </div>
  );
}

function SheetSectionHead({ title, right }) {
  return (
    <div className="flex items-end justify-between gap-4 px-6 sm:px-8 lg:px-10 pt-6 pb-3 border-b border-[#e5e1d8]">
      <h3 className="text-[15px] sm:text-base font-bold text-[#1a1a1a] tracking-tight">{title}</h3>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9a958c] shrink-0">
        {right}
      </span>
    </div>
  );
}

function ColHeads() {
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.7fr)_minmax(9rem,0.55fr)] gap-3 px-6 sm:px-8 lg:px-10 py-2.5 border-b border-[#eceae4] bg-[#faf9f6]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a857c]">
        Component
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a857c] text-right">
        W.E.F. Rate (Monthly)
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a857c] text-right">
        P.A.
      </div>
    </div>
  );
}

function AmountInput({ value, onChange, label, readOnly = false }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        // Digits only — avoids type="number" wheel-scroll changing 15000 → 14999
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(raw);
      }}
      onBlur={() => {
        if (readOnly || value === "") return;
        const n = parseRupeeInput(value);
        if (n != null && String(n) !== String(value)) onChange(String(n));
      }}
      onWheel={(e) => {
        // If any number-like behavior remains, never let page scroll nudge the value
        e.currentTarget.blur();
      }}
      readOnly={readOnly}
      disabled={readOnly}
      className={`${amountInput} ${readOnly ? "bg-[#f3f1ec] text-[#5c584f] cursor-default" : ""}`}
      placeholder=""
      aria-label={label}
    />
  );
}

/** Optional Part B line: tick to include and enter amount. */
function OptionalAddLabel({ label, checked, onCheckedChange, disabled = false }) {
  return (
    <label
      className={`inline-flex items-center gap-2.5 select-none ${
        disabled ? "cursor-default" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-[#c4bfb6] text-[#1F3A8A] focus:ring-[#1F3A8A]/30 accent-[#1F3A8A] disabled:opacity-50"
        aria-label={`Include ${label}`}
      />
      <span className={checked ? "text-[#2a2a2a]" : "text-[#8a857c]"}>
        Add : {label}
      </span>
    </label>
  );
}

function numOrEmpty(saved) {
  if (saved == null || saved === "") return "";
  const n = parseRupeeInput(saved);
  return n == null ? "" : String(n);
}

/**
 * Compensation structure — Indus sheet Year 2026-2027 layout.
 * First save creates CTC; later changes use ?mode=revise (archives previous).
 */
export default function SalaryEmployeeCtc() {
  const { employeeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reviseRequested = searchParams.get("mode") === "revise";

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const [hasExistingCtc, setHasExistingCtc] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");

  const [basic, setBasic] = useState("");
  const [hraMode, setHraMode] = useState(HRA_MODE_PERCENT);
  const [hraCustom, setHraCustom] = useState("");
  const [special, setSpecial] = useState("");
  const [empPf, setEmpPf] = useState("");
  const [erPf, setErPf] = useState("");
  const [pt, setPt] = useState("");
  const [mediclaimEnabled, setMediclaimEnabled] = useState(false);
  const [mediclaim, setMediclaim] = useState("");
  const [licEnabled, setLicEnabled] = useState(false);
  const [lic, setLic] = useState("");
  const [bonus, setBonus] = useState("");
  const [wef, setWef] = useState("");

  const isRevisionMode = reviseRequested && hasExistingCtc;
  const isViewOnly = hasExistingCtc && !reviseRequested;
  const canEdit = !isViewOnly;
  const hraIsCustom = hraMode === HRA_MODE_CUSTOM;

  const buildArgs = useCallback(
    () => ({
      basicMonthly: parseRupeeInput(basic) ?? 0,
      specialAllowanceMonthly: parseRupeeInput(special) ?? 0,
      empPfMonthly: parseRupeeInput(empPf),
      erPfMonthly: parseRupeeInput(erPf),
      ptMonthly: parseRupeeInput(pt),
      bonusMonthly: parseRupeeInput(bonus),
      mediclaimEnabled,
      mediclaimMonthly: parseRupeeInput(mediclaim),
      licEnabled,
      licMonthly: parseRupeeInput(lic),
      hraMode,
      hraMonthly: hraIsCustom ? parseRupeeInput(hraCustom) : null,
    }),
    [
      basic,
      special,
      empPf,
      erPf,
      pt,
      bonus,
      mediclaimEnabled,
      mediclaim,
      licEnabled,
      lic,
      hraMode,
      hraIsCustom,
      hraCustom,
    ]
  );

  const applyPfFromBasic = useCallback((basicValue) => {
    const b = parseRupeeInput(basicValue);
    if (b == null || b <= 0) {
      setEmpPf("");
      setErPf("");
      return false;
    }
    const { empPf: emp, erPf: er } = suggestedPfFromBasic(b);
    setEmpPf(String(emp));
    setErPf(String(er));
    return true;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(
          "id, employee_id, employment_type, employee_code, full_name, designation, department, location, date_of_birth, date_of_joining"
        )
        .eq("id", employeeId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        setEmployee(null);
        setError("Employee not found.");
        return;
      }
      setEmployee(data);

      const saved = getSalaryStructure(data.id);
      const declared = Boolean(saved?.declared);
      setHasExistingCtc(declared);
      setRevisionCount(Number(saved?.revision_count) || 0);
      // New revise: blank reason for this revision. View: show saved reason.
      setRevisionReason(reviseRequested && declared ? "" : saved?.revision_reason || "");
      setBasic(numOrEmpty(saved?.basic_monthly));

      // HRA: prefer saved mode; legacy drafts without mode → custom if amount ≠ 40% of Basic
      const basicSaved = parseRupeeInput(saved?.basic_monthly) ?? 0;
      const hraSaved = parseRupeeInput(saved?.hra_monthly);
      let loadedHraMode = HRA_MODE_PERCENT;
      if (saved?.hra_mode) {
        loadedHraMode = normalizeHraMode(saved.hra_mode);
      } else if (
        declared &&
        hraSaved != null &&
        basicSaved > 0 &&
        hraSaved !== hraFromBasic(basicSaved)
      ) {
        loadedHraMode = HRA_MODE_CUSTOM;
      }
      setHraMode(loadedHraMode);
      setHraCustom(
        loadedHraMode === HRA_MODE_CUSTOM
          ? numOrEmpty(hraSaved)
          : numOrEmpty(hraSaved ?? (basicSaved > 0 ? hraFromBasic(basicSaved) : null))
      );

      // Prefer Special Allowance; fall back to legacy uniform-only drafts
      const specialSaved =
        saved?.special_allowance_monthly != null
          ? saved.special_allowance_monthly
          : saved?.uniform_monthly != null &&
              !saved?.conveyance_monthly &&
              !saved?.medical_monthly
            ? saved.uniform_monthly
            : null;
      setSpecial(numOrEmpty(specialSaved));
      setEmpPf(numOrEmpty(saved?.emp_pf_monthly));
      setErPf(numOrEmpty(saved?.er_pf_monthly));
      setPt(numOrEmpty(saved?.pt_monthly));
      const mediclaimAmt = numOrEmpty(saved?.mediclaim_monthly);
      const licAmt = numOrEmpty(saved?.lic_monthly);
      setMediclaimEnabled(
        Boolean(saved?.mediclaim_enabled) || (parseRupeeInput(mediclaimAmt) ?? 0) > 0
      );
      setMediclaim(mediclaimAmt);
      setLicEnabled(Boolean(saved?.lic_enabled) || (parseRupeeInput(licAmt) ?? 0) > 0);
      setLic(licAmt);
      setBonus(numOrEmpty(saved?.bonus_monthly));
      // Profile identity (location, code, name, designation, segment, DOB, DOJ)
      // always comes from Employee Master and is locked — only W.E.F. is editable here.
      // Revise: default W.E.F. to today (user can change). Otherwise keep saved.
      setWef(reviseRequested && declared ? todayInputDate() : saved?.wef_date || "");
      setSaveError("");
      setSaveMsg("");
    } catch (err) {
      console.error("Salary CTC: failed to load employee", err);
      setError("Could not load employee profile. Please try again.");
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, reviseRequested]);

  useEffect(() => {
    load();
  }, [load]);

  const parsed = useMemo(() => {
    if (basic === "" && special === "" && !(hraIsCustom && hraCustom !== "")) {
      return emptyCtcStructure();
    }
    return computeCtcStructure(buildArgs());
  }, [basic, special, hraIsCustom, hraCustom, buildArgs]);

  const fy = currentCompensationYear();
  const segment = employee
    ? employmentTypeLabel(employee.employment_type || employee.employee_id) || "—"
    : "—";

  const hraMonthlyDisplay = parsed.hra_monthly;

  const syncDerivedFromBasic = (basicRaw, specialRaw = special, mode = hraMode, customHra = hraCustom) => {
    const b = parseRupeeInput(basicRaw);
    if (basicRaw === "" || b == null || b <= 0) {
      setEmpPf("");
      setErPf("");
      setPt("");
      return;
    }
    const { empPf: emp, erPf: er } = suggestedPfFromBasic(b);
    setEmpPf(String(emp));
    setErPf(String(er));
    const preview = computeCtcStructure({
      basicMonthly: b,
      specialAllowanceMonthly: parseRupeeInput(specialRaw) ?? 0,
      empPfMonthly: emp,
      erPfMonthly: er,
      ptMonthly: null,
      hraMode: mode,
      hraMonthly: mode === HRA_MODE_CUSTOM ? parseRupeeInput(customHra) : null,
    });
    setPt(String(preview.pt_monthly ?? ""));
  };

  const handleBasicChange = (raw) => {
    if (!canEdit) return;
    setBasic(raw);
    syncDerivedFromBasic(raw, special);
  };

  const handleHraModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeHraMode(nextMode);
    if (mode === HRA_MODE_CUSTOM) {
      // Prefill custom with current 40% figure so user can tweak from there
      const auto = hraFromBasic(parseRupeeInput(basic) ?? 0);
      const seedStr =
        auto > 0
          ? String(auto)
          : hraCustom !== ""
            ? hraCustom
            : "";
      setHraCustom(seedStr);
      setHraMode(mode);
      syncDerivedFromBasic(basic, special, mode, seedStr);
      return;
    }
    setHraMode(mode);
    syncDerivedFromBasic(basic, special, mode, hraCustom);
  };

  const handleHraCustomChange = (raw) => {
    if (!canEdit || !hraIsCustom) return;
    setHraCustom(raw);
    const b = parseRupeeInput(basic);
    if (b != null && b > 0) {
      const preview = computeCtcStructure({
        basicMonthly: b,
        specialAllowanceMonthly: parseRupeeInput(special) ?? 0,
        empPfMonthly: parseRupeeInput(empPf),
        erPfMonthly: parseRupeeInput(erPf),
        ptMonthly: null,
        hraMode: HRA_MODE_CUSTOM,
        hraMonthly: parseRupeeInput(raw),
      });
      setPt(String(preview.pt_monthly ?? defaultPtForGross(preview.gross_monthly)));
    }
  };

  const handleSpecialChange = (raw) => {
    if (!canEdit) return;
    setSpecial(raw);
    const b = parseRupeeInput(basic);
    if (b != null && b > 0) {
      const preview = computeCtcStructure({
        basicMonthly: b,
        specialAllowanceMonthly: parseRupeeInput(raw) ?? 0,
        empPfMonthly: parseRupeeInput(empPf),
        erPfMonthly: parseRupeeInput(erPf),
        ptMonthly: null,
        hraMode,
        hraMonthly: hraIsCustom ? parseRupeeInput(hraCustom) : null,
      });
      setPt(String(preview.pt_monthly ?? defaultPtForGross(preview.gross_monthly)));
    }
  };

  const applyPfDefaults = () => {
    if (!canEdit) return;
    if (!applyPfFromBasic(basic)) return;
    if (parsed.gross_monthly != null) {
      setPt(String(defaultPtForGross(parsed.gross_monthly)));
    }
  };

  const enterReviseMode = () => {
    navigate(`/app/admin/salary-admin/salary-master/${employeeId}?mode=revise`, {
      replace: true,
    });
  };

  const handleSave = () => {
    if (!employee || !canEdit) return;
    setSaveError("");
    const structure = computeCtcStructure(buildArgs());
    if (!structure.declared) {
      setSaveError("Enter Basic or Special Allowance before saving.");
      return;
    }

    const wefToSave = wef || (isRevisionMode ? todayInputDate() : null);
    if (isRevisionMode && !wefToSave) {
      setSaveError("Set a W.E.F. date for this revision.");
      return;
    }

    const payload = {
      ...structure,
      // Persist exact whole-rupee amounts entered / computed
      basic_monthly: structure.basic_monthly,
      special_allowance_monthly: structure.special_allowance_monthly,
      emp_pf_monthly: structure.emp_pf_monthly,
      er_pf_monthly: structure.er_pf_monthly,
      pt_monthly: structure.pt_monthly,
      bonus_monthly: structure.bonus_monthly,
      mediclaim_enabled: structure.mediclaim_enabled,
      mediclaim_monthly: structure.mediclaim_monthly,
      lic_enabled: structure.lic_enabled,
      lic_monthly: structure.lic_monthly,
      hra_mode: structure.hra_mode,
      hra_monthly: structure.hra_monthly,
      // Snapshot from Employee Master (locked on this screen)
      date_of_birth: employee.date_of_birth || null,
      date_of_joining: employee.date_of_joining || null,
      wef_date: wefToSave,
    };

    let savedRow;
    if (isRevisionMode) {
      savedRow = reviseSalaryStructure(employee.id, payload, {
        reason: revisionReason,
        wef_date: wefToSave,
      });
      setRevisionCount(Number(savedRow?.revision_count) || 0);
      setSaveMsg("Revision saved");
    } else {
      savedRow = saveSalaryStructure(employee.id, payload);
      setSaveMsg("Saved");
    }

    setHasExistingCtc(true);
    // Keep form in sync with what was actually saved (current revision)
    setBasic(numOrEmpty(savedRow?.basic_monthly ?? structure.basic_monthly));
    setHraMode(normalizeHraMode(savedRow?.hra_mode ?? structure.hra_mode));
    setHraCustom(
      numOrEmpty(savedRow?.hra_monthly ?? structure.hra_monthly)
    );
    setSpecial(numOrEmpty(savedRow?.special_allowance_monthly ?? structure.special_allowance_monthly));
    setEmpPf(String(structure.emp_pf_monthly ?? ""));
    setErPf(String(structure.er_pf_monthly ?? ""));
    setPt(String(structure.pt_monthly ?? ""));
    setMediclaimEnabled(Boolean(savedRow?.mediclaim_enabled ?? structure.mediclaim_enabled));
    setMediclaim(numOrEmpty(savedRow?.mediclaim_monthly ?? structure.mediclaim_monthly));
    setLicEnabled(Boolean(savedRow?.lic_enabled ?? structure.lic_enabled));
    setLic(numOrEmpty(savedRow?.lic_monthly ?? structure.lic_monthly));
    setBonus(String(structure.bonus_monthly ?? ""));
    setWef(savedRow?.wef_date || wefToSave || "");
    setRevisionReason(savedRow?.revision_reason || revisionReason || "");

    if (isRevisionMode || reviseRequested) {
      navigate(`/app/admin/salary-admin/salary-master/${employee.id}`, { replace: true });
    }
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  if (loading) {
    return (
      <div className="-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] flex items-center justify-center bg-[#f0eee8]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1F3A8A]" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] bg-[#f0eee8] p-6 space-y-3">
        <Link
          to="/app/admin/salary-admin/salary-master"
          className="inline-flex items-center gap-1.5 text-sm text-[#1F3A8A] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Salary Master
        </Link>
        <p className="text-sm text-red-600">{error || "Employee not found."}</p>
      </div>
    );
  }

  const name = employee.full_name || "Employee";
  const code = employee.employee_code || employee.employee_id || "—";
  const metaLine = [code, employee.designation, employee.department].filter(Boolean).join(" · ");

  return (
    <div className="-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] flex flex-col bg-[#f0eee8]">
      <div className="shrink-0 border-b border-[#e5e1d8] bg-[#f7f5f0]">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-[1.75rem] font-bold text-[#1a1a1a] tracking-tight">
              {name}
            </h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a857c]">
              {isRevisionMode
                ? `Salary revision · ${code}`
                : isViewOnly
                  ? `Compensation structure · ${code}`
                  : `New CTC setup · ${code}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasExistingCtc ? (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="h-9 px-3 rounded-md border border-[#d4d0c8] bg-white text-xs font-medium text-[#2a2a2a] hover:bg-[#faf9f6] inline-flex items-center gap-1.5"
              >
                <History className="h-3.5 w-3.5" />
                History
                {revisionCount > 0 ? (
                  <span className="ml-0.5 inline-flex min-w-[1.1rem] h-4 px-1 items-center justify-center rounded-full bg-[#1F3A8A] text-[9px] font-bold text-white">
                    {revisionCount}
                  </span>
                ) : null}
              </button>
            ) : null}
            {isViewOnly ? (
              <button
                type="button"
                onClick={enterReviseMode}
                className="h-9 px-3 rounded-md bg-[#1F3A8A] text-white text-xs font-semibold hover:bg-[#18306f] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Revise CTC
              </button>
            ) : null}
          </div>
        </div>
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-2.5 border-t border-[#ebe7df] bg-[#f3f1ec]">
          <Link
            to="/app/admin/salary-admin/salary-master"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5c584f] hover:text-[#1F3A8A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Salary Master
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="w-full px-3 sm:px-5 lg:px-8 xl:px-10 py-4 sm:py-5 pb-28">
          {isRevisionMode ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-start gap-3">
              <RefreshCw className="h-4 w-4 text-amber-800 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-950">Salary revision</p>
                <p className="mt-0.5 text-xs text-amber-900/80">
                  Current figures are pre-filled. Change amounts as needed. W.E.F. is set to today
                  (you can change it). Previous CTC is kept in history.
                </p>
              </div>
            </div>
          ) : null}

          {isViewOnly ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Viewing current CTC</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Amounts are locked. Use Revise CTC to change compensation and keep a history trail.
                </p>
              </div>
              <button
                type="button"
                onClick={enterReviseMode}
                className="h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-semibold text-[#1F3A8A] hover:bg-white"
              >
                Revise CTC
              </button>
            </div>
          ) : null}

          {reviseRequested && !hasExistingCtc ? (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              No CTC yet for this employee. Enter the first structure below and save — later changes
              will use revision.
            </div>
          ) : null}

          <div className="w-full bg-white border border-[#e5e1d8] shadow-[0_1px_3px_rgba(40,35,25,0.04)] overflow-hidden">
            <div className="px-6 sm:px-8 lg:px-10 py-5 sm:py-6 border-b border-[#eceae4] flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-[#1a1a1a]">{name}</h2>
                <p className="mt-1 text-sm text-[#5c584f]">{metaLine || "—"}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-[#f3e6d4] text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a5a2e]">
                  Compensation scheme — Year {fy}
                </span>
                {hasExistingCtc ? (
                  <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#8a857c]">
                    Version {(revisionCount || 0) + 1}
                    {revisionCount > 0 ? ` · ${revisionCount} prior revision${revisionCount === 1 ? "" : "s"}` : ""}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-6 sm:px-8 lg:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6 border-b border-[#eceae4]">
              <ProfileField label="Location">{employee.location || "—"}</ProfileField>
              <ProfileField label="Employee Code">{employee.employee_code || "—"}</ProfileField>
              <ProfileField label="Employee Name">{employee.full_name || "—"}</ProfileField>
              <ProfileField label="Designation">{employee.designation || "—"}</ProfileField>
              <ProfileField label="Segment">{segment}</ProfileField>
              <ProfileField label="D.O.B.">
                {employee.date_of_birth ? formatSalaryDate(employee.date_of_birth) : "—"}
              </ProfileField>
              <ProfileField label="D.O.J.">
                {employee.date_of_joining ? formatSalaryDate(employee.date_of_joining) : "—"}
              </ProfileField>
              <div className="min-w-0">
                <p className={fieldLabel}>W.E.F.</p>
                <div className="mt-1.5">
                  <FormDateInput
                    value={wef}
                    onChange={(e) => canEdit && setWef(e.target.value)}
                    className={`${dateInput} ${!canEdit ? "bg-[#f3f1ec] pointer-events-none" : ""}`}
                  />
                </div>
                {canEdit ? (
                  <p className="mt-1 text-[10px] text-[#8a857c]">
                    {isRevisionMode
                      ? "Only editable profile field — defaults to today"
                      : "Only editable profile field"}
                  </p>
                ) : null}
              </div>
              {isRevisionMode ? (
                <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                  <p className={fieldLabel}>Revision reason</p>
                  <div className="mt-1.5">
                    <input
                      type="text"
                      value={revisionReason}
                      onChange={(e) => setRevisionReason(e.target.value)}
                      placeholder="e.g. Annual increment, role change…"
                      className="w-full max-w-xl h-9 text-sm border border-[#d4d0c8] rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/25 focus:border-[#1F3A8A]"
                    />
                  </div>
                </div>
              ) : hasExistingCtc ? (
                <div className="min-w-0 sm:col-span-2 lg:col-span-4">
                  <ProfileField label="Revision reason">
                    {revisionReason?.trim() || "—"}
                  </ProfileField>
                </div>
              ) : null}
            </div>

            <SheetSectionHead title="PART A — Gross & Take Home" right="w.e.f. rate · per annum" />
            <ColHeads />

            <SheetRow
              label="Basic"
              monthly={
                <AmountInput
                  value={basic}
                  onChange={handleBasicChange}
                  label="Basic monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parseRupeeInput(basic))}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[2.5rem]">HRA</span>
                  <HraModeSelect
                    value={hraMode}
                    onChange={handleHraModeChange}
                    disabled={!canEdit}
                  />
                </div>
              }
              monthly={
                hraIsCustom ? (
                  <AmountInput
                    value={hraCustom}
                    onChange={handleHraCustomChange}
                    label="HRA monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={hraMonthlyDisplay} />
                )
              }
              pa={paFromMonthly(hraMonthlyDisplay)}
            />
            <SheetRow
              label="Special Allowance"
              monthly={
                <AmountInput
                  value={special}
                  onChange={handleSpecialChange}
                  label="Special allowance monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parseRupeeInput(special))}
            />
            <SheetRow
              label="GROSS (PART A)"
              tone="gross"
              monthly={<MoneyCell value={parsed.gross_monthly} strong />}
              pa={paFromMonthly(parsed.gross_monthly)}
            />
            <SheetRow
              label="Less : Employee PF"
              monthly={
                <AmountInput
                  value={empPf}
                  onChange={canEdit ? setEmpPf : () => {}}
                  label="Employee PF monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parsed.emp_pf_monthly)}
            />
            <SheetRow
              label="Less : P. Tax"
              monthly={
                <AmountInput
                  value={pt}
                  onChange={canEdit ? setPt : () => {}}
                  label="Professional tax monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parsed.pt_monthly)}
            />
            <SheetRow
              label={
                parsed.emp_esic_applicable
                  ? "Less : Employee ESIC"
                  : "Less : Employee ESIC (not applicable)"
              }
              monthly={<MoneyCell value={parsed.declared ? parsed.emp_esic_monthly : null} />}
              pa={paFromMonthly(parsed.declared ? parsed.emp_esic_monthly : null)}
            />
            <SheetRow
              label="TAKE HOME"
              tone="takehome"
              monthly={<MoneyCell value={parsed.take_home_monthly} strong />}
              pa={paFromMonthly(parsed.take_home_monthly)}
            />

            <SheetSectionHead title="PART B — Employer Contributions" right="employer cost" />
            <ColHeads />

            <SheetRow
              label="Add : Employer PF"
              monthly={
                <AmountInput
                  value={erPf}
                  onChange={canEdit ? setErPf : () => {}}
                  label="Employer PF monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parsed.er_pf_monthly)}
            />
            <SheetRow
              label={
                parsed.er_esic_applicable
                  ? "Add : Employer ESIC"
                  : "Add : Employer ESIC (not applicable)"
              }
              monthly={<MoneyCell value={parsed.declared ? parsed.er_esic_monthly : null} />}
              pa={paFromMonthly(parsed.declared ? parsed.er_esic_monthly : null)}
            />
            <SheetRow
              label="Add : Gratuity (as per Govt. rules)"
              monthly={<MoneyCell value={parsed.gratuity_monthly} />}
              pa={paFromMonthly(parsed.gratuity_monthly)}
            />
            <SheetRow
              label="Add : Leave Encashment (as per company policy)"
              monthly={<MoneyCell value={parsed.leave_encash_monthly} />}
              pa={paFromMonthly(parsed.leave_encash_monthly)}
            />
            <SheetRow
              label={
                <OptionalAddLabel
                  label="Mediclaim health policy"
                  checked={mediclaimEnabled}
                  onCheckedChange={(on) => {
                    if (!canEdit) return;
                    setMediclaimEnabled(on);
                  }}
                  disabled={!canEdit}
                />
              }
              monthly={
                mediclaimEnabled ? (
                  <AmountInput
                    value={mediclaim}
                    onChange={canEdit ? setMediclaim : () => {}}
                    label="Mediclaim monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <span className="text-[12px] text-[#b0aaa0]">Not included</span>
                )
              }
              pa={paFromMonthly(mediclaimEnabled ? parsed.mediclaim_monthly : null)}
            />
            <SheetRow
              label={
                <OptionalAddLabel
                  label="LIC policy"
                  checked={licEnabled}
                  onCheckedChange={(on) => {
                    if (!canEdit) return;
                    setLicEnabled(on);
                  }}
                  disabled={!canEdit}
                />
              }
              monthly={
                licEnabled ? (
                  <AmountInput
                    value={lic}
                    onChange={canEdit ? setLic : () => {}}
                    label="LIC monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <span className="text-[12px] text-[#b0aaa0]">Not included</span>
                )
              }
              pa={paFromMonthly(licEnabled ? parsed.lic_monthly : null)}
            />
            <SheetRow
              label="Add : Bonus"
              monthly={
                <AmountInput
                  value={bonus}
                  onChange={canEdit ? setBonus : () => {}}
                  label="Bonus monthly"
                  readOnly={!canEdit}
                />
              }
              pa={paFromMonthly(parsed.bonus_monthly)}
            />
            <SheetRow
              label="Total (B)"
              tone="total"
              monthly={<MoneyCell value={parsed.total_b_monthly} strong />}
              pa={paFromMonthly(parsed.total_b_monthly)}
            />
            <SheetRow
              label="CTC (PART A + B)"
              tone="ctc"
              monthly={<MoneyCell value={parsed.ctc_monthly} strong />}
              pa={parsed.ctc_annual}
            />
          </div>
        </div>
      </div>

      <footer className="shrink-0 sticky bottom-0 z-20 border-t border-[#e5e1d8] bg-[#f7f5f0]/95 backdrop-blur-sm">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-3 flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={handleSave}
              className="h-10 px-5 rounded-md bg-[#1a1a1a] text-white text-sm font-semibold hover:bg-black inline-flex items-center gap-1.5"
            >
              {saveMsg ? <Check className="h-4 w-4" /> : null}
              {saveMsg
                ? saveMsg === "Revision saved"
                  ? "Revision saved"
                  : "CTC saved"
                : isRevisionMode
                  ? "Save revision"
                  : "Save CTC"}
            </button>
          ) : (
            <button
              type="button"
              onClick={enterReviseMode}
              className="h-10 px-5 rounded-md bg-[#1F3A8A] text-white text-sm font-semibold hover:bg-[#18306f] inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Revise CTC
            </button>
          )}
          {canEdit ? (
            <button
              type="button"
              onClick={applyPfDefaults}
              disabled={!basic || (parseRupeeInput(basic) ?? 0) <= 0}
              className="h-10 px-4 rounded-md border border-[#d4d0c8] bg-white text-sm font-medium text-[#2a2a2a] hover:bg-[#faf9f6] disabled:opacity-40 disabled:pointer-events-none"
              title="Fill Employee PF 12% and Employer PF 13% of Basic (capped ₹15,000)"
            >
              Suggest PF (12% / 13%)
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate("/app/admin/salary-admin/salary-processing")}
            className="h-10 px-4 rounded-md border border-[#d4d0c8] bg-white text-sm font-medium text-[#2a2a2a] hover:bg-[#faf9f6] inline-flex items-center gap-1.5"
          >
            Go to Salary Processing
            <ArrowRight className="h-4 w-4" />
          </button>
          {saveError ? (
            <span className="text-sm text-red-600 font-medium">{saveError}</span>
          ) : null}
        </div>
      </footer>

      <Drawer
        open={historyOpen}
        title="CTC revision history"
        onClose={() => setHistoryOpen(false)}
        widthClass="max-w-md"
      >
        <SalaryRevisionHistory
          employee={employee}
          salary={getSalaryStructure(employee.id)}
        />
      </Drawer>
    </div>
  );
}
