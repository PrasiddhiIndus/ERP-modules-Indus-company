import React from 'react';
import {
  ATTENDANCE_CYCLE_DAY_OPTIONS,
  INDUSTRY_CATEGORY_OPTIONS,
  OT_RATE_OPTIONS,
  SITE_STATUS_OPTIONS,
  STATE_JURISDICTION_OPTIONS,
  formatAttendanceCycle,
} from '../siteMasterOptions';

function MasterTag() {
  return (
    <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-800">
      Master
    </span>
  );
}

function InfoTag() {
  return (
    <span className="ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600">
      Info only
    </span>
  );
}

function FormSection({ number, title, hint, children, variant = 'master' }) {
  const isInfo = variant === 'info';
  return (
    <section
      className={`rounded-xl border shadow-sm ${
        isInfo ? 'border-slate-200 bg-slate-50/40' : 'border-blue-200/70 bg-white'
      }`}
    >
      <div
        className={`flex flex-wrap items-start gap-2 border-b px-5 py-4 ${
          isInfo ? 'border-slate-200' : 'border-blue-100 bg-gradient-to-r from-blue-50/80 to-white'
        }`}
      >
        {number ? (
          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-[#1F3A8A] px-1.5 text-xs font-bold text-white">
            {number}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Field({ label, required, tag, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1.5 flex flex-wrap items-center gap-x-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <span>{label}</span>
        {required ? <span className="text-red-500 normal-case">*</span> : null}
        {tag === 'master' ? <MasterTag /> : null}
        {tag === 'info' ? <InfoTag /> : null}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  'w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F3A8A] focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/20';
const selectClass = `${inputClass} appearance-none`;
const textareaClass =
  'w-full min-h-[88px] resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F3A8A] focus:outline-none focus:ring-2 focus:ring-[#1F3A8A]/20';

export default function SiteMasterSetupForm({ form, onChange, disabled = false }) {
  const isIndustryOther = form.industryCategory === 'Other';
  const attendanceCyclePreview = formatAttendanceCycle(
    form.attendanceCycleStartDay,
    form.attendanceCycleEndDay
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'industryCategory' && value !== 'Other') {
      onChange(name, value);
      onChange('industryCategoryCustom', '');
      return;
    }
    onChange(name, value);
  };

  const gridTwo = 'grid grid-cols-1 gap-5 sm:grid-cols-2';
  const gridThree = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-5">
      <header className="border-b-2 border-[#1F3A8A] pb-4">
        <h2 className="text-base font-bold uppercase tracking-wide text-slate-900">Site Master Setup Form</h2>
        <p className="mt-1 text-xs text-slate-500">
          Manpower Services — Salary Management &amp; Architectural Matrix
        </p>
      </header>

      <FormSection
        number="1"
        title="Core Master Parameters"
        hint="These fields hit the primary master list and control queries/reporting."
      >
        <div className={gridTwo}>
          <Field
            label="Site Code"
            required
            tag="master"
            hint="Unique identification code used across salary run tables."
          >
            <input
              name="siteCode"
              value={form.siteCode}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass} font-mono uppercase`}
              placeholder="e.g. S001"
            />
          </Field>
          <Field label="Site Name" required tag="master">
            <input
              name="siteName"
              value={form.siteName}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
              placeholder="Client site / deployment name"
            />
          </Field>
          <Field
            label="Industry Category"
            required
            tag="master"
            hint="Feeds into dashboard analytics for sector-wise tracking."
          >
            <select
              name="industryCategory"
              value={form.industryCategory}
              onChange={handleChange}
              disabled={disabled}
              className={selectClass}
            >
              <option value="">Select sector (Manufacturing, BFSI, Retail…)</option>
              {INDUSTRY_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {isIndustryOther ? (
              <input
                name="industryCategoryCustom"
                value={form.industryCategoryCustom}
                onChange={handleChange}
                disabled={disabled}
                className={`${inputClass} mt-2`}
                placeholder="Enter industry category"
              />
            ) : null}
          </Field>
          <Field
            label="Cost Centre"
            required
            tag="master"
            hint="Enter financial ledger allocation / cost centre code."
          >
            <input
              name="costCentre"
              value={form.costCentre}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
              placeholder="e.g. CC-1001 — Corporate Ops"
            />
          </Field>
          <Field
            label="State"
            required
            tag="master"
            hint="Triggers localized legal parameters (Minimum Wages, PT slabs)."
            className="sm:col-span-2 lg:col-span-1"
          >
            <select name="state" value={form.state} onChange={handleChange} disabled={disabled} className={selectClass}>
              <option value="">Select state jurisdictions</option>
              {STATE_JURISDICTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        number="2"
        title="Informational & Operational Parameters"
        hint="Stored purely for records/reference; does not affect query performance."
        variant="info"
      >
        <div className="space-y-5">
          <Field
            label="Site Address"
            tag="info"
            hint="Physical site deployment coordinates for billing/courier tracking."
          >
            <textarea
              name="siteAddress"
              value={form.siteAddress}
              onChange={handleChange}
              disabled={disabled}
              rows={3}
              className={textareaClass}
              placeholder="Full postal address"
            />
          </Field>
          <div className={gridTwo}>
            <Field
              label="Primary Client Contact"
              tag="info"
              hint="Name of the operational or billing head at the client site."
            >
              <input
                name="primaryClientContact"
                value={form.primaryClientContact}
                onChange={handleChange}
                disabled={disabled}
                className={inputClass}
                placeholder="Contact person name"
              />
            </Field>
            <Field label="Contact Phone / Email" tag="info">
              <input
                name="contactPhoneEmail"
                value={form.contactPhoneEmail}
                onChange={handleChange}
                disabled={disabled}
                className={inputClass}
                placeholder="Phone or email"
              />
            </Field>
          </div>
        </div>
      </FormSection>

      <FormSection
        number="3"
        title="Salary Structure & Control Switches"
        hint="Master rules linked directly to the payroll engine loops."
      >
        <div className={gridTwo}>
          <Field
            label="Attendance Cycle"
            required
            tag="master"
            hint="Select start and end day of month (1–31) for payroll attendance cut-off."
            className="sm:col-span-2"
          >
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Starting day
                  </span>
                  <select
                    name="attendanceCycleStartDay"
                    value={form.attendanceCycleStartDay}
                    onChange={handleChange}
                    disabled={disabled}
                    className={selectClass}
                    aria-label="Attendance cycle start day"
                  >
                    {ATTENDANCE_CYCLE_DAY_OPTIONS.map((day) => (
                      <option key={`start-${day}`} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="hidden pb-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-400 sm:block">
                  to
                </span>
                <div>
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    End day
                  </span>
                  <select
                    name="attendanceCycleEndDay"
                    value={form.attendanceCycleEndDay}
                    onChange={handleChange}
                    disabled={disabled}
                    className={selectClass}
                    aria-label="Attendance cycle end day"
                  >
                    {ATTENDANCE_CYCLE_DAY_OPTIONS.map((day) => (
                      <option key={`end-${day}`} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-3 border-t border-slate-200 pt-3 text-center text-xs font-medium text-slate-600">
                Cycle preview: <span className="text-[#1F3A8A]">{attendanceCyclePreview}</span>
              </p>
            </div>
          </Field>
          <Field label="Overtime (OT) Rate" required tag="master">
            <select name="otRate" value={form.otRate} onChange={handleChange} disabled={disabled} className={selectClass}>
              {OT_RATE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" required tag="master">
            <select name="status" value={form.status} onChange={handleChange} disabled={disabled} className={selectClass}>
              {SITE_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-950">
        <p className="font-semibold">Architectural layout guidelines</p>
        <p className="mt-1">
          Fields tagged <strong>MASTER</strong> require strict field indexing in the backend schema for optimized
          dashboard charts and report exports. Fields tagged <strong>INFO ONLY</strong> are kept unindexed for
          structural database efficiency.
        </p>
      </div>
    </div>
  );
}
