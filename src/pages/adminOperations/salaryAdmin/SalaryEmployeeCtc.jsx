import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import FormDateInput from "../../../components/FormDateInput";
import {
  computeCtcStructure,
  currentCompensationYear,
  emptyCtcStructure,
  formatINR,
  getSalaryStructure,
  hraFromBasic,
  paFromMonthly,
  saveSalaryStructure,
  statutoryHelpText,
} from "./salaryData";

const amountInput =
  "w-[9rem] h-9 px-2.5 text-right text-[15px] tabular-nums border border-[#d4d0c8] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/25 focus:border-[#1F3A8A]";
const dateInput =
  "w-full max-w-[12rem] h-9 text-sm border border-[#d4d0c8] rounded px-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/25 focus:border-[#1F3A8A]";
const fieldLabel = "text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a857c]";

function MoneyCell({ value, strong = false, size = "base" }) {
  if (value == null || value === "") {
    return <span className="text-[#d0cbc3] tabular-nums">—</span>;
  }
  const sizeClass = size === "lg" ? "text-[15px]" : "text-[15px]";
  return (
    <span
      className={`tabular-nums ${sizeClass} ${
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

function SheetRow({
  label,
  monthly,
  pa,
  tone = "default",
  labelClass = "",
}) {
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

/**
 * Full-screen compensation structure — document-style Part A / Part B sheet.
 */
export default function SalaryEmployeeCtc() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  const [basic, setBasic] = useState("");
  const [special, setSpecial] = useState("");
  const [dob, setDob] = useState("");
  const [doj, setDoj] = useState("");
  const [wef, setWef] = useState("");

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
      setBasic(saved?.basic_monthly != null ? String(saved.basic_monthly) : "");
      setSpecial(
        saved?.special_allowance_monthly != null ? String(saved.special_allowance_monthly) : ""
      );
      setDob(saved?.date_of_birth || data.date_of_birth || "");
      setDoj(saved?.date_of_joining || data.date_of_joining || "");
      setWef(saved?.wef_date || "");
    } catch (err) {
      console.error("Salary CTC: failed to load employee", err);
      setError("Could not load employee profile. Please try again.");
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const parsed = useMemo(() => {
    const basicN = basic === "" ? 0 : Number(basic);
    const specialN = special === "" ? 0 : Number(special);
    const anyEntered = basic !== "" || special !== "";
    if (!anyEntered) return emptyCtcStructure();
    return computeCtcStructure({
      basicMonthly: Number.isFinite(basicN) ? basicN : 0,
      specialAllowanceMonthly: Number.isFinite(specialN) ? specialN : 0,
      autoHra: true,
    });
  }, [basic, special]);

  const fy = currentCompensationYear();
  const segment = employee
    ? employmentTypeLabel(employee.employment_type || employee.employee_id) || "—"
    : "—";

  const handleSave = () => {
    if (!employee) return;
    const structure = computeCtcStructure({
      basicMonthly: basic === "" ? 0 : Number(basic) || 0,
      specialAllowanceMonthly: special === "" ? 0 : Number(special) || 0,
      autoHra: true,
    });
    saveSalaryStructure(employee.id, {
      ...structure,
      basic_monthly: basic === "" ? null : Number(basic) || 0,
      hra_monthly: basic === "" ? null : hraFromBasic(Number(basic) || 0),
      special_allowance_monthly: special === "" ? null : Number(special) || 0,
      date_of_birth: dob || null,
      date_of_joining: doj || null,
      wef_date: wef || null,
    });
    setSaveMsg("Saved");
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
      {/* Title + back — full width */}
      <div className="shrink-0 border-b border-[#e5e1d8] bg-[#f7f5f0]">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-4">
          <h1 className="text-2xl sm:text-[1.75rem] font-bold text-[#1a1a1a] tracking-tight">
            {name}
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a857c]">
            Compensation Structure · {code}
          </p>
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

      {/* Full-width document */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="w-full px-3 sm:px-5 lg:px-8 xl:px-10 py-4 sm:py-5 pb-28">
          <div className="w-full bg-white border border-[#e5e1d8] shadow-[0_1px_3px_rgba(40,35,25,0.04)] overflow-hidden">
            {/* Profile band */}
            <div className="px-6 sm:px-8 lg:px-10 py-5 sm:py-6 border-b border-[#eceae4] flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-[#1a1a1a]">{name}</h2>
                <p className="mt-1 text-sm text-[#5c584f]">{metaLine || "—"}</p>
              </div>
              <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-[#f3e6d4] text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a5a2e]">
                Compensation scheme — Year {fy}
              </span>
            </div>

            <div className="px-6 sm:px-8 lg:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-6 border-b border-[#eceae4]">
              <ProfileField label="Location">{employee.location || "—"}</ProfileField>
              <ProfileField label="Employee Code">{employee.employee_code || "—"}</ProfileField>
              <ProfileField label="Employee Name">{employee.full_name || "—"}</ProfileField>
              <ProfileField label="Department">{employee.department || "—"}</ProfileField>

              <ProfileField label="Designation">{employee.designation || "—"}</ProfileField>
              <ProfileField label="Segment">{segment}</ProfileField>
              <div className="min-w-0">
                <p className={fieldLabel}>D.O.B.</p>
                <div className="mt-1.5">
                  <FormDateInput value={dob} onChange={(e) => setDob(e.target.value)} className={dateInput} />
                </div>
              </div>
              <div className="min-w-0">
                <p className={fieldLabel}>D.O.J.</p>
                <div className="mt-1.5">
                  <FormDateInput value={doj} onChange={(e) => setDoj(e.target.value)} className={dateInput} />
                </div>
              </div>

              <div className="min-w-0">
                <p className={fieldLabel}>W.E.F.</p>
                <div className="mt-1.5">
                  <FormDateInput value={wef} onChange={(e) => setWef(e.target.value)} className={dateInput} />
                </div>
              </div>
            </div>

            {/* PART A */}
            <SheetSectionHead title="PART A — Fixed Compensation" right="w.e.f. rate · per annum" />
            <ColHeads />

            <SheetRow
              label="Basic"
              monthly={
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={basic}
                  onChange={(e) => setBasic(e.target.value)}
                  className={amountInput}
                  placeholder=""
                  aria-label="Basic monthly"
                />
              }
              pa={paFromMonthly(basic === "" ? null : Number(basic))}
            />
            <SheetRow
              label="HRA (40% of Basic)"
              monthly={<MoneyCell value={parsed.hra_monthly} />}
              pa={paFromMonthly(parsed.hra_monthly)}
            />
            <SheetRow
              label="Special Allowance"
              monthly={
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={special}
                  onChange={(e) => setSpecial(e.target.value)}
                  className={amountInput}
                  placeholder=""
                  aria-label="Special allowance monthly"
                />
              }
              pa={paFromMonthly(special === "" ? null : Number(special))}
            />
            <SheetRow
              label="GROSS (PART A)"
              tone="gross"
              monthly={<MoneyCell value={parsed.gross_monthly} strong />}
              pa={paFromMonthly(parsed.gross_monthly)}
            />
            <SheetRow
              label="Less : Employee PF"
              monthly={<MoneyCell value={parsed.emp_pf_monthly} />}
              pa={paFromMonthly(parsed.emp_pf_monthly)}
            />
            <SheetRow
              label="Less : P. Tax"
              monthly={<MoneyCell value={parsed.pt_monthly} />}
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

            {/* PART B */}
            <SheetSectionHead title="PART B — Retirals & Statutory Add-ons" right="employer cost" />
            <ColHeads />

            <SheetRow
              label="Add : Employer PF"
              monthly={<MoneyCell value={parsed.er_pf_monthly} />}
              pa={paFromMonthly(parsed.er_pf_monthly)}
            />
            <SheetRow
              label="Add : Employer ESIC"
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
              label="Add : Bonus"
              monthly={<MoneyCell value={parsed.bonus_monthly} />}
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

            <p className="px-6 sm:px-8 lg:px-10 py-4 text-[11px] leading-relaxed text-[#8a857c] bg-[#faf9f6] border-t border-[#eceae4]">
              {statutoryHelpText()}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <footer className="shrink-0 sticky bottom-0 z-20 border-t border-[#e5e1d8] bg-[#f7f5f0]/95 backdrop-blur-sm">
        <div className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="h-10 px-5 rounded-md bg-[#1a1a1a] text-white text-sm font-semibold hover:bg-black inline-flex items-center gap-1.5"
          >
            {saveMsg ? <Check className="h-4 w-4" /> : null}
            {saveMsg ? "CTC saved" : "Save CTC"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/admin/salary-admin/salary-processing")}
            className="h-10 px-4 rounded-md border border-[#d4d0c8] bg-white text-sm font-medium text-[#2a2a2a] hover:bg-[#faf9f6] inline-flex items-center gap-1.5"
          >
            Go to Salary Processing
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
