import React, { useEffect, useMemo, useState } from "react";
import { Paperclip, Share2 } from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import {
  callingAttachmentStoragePath,
  fileLabelFromCallingAttachment,
  presignCallingMasterR2Get,
  uploadCallingMasterFileToR2,
} from "../../../lib/callingMasterR2";
import { deriveSiteCodeFromName } from "../../../lib/offerLetterDocuments";
import { pushToast } from "../../../lib/toast";
import {
  CollapsibleHelp,
  PageTaskHeader,
  SectionCard,
  TinySelect,
} from "../../adminOperations/components/AdminUi";
import { CALLING_MASTER_FIELDS } from "./callingMasterConfig";
import OfferDetailsFields, { emptyOfferDetailValues } from "./OfferDetailsFields";
import { loadCallingByEmployees, saveReferralCandidate } from "./callingMasterStorage";
import { useCallingMasterDropdowns } from "./useCallingMasterDropdowns";

const REFERRAL_BASIC_KEYS = new Set([
  "candidateName",
  "phoneNumber",
  "academicQualification",
  "fireCourse",
  "currentlyWorking",
  "designation",
  "company",
  "salaryGross",
  "cvSubmitted",
  "siteSuitable",
]);

function emptyReferralForm() {
  return {
    candidateName: "",
    phoneNumber: "",
    academicQualification: "",
    fireCourse: "",
    currentlyWorking: "",
    designation: "",
    company: "",
    salaryGross: "",
    cvSubmitted: "",
    siteSuitable: "",
    referredByEmployeeId: "",
    referredByNote: "",
    attachments: [],
    ...emptyOfferDetailValues(),
  };
}

function referralSections() {
  return CALLING_MASTER_FIELDS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => REFERRAL_BASIC_KEYS.has(field.key)),
  })).filter((section) => section.fields.length);
}

function ReferralField({ field, value, error, onChange, selectOptions }) {
  const options = selectOptions?.[field.optionsKey] || [];
  const inputClassName = `box-border h-10 w-full min-w-0 rounded-lg border px-3 text-sm shadow-sm focus:outline-none focus:ring-2 ${
    error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:ring-blue-100"
  }`;

  let control = null;
  if (field.type === "date") {
    control = (
      <FormDateInput
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        className={inputClassName}
      />
    );
  } else if (field.type === "select") {
    control = (
      <select
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        className={`${inputClassName} bg-white`}
      >
        <option value="">{field.placeholder || `Select ${field.label}`}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        type={field.type === "number" || field.key === "phoneNumber" ? "text" : field.type}
        inputMode={field.type === "number" || field.key === "phoneNumber" ? "numeric" : undefined}
        value={value}
        maxLength={field.maxLength}
        onChange={(event) => {
          let next = event.target.value;
          if (field.key === "phoneNumber") next = String(next || "").replace(/\D/g, "").slice(0, 10);
          onChange(field.key, next);
        }}
        placeholder={field.placeholder}
        className={inputClassName}
      />
    );
  }

  return (
    <label className="flex min-w-0 flex-col">
      <span className="mb-1.5 block truncate text-xs font-medium text-slate-700" title={field.label}>
        {field.label}
        {field.required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {control}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );
}

function validateReferralForm(values) {
  const errors = {};
  const cleanPhone = String(values.phoneNumber || "").replace(/\D/g, "");
  if (!String(values.candidateName || "").trim()) errors.candidateName = "Candidate name is required.";
  if (!cleanPhone) errors.phoneNumber = "Mobile number is required.";
  else if (!/^\d{10}$/.test(cleanPhone)) errors.phoneNumber = "Mobile number must be exactly 10 digits.";
  if (!values.referredByEmployeeId) errors.referredByEmployeeId = "Referred by is required.";
  const salaryRaw = String(values.salaryGross || "").trim();
  if (salaryRaw && !/^\d+(\.\d+)?$/.test(salaryRaw)) errors.salaryGross = "Salary must be numeric.";
  return errors;
}

export default function CallingMasterReferralPage() {
  const { options: selectOptions } = useCallingMasterDropdowns();
  const [referrers, setReferrers] = useState([]);
  const [form, setForm] = useState(emptyReferralForm);
  const [errors, setErrors] = useState({});
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => referralSections(), []);

  useEffect(() => {
    loadCallingByEmployees()
      .then(setReferrers)
      .catch((err) => {
        console.error(err);
        setReferrers([]);
      });
  }, []);

  const handleChange = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "siteSuitable") {
        const siteName = String(value || "").trim();
        if (!String(current.siteFullName || "").trim() || current.siteFullName === current.siteSuitable) {
          next.siteFullName = siteName;
        }
        if (!String(current.siteCode || "").trim()) {
          next.siteCode = deriveSiteCodeFromName(siteName);
        }
      }
      return next;
    });
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextValues = {
      ...form,
      phoneNumber: String(form.phoneNumber || "").replace(/\D/g, ""),
    };
    const nextErrors = validateReferralForm(nextValues);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      pushToast("Form validation pending", "Please correct the highlighted fields.", "warning");
      return;
    }

    try {
      setSaving(true);
      const candidateKey = nextValues.phoneNumber || `referral-${Date.now()}`;
      const uploaded = [];
      for (const file of pendingFiles) {
        const result = await uploadCallingMasterFileToR2({ file, candidateKey });
        const storagePath = result.filePath || result.objectKey;
        uploaded.push({
          filePath: storagePath,
          objectKey: storagePath,
          bucket: result.bucket || "indus-erp-uploads",
          fileName: result.fileName || file.name,
          contentType: result.contentType || file.type || "",
          uploadedAt: new Date().toISOString(),
        });
      }

      const saved = await saveReferralCandidate({
        ...nextValues,
        attachments: [...(Array.isArray(nextValues.attachments) ? nextValues.attachments : []), ...uploaded],
      });

      setForm(emptyReferralForm());
      setPendingFiles([]);
      setErrors({});
      pushToast(
        "Referral added",
        `${saved.candidateName} is in Selected and ready for Offer Generation.`,
        "success"
      );
    } catch (err) {
      const message = err?.message || "Unable to add referral candidate.";
      if (/already exists|mobile number/i.test(message)) {
        setErrors((current) => ({ ...current, phoneNumber: message }));
      }
      pushToast("Referral not saved", message, "warning");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Add Referral"
        subtitle="Add a referred candidate directly to Selected, with offer details ready for letter generation."
      />

      <CollapsibleHelp label="how referral entry works">
        The candidate skips Calling and Shortlisted and lands in Selected with offer details filled.
        Offer response, joining, IOM, and Employee Master conversion stay the same as a normal Selected candidate.
      </CollapsibleHelp>

      <form id="referral-candidate-form" onSubmit={handleSubmit} className="space-y-4">
        <SectionCard title="Referral">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col">
              <span className="mb-1.5 block text-xs font-medium text-slate-700">
                Referred by <span className="text-rose-500">*</span>
              </span>
              <TinySelect
                value={form.referredByEmployeeId}
                onChange={(event) => handleChange("referredByEmployeeId", event.target.value)}
                className="h-10 rounded-lg border-slate-200 bg-white text-sm"
              >
                <option value="">Select employee</option>
                {referrers.map((person) => (
                  <option key={person.id} value={String(person.id)}>
                    {person.fullName}
                    {person.employeeCode ? ` (${person.employeeCode})` : ""}
                  </option>
                ))}
              </TinySelect>
              {errors.referredByEmployeeId ? (
                <span className="mt-1 block text-xs text-rose-600">{errors.referredByEmployeeId}</span>
              ) : (
                <span className="mt-1 block text-[11px] text-slate-500">
                  Same Active HR list as Calling By.
                </span>
              )}
            </label>
            <label className="flex min-w-0 flex-col sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-slate-700">Referral note</span>
              <textarea
                value={form.referredByNote}
                onChange={(event) => handleChange("referredByNote", event.target.value)}
                rows={3}
                placeholder="Who referred them, relationship, or any context"
                className="box-border w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm shadow-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
        </SectionCard>

        {sections.map((section) => (
            <SectionCard key={section.section} title={section.section}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {section.fields.map((field) => (
                  <ReferralField
                    key={field.key}
                    field={field}
                    value={form[field.key]}
                    error={errors[field.key]}
                    onChange={handleChange}
                    selectOptions={selectOptions}
                  />
                ))}
              </div>
            </SectionCard>
        ))}

        <SectionCard title="Offer details">
          <p className="mb-3 text-xs text-slate-500">
            Pre-filled for Offer Generation. Codes and the letter are still created on that screen.
          </p>
          <OfferDetailsFields values={form} onChange={handleChange} />
        </SectionCard>

        <SectionCard title="CV / attachments">
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <Paperclip className="h-4 w-4 text-accent" />
            Upload the CV or supporting files. Same storage as Calling records.
          </div>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              if (!files.length) return;
              setPendingFiles((current) => [...current, ...files]);
              event.target.value = "";
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
          />
          {(form.attachments?.length || pendingFiles.length) ? (
            <ul className="mt-4 space-y-2">
              {(form.attachments || []).map((item) => {
                const path = callingAttachmentStoragePath(item);
                return (
                  <li
                    key={path || item.fileName}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-800">{fileLabelFromCallingAttachment(item)}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-accent hover:underline"
                        onClick={async () => {
                          try {
                            const url = await presignCallingMasterR2Get(path);
                            window.open(url, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            pushToast("Open failed", err.message || "Unable to open file.", "warning");
                          }
                        }}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-rose-600 hover:underline"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            attachments: (current.attachments || []).filter(
                              (row) => callingAttachmentStoragePath(row) !== path
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
              {pendingFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-800">
                    {file.name} <span className="text-slate-400">(pending)</span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-rose-600 hover:underline"
                    onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No files yet.</p>
          )}
        </SectionCard>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="erp-btn-primary inline-flex items-center gap-2 rounded-control px-4 py-2 disabled:opacity-50"
          >
            <Share2 className="h-4 w-4" />
            {saving ? "Saving…" : "Add referral"}
          </button>
        </div>
      </form>
    </div>
  );
}
