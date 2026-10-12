import React from "react";
import { Plus, X } from "lucide-react";
import FormDateInput from "../../../components/FormDateInput";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import { blankWageRow } from "./wageFormCatalog";

const line = "h-8 border-b border-slate-400 bg-transparent px-1 text-sm text-slate-900 outline-none focus:border-accent";

function Blank({ value, onChange, readOnly, className = "w-44", placeholder }) {
  if (readOnly) {
    return <span className={`inline-block border-b border-slate-400 px-1 text-sm text-slate-900 ${className}`}>{value || "\u00a0"}</span>;
  }
  return (
    <input
      className={`${line} ${className}`}
      value={value || ""}
      placeholder={placeholder || ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Block({ children }) {
  return <div className="text-sm leading-8 text-slate-800">{children}</div>;
}

function DateBlank({ value, onChange, readOnly }) {
  if (readOnly) {
    return <span className="inline-block min-w-24 border-b border-slate-400 px-1 text-sm text-slate-900">{formatDateDdMmYyyy(value) || "\u00a0"}</span>;
  }
  return (
    <span className="mx-1 inline-block w-[9.75rem] align-middle">
      <FormDateInput
        compact
        aria-label="Date"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-slate-300 bg-white text-sm"
      />
    </span>
  );
}

function MiniUpload({ value, onChange, readOnly }) {
  const add = async (event) => {
    const next = (await readImageFiles(event.target.files)).filter(Boolean);
    event.target.value = "";
    if (next[0]) onChange(next[0]);
  };
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {value ? (
        <span className="relative inline-flex h-8 w-12">
          <img src={value} alt="" className="h-8 w-12 rounded border border-slate-200 bg-white object-contain" />
          {readOnly ? null : (
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-red-600"
              onClick={() => onChange("")}
              aria-label="Remove upload"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ) : null}
      {readOnly ? null : (
        <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-accent hover:text-accent">
          <Plus className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" className="sr-only" onChange={add} />
        </label>
      )}
    </span>
  );
}

function readImageFiles(fileList) {
  const files = [...(fileList || [])].filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        })
    )
  );
}

function MarkUploads({ values, onChange, readOnly }) {
  const marks = (Array.isArray(values) ? values : []).filter(Boolean);
  const add = async (event) => {
    const next = (await readImageFiles(event.target.files)).filter(Boolean);
    event.target.value = "";
    if (next.length) onChange([...marks, ...next]);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {marks.map((src, index) => (
        <div key={`${index}-${src.slice(0, 24)}`} className="relative h-8 w-8">
          <img src={src} alt="" className="h-8 w-8 rounded border border-slate-200 bg-white object-contain" />
          {readOnly ? null : (
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-red-600"
              onClick={() => onChange(marks.filter((_, itemIndex) => itemIndex !== index))}
              aria-label="Remove upload"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {readOnly ? null : (
        <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-accent hover:text-accent">
          <Plus className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" multiple className="sr-only" onChange={add} />
        </label>
      )}
    </div>
  );
}

export default function NominationDocument({ form, header = {}, rows = [], onHeader, onRows, readOnly = false }) {
  const set = (key, value) => onHeader({ ...header, [key]: value });
  const witnesses = Array.isArray(header.witnesses)
    ? header.witnesses
    : [
        { name: header.witness1 || "", signature: "" },
        { name: header.witness2 || "", signature: "" },
      ];
  const setWitnesses = (next) => set("witnesses", next);
  const safeRows = rows.length ? rows : [blankWageRow(form)];

  const updateRow = (index, key, value) => {
    onRows(safeRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  const addRow = () => onRows([...safeRows, blankWageRow(form)]);
  const removeRow = (index) => onRows(safeRows.filter((_, rowIndex) => rowIndex !== index));

  return (
    <div className="space-y-4 text-slate-800">
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center sm:px-6">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">FORM I</h2>
        <p className="mt-1 text-xs italic text-slate-500">[(see rule 6(1), (2), (3) and (4))]</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">Nomination/Fresh Nomination/Modification of Nomination</p>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <Block>
          To{" "}
          <Blank className="w-full max-w-xl" value={header.establishmentTo} onChange={(value) => set("establishmentTo", value)} readOnly={readOnly} placeholder="Name and full address" />
        </Block>
        <p className="text-xs italic text-slate-500">(Give here name or description of the establishment with full address)</p>
        <Block>
          1. I, Shri/Shrimati/Kumari{" "}
          <Blank value={header.employeeName} onChange={(value) => set("employeeName", value)} readOnly={readOnly} placeholder="Name in full" className="w-56" />{" "}
          (Name in full here) whose particulars are given in the statement below, hereby nominate the person(s) mentioned below/ have acquired a family within the meaning of clause (33) of section 2 of Code on Social Security, 2020 with effect from the{" "}
          <DateBlank value={header.familyFrom} onChange={(value) => set("familyFrom", value)} readOnly={readOnly} />{" "}
          (date here) in the manner indicated below and therefore nominate afresh the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s).
        </Block>
        <p className="text-center text-sm font-medium text-slate-900">Or</p>
        <Block>
          I, Shri/Shrimati/Kumari{" "}
          <Blank value={header.modifyName} onChange={(value) => set("modifyName", value)} readOnly={readOnly} placeholder="Name in full" className="w-56" />{" "}
          (Name in full here) whose particulars are given in the statement below, hereby give notice that the nomination filled by me on date{" "}
          <DateBlank value={header.previousDate} onChange={(value) => set("previousDate", value)} readOnly={readOnly} />{" "}
          and recorded under your reference No.{" "}
          <Blank value={header.referenceNo} onChange={(value) => set("referenceNo", value)} readOnly={readOnly} placeholder="Reference no." className="w-36" />{" "}
          dated{" "}
          <DateBlank value={header.referenceDate} onChange={(value) => set("referenceDate", value)} readOnly={readOnly} />{" "}
          shall stand modified in the following manner-
        </Block>
        <p className="text-xs italic text-slate-500">*Strike out unnecessary portion.</p>
        <Block>2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (33) of section 2 of the Code on Social Security, 2020.</Block>
        <Block>3. I hereby declare that I have no family within the meaning of clause (33) of section 2 of the said Code.</Block>
        <Block>(a) My father/mother/parents is/are not dependent on me.</Block>
        <Block>(b) My husband&apos;s father/mother/parents is/are not dependent on my husband.</Block>
        <Block>
          4. I have excluded my husband from my family by a notice dated the{" "}
          <DateBlank value={header.excludeHusbandDate} onChange={(value) => set("excludeHusbandDate", value)} readOnly={readOnly} />{" "}
          to the competent authority in terms of clause (33) of section 2 of the said Code.
        </Block>
        <Block>5. Nomination made herein invalidates my previous nomination.</Block>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h3 className="mb-3 text-center text-sm font-semibold text-slate-900">Nominee(s)</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#eef2f6]">
                {["S.No.", "Name in full with full address of nominee(s)", "Relationship with the employee", "Age of nominee", "Proportion by which the gratuity will be shared", ""].map((heading) => (
                  <th key={heading || "remove"} className="border border-slate-200 px-2 py-2 text-left text-[12px] font-medium text-slate-500">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, index) => (
                <tr key={index}>
                  <td className="w-14 border border-slate-200 px-2 text-center text-sm text-slate-500">{index + 1}.</td>
                  {["nameAddress", "relationship", "age", "proportion"].map((key) => (
                    <td key={key} className="border border-slate-200 p-0">
                      {readOnly ? (
                        <div className="min-h-7 px-2 py-1 text-sm text-slate-700">{row[key] || "—"}</div>
                      ) : (
                        <input
                          className="h-7 w-full bg-transparent px-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-inset focus:ring-accent/30"
                          value={row[key] || ""}
                          onChange={(event) => updateRow(index, key, event.target.value)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="w-10 border border-slate-200 text-center">
                    {readOnly ? null : (
                      <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => removeRow(index)} aria-label="Remove nominee">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {readOnly ? null : (
                <tr>
                  <td colSpan={6} className="border border-slate-200 px-2 py-2">
                    <button type="button" className="text-sm font-medium text-accent" onClick={addRow}>
                      Add a line
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">So on</p>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h3 className="text-center text-sm font-semibold text-slate-900">Manner of acquiring a &quot;Family&quot;</h3>
        <p className="text-sm leading-7 text-slate-800">
          (Here give details as to how family was acquired. i.e. whether by marriage or parents being rendered dependent or through other process like adoption)
        </p>
        {readOnly ? (
          <p className="min-h-16 whitespace-pre-wrap text-sm text-slate-900">{header.familyManner || "—"}</p>
        ) : (
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            value={header.familyManner || ""}
            onChange={(event) => set("familyManner", event.target.value)}
          />
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h3 className="text-center text-sm font-semibold text-slate-900">Statement</h3>
        {[
          ["1. Name of employee in full", "statementName"],
          ["2. Sex", "sex"],
          ["3. Religion", "religion"],
          ["4. Whether unmarried/married/widow/widower", "marital"],
          ["5. Department/Branch/Section where employed", "department"],
          ["6. Post held with Ticket No. or Serial No., if any", "postTicket"],
          ["7. Date of appointment", "appointmentDate"],
        ].map(([label, key]) => (
          <label key={key} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center">
            <span className="text-sm text-slate-800">{label}</span>
            <Blank className="w-full" value={header[key]} onChange={(value) => set(key, value)} readOnly={readOnly} />
          </label>
        ))}
        <p className="text-sm text-slate-800">8. Permanent address:</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["Village", "village"],
            ["Thana", "thana"],
            ["Sub-division", "subdivision"],
            ["Post Office", "postOffice"],
            ["Pin-Code", "pinCode"],
            ["District", "district"],
            ["State", "stateName"],
            ["E-mail ID", "email"],
            ["Mobile Number", "mobile"],
          ].map(([label, key]) => (
            <label key={key}>
              <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
              <Blank className="w-full" value={header[key]} onChange={(value) => set(key, value)} readOnly={readOnly} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-800">Place:</span>
              <Blank className="w-full" value={header.statementPlace} onChange={(value) => set("statementPlace", value)} readOnly={readOnly} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-800">Date:</span>
              <DateBlank value={header.statementDate} onChange={(value) => set("statementDate", value)} readOnly={readOnly} />
            </label>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-slate-800">Signature/Thumb-impression of the Employee</p>
            <div className="mt-2 sm:flex sm:justify-end">
              <MarkUploads
                values={Array.isArray(header.employeeMarks) ? header.employeeMarks : header.employeeSignature ? [header.employeeSignature] : []}
                readOnly={readOnly}
                onChange={(next) => onHeader({ ...header, employeeMarks: next, employeeSignature: next[0] || "" })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h3 className="text-center text-sm font-semibold text-slate-900">DECLARATION BY WITNESSES</h3>
        <Block>Fresh nomination signed/thumb-impressed before me.</Block>
        <p className="text-sm text-slate-800">Name in full and full address of witnesses, and signature:</p>
        <div className="space-y-2">
          {witnesses.map((witness, index) => (
            <div key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-5 text-sm text-slate-500">{index + 1}.</span>
              {readOnly ? (
                <span className="min-w-40 flex-1 text-sm text-slate-900">{witness.name || "—"}</span>
              ) : (
                <input
                  className="h-8 min-w-40 flex-1 border-b border-slate-400 bg-transparent px-1 text-sm text-slate-900 outline-none focus:border-accent"
                  value={witness.name || ""}
                  placeholder="Name and address"
                  onChange={(event) => setWitnesses(witnesses.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))}
                />
              )}
              <MiniUpload
                value={witness.signature}
                readOnly={readOnly}
                onChange={(signature) => setWitnesses(witnesses.map((item, itemIndex) => (itemIndex === index ? { ...item, signature } : item)))}
              />
              {readOnly ? null : (
                <button type="button" className="inline-flex h-6 w-6 items-center justify-center text-slate-400 hover:text-red-600" onClick={() => setWitnesses(witnesses.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove witness">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {readOnly ? null : (
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setWitnesses([...witnesses, { name: "", signature: "" }])}>
            Add a witness
          </button>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-sm text-slate-800">Place:</span>
            <Blank className="w-full" value={header.witnessPlace} onChange={(value) => set("witnessPlace", value)} readOnly={readOnly} />
          </label>
          <label>
            <span className="mb-1 block text-sm text-slate-800">Date:</span>
            <Blank className="w-full" value={header.witnessDate} onChange={(value) => set("witnessDate", value)} readOnly={readOnly} />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6">
        <h3 className="text-center text-sm font-semibold text-slate-900">Certificate by the Employer</h3>
        <Block>Certified that the particulars of the above nomination have been verified and recorded in this establishment.</Block>
        <label className="block text-sm text-slate-800">
          Employer&apos;s Reference No., if any{" "}
          <Blank className="w-48" value={header.employerReference} onChange={(value) => set("employerReference", value)} readOnly={readOnly} />
        </label>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-800">
            Date:
            <span className="mt-1 block"><DateBlank value={header.employerCertDate} onChange={(value) => set("employerCertDate", value)} readOnly={readOnly} /></span>
          </label>
          <div className="sm:text-right">
            <p className="text-sm text-slate-800">Signature of the employer/Officer authorized</p>
            <div className="mt-1 sm:flex sm:justify-end">
              <MiniUpload value={header.employerSignature} onChange={(value) => set("employerSignature", value)} readOnly={readOnly} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <label className="block text-sm leading-7 text-slate-800">
            Name and address of the establishment or rubber stamp thereof.
            <Blank className="mt-1 w-full" value={header.employerEstablishment} onChange={(value) => set("employerEstablishment", value)} readOnly={readOnly} />
          </label>
          <label className="block text-sm text-slate-800 sm:text-right">
            Designation:
            <Blank className="mt-1 w-full" value={header.employerDesignation} onChange={(value) => set("employerDesignation", value)} readOnly={readOnly} />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 text-center sm:px-6">
        <h3 className="text-sm font-semibold text-slate-900">Acknowledgement by the Employee</h3>
        <p className="text-left text-sm leading-7 text-slate-800">
          Received the duplicate copy of nomination in Form-I filed by me and duly certified by the employer.
        </p>
        <div className="grid grid-cols-1 items-start gap-4 text-left sm:grid-cols-2">
          <label className="block text-sm text-slate-800">
            Date:
            <span className="mt-1 block"><DateBlank value={header.ackDate} onChange={(value) => set("ackDate", value)} readOnly={readOnly} /></span>
          </label>
          <div className="sm:text-right">
            <p className="text-sm text-slate-800">Signature of the Employee</p>
            <div className="mt-1 sm:flex sm:justify-end">
              <MiniUpload value={header.ackSignature} onChange={(value) => set("ackSignature", value)} readOnly={readOnly} />
            </div>
          </div>
        </div>
        <div className="pt-4 text-sm leading-6 text-slate-700">
          <p>By order and in the name of the Governor of Gujarat,</p>
          <div className="mt-3 flex justify-center">
            <MiniUpload value={header.secretarySignature} onChange={(value) => set("secretarySignature", value)} readOnly={readOnly} />
          </div>
          <p className="mt-2 font-medium text-slate-900">(Drashti Shah)</p>
          <p className="font-semibold text-slate-900">Deputy Secretary to Government.</p>
        </div>
      </section>
    </div>
  );
}
