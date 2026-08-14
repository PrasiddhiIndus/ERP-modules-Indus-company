import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronDown, History, RefreshCw } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import FormDateInput from "../../../components/FormDateInput";
import { Drawer } from "../components/AdminUi";
import {
  BASIC_GROSS_PERCENT,
  BASIC_SLAB_MIN,
  basicFromGross,
  computeCtcStructure,
  currentCompensationYear,
  DEFAULT_EMP_ESIC_RATE_PCT,
  DEFAULT_ER_ESIC_RATE_PCT,
  DEFAULT_ESIC_CEILING,
  defaultBasicModeForLevel,
  defaultPtForGross,
  emptyCtcStructure,
  EMP_LEVEL_HELPER,
  EMP_LEVEL_OFFICE,
  formatINR,
  formatPA,
  formatSalaryDate,
  getSalaryStructure,
  hraFromBasic,
  HRA_MODE_CUSTOM,
  HRA_MODE_PERCENT,
  HRA_PERCENT,
  MODE_AUTO,
  MODE_CUSTOM,
  normalizeComponentMode,
  normalizeEmployeeLevel,
  normalizeHraMode,
  paFromMonthly,
  parsePaInput,
  parseRateInput,
  parseRupeeInput,
  reviseSalaryStructure,
  roundPa,
  saveSalaryStructure,
  suggestedPfFromBasic,
  todayInputDate,
} from "./salaryData";
import SalaryRevisionHistory from "./SalaryRevisionHistory";
import PersonSalaryComponentsPanel from "./PersonSalaryComponentsPanel";
import {
  CTC_OPTIONAL_PRESETS,
  evalComponentFormula,
  getProfileCustomComponents,
  hydratePersonComponents,
  isCtcOptionalPresetCode,
  loadCustomComponentAmounts,
  personHasComponent,
  persistPersonComponentAmounts,
  saveCustomComponentAmounts,
  setPersonOptionalPreset,
} from "./salaryComponentsCatalog";

/** Normalize saved P.A. overrides (DB JSON). Empty = use monthly × 12. */
function normalizePaOverridesMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = parsePaInput(v);
    if (n != null) out[String(k)] = n;
  }
  return out;
}

/** Load P.A. overrides from a saved CTC row (DB only — not auto-persisted while typing). */
function paOverridesFromSaved(saved) {
  const fromJson = normalizePaOverridesMap(saved?.pa_overrides_json);
  if (Object.keys(fromJson).length) return fromJson;
  const autoCtc = paFromMonthly(saved?.ctc_monthly);
  const savedCtc = parsePaInput(saved?.ctc_annual);
  if (
    savedCtc != null &&
    autoCtc != null &&
    Math.abs(savedCtc - autoCtc) > 0.001
  ) {
    return { ctc: savedCtc };
  }
  return {};
}

const amountInput =
  "w-[9rem] h-9 px-2.5 text-right text-[15px] font-normal tabular-nums text-ink border border-border-strong rounded bg-white focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent";
const paAmountInput =
  "w-[9rem] h-9 px-2.5 text-right text-[15px] font-normal tabular-nums text-ink border border-border-strong rounded bg-white focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent";
const dateInput =
  "w-full max-w-[12rem] h-9 text-sm border border-border-strong rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent";
const fieldLabel = "text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted";
const selectInput =
  "w-full max-w-[12rem] h-9 text-sm border border-border-strong rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent";
const sheetGridCols =
  "grid grid-cols-[minmax(0,1.35fr)_minmax(9.5rem,0.65fr)_minmax(9.5rem,0.65fr)] gap-x-4 gap-y-0 items-center";

function ModeToggle({ value, onChange, disabled = false, autoLabel = "Auto", customLabel = "Custom", ariaLabel }) {
  const isAuto = normalizeComponentMode(value) === MODE_AUTO;
  return (
    <div
      className={[
        "inline-flex rounded-md border border-border-strong p-0.5 shrink-0",
        disabled ? "bg-surface-sunken opacity-80" : "bg-row-hover",
      ].join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(MODE_AUTO)}
        className={[
          "h-7 px-2.5 text-[11px] font-semibold rounded",
          isAuto ? "bg-ink-strong text-white" : "text-ink-muted hover:text-ink",
          disabled ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        {autoLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(MODE_CUSTOM)}
        className={[
          "h-7 px-2.5 text-[11px] font-semibold rounded",
          !isAuto ? "bg-ink-strong text-white" : "text-ink-muted hover:text-ink",
          disabled ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        {customLabel}
      </button>
    </div>
  );
}

function MoneyCell({ value, strong = false }) {
  if (value == null || value === "") {
    return <span className="text-ink-disabled tabular-nums">—</span>;
  }
  return (
    <span
      className={`tabular-nums text-[15px] ${
        strong ? "font-semibold text-ink-strong" : "font-medium text-ink"
      }`}
    >
      {formatINR(value)}
    </span>
  );
}

function MoneyCellPa({ value }) {
  if (value == null || value === "") {
    return <span className="text-ink-disabled tabular-nums">—</span>;
  }
  return (
    <span className="inline-flex w-[9rem] justify-end tabular-nums text-[15px] font-normal text-ink">
      {formatPA(value)}
    </span>
  );
}

function ProfileField({ label, children }) {
  return (
    <div className="min-w-0">
      <p className={fieldLabel}>{label}</p>
      <div className="mt-1.5 text-[15px] text-ink-strong font-medium leading-snug">{children}</div>
    </div>
  );
}

function SheetRow({ label, monthly, pa, tone = "default", labelClass = "", hint = null }) {
  const toneClass =
    tone === "gross"
      ? "bg-surface-sunken"
      : tone === "takehome"
        ? "bg-accent-soft"
        : tone === "ctc"
          ? "bg-warning-soft"
          : tone === "total"
            ? "bg-surface-raised"
            : "bg-white";

  const labelWeight =
    tone === "gross" || tone === "takehome" || tone === "ctc" || tone === "total"
      ? "font-semibold text-ink-strong"
      : "font-medium text-ink";

  const paNode = React.isValidElement(pa) ? pa : <MoneyCellPa value={pa} />;

  return (
    <div
      className={`${sheetGridCols} px-6 sm:px-8 lg:px-10 py-3 border-b border-divider ${toneClass}`}
    >
      <div className={`text-[15px] min-w-0 pr-2 ${labelWeight} ${labelClass}`}>
        {label}
        {hint ? <p className="mt-0.5 text-[11px] font-normal text-ink-muted leading-snug">{hint}</p> : null}
      </div>
      <div className="flex justify-end min-w-0">{monthly}</div>
      <div className="flex justify-end min-w-0">{paNode}</div>
    </div>
  );
}

function SheetSectionHead({ title, right }) {
  return (
    <div className="flex items-end justify-between gap-4 px-6 sm:px-8 lg:px-10 pt-6 pb-3 border-b border-border">
      <h3 className="text-[15px] sm:text-base font-bold text-ink-strong tracking-tight">{title}</h3>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-disabled shrink-0">
        {right}
      </span>
    </div>
  );
}

function ColHeads() {
  return (
    <div className={`${sheetGridCols} px-6 sm:px-8 lg:px-10 py-2.5 border-b border-divider bg-row-hover`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Component
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted text-right">
        W.E.F. Rate (Monthly)
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted text-right">
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
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(raw);
      }}
      onBlur={() => {
        if (readOnly || value === "") return;
        const n = parseRupeeInput(value);
        if (n != null && String(n) !== String(value)) onChange(String(n));
      }}
      onWheel={(e) => {
        e.currentTarget.blur();
      }}
      readOnly={readOnly}
      disabled={readOnly}
      className={`${amountInput} ${readOnly ? "bg-surface-sunken text-ink-secondary cursor-default" : ""}`}
      placeholder=""
      aria-label={label}
    />
  );
}

/** Editable P.A. — decimals allowed; never writes back into monthly. */
function PaAmountInput({ value, onChange, onCommit, onClear, label, readOnly = false }) {
  const display =
    value == null || value === ""
      ? ""
      : typeof value === "number"
        ? String(value)
        : String(value);

  if (readOnly) {
    return <MoneyCellPa value={value === "" ? null : value} />;
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, "");
        const parts = raw.split(".");
        const cleaned =
          parts.length <= 1
            ? raw
            : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`;
        onChange(cleaned);
      }}
      onBlur={() => {
        if (display === "" || display === ".") {
          onClear?.();
          return;
        }
        const n = parsePaInput(display);
        if (n == null) {
          onClear?.();
          return;
        }
        onCommit?.(String(n));
      }}
      onWheel={(e) => {
        e.currentTarget.blur();
      }}
      className={paAmountInput}
      placeholder=""
      aria-label={label}
      title="P.A. can be edited (e.g. 480030.50). Clearing the field restores monthly × 12. Monthly amounts are never changed."
    />
  );
}

function RateInput({ value, onChange, label, readOnly = false, stepHint = "0.05" }) {
  return (
    <div className="relative inline-flex items-center">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, "");
          onChange(raw);
        }}
        readOnly={readOnly}
        disabled={readOnly}
        className={`${amountInput} w-[6.5rem] pr-7 ${readOnly ? "bg-surface-sunken text-ink-secondary cursor-default" : ""}`}
        aria-label={label}
        title={`Step ${stepHint}`}
      />
      <span className="pointer-events-none absolute right-2.5 text-[12px] text-ink-muted">%</span>
    </div>
  );
}

/** High-contrast checkbox used on Salary CTC optional lines. */
function SalaryTick({ checked, onChange, disabled = false, ariaLabel }) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        aria-label={ariaLabel}
      />
      <span
        aria-hidden
        className={`pointer-events-none flex h-5 w-5 items-center justify-center rounded-[5px] border-2 transition-colors ${
          checked
            ? "border-slate-800 bg-slate-800 text-white shadow-sm"
            : "border-slate-400 bg-white text-transparent"
        } peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400/50 peer-focus-visible:ring-offset-1`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
          <path
            d="M3.5 8.2 6.4 11l6.1-6.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}

/** Optional Part B line: tick to include and enter amount. */
function OptionalAddLabel({ label, checked, onCheckedChange, disabled = false }) {
  return (
    <label
      className={`inline-flex items-center gap-2.5 select-none ${
        disabled ? "cursor-default opacity-70" : "cursor-pointer"
      }`}
    >
      <SalaryTick
        checked={checked}
        onChange={onCheckedChange}
        disabled={disabled}
        ariaLabel={`Include ${label}`}
      />
      <span className={checked ? "text-ink font-medium" : "text-ink-muted"}>
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

function rateOrEmpty(saved, fallback) {
  if (saved == null || saved === "") return String(fallback);
  const n = parseRateInput(saved);
  return n == null ? String(fallback) : String(n);
}

/**
 * Compensation structure — Gross-master CTC per Salary Admin BRD.
 * First save creates CTC; later changes use ?mode=revise (archives previous).
 */
export default function SalaryEmployeeCtc({
  employeeId: employeeIdProp = null,
  embedded = false,
  persist = true,
} = {}) {
  const { employeeId: employeeIdParam } = useParams();
  const employeeId = employeeIdProp ?? employeeIdParam;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const reviseRequested = persist && searchParams.get("mode") === "revise";

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");
  const [hasExistingCtc, setHasExistingCtc] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [esicSettingsOpen, setEsicSettingsOpen] = useState(false);
  const [savedStructure, setSavedStructure] = useState(null);
  const [customAmounts, setCustomAmounts] = useState({});
  const [catalogRev, setCatalogRev] = useState(0);
  /** Manual P.A. overrides (numbers). Empty key = use monthly × 12 / sum. Never feeds monthly. */
  const [paOverrides, setPaOverrides] = useState({});
  /** In-progress P.A. text while typing. */
  const [paDrafts, setPaDrafts] = useState({});
  const prevAutoPaRef = useRef({});

  const [employeeLevel, setEmployeeLevel] = useState(EMP_LEVEL_OFFICE);
  const [gross, setGross] = useState("");
  const [basicMode, setBasicMode] = useState(MODE_AUTO);
  const [basic, setBasic] = useState("");
  const [hraMode, setHraMode] = useState(HRA_MODE_PERCENT);
  const [hraCustom, setHraCustom] = useState("");
  const [empPf, setEmpPf] = useState("");
  const [erPf, setErPf] = useState("");
  const [pt, setPt] = useState("");
  const [mediclaimEnabled, setMediclaimEnabled] = useState(false);
  const [mediclaim, setMediclaim] = useState("");
  const [licEnabled, setLicEnabled] = useState(false);
  const [lic, setLic] = useState("");
  const [bonus, setBonus] = useState("");
  const [wef, setWef] = useState("");
  const [esicEnabled, setEsicEnabled] = useState(true);
  const [esicCeiling, setEsicCeiling] = useState(String(DEFAULT_ESIC_CEILING));
  const [esicEmpRate, setEsicEmpRate] = useState(String(DEFAULT_EMP_ESIC_RATE_PCT));
  const [esicErRate, setEsicErRate] = useState(String(DEFAULT_ER_ESIC_RATE_PCT));
  const [empEsicMode, setEmpEsicMode] = useState(MODE_AUTO);
  const [empEsicCustom, setEmpEsicCustom] = useState("");
  const [erEsicMode, setErEsicMode] = useState(MODE_AUTO);
  const [erEsicCustom, setErEsicCustom] = useState("");
  const [leaveEncashMode, setLeaveEncashMode] = useState(MODE_AUTO);
  const [leaveEncashCustom, setLeaveEncashCustom] = useState("");
  const [gratuityMode, setGratuityMode] = useState(MODE_AUTO);
  const [gratuityCustom, setGratuityCustom] = useState("");
  const [specialPerfBonusEnabled, setSpecialPerfBonusEnabled] = useState(false);
  const [specialPerfBonus, setSpecialPerfBonus] = useState("");

  const isRevisionMode = persist && reviseRequested && hasExistingCtc;
  // Shell mode (persist=false): always editable for live formulas; no DB save.
  const isViewOnly = persist && hasExistingCtc && !reviseRequested;
  const canEdit = !persist || !isViewOnly;
  const basicIsCustom = normalizeComponentMode(basicMode) === MODE_CUSTOM;
  const hraIsCustom = normalizeComponentMode(hraMode) === MODE_CUSTOM;
  const empEsicIsCustom = normalizeComponentMode(empEsicMode) === MODE_CUSTOM;
  const erEsicIsCustom = normalizeComponentMode(erEsicMode) === MODE_CUSTOM;
  const leaveEncashIsCustom = normalizeComponentMode(leaveEncashMode) === MODE_CUSTOM;
  const gratuityIsCustom = normalizeComponentMode(gratuityMode) === MODE_CUSTOM;

  const buildArgs = useCallback(
    () => ({
      grossMonthly: parseRupeeInput(gross),
      basicMode,
      basicMonthly: parseRupeeInput(basic) ?? 0,
      empPfMonthly: parseRupeeInput(empPf),
      erPfMonthly: parseRupeeInput(erPf),
      ptMonthly: parseRupeeInput(pt),
      bonusMonthly: parseRupeeInput(bonus),
      mediclaimEnabled,
      mediclaimMonthly: parseRupeeInput(mediclaim),
      licEnabled,
      licMonthly: parseRupeeInput(lic),
      specialPerfBonusEnabled,
      specialPerfBonusMonthly: parseRupeeInput(specialPerfBonus),
      hraMode,
      hraMonthly: hraIsCustom ? parseRupeeInput(hraCustom) : null,
      employeeLevel,
      esicEnabled,
      esicCeiling: parseRupeeInput(esicCeiling),
      esicEmpRatePct: parseRateInput(esicEmpRate),
      esicErRatePct: parseRateInput(esicErRate),
      empEsicMode,
      erEsicMode,
      empEsicMonthly: empEsicIsCustom ? parseRupeeInput(empEsicCustom) : null,
      erEsicMonthly: erEsicIsCustom ? parseRupeeInput(erEsicCustom) : null,
      leaveEncashMode,
      leaveEncashMonthly: leaveEncashIsCustom ? parseRupeeInput(leaveEncashCustom) : null,
      gratuityMode,
      gratuityMonthly: gratuityIsCustom ? parseRupeeInput(gratuityCustom) : null,
    }),
    [
      gross,
      basicMode,
      basic,
      empPf,
      erPf,
      pt,
      bonus,
      mediclaimEnabled,
      mediclaim,
      licEnabled,
      lic,
      specialPerfBonusEnabled,
      specialPerfBonus,
      hraMode,
      hraIsCustom,
      hraCustom,
      employeeLevel,
      esicEnabled,
      esicCeiling,
      esicEmpRate,
      esicErRate,
      empEsicMode,
      erEsicMode,
      empEsicIsCustom,
      empEsicCustom,
      erEsicIsCustom,
      erEsicCustom,
      leaveEncashMode,
      leaveEncashIsCustom,
      leaveEncashCustom,
      gratuityMode,
      gratuityIsCustom,
      gratuityCustom,
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

  const syncDerived = useCallback(
    (argsOverride = {}) => {
      const args = { ...buildArgs(), ...argsOverride };
      const preview = computeCtcStructure(args);
      if (!preview.declared) {
        setEmpPf("");
        setErPf("");
        setPt("");
        return preview;
      }
      // Keep Auto Basic / HRA display strings in sync with formula
      if (normalizeComponentMode(args.basicMode) === MODE_AUTO) {
        setBasic(preview.basic_monthly > 0 ? String(preview.basic_monthly) : "");
      }
      if (normalizeComponentMode(args.hraMode) === MODE_AUTO) {
        setHraCustom(preview.hra_monthly > 0 ? String(preview.hra_monthly) : "");
      }
      if (normalizeComponentMode(args.empEsicMode) === MODE_AUTO) {
        setEmpEsicCustom(
          preview.emp_esic_monthly != null ? String(preview.emp_esic_monthly) : ""
        );
      }
      if (normalizeComponentMode(args.erEsicMode) === MODE_AUTO) {
        setErEsicCustom(
          preview.er_esic_monthly != null ? String(preview.er_esic_monthly) : ""
        );
      }
      if (normalizeComponentMode(args.leaveEncashMode) === MODE_AUTO) {
        setLeaveEncashCustom(
          preview.leave_encash_monthly != null ? String(preview.leave_encash_monthly) : ""
        );
      }
      if (normalizeComponentMode(args.gratuityMode) === MODE_AUTO) {
        setGratuityCustom(
          preview.gratuity_monthly != null ? String(preview.gratuity_monthly) : ""
        );
      }
      if (args.empPfMonthly == null) {
        setEmpPf(String(preview.emp_pf_monthly ?? ""));
      }
      if (args.erPfMonthly == null) {
        setErPf(String(preview.er_pf_monthly ?? ""));
      }
      if (args.ptMonthly == null) {
        setPt(String(preview.pt_monthly ?? defaultPtForGross(preview.gross_monthly)));
      }
      return preview;
    },
    [buildArgs]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(
          "id, employee_id, employment_type, employee_code, full_name, designation, department, location, date_of_birth, date_of_joining, confirmation_date, bank_account_no, ifsc_code"
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

      let saved = null;
      try {
        saved = await getSalaryStructure(data.id);
      } catch (structErr) {
        console.warn("Salary CTC: structure load skipped", structErr);
        saved = null;
      }
      const declared = Boolean(saved?.declared);
      setSavedStructure(saved);
      setHasExistingCtc(persist ? declared : Boolean(saved));
      setRevisionCount(Number(saved?.revision_count) || 0);
      setRevisionReason(reviseRequested && declared ? "" : saved?.revision_reason || "");

      const level = normalizeEmployeeLevel(saved?.employee_level);
      setEmployeeLevel(level);

      const basicSaved = parseRupeeInput(saved?.basic_monthly) ?? 0;
      const hraSaved = parseRupeeInput(saved?.hra_monthly);
      const specialSaved =
        saved?.special_allowance_monthly != null
          ? parseRupeeInput(saved.special_allowance_monthly) ?? 0
          : saved?.uniform_monthly != null &&
              !saved?.conveyance_monthly &&
              !saved?.medical_monthly
            ? parseRupeeInput(saved.uniform_monthly) ?? 0
            : 0;

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

      const loadedBasicMode = saved?.basic_mode
        ? normalizeComponentMode(saved.basic_mode)
        : declared
          ? MODE_CUSTOM
          : defaultBasicModeForLevel(level);

      const resolvedHra =
        loadedHraMode === HRA_MODE_CUSTOM
          ? hraSaved ?? 0
          : basicSaved > 0
            ? hraFromBasic(basicSaved)
            : hraSaved ?? 0;

      // Gross master: prefer saved Gross; else reconstruct from legacy Part A lines
      const grossSaved =
        parseRupeeInput(saved?.gross_monthly) ??
        (declared ? basicSaved + resolvedHra + specialSaved : null);

      setGross(numOrEmpty(grossSaved));
      setBasicMode(loadedBasicMode);
      setBasic(numOrEmpty(basicSaved || null));
      setHraMode(loadedHraMode);
      setHraCustom(
        loadedHraMode === HRA_MODE_CUSTOM
          ? numOrEmpty(hraSaved)
          : numOrEmpty(hraSaved ?? (basicSaved > 0 ? hraFromBasic(basicSaved) : null))
      );

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
      const perfAmt = numOrEmpty(saved?.special_perf_bonus_monthly);
      setSpecialPerfBonusEnabled(
        Boolean(saved?.special_perf_bonus_enabled) || (parseRupeeInput(perfAmt) ?? 0) > 0
      );
      setSpecialPerfBonus(perfAmt);
      setBonus(numOrEmpty(saved?.bonus_monthly));
      setEsicEnabled(saved?.esic_enabled !== false);
      setEsicCeiling(rateOrEmpty(saved?.esic_ceiling, DEFAULT_ESIC_CEILING));
      setEsicEmpRate(rateOrEmpty(saved?.esic_emp_rate_pct, DEFAULT_EMP_ESIC_RATE_PCT));
      setEsicErRate(rateOrEmpty(saved?.esic_er_rate_pct, DEFAULT_ER_ESIC_RATE_PCT));
      const loadedEmpEsicMode = saved?.emp_esic_mode
        ? normalizeComponentMode(saved.emp_esic_mode)
        : MODE_AUTO;
      const loadedErEsicMode = saved?.er_esic_mode
        ? normalizeComponentMode(saved.er_esic_mode)
        : MODE_AUTO;
      setEmpEsicMode(loadedEmpEsicMode);
      setErEsicMode(loadedErEsicMode);
      setEmpEsicCustom(numOrEmpty(saved?.emp_esic_monthly));
      setErEsicCustom(numOrEmpty(saved?.er_esic_monthly));
      const loadedLeaveEncashMode = saved?.leave_encash_mode
        ? normalizeComponentMode(saved.leave_encash_mode)
        : MODE_AUTO;
      setLeaveEncashMode(loadedLeaveEncashMode);
      setLeaveEncashCustom(numOrEmpty(saved?.leave_encash_monthly));
      const loadedGratuityMode = saved?.gratuity_mode
        ? normalizeComponentMode(saved.gratuity_mode)
        : MODE_AUTO;
      setGratuityMode(loadedGratuityMode);
      setGratuityCustom(numOrEmpty(saved?.gratuity_monthly));
      setWef(reviseRequested && declared ? todayInputDate() : saved?.wef_date || "");
      setSaveError("");
      setSaveMsg("");
      try {
        await hydratePersonComponents(employeeId);
      } catch (hydErr) {
        console.warn("Salary CTC: person components hydrate failed", hydErr);
      }
      const fromStructure = saved?.custom_component_amounts_json;
      if (fromStructure && typeof fromStructure === "object" && Object.keys(fromStructure).length) {
        saveCustomComponentAmounts(employeeId, fromStructure);
        setCustomAmounts(
          Object.fromEntries(
            Object.entries(fromStructure).map(([k, v]) => [k, v == null ? "" : String(v)])
          )
        );
      } else {
        setCustomAmounts(loadCustomComponentAmounts(employeeId));
      }
      setCatalogRev((n) => n + 1);
      setPaOverrides(paOverridesFromSaved(saved));
      setPaDrafts({});
      prevAutoPaRef.current = {};
    } catch (err) {
      console.error("Salary CTC: failed to load employee", err);
      setError("Could not load employee profile. Please try again.");
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, reviseRequested, persist]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const bump = () => setCatalogRev((n) => n + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const parsed = useMemo(() => {
    if (gross === "" && basic === "" && !(hraIsCustom && hraCustom !== "")) {
      return emptyCtcStructure();
    }
    return computeCtcStructure(buildArgs());
  }, [gross, basic, hraIsCustom, hraCustom, buildArgs]);

  const profileCustoms = useMemo(() => {
    const all = getProfileCustomComponents(employeeId);
    const partB = all.filter((c) => c.parent_code === "PART_B");
    // Presets (LTA / Food / VPI) render as checkbox rows — not duplicated here
    const partA = all.filter(
      (c) => c.parent_code !== "PART_B" && !isCtcOptionalPresetCode(c.code)
    );
    return { partA, partB };
  }, [employeeId, catalogRev]);

  const optionalPresetsOn = useMemo(() => {
    const on = {};
    for (const p of CTC_OPTIONAL_PRESETS) {
      on[p.code] = personHasComponent(employeeId, p.code);
    }
    return on;
  }, [employeeId, catalogRev]);

  const toggleOptionalPreset = useCallback(
    async (preset, enabled) => {
      if (!canEdit || !employeeId) return;
      try {
        await setPersonOptionalPreset(employeeId, preset, enabled);
      } catch (err) {
        console.warn("Optional CTC component save failed", err);
      }
      if (!enabled) {
        setCustomAmounts((prev) => {
          const next = { ...prev };
          delete next[preset.code];
          saveCustomComponentAmounts(employeeId, next);
          return next;
        });
        setPaOverrides((prev) => {
          const next = { ...prev };
          delete next[`custom:${preset.code}`];
          return next;
        });
      }
      setCatalogRev((n) => n + 1);
    },
    [canEdit, employeeId]
  );

  const customExtraVars = useMemo(() => {
    const vars = {};
    for (const [code, val] of Object.entries(customAmounts || {})) {
      const n = Number(val);
      if (Number.isFinite(n)) vars[code] = n;
    }
    return vars;
  }, [customAmounts]);

  const setCustomAmount = useCallback(
    (code, value) => {
      setCustomAmounts((prev) => {
        const next = { ...prev, [code]: value };
        saveCustomComponentAmounts(employeeId, next);
        return next;
      });
    },
    [employeeId]
  );

  const clearPaKeys = useCallback((keys) => {
    if (!keys?.length) return;
    setPaOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of keys) {
        if (k in next) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setPaDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of keys) {
        if (k in next) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const setPaDraft = useCallback((key, raw) => {
    const summaryKeys = ["gross_part_a", "take_home", "total_b", "ctc"];
    setPaDrafts((prev) => {
      const next = { ...prev, [key]: raw };
      if (!summaryKeys.includes(key)) {
        for (const s of summaryKeys) delete next[s];
      }
      return next;
    });
    if (!summaryKeys.includes(key)) {
      setPaOverrides((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const s of summaryKeys) {
          if (s in next) {
            delete next[s];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, []);

  const commitPaOverride = useCallback(
    (key, raw) => {
      if (raw === "" || raw == null || raw === ".") {
        clearPaKeys([key]);
        return;
      }
      const n = parsePaInput(raw);
      if (n == null) {
        clearPaKeys([key]);
        return;
      }
      setPaDrafts((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const summaryKeys = ["gross_part_a", "take_home", "total_b", "ctc"];
      setPaOverrides((prev) => {
        const next = { ...prev, [key]: n };
        // Line edit: drop summary overrides so totals re-sum from P.A. column
        if (!summaryKeys.includes(key)) {
          for (const s of summaryKeys) delete next[s];
        }
        return next;
      });
    },
    [clearPaKeys]
  );

  const paDisplay = useCallback(
    (key, resolved) => {
      if (paDrafts[key] !== undefined) return paDrafts[key];
      if (key in paOverrides) return String(paOverrides[key]);
      return resolved == null || resolved === "" ? "" : String(resolved);
    },
    [paDrafts, paOverrides]
  );

  const renderPaField = useCallback(
    (key, resolved, { label } = {}) => (
      <PaAmountInput
        value={paDisplay(key, resolved)}
        onChange={(raw) => setPaDraft(key, raw)}
        onCommit={(raw) => commitPaOverride(key, raw)}
        onClear={() => clearPaKeys([key])}
        label={label || `${key} P.A.`}
        readOnly={!canEdit}
      />
    ),
    [canEdit, clearPaKeys, commitPaOverride, paDisplay, setPaDraft]
  );

  const customPartAMonthly = useMemo(() => {
    const map = {};
    for (const preset of CTC_OPTIONAL_PRESETS) {
      if (!optionalPresetsOn[preset.code]) continue;
      map[preset.code] = parseRupeeInput(customAmounts[preset.code] ?? "");
    }
    for (const comp of profileCustoms.partA) {
      const isManual = !comp.effective_formula || /^manual$/i.test(String(comp.effective_formula));
      const computed = isManual
        ? parseRupeeInput(customAmounts[comp.code] ?? "")
        : evalComponentFormula(comp.effective_formula, parsed, customExtraVars);
      map[comp.code] = computed;
    }
    return map;
  }, [optionalPresetsOn, profileCustoms.partA, customAmounts, parsed, customExtraVars]);

  const customPartBMonthly = useMemo(() => {
    const map = {};
    for (const comp of profileCustoms.partB) {
      const isManual = !comp.effective_formula || /^manual$/i.test(String(comp.effective_formula));
      const computed = isManual
        ? parseRupeeInput(customAmounts[comp.code] ?? "")
        : evalComponentFormula(comp.effective_formula, parsed, customExtraVars);
      map[comp.code] = computed;
    }
    return map;
  }, [profileCustoms.partB, customAmounts, parsed, customExtraVars]);

  const sheetPa = useMemo(() => {
    const effectiveOv = (key) => {
      if (paDrafts[key] !== undefined) {
        const draft = paDrafts[key];
        if (draft === "" || draft === ".") return undefined;
        const n = parsePaInput(draft);
        if (n != null) return n;
      }
      if (key in paOverrides) return paOverrides[key];
      return undefined;
    };
    const line = (key, monthly) => {
      const o = effectiveOv(key);
      if (o !== undefined) return o;
      return paFromMonthly(monthly);
    };
    const sum = (...vals) =>
      roundPa(vals.reduce((acc, v) => acc + (v == null || v === "" ? 0 : Number(v) || 0), 0));

    const basicPa = line("basic", parsed.basic_monthly);
    const hraPa = line("hra", parsed.hra_monthly);
    const specialPa = line(
      "special",
      parsed.declared ? parsed.special_allowance_monthly : null
    );
    const grossPa = line("gross", parsed.gross_monthly);

    const partACustomCodes = [
      ...CTC_OPTIONAL_PRESETS.filter((p) => optionalPresetsOn[p.code]).map((p) => p.code),
      ...profileCustoms.partA.map((c) => c.code),
    ];
    const partACustomPas = partACustomCodes.map((code) =>
      line(`custom:${code}`, customPartAMonthly[code])
    );

    const empPfPa = line("emp_pf", parsed.emp_pf_monthly);
    const ptPa = line("pt", parsed.pt_monthly);
    const empEsicPa = line(
      "emp_esic",
      parsed.declared ? parsed.emp_esic_monthly : null
    );

    const erPfPa = line("er_pf", parsed.er_pf_monthly);
    const erEsicPa = line(
      "er_esic",
      parsed.declared ? parsed.er_esic_monthly : null
    );
    const gratuityPa = line(
      "gratuity",
      parsed.declared ? parsed.gratuity_monthly : null
    );
    const leaveEncashPa = line(
      "leave_encash",
      parsed.declared ? parsed.leave_encash_monthly : null
    );
    const mediclaimPa = line(
      "mediclaim",
      mediclaimEnabled ? parsed.mediclaim_monthly : null
    );
    const licPa = line("lic", licEnabled ? parsed.lic_monthly : null);
    const specialPerfPa = line(
      "special_perf",
      specialPerfBonusEnabled ? parsed.special_perf_bonus_monthly : null
    );
    const bonusPa = line("bonus", parsed.bonus_monthly);

    const partBCustomPas = profileCustoms.partB.map((comp) =>
      line(`custom:${comp.code}`, customPartBMonthly[comp.code])
    );

    const anyCorePaOverride = ["basic", "hra", "special"].some(
      (k) => effectiveOv(k) !== undefined
    );

    // Default GROSS P.A. stays monthly × 12. Re-sum only when a core line P.A. is manual.
    const grossPartAPa =
      effectiveOv("gross_part_a") !== undefined
        ? effectiveOv("gross_part_a")
        : effectiveOv("gross") !== undefined
          ? effectiveOv("gross")
          : anyCorePaOverride
            ? sum(basicPa, hraPa, specialPa)
            : paFromMonthly(parsed.gross_monthly);

    const anyTakeHomeDeductionOv = ["emp_pf", "pt", "emp_esic"].some(
      (k) => effectiveOv(k) !== undefined
    );

    const takeHomePa =
      effectiveOv("take_home") !== undefined
        ? effectiveOv("take_home")
        : anyCorePaOverride ||
            effectiveOv("gross") !== undefined ||
            effectiveOv("gross_part_a") !== undefined ||
            anyTakeHomeDeductionOv
          ? roundPa(
              (grossPartAPa || 0) - (empPfPa || 0) - (ptPa || 0) - (empEsicPa || 0)
            )
          : paFromMonthly(parsed.take_home_monthly);

    const anyPartBOverride = [
      "er_pf",
      "er_esic",
      "gratuity",
      "leave_encash",
      "mediclaim",
      "lic",
      "special_perf",
      "bonus",
      ...profileCustoms.partB.map((c) => `custom:${c.code}`),
    ].some((k) => effectiveOv(k) !== undefined);

    const totalBPa =
      effectiveOv("total_b") !== undefined
        ? effectiveOv("total_b")
        : anyPartBOverride
          ? sum(
              erPfPa,
              erEsicPa,
              gratuityPa,
              leaveEncashPa,
              mediclaimPa,
              licPa,
              specialPerfPa,
              bonusPa,
              ...partBCustomPas
            )
          : paFromMonthly(parsed.total_b_monthly);

    const ctcPa =
      effectiveOv("ctc") !== undefined
        ? effectiveOv("ctc")
        : anyCorePaOverride ||
            anyPartBOverride ||
            effectiveOv("gross") !== undefined ||
            effectiveOv("gross_part_a") !== undefined ||
            effectiveOv("total_b") !== undefined
          ? sum(grossPartAPa, totalBPa)
          : paFromMonthly(parsed.ctc_monthly);

    return {
      gross: grossPa,
      basic: basicPa,
      hra: hraPa,
      special: specialPa,
      gross_part_a: grossPartAPa,
      emp_pf: empPfPa,
      pt: ptPa,
      emp_esic: empEsicPa,
      take_home: takeHomePa,
      er_pf: erPfPa,
      er_esic: erEsicPa,
      gratuity: gratuityPa,
      leave_encash: leaveEncashPa,
      mediclaim: mediclaimPa,
      lic: licPa,
      special_perf: specialPerfPa,
      bonus: bonusPa,
      total_b: totalBPa,
      ctc: ctcPa,
      customPartA: Object.fromEntries(
        partACustomCodes.map((code, i) => [code, partACustomPas[i]])
      ),
      customPartB: Object.fromEntries(
        profileCustoms.partB.map((comp, i) => [comp.code, partBCustomPas[i]])
      ),
    };
  }, [
    paOverrides,
    paDrafts,
    parsed,
    optionalPresetsOn,
    profileCustoms.partA,
    profileCustoms.partB,
    customPartAMonthly,
    customPartBMonthly,
    mediclaimEnabled,
    licEnabled,
    specialPerfBonusEnabled,
  ]);

  // When monthly (auto P.A.) changes, drop manual P.A. for that line so auto refreshes.
  // Summary overrides also reset so totals follow the new monthly × 12 / sums.
  useEffect(() => {
    const autoMap = {
      gross: paFromMonthly(parsed.gross_monthly),
      basic: paFromMonthly(parsed.basic_monthly),
      hra: paFromMonthly(parsed.hra_monthly),
      special: paFromMonthly(parsed.declared ? parsed.special_allowance_monthly : null),
      emp_pf: paFromMonthly(parsed.emp_pf_monthly),
      pt: paFromMonthly(parsed.pt_monthly),
      emp_esic: paFromMonthly(parsed.declared ? parsed.emp_esic_monthly : null),
      er_pf: paFromMonthly(parsed.er_pf_monthly),
      er_esic: paFromMonthly(parsed.declared ? parsed.er_esic_monthly : null),
      gratuity: paFromMonthly(parsed.declared ? parsed.gratuity_monthly : null),
      leave_encash: paFromMonthly(parsed.declared ? parsed.leave_encash_monthly : null),
      mediclaim: paFromMonthly(mediclaimEnabled ? parsed.mediclaim_monthly : null),
      lic: paFromMonthly(licEnabled ? parsed.lic_monthly : null),
      special_perf: paFromMonthly(
        specialPerfBonusEnabled ? parsed.special_perf_bonus_monthly : null
      ),
      bonus: paFromMonthly(parsed.bonus_monthly),
    };
    for (const [code, monthly] of Object.entries(customPartAMonthly)) {
      autoMap[`custom:${code}`] = paFromMonthly(monthly);
    }
    for (const [code, monthly] of Object.entries(customPartBMonthly)) {
      autoMap[`custom:${code}`] = paFromMonthly(monthly);
    }

    const prev = prevAutoPaRef.current;
    const changed = [];
    for (const [key, auto] of Object.entries(autoMap)) {
      if (Object.prototype.hasOwnProperty.call(prev, key) && prev[key] !== auto) {
        changed.push(key);
      }
    }
    prevAutoPaRef.current = autoMap;
    if (!changed.length) return;

    clearPaKeys([
      ...changed,
      "gross_part_a",
      "take_home",
      "total_b",
      "ctc",
    ]);
  }, [
    parsed,
    customPartAMonthly,
    customPartBMonthly,
    mediclaimEnabled,
    licEnabled,
    specialPerfBonusEnabled,
    clearPaKeys,
  ]);

  // Keep Auto Basic / HRA / ESIC display values aligned while editing
  useEffect(() => {
    if (!canEdit || !parsed.declared) return;
    if (!basicIsCustom && parsed.basic_monthly != null) {
      const next = String(parsed.basic_monthly);
      if (basic !== next) setBasic(next);
    }
    if (!hraIsCustom && parsed.hra_monthly != null) {
      const next = String(parsed.hra_monthly);
      if (hraCustom !== next) setHraCustom(next);
    }
    if (!empEsicIsCustom && parsed.emp_esic_monthly != null) {
      const next = String(parsed.emp_esic_monthly);
      if (empEsicCustom !== next) setEmpEsicCustom(next);
    }
    if (!erEsicIsCustom && parsed.er_esic_monthly != null) {
      const next = String(parsed.er_esic_monthly);
      if (erEsicCustom !== next) setErEsicCustom(next);
    }
    if (!leaveEncashIsCustom && parsed.leave_encash_monthly != null) {
      const next = String(parsed.leave_encash_monthly);
      if (leaveEncashCustom !== next) setLeaveEncashCustom(next);
    }
    if (!gratuityIsCustom && parsed.gratuity_monthly != null) {
      const next = String(parsed.gratuity_monthly);
      if (gratuityCustom !== next) setGratuityCustom(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync display when Auto results change
  }, [
    parsed.basic_monthly,
    parsed.hra_monthly,
    parsed.emp_esic_monthly,
    parsed.er_esic_monthly,
    parsed.leave_encash_monthly,
    parsed.gratuity_monthly,
    basicIsCustom,
    hraIsCustom,
    empEsicIsCustom,
    erEsicIsCustom,
    leaveEncashIsCustom,
    gratuityIsCustom,
    canEdit,
  ]);

  const fy = currentCompensationYear();
  const segment = employee
    ? employmentTypeLabel(employee.employment_type || employee.employee_id) || "—"
    : "—";

  const handleLevelChange = (raw) => {
    if (!canEdit) return;
    const level = normalizeEmployeeLevel(raw);
    setEmployeeLevel(level);
    const nextBasicMode = defaultBasicModeForLevel(level);
    // UX default only — does not wipe the current Basic figure
    setBasicMode(nextBasicMode);
    if (nextBasicMode === MODE_AUTO) {
      const g = parseRupeeInput(gross) ?? 0;
      const auto = basicFromGross(g);
      if (auto > 0) setBasic(String(auto));
      syncDerived({
        employeeLevel: level,
        basicMode: MODE_AUTO,
        basicMonthly: auto,
        empPfMonthly: null,
        erPfMonthly: null,
        ptMonthly: null,
      });
    } else {
      syncDerived({
        employeeLevel: level,
        basicMode: MODE_CUSTOM,
        empPfMonthly: null,
        erPfMonthly: null,
        ptMonthly: null,
      });
    }
  };

  const handleGrossChange = (raw) => {
    if (!canEdit) return;
    setGross(raw);
    const g = parseRupeeInput(raw) ?? 0;
    const nextBasic =
      basicIsCustom
        ? parseRupeeInput(basic) ?? 0
        : basicFromGross(g);
    if (!basicIsCustom && nextBasic > 0) setBasic(String(nextBasic));
    syncDerived({
      grossMonthly: g > 0 ? g : null,
      basicMonthly: nextBasic,
      empPfMonthly: null,
      erPfMonthly: null,
      ptMonthly: null,
    });
  };

  const handleBasicModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      // Prefill with current Auto figure so switching never silently blanks the field
      const g = parseRupeeInput(gross) ?? 0;
      const seed =
        parseRupeeInput(basic) ??
        (g > 0 ? basicFromGross(g) : 0);
      const seedStr = seed > 0 ? String(seed) : basic;
      setBasic(seedStr);
      setBasicMode(mode);
      syncDerived({
        basicMode: mode,
        basicMonthly: parseRupeeInput(seedStr) ?? 0,
        empPfMonthly: null,
        erPfMonthly: null,
        ptMonthly: null,
      });
      return;
    }
    setBasicMode(mode);
    const g = parseRupeeInput(gross) ?? 0;
    const auto = basicFromGross(g);
    if (auto > 0) setBasic(String(auto));
    syncDerived({
      basicMode: mode,
      basicMonthly: auto,
      empPfMonthly: null,
      erPfMonthly: null,
      ptMonthly: null,
    });
  };

  const handleBasicChange = (raw) => {
    if (!canEdit || !basicIsCustom) return;
    setBasic(raw);
    syncDerived({
      basicMonthly: parseRupeeInput(raw) ?? 0,
      empPfMonthly: null,
      erPfMonthly: null,
      ptMonthly: null,
    });
  };

  const handleHraModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      const auto = hraFromBasic(parseRupeeInput(basic) ?? 0);
      const seedStr =
        auto > 0 ? String(auto) : hraCustom !== "" ? hraCustom : "";
      setHraCustom(seedStr);
      setHraMode(HRA_MODE_CUSTOM);
      syncDerived({
        hraMode: HRA_MODE_CUSTOM,
        hraMonthly: parseRupeeInput(seedStr),
        ptMonthly: null,
      });
      return;
    }
    setHraMode(HRA_MODE_PERCENT);
    syncDerived({
      hraMode: HRA_MODE_PERCENT,
      hraMonthly: null,
      ptMonthly: null,
    });
  };

  const handleHraCustomChange = (raw) => {
    if (!canEdit || !hraIsCustom) return;
    setHraCustom(raw);
    syncDerived({
      hraMode: HRA_MODE_CUSTOM,
      hraMonthly: parseRupeeInput(raw),
      ptMonthly: null,
    });
  };

  const handleEmpEsicModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      const seed =
        parseRupeeInput(empEsicCustom) ??
        parsed.emp_esic_monthly ??
        0;
      const seedStr = seed > 0 || seed === 0 ? String(seed) : empEsicCustom;
      setEmpEsicCustom(seedStr);
      setEmpEsicMode(mode);
      syncDerived({
        empEsicMode: mode,
        empEsicMonthly: parseRupeeInput(seedStr),
      });
      return;
    }
    setEmpEsicMode(mode);
    syncDerived({
      empEsicMode: mode,
      empEsicMonthly: null,
    });
  };

  const handleEmpEsicCustomChange = (raw) => {
    if (!canEdit || !empEsicIsCustom) return;
    setEmpEsicCustom(raw);
    syncDerived({
      empEsicMode: MODE_CUSTOM,
      empEsicMonthly: parseRupeeInput(raw),
    });
  };

  const handleErEsicModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      const seed =
        parseRupeeInput(erEsicCustom) ??
        parsed.er_esic_monthly ??
        0;
      const seedStr = seed > 0 || seed === 0 ? String(seed) : erEsicCustom;
      setErEsicCustom(seedStr);
      setErEsicMode(mode);
      syncDerived({
        erEsicMode: mode,
        erEsicMonthly: parseRupeeInput(seedStr),
      });
      return;
    }
    setErEsicMode(mode);
    syncDerived({
      erEsicMode: mode,
      erEsicMonthly: null,
    });
  };

  const handleErEsicCustomChange = (raw) => {
    if (!canEdit || !erEsicIsCustom) return;
    setErEsicCustom(raw);
    syncDerived({
      erEsicMode: MODE_CUSTOM,
      erEsicMonthly: parseRupeeInput(raw),
    });
  };

  const handleLeaveEncashModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      const seed =
        parseRupeeInput(leaveEncashCustom) ??
        parsed.leave_encash_monthly ??
        0;
      const seedStr = String(seed);
      setLeaveEncashCustom(seedStr);
      setLeaveEncashMode(mode);
      syncDerived({
        leaveEncashMode: mode,
        leaveEncashMonthly: parseRupeeInput(seedStr),
      });
      return;
    }
    setLeaveEncashMode(mode);
    syncDerived({
      leaveEncashMode: mode,
      leaveEncashMonthly: null,
    });
  };

  const handleLeaveEncashCustomChange = (raw) => {
    if (!canEdit || !leaveEncashIsCustom) return;
    setLeaveEncashCustom(raw);
    syncDerived({
      leaveEncashMode: MODE_CUSTOM,
      leaveEncashMonthly: parseRupeeInput(raw),
    });
  };

  const handleGratuityModeChange = (nextMode) => {
    if (!canEdit) return;
    const mode = normalizeComponentMode(nextMode);
    if (mode === MODE_CUSTOM) {
      const seed =
        parseRupeeInput(gratuityCustom) ??
        parsed.gratuity_monthly ??
        0;
      const seedStr = String(seed);
      setGratuityCustom(seedStr);
      setGratuityMode(mode);
      syncDerived({
        gratuityMode: mode,
        gratuityMonthly: parseRupeeInput(seedStr),
      });
      return;
    }
    setGratuityMode(mode);
    syncDerived({
      gratuityMode: mode,
      gratuityMonthly: null,
    });
  };

  const handleGratuityCustomChange = (raw) => {
    if (!canEdit || !gratuityIsCustom) return;
    setGratuityCustom(raw);
    syncDerived({
      gratuityMode: MODE_CUSTOM,
      gratuityMonthly: parseRupeeInput(raw),
    });
  };

  const applyPfDefaults = () => {
    if (!canEdit) return;
    const b = parsed.basic_monthly ?? parseRupeeInput(basic);
    if (!applyPfFromBasic(b)) return;
    if (parsed.gross_monthly != null) {
      setPt(String(defaultPtForGross(parsed.gross_monthly)));
    }
  };

  const enterReviseMode = () => {
    if (!persist) return;
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "ctc");
      next.set("mode", "revise");
      setSearchParams(next, { replace: true });
      return;
    }
    navigate(`/app/admin/employee/master/${employeeId}?tab=ctc&mode=revise`, {
      replace: true,
    });
  };

  const exitReviseMode = () => {
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "ctc");
      next.delete("mode");
      setSearchParams(next, { replace: true });
      return;
    }
    navigate(`/app/admin/employee/master/${employeeId}?tab=ctc`, { replace: true });
  };

  const handleSave = async () => {
    if (!persist) {
      setSaveError("Salary save is paused while salary admin is being rewired.");
      return;
    }
    if (!employee || !canEdit) return;
    setSaveError("");
    const structure = computeCtcStructure(buildArgs());
    if (!structure.declared) {
      setSaveError("Enter Gross salary before saving.");
      return;
    }
    if (structure.structure_invalid) {
      setSaveError(
        "Basic + HRA exceed Gross. Adjust Gross, Basic, or HRA so Special Allowance is not negative."
      );
      return;
    }
    if (normalizeComponentMode(structure.basic_mode) === MODE_AUTO && structure.basic_monthly < BASIC_SLAB_MIN) {
      setSaveError(`Auto Basic cannot be below ₹${BASIC_SLAB_MIN.toLocaleString("en-IN")}.`);
      return;
    }
    const ceiling = parseRupeeInput(esicCeiling);
    const empRate = parseRateInput(esicEmpRate);
    const erRate = parseRateInput(esicErRate);
    if (esicEnabled) {
      if (ceiling == null || ceiling <= 0) {
        setSaveError("ESIC ceiling must be a number greater than zero.");
        return;
      }
      if (empRate == null || empRate <= 0 || erRate == null || erRate <= 0) {
        setSaveError("ESIC rates must be numbers greater than zero.");
        return;
      }
    }

    const wefToSave = wef || (isRevisionMode ? todayInputDate() : null);
    if (isRevisionMode && !wefToSave) {
      setSaveError("Set a W.E.F. date for this revision.");
      return;
    }

    // Commit open P.A. drafts into the map that will be saved (only on Save CTC)
    const paToSave = { ...paOverrides };
    for (const [key, draft] of Object.entries(paDrafts)) {
      if (draft === "" || draft == null || draft === ".") {
        delete paToSave[key];
        continue;
      }
      const n = parsePaInput(draft);
      if (n == null) delete paToSave[key];
      else paToSave[key] = n;
    }
    // Keep CTC annual override aligned with sheet total when it differs from monthly × 12
    const autoCtcPa = paFromMonthly(structure.ctc_monthly);
    const sheetCtcPa = sheetPa.ctc ?? structure.ctc_annual;
    if (
      sheetCtcPa != null &&
      autoCtcPa != null &&
      Math.abs(Number(sheetCtcPa) - Number(autoCtcPa)) > 0.001
    ) {
      paToSave.ctc = roundPa(sheetCtcPa);
    } else if (
      paToSave.ctc != null &&
      autoCtcPa != null &&
      Math.abs(Number(paToSave.ctc) - Number(autoCtcPa)) <= 0.001
    ) {
      delete paToSave.ctc;
    }

    const payload = {
      ...structure,
      basic_monthly: structure.basic_monthly,
      basic_mode: structure.basic_mode,
      special_allowance_monthly: structure.special_allowance_monthly,
      gross_monthly: structure.gross_monthly,
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
      employee_level: structure.employee_level,
      esic_enabled: structure.esic_enabled,
      esic_ceiling: structure.esic_ceiling,
      esic_emp_rate_pct: structure.esic_emp_rate_pct,
      esic_er_rate_pct: structure.esic_er_rate_pct,
      emp_esic_mode: structure.emp_esic_mode,
      emp_esic_monthly: structure.emp_esic_monthly,
      er_esic_mode: structure.er_esic_mode,
      er_esic_monthly: structure.er_esic_monthly,
      leave_encash_mode: structure.leave_encash_mode,
      leave_encash_monthly: structure.leave_encash_monthly,
      gratuity_mode: structure.gratuity_mode,
      gratuity_monthly: structure.gratuity_monthly,
      special_perf_bonus_enabled: structure.special_perf_bonus_enabled,
      special_perf_bonus_monthly: structure.special_perf_bonus_monthly,
      // Manual P.A. + annual CTC only persist when Save CTC is clicked
      ctc_annual: sheetCtcPa ?? structure.ctc_annual,
      pa_overrides_json: paToSave,
      custom_component_amounts_json: Object.fromEntries(
        Object.entries(customAmounts || {})
          .map(([k, v]) => {
            if (v == null || v === "") return null;
            const n = Number(String(v).replace(/,/g, ""));
            return Number.isFinite(n) ? [k, n] : null;
          })
          .filter(Boolean)
      ),
      date_of_birth: employee.date_of_birth || null,
      date_of_joining: employee.date_of_joining || null,
      wef_date: wefToSave,
    };

    let savedRow;
    const wasRevision = isRevisionMode;
    try {
      if (isRevisionMode) {
        savedRow = await reviseSalaryStructure(employee.id, payload, {
          reason: revisionReason,
          wef_date: wefToSave,
        });
        setSaveMsg(savedRow?.__local ? "Revision saved on this device" : "Revision saved");
      } else {
        savedRow = await saveSalaryStructure(employee.id, payload);
        setSaveMsg(savedRow?.__local ? "Saved on this device" : "Saved");
      }
    } catch (err) {
      console.error("Salary CTC: save failed", err);
      const msg = String(err?.message || err?.details || err?.hint || "");
      const code = String(err?.code || "");
      if (/42501|row-level security|permission denied|RLS/i.test(`${code} ${msg}`)) {
        setSaveError("You do not have permission to save salary CTC. Sign in with an allowed Salary Admin account.");
      } else if (/foreign key|employee_master|23503/i.test(`${code} ${msg}`)) {
        setSaveError("This employee is missing from Employee Master. Save the employee first, then save CTC.");
      } else {
        setSaveError(msg ? `Could not save CTC: ${msg}` : "Could not save CTC. Please try again.");
      }
      return;
    }

    // Persist person-component amounts onto component rows + history
    try {
      await persistPersonComponentAmounts(
        employee.id,
        payload.custom_component_amounts_json || {}
      );
    } catch (amtErr) {
      console.warn("Salary CTC: component amounts sync failed", amtErr);
    }

    // Reload with revision trail so History + Salary Processing see the latest CTC
    let fresh = null;
    try {
      fresh = await getSalaryStructure(employee.id);
    } catch (reloadErr) {
      console.warn("Salary CTC: reload after save failed", reloadErr);
    }
    const nextSaved = fresh?.declared
      ? fresh
      : savedRow || { ...structure, declared: true };
    setHasExistingCtc(true);
    setSavedStructure(nextSaved);
    setRevisionCount(
      Number(nextSaved?.revision_count) ||
        (Array.isArray(nextSaved?.revisions) ? nextSaved.revisions.length : 0) ||
        0
    );
    if (wasRevision) {
      setHistoryOpen(true);
    }
    const apply = nextSaved || structure;
    setGross(numOrEmpty(apply?.gross_monthly ?? structure.gross_monthly));
    setBasicMode(normalizeComponentMode(apply?.basic_mode ?? structure.basic_mode));
    setBasic(numOrEmpty(apply?.basic_monthly ?? structure.basic_monthly));
    setHraMode(normalizeHraMode(apply?.hra_mode ?? structure.hra_mode));
    setHraCustom(numOrEmpty(apply?.hra_monthly ?? structure.hra_monthly));
    setEmployeeLevel(normalizeEmployeeLevel(apply?.employee_level ?? structure.employee_level));
    setEmpPf(String(apply?.emp_pf_monthly ?? structure.emp_pf_monthly ?? ""));
    setErPf(String(apply?.er_pf_monthly ?? structure.er_pf_monthly ?? ""));
    setPt(String(apply?.pt_monthly ?? structure.pt_monthly ?? ""));
    setMediclaimEnabled(Boolean(apply?.mediclaim_enabled ?? structure.mediclaim_enabled));
    setMediclaim(numOrEmpty(apply?.mediclaim_monthly ?? structure.mediclaim_monthly));
    setLicEnabled(Boolean(apply?.lic_enabled ?? structure.lic_enabled));
    setLic(numOrEmpty(apply?.lic_monthly ?? structure.lic_monthly));
    setSpecialPerfBonusEnabled(
      Boolean(apply?.special_perf_bonus_enabled ?? structure.special_perf_bonus_enabled)
    );
    setSpecialPerfBonus(
      numOrEmpty(apply?.special_perf_bonus_monthly ?? structure.special_perf_bonus_monthly)
    );
    setBonus(String(apply?.bonus_monthly ?? structure.bonus_monthly ?? ""));
    setEsicEnabled(apply?.esic_enabled !== false);
    setEsicCeiling(String(apply?.esic_ceiling ?? structure.esic_ceiling));
    setEsicEmpRate(String(apply?.esic_emp_rate_pct ?? structure.esic_emp_rate_pct));
    setEsicErRate(String(apply?.esic_er_rate_pct ?? structure.esic_er_rate_pct));
    setEmpEsicMode(normalizeComponentMode(apply?.emp_esic_mode ?? structure.emp_esic_mode));
    setErEsicMode(normalizeComponentMode(apply?.er_esic_mode ?? structure.er_esic_mode));
    setEmpEsicCustom(numOrEmpty(apply?.emp_esic_monthly ?? structure.emp_esic_monthly));
    setErEsicCustom(numOrEmpty(apply?.er_esic_monthly ?? structure.er_esic_monthly));
    setLeaveEncashMode(
      normalizeComponentMode(apply?.leave_encash_mode ?? structure.leave_encash_mode)
    );
    setLeaveEncashCustom(
      numOrEmpty(apply?.leave_encash_monthly ?? structure.leave_encash_monthly)
    );
    setGratuityMode(normalizeComponentMode(apply?.gratuity_mode ?? structure.gratuity_mode));
    setGratuityCustom(numOrEmpty(apply?.gratuity_monthly ?? structure.gratuity_monthly));
    setWef(apply?.wef_date || wefToSave || "");
    setRevisionReason(apply?.revision_reason || revisionReason || "");
    setPaOverrides(paOverridesFromSaved({ ...apply, pa_overrides_json: apply?.pa_overrides_json ?? paToSave }));
    setPaDrafts({});
    prevAutoPaRef.current = {};

    if (isRevisionMode || reviseRequested) {
      exitReviseMode();
    }
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  const shellClass = embedded
    ? "min-h-[28rem] flex flex-col bg-canvas"
    : "-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] flex flex-col bg-canvas";

  if (loading) {
    return (
      <div className={`${shellClass} items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className={`${embedded ? "p-6 space-y-3 bg-canvas" : "-m-4 sm:-m-6 min-h-[calc(100vh-4.5rem)] bg-canvas p-6 space-y-3"}`}>
        {!embedded ? (
          <Link
            to={`/app/admin/employee/master/${employeeId}?tab=ctc`}
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Employee Master
          </Link>
        ) : null}
        <p className="text-sm text-red-600">{error || "Employee not found."}</p>
      </div>
    );
  }

  const name = employee.full_name || "Employee";
  const code = employee.employee_code || employee.employee_id || "—";
  const metaLine = [code, employee.designation, employee.department].filter(Boolean).join(" · ");

  const basicHint = basicIsCustom
    ? "Custom: negotiated figure — used for helper / labour designations without the office slab."
    : `Auto: ${BASIC_GROSS_PERCENT}% of Gross, floored at ₹${BASIC_SLAB_MIN.toLocaleString("en-IN")}.`;

  const hraHint = hraIsCustom
    ? "Custom: fixed amount — stays put even if Gross or Basic change."
    : `Auto: ${HRA_PERCENT}% of Basic.`;

  return (
    <div className={shellClass}>
      <div className="shrink-0 border-b border-border bg-surface-raised">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-[1.75rem] font-bold text-ink-strong tracking-tight">
              {embedded ? "CTC structure" : name}
            </h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              {!persist
                ? `Live formula preview · ${code}`
                : isRevisionMode
                  ? `Salary revision · ${code}`
                  : isViewOnly
                    ? `Compensation structure · ${code}`
                    : `New CTC setup · ${code}`}
            </p>
            {embedded ? (
              <p className="mt-1 text-sm text-ink-secondary">{name} · {metaLine}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {persist && hasExistingCtc ? (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="h-9 px-3 rounded-md border border-border-strong bg-white text-xs font-medium text-ink hover:bg-row-hover inline-flex items-center gap-1.5"
              >
                <History className="h-3.5 w-3.5" />
                History
                <span className="ml-0.5 inline-flex min-w-[1.1rem] h-4 px-1 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                  {(revisionCount || 0) + 1}
                </span>
              </button>
            ) : null}
            {persist && isViewOnly ? (
              <button
                type="button"
                onClick={enterReviseMode}
                className="h-9 px-3 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent-deep inline-flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Revise CTC
              </button>
            ) : null}
            {persist && isRevisionMode ? (
              <button
                type="button"
                onClick={exitReviseMode}
                className="h-9 px-3 rounded-md border border-border-strong bg-white text-xs font-medium text-ink hover:bg-row-hover"
              >
                Cancel revision
              </button>
            ) : null}
          </div>
        </div>
        {!embedded ? (
          <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-2.5 border-t border-border bg-surface-sunken">
            <Link
              to={`/app/admin/employee/master/${employeeId}?tab=ctc`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Employee Master
            </Link>
          </div>
        ) : null}
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-white inline-flex items-center gap-1.5"
                >
                  <History className="h-3.5 w-3.5" />
                  History ({(revisionCount || 0) + 1})
                </button>
                <button
                  type="button"
                  onClick={enterReviseMode}
                  className="h-8 px-3 rounded-md border border-slate-300 bg-white text-xs font-semibold text-accent hover:bg-white"
                >
                  Revise CTC
                </button>
              </div>
            </div>
          ) : null}

          {reviseRequested && !hasExistingCtc ? (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              No CTC yet for this employee. Enter Gross and save the first structure — later changes
              will use revision.
            </div>
          ) : null}

          <div className="w-full bg-white border border-border shadow-[0_1px_3px_rgba(40,35,25,0.04)] overflow-hidden">
            <div className="px-6 sm:px-8 lg:px-10 py-5 sm:py-6 border-b border-divider flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-ink-strong">{name}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{metaLine || "—"}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-warning-soft text-[10px] font-bold uppercase tracking-[0.08em] text-warning">
                  Compensation scheme — Year {fy}
                </span>
                {hasExistingCtc ? (
                  <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                    Version {(revisionCount || 0) + 1}
                    {revisionCount > 0 ? ` · ${revisionCount} prior revision${revisionCount === 1 ? "" : "s"}` : ""}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-6 sm:px-8 lg:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6 border-b border-divider">
              <ProfileField label="Location">Indus Headquater</ProfileField>
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
              <ProfileField label="Account Number">{employee.bank_account_no || "—"}</ProfileField>
              <ProfileField label="IFSC Code">{employee.ifsc_code || "—"}</ProfileField>
              <ProfileField label="Confirmation">
                {employee.confirmation_date ? formatSalaryDate(employee.confirmation_date) : "—"}
              </ProfileField>
              <div className="min-w-0">
                <p className={fieldLabel}>Employee level</p>
                <div className="mt-1.5">
                  {canEdit ? (
                    <div className="relative inline-flex w-full max-w-[12rem]">
                      <select
                        value={employeeLevel}
                        onChange={(e) => handleLevelChange(e.target.value)}
                        className={`${selectInput} appearance-none pr-8`}
                        aria-label="Employee level"
                      >
                        <option value={EMP_LEVEL_OFFICE}>Office staff</option>
                        <option value={EMP_LEVEL_HELPER}>Helper / labour</option>
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted"
                        aria-hidden
                      />
                    </div>
                  ) : (
                    <div className="text-[15px] text-ink-strong font-medium">
                      {employeeLevel === EMP_LEVEL_HELPER ? "Helper / labour" : "Office staff"}
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <p className="mt-1 text-[10px] text-ink-muted">
                    Helper defaults Basic to Custom; Office defaults to Auto (you can override).
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className={fieldLabel}>W.E.F.</p>
                <div className="mt-1.5">
                  <FormDateInput
                    value={wef}
                    onChange={(e) => canEdit && setWef(e.target.value)}
                    className={`${dateInput} ${!canEdit ? "bg-surface-sunken pointer-events-none" : ""}`}
                  />
                </div>
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
                      className="w-full max-w-xl h-9 text-sm border border-border-strong rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent"
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

            <SheetSectionHead title="PART A — Gross & Take Home" />
            <ColHeads />

            <SheetRow
              label="Gross salary"
              hint="Master input. Basic, HRA and Special Allowance recalculate from this figure."
              tone="gross"
              monthly={
                <AmountInput
                  value={gross}
                  onChange={handleGrossChange}
                  label="Gross monthly"
                  readOnly={!canEdit}
                />
              }
              pa={renderPaField("gross", sheetPa.gross, { label: "Gross P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[2.5rem]">Basic</span>
                  <ModeToggle
                    value={basicMode}
                    onChange={handleBasicModeChange}
                    disabled={!canEdit}
                    autoLabel="Auto (slab)"
                    customLabel="Custom"
                    ariaLabel="Basic calculation mode"
                  />
                </div>
              }
              hint={basicHint}
              monthly={
                <AmountInput
                  value={basic}
                  onChange={handleBasicChange}
                  label="Basic monthly"
                  readOnly={!canEdit || !basicIsCustom}
                />
              }
              pa={renderPaField("basic", sheetPa.basic, { label: "Basic P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-[2.5rem]">HRA</span>
                  <ModeToggle
                    value={hraIsCustom ? MODE_CUSTOM : MODE_AUTO}
                    onChange={handleHraModeChange}
                    disabled={!canEdit}
                    autoLabel={`Auto (${HRA_PERCENT}%)`}
                    customLabel="Custom"
                    ariaLabel="HRA calculation mode"
                  />
                </div>
              }
              hint={hraHint}
              monthly={
                hraIsCustom ? (
                  <AmountInput
                    value={hraCustom}
                    onChange={handleHraCustomChange}
                    label="HRA monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={parsed.hra_monthly} />
                )
              }
              pa={renderPaField("hra", sheetPa.hra, { label: "HRA P.A." })}
            />
            <SheetRow
              label="Special Allowance"
              hint="Balancing figure: Gross − Basic − HRA. Always system-calculated."
              monthly={<MoneyCell value={parsed.declared ? parsed.special_allowance_monthly : null} />}
              pa={renderPaField("special", sheetPa.special, { label: "Special Allowance P.A." })}
            />

            {CTC_OPTIONAL_PRESETS.map((preset) => {
              const on = Boolean(optionalPresetsOn[preset.code]);
              const manualVal = customAmounts[preset.code] ?? "";
              return (
                <SheetRow
                  key={preset.code}
                  label={
                    <OptionalAddLabel
                      label={preset.name}
                      checked={on}
                      onCheckedChange={(checked) => toggleOptionalPreset(preset, checked)}
                      disabled={!canEdit}
                    />
                  }
                  hint={
                    on
                      ? "Included in Part A CTC — enter monthly and P.A.; Save CTC to keep."
                      : "Tick to add this component to CTC"
                  }
                  monthly={
                    on ? (
                      <AmountInput
                        value={manualVal}
                        onChange={canEdit ? (v) => setCustomAmount(preset.code, v) : () => {}}
                        label={`${preset.name} monthly`}
                        readOnly={!canEdit}
                      />
                    ) : (
                      <span className="text-[12px] text-ink-disabled">Not included</span>
                    )
                  }
                  pa={
                    on
                      ? renderPaField(`custom:${preset.code}`, sheetPa.customPartA?.[preset.code], {
                          label: `${preset.name} P.A.`,
                        })
                      : null
                  }
                />
              );
            })}

            {profileCustoms.partA.map((comp) => {
              const isManual = !comp.effective_formula || /^manual$/i.test(String(comp.effective_formula));
              const computed = isManual
                ? null
                : evalComponentFormula(comp.effective_formula, parsed, customExtraVars);
              const manualVal = customAmounts[comp.code] ?? "";
              return (
                <SheetRow
                  key={comp.code}
                  label={comp.name}
                  hint={
                    isManual
                      ? "Manual amount — enter monthly and P.A."
                      : comp.formula_label || comp.effective_formula || null
                  }
                  monthly={
                    isManual ? (
                      <AmountInput
                        value={manualVal}
                        onChange={canEdit ? (v) => setCustomAmount(comp.code, v) : () => {}}
                        label={`${comp.name} monthly`}
                        readOnly={!canEdit}
                      />
                    ) : (
                      <MoneyCell value={computed} />
                    )
                  }
                  pa={renderPaField(`custom:${comp.code}`, sheetPa.customPartA[comp.code], {
                    label: `${comp.name} P.A.`,
                  })}
                />
              );
            })}

            {parsed.structure_warn ? (
              <div className="mx-6 sm:mx-8 lg:mx-10 my-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800 leading-snug">
                {parsed.structure_warn}
              </div>
            ) : null}

            <SheetRow
              label="GROSS (PART A)"
              tone="gross"
              monthly={<MoneyCell value={parsed.gross_monthly} strong />}
              pa={renderPaField("gross_part_a", sheetPa.gross_part_a, {
                label: "GROSS (PART A) P.A.",
              })}
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
              pa={renderPaField("emp_pf", sheetPa.emp_pf, { label: "Employee PF P.A." })}
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
              pa={renderPaField("pt", sheetPa.pt, { label: "P. Tax P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {parsed.emp_esic_applicable
                      ? "Less : Employee ESIC"
                      : "Less : Employee ESIC (not applicable)"}
                  </span>
                  <ModeToggle
                    value={empEsicMode}
                    onChange={handleEmpEsicModeChange}
                    disabled={!canEdit}
                    autoLabel="Auto"
                    customLabel="Custom"
                    ariaLabel="Employee ESIC calculation mode"
                  />
                </div>
              }
              hint={
                empEsicIsCustom
                  ? "Manual amount — used even when Gross is above the ESIC ceiling"
                  : parsed.esic_eligible
                    ? `On Basic × ${parsed.esic_emp_rate_pct}% · Gross within ₹${Number(parsed.esic_ceiling).toLocaleString("en-IN")} ceiling`
                    : esicEnabled
                      ? `Gross above ₹${Number(parsed.esic_ceiling || DEFAULT_ESIC_CEILING).toLocaleString("en-IN")} ceiling — no ESIC`
                      : "ESIC turned off for this structure"
              }
              monthly={
                empEsicIsCustom ? (
                  <AmountInput
                    value={empEsicCustom}
                    onChange={handleEmpEsicCustomChange}
                    label="Employee ESIC monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={parsed.declared ? parsed.emp_esic_monthly : null} />
                )
              }
              pa={renderPaField("emp_esic", sheetPa.emp_esic, { label: "Employee ESIC P.A." })}
            />
            <SheetRow
              label="TAKE HOME"
              tone="takehome"
              monthly={<MoneyCell value={parsed.take_home_monthly} strong />}
              pa={renderPaField("take_home", sheetPa.take_home, {
                label: "Take home P.A.",
              })}
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
              pa={renderPaField("er_pf", sheetPa.er_pf, { label: "Employer PF P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {parsed.er_esic_applicable
                      ? "Add : Employer ESIC"
                      : "Add : Employer ESIC (not applicable)"}
                  </span>
                  <ModeToggle
                    value={erEsicMode}
                    onChange={handleErEsicModeChange}
                    disabled={!canEdit}
                    autoLabel="Auto"
                    customLabel="Custom"
                    ariaLabel="Employer ESIC calculation mode"
                  />
                </div>
              }
              hint={
                erEsicIsCustom
                  ? "Manual amount — used even when Gross is above the ESIC ceiling"
                  : parsed.esic_eligible
                    ? `On Basic × ${parsed.esic_er_rate_pct}% · same Gross ceiling as employee ESIC`
                    : esicEnabled
                      ? `Gross above ceiling — Auto shows ₹0; switch to Custom to enter an amount`
                      : "ESIC turned off for this structure"
              }
              monthly={
                erEsicIsCustom ? (
                  <AmountInput
                    value={erEsicCustom}
                    onChange={handleErEsicCustomChange}
                    label="Employer ESIC monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={parsed.declared ? parsed.er_esic_monthly : null} />
                )
              }
              pa={renderPaField("er_esic", sheetPa.er_esic, { label: "Employer ESIC P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span>Add : Gratuity (as per Govt. rules)</span>
                  <ModeToggle
                    value={gratuityMode}
                    onChange={handleGratuityModeChange}
                    disabled={!canEdit}
                    autoLabel="Auto"
                    customLabel="Custom"
                    ariaLabel="Gratuity calculation mode"
                  />
                </div>
              }
              hint={
                gratuityIsCustom
                  ? "Manual amount — overrides the Govt. accrual formula"
                  : "Auto: Basic × 4.81% — as per Govt. rules"
              }
              monthly={
                gratuityIsCustom ? (
                  <AmountInput
                    value={gratuityCustom}
                    onChange={handleGratuityCustomChange}
                    label="Gratuity monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={parsed.declared ? parsed.gratuity_monthly : null} />
                )
              }
              pa={renderPaField("gratuity", sheetPa.gratuity, { label: "Gratuity P.A." })}
            />
            <SheetRow
              label={
                <div className="flex flex-wrap items-center gap-3">
                  <span>Add : Leave Encashment (as per company policy)</span>
                  <ModeToggle
                    value={leaveEncashMode}
                    onChange={handleLeaveEncashModeChange}
                    disabled={!canEdit}
                    autoLabel="Auto"
                    customLabel="Custom"
                    ariaLabel="Leave Encashment calculation mode"
                  />
                </div>
              }
              hint={
                leaveEncashIsCustom
                  ? "Manual amount — overrides the company-policy formula"
                  : "Auto: (Basic × 7) ÷ (26 × 12) — company policy from Basic"
              }
              monthly={
                leaveEncashIsCustom ? (
                  <AmountInput
                    value={leaveEncashCustom}
                    onChange={handleLeaveEncashCustomChange}
                    label="Leave Encashment monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <MoneyCell value={parsed.declared ? parsed.leave_encash_monthly : null} />
                )
              }
              pa={renderPaField("leave_encash", sheetPa.leave_encash, {
                label: "Leave Encashment P.A.",
              })}
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
                  <span className="text-[12px] text-ink-disabled">Not included</span>
                )
              }
              pa={renderPaField("mediclaim", sheetPa.mediclaim, { label: "Mediclaim P.A." })}
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
                  <span className="text-[12px] text-ink-disabled">Not included</span>
                )
              }
              pa={renderPaField("lic", sheetPa.lic, { label: "LIC P.A." })}
            />
            <SheetRow
              label={
                <OptionalAddLabel
                  label="Special Performance bonus (variable-annually)"
                  checked={specialPerfBonusEnabled}
                  onCheckedChange={(on) => {
                    if (!canEdit) return;
                    setSpecialPerfBonusEnabled(on);
                  }}
                  disabled={!canEdit}
                />
              }
              hint={
                specialPerfBonusEnabled
                  ? "Optional Part B amount — enter the monthly accrual for variable annual performance bonus"
                  : "Tick to include this optional employer cost in Part B / CTC"
              }
              monthly={
                specialPerfBonusEnabled ? (
                  <AmountInput
                    value={specialPerfBonus}
                    onChange={canEdit ? setSpecialPerfBonus : () => {}}
                    label="Special Performance bonus monthly"
                    readOnly={!canEdit}
                  />
                ) : (
                  <span className="text-[12px] text-ink-disabled">Not included</span>
                )
              }
              pa={renderPaField("special_perf", sheetPa.special_perf, {
                label: "Special Performance bonus P.A.",
              })}
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
              pa={renderPaField("bonus", sheetPa.bonus, { label: "Bonus P.A." })}
            />

            {profileCustoms.partB.map((comp) => {
              const isManual = !comp.effective_formula || /^manual$/i.test(String(comp.effective_formula));
              const computed = isManual
                ? null
                : evalComponentFormula(comp.effective_formula, parsed, customExtraVars);
              const manualVal = customAmounts[comp.code] ?? "";
              return (
                <SheetRow
                  key={comp.code}
                  label={comp.name}
                  hint={
                    isManual
                      ? "Manual amount — enter monthly and P.A."
                      : comp.formula_label || comp.effective_formula || null
                  }
                  monthly={
                    isManual ? (
                      <AmountInput
                        value={manualVal}
                        onChange={canEdit ? (v) => setCustomAmount(comp.code, v) : () => {}}
                        label={`${comp.name} monthly`}
                        readOnly={!canEdit}
                      />
                    ) : (
                      <MoneyCell value={computed} />
                    )
                  }
                  pa={renderPaField(`custom:${comp.code}`, sheetPa.customPartB[comp.code], {
                    label: `${comp.name} P.A.`,
                  })}
                />
              );
            })}

            <SheetRow
              label="Total (B)"
              tone="total"
              monthly={<MoneyCell value={parsed.total_b_monthly} strong />}
              pa={renderPaField("total_b", sheetPa.total_b, {
                label: "Total (B) P.A.",
              })}
            />
            <SheetRow
              label="CTC (PART A + B)"
              tone="ctc"
              monthly={<MoneyCell value={parsed.ctc_monthly} strong />}
              pa={renderPaField("ctc", sheetPa.ctc, {
                label: "CTC P.A.",
              })}
            />

            {/* ESIC settings — progressive disclosure */}
            <div className="px-6 sm:px-8 lg:px-10 py-5 border-t border-divider bg-surface-sunken/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-ink-strong">ESIC settings</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    Ceiling and rates are stored on this CTC and used by Monthly Salary Processing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEsicSettingsOpen((v) => !v)}
                  className="text-[11px] font-medium text-accent hover:underline"
                  aria-expanded={esicSettingsOpen}
                >
                  {esicSettingsOpen ? "Hide settings" : "Edit ceiling & rates"}
                </button>
              </div>

              {esicSettingsOpen ? (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <label className="inline-flex items-center gap-2.5 select-none sm:col-span-2 lg:col-span-4">
                    <SalaryTick
                      checked={esicEnabled}
                      onChange={(on) => canEdit && setEsicEnabled(on)}
                      disabled={!canEdit}
                      ariaLabel="ESIC applicable for this structure"
                    />
                    <span className="text-[13px] font-medium text-ink">ESIC applicable for this structure</span>
                  </label>
                  <div>
                    <p className={fieldLabel}>Eligibility ceiling (Gross)</p>
                    <div className="mt-1.5">
                      <AmountInput
                        value={esicCeiling}
                        onChange={canEdit ? setEsicCeiling : () => {}}
                        label="ESIC ceiling"
                        readOnly={!canEdit || !esicEnabled}
                      />
                    </div>
                  </div>
                  <div>
                    <p className={fieldLabel}>Employee ESIC %</p>
                    <div className="mt-1.5">
                      <RateInput
                        value={esicEmpRate}
                        onChange={canEdit ? setEsicEmpRate : () => {}}
                        label="Employee ESIC percent"
                        readOnly={!canEdit || !esicEnabled}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-ink-muted">Contribution base: Basic</p>
                  </div>
                  <div>
                    <p className={fieldLabel}>Employer ESIC %</p>
                    <div className="mt-1.5">
                      <RateInput
                        value={esicErRate}
                        onChange={canEdit ? setEsicErRate : () => {}}
                        label="Employer ESIC percent"
                        readOnly={!canEdit || !esicEnabled}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-ink-muted">Contribution base: Basic</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <PersonSalaryComponentsPanel
              employeeId={employeeId}
              employeeName={name}
              onChanged={() => {
                setCatalogRev((n) => n + 1);
                setCustomAmounts(loadCustomComponentAmounts(employeeId));
              }}
            />
          </div>
        </div>
      </div>

      <footer className="shrink-0 sticky bottom-0 z-20 border-t border-border bg-surface-raised/95 backdrop-blur-sm">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-3 flex flex-wrap items-center gap-2">
          {persist && canEdit ? (
            <button
              type="button"
              onClick={handleSave}
              className="h-10 px-5 rounded-md bg-ink-strong text-white text-sm font-semibold hover:bg-ink inline-flex items-center gap-1.5"
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
          ) : null}
          {persist && !canEdit ? (
            <button
              type="button"
              onClick={enterReviseMode}
              className="h-10 px-5 rounded-md bg-accent text-white text-sm font-semibold hover:bg-accent-deep inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Revise CTC
            </button>
          ) : null}
          {!persist ? (
            <span className="text-sm text-ink-muted font-medium">
              Formula preview only — salary save is paused during rewire.
            </span>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={applyPfDefaults}
              disabled={!parsed.basic_monthly || parsed.basic_monthly <= 0}
              className="h-10 px-4 rounded-md border border-border-strong bg-white text-sm font-medium text-ink hover:bg-row-hover disabled:opacity-40 disabled:pointer-events-none"
              title="Fill Employee PF 12% and Employer PF 13% of Basic (capped ₹15,000)"
            >
              Suggest PF (12% / 13%)
            </button>
          ) : null}
          {persist ? (
            <button
              type="button"
              onClick={() => navigate("/app/admin/salary-admin/salary-processing")}
              className="h-10 px-4 rounded-md border border-border-strong bg-white text-sm font-medium text-ink hover:bg-row-hover inline-flex items-center gap-1.5"
            >
              Go to Salary Processing
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
          {saveError ? (
            <span className="text-sm text-red-600 font-medium">{saveError}</span>
          ) : null}
        </div>
      </footer>

      {persist ? (
        <Drawer
          open={historyOpen}
          title="CTC revision history"
          onClose={() => setHistoryOpen(false)}
          widthClass="max-w-xl"
        >
          <SalaryRevisionHistory
            employee={employee}
            salary={savedStructure}
          />
        </Drawer>
      ) : null}
    </div>
  );
}
