import React from "react";
import FormDateInput from "../../../components/FormDateInput";
import { amountInWords } from "../../../lib/offerLetterDocuments";
import { TinyInput, TinySelect } from "../../adminOperations/components/AdminUi";

/** Shared offer-detail fields used on Selected register and Offer Generation. */
export default function OfferDetailsFields({
  values,
  onChange,
  readOnly = false,
  showRegisterSummary = false,
  candidateName = "",
  siteSuitable = "",
}) {
  const salaryWords = amountInWords(values?.salaryGross);
  const set = (key, value) => onChange?.(key, value);

  if (readOnly) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {showRegisterSummary ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Candidate</p>
            <p className="mt-1 font-medium text-slate-900">{candidateName || "—"}</p>
            <p className="text-slate-600">Site (register): {siteSuitable || "—"}</p>
          </div>
        ) : null}
        <ReadOnlyField label="Salutation" value={values.offerSalutation} />
        <ReadOnlyField label="Father's Name" value={values.fatherName} />
        <ReadOnlyField label="Address line" value={values.addressLine} className="sm:col-span-2" />
        <ReadOnlyField label="District" value={values.addressDistrict} />
        <ReadOnlyField label="State" value={values.addressState} />
        <ReadOnlyField label="Pincode" value={values.addressPincode} />
        <ReadOnlyField label="Date of Joining" value={values.joiningDate} />
        <ReadOnlyField label="Duty Pattern" value={values.dutyPattern ? `${values.dutyPattern} days` : ""} />
        <ReadOnlyField label="Site Code" value={values.siteCode} />
        <ReadOnlyField label="Full Site Name & Location" value={values.siteFullName} className="sm:col-span-2" />
        <ReadOnlyField label="Designation" value={values.designation} />
        <ReadOnlyField
          label="Gross Salary"
          value={
            values.salaryGross === "" || values.salaryGross == null
              ? ""
              : `Rs. ${values.salaryGross}${salaryWords ? ` (${salaryWords})` : ""}`
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      {showRegisterSummary ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">From Calling Register</p>
          <p className="mt-1 font-medium text-slate-900">{candidateName || "—"}</p>
          <p className="text-slate-600">Site: {siteSuitable || values.siteSuitable || "—"}</p>
          <p className="text-slate-600">
            Gross:{" "}
            {values.salaryGross === "" || values.salaryGross == null
              ? "—"
              : `Rs. ${values.salaryGross}${salaryWords ? ` (${salaryWords})` : ""}`}
          </p>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-slate-600">
        Salutation
        <TinySelect
          value={values.offerSalutation || "Mr."}
          onChange={(e) => set("offerSalutation", e.target.value)}
        >
          <option value="Mr.">Mr.</option>
          <option value="Ms.">Ms.</option>
          <option value="Mrs.">Mrs.</option>
        </TinySelect>
      </label>

      <label className="flex flex-col gap-1 text-slate-600 sm:col-span-2">
        Father&apos;s Name
        <TinyInput
          value={values.fatherName || ""}
          onChange={(e) => set("fatherName", e.target.value)}
          placeholder="As on the offer letter"
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600 sm:col-span-2">
        Address line
        <TinyInput
          value={values.addressLine || ""}
          onChange={(e) => set("addressLine", e.target.value)}
          placeholder="Village / street, locality"
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600">
        District
        <TinyInput
          value={values.addressDistrict || ""}
          onChange={(e) => set("addressDistrict", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-slate-600">
        State
        <TinyInput
          value={values.addressState || ""}
          onChange={(e) => set("addressState", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-slate-600">
        Pincode
        <TinyInput
          value={values.addressPincode || ""}
          onChange={(e) => set("addressPincode", e.target.value)}
          maxLength={10}
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600">
        Date of Joining
        <FormDateInput
          value={values.joiningDate || ""}
          onChange={(e) => set("joiningDate", e.target.value)}
          className="h-8"
          compact
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600">
        Duty Pattern
        <TinySelect
          value={values.dutyPattern || "26"}
          onChange={(e) => set("dutyPattern", e.target.value)}
        >
          <option value="26">26 days</option>
          <option value="27">27 days</option>
        </TinySelect>
      </label>

      <label className="flex flex-col gap-1 text-slate-600">
        Site Code (for reference no.)
        <TinyInput
          value={values.siteCode || ""}
          onChange={(e) => set("siteCode", String(e.target.value || "").toUpperCase())}
          placeholder="e.g. NMDC"
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600 sm:col-span-2">
        Full Site Name &amp; Location
        <TinyInput
          value={values.siteFullName || ""}
          onChange={(e) => set("siteFullName", e.target.value)}
          placeholder="As printed on the letter"
        />
      </label>

      <label className="flex flex-col gap-1 text-slate-600">
        Designation (editable)
        <TinyInput
          value={values.designation || ""}
          onChange={(e) => set("designation", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-slate-600">
        Gross Salary (editable)
        <TinyInput
          type="number"
          value={values.salaryGross ?? ""}
          onChange={(e) => set("salaryGross", e.target.value)}
        />
      </label>
    </div>
  );
}

function ReadOnlyField({ label, value, className = "" }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`.trim()}>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-900">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

export function emptyOfferDetailValues() {
  return {
    offerSalutation: "Mr.",
    fatherName: "",
    addressLine: "",
    addressDistrict: "",
    addressState: "",
    addressPincode: "",
    joiningDate: "",
    dutyPattern: "26",
    siteFullName: "",
    siteCode: "",
    designation: "",
    salaryGross: "",
    siteSuitable: "",
  };
}

export function offerDetailsFromCandidate(row) {
  return {
    offerSalutation: row?.offerSalutation || "Mr.",
    fatherName: row?.fatherName || "",
    addressLine: row?.addressLine || "",
    addressDistrict: row?.addressDistrict || "",
    addressState: row?.addressState || row?.homeState || "",
    addressPincode: row?.addressPincode || "",
    joiningDate: row?.joiningDate || "",
    dutyPattern: row?.dutyPattern || "26",
    siteFullName: row?.siteFullName || row?.siteSuitable || "",
    siteCode: row?.siteCode || "",
    designation: row?.designation || "",
    salaryGross: row?.salaryGross ?? "",
    siteSuitable: row?.siteSuitable || "",
  };
}
