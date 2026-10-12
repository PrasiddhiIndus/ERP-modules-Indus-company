(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/pages/compliance/payroll/NominationDocument.jsx
  var import_react3 = __toESM(__require("react"), 1);
  var import_lucide_react2 = __require("lucide-react");

  // src/components/FormDateInput.jsx
  var import_react2 = __toESM(__require("react"), 1);

  // src/components/DateInput.jsx
  var import_react = __toESM(__require("react"), 1);
  var import_lucide_react = __require("lucide-react");

  // src/utils/dateDisplay.js
  var ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
  var DMY_DASH_RE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  var DMY_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function toDdMmYyyy(dd, mm, yyyy) {
    return `${pad2(dd)}/${pad2(mm)}/${yyyy}`;
  }
  function isoFromParts(day, month, year) {
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
    return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  }
  function isoFromAmbiguousParts(a, b, year) {
    const n1 = Number(a);
    const n2 = Number(b);
    let day;
    let month;
    if (n1 > 12 && n2 <= 12) {
      day = n1;
      month = n2;
    } else if (n2 > 12 && n1 <= 12) {
      month = n1;
      day = n2;
    } else if (n1 > 12 && n2 > 12) {
      return "";
    } else {
      day = n1;
      month = n2;
    }
    return isoFromParts(day, month, year);
  }
  function normalizeToIsoDate(value) {
    if (value == null || String(value).trim() === "") return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return isoFromParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
    }
    const s = String(value).trim();
    const iso = s.match(ISO_DATE_RE);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    const dash = s.match(DMY_DASH_RE);
    if (dash) return isoFromAmbiguousParts(dash[1], dash[2], dash[3]);
    const slash = s.match(DMY_SLASH_RE);
    if (slash) return isoFromAmbiguousParts(slash[1], slash[2], slash[3]);
    const short = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
    if (short) {
      const year = short[3].length === 2 ? `20${short[3]}` : short[3];
      return isoFromAmbiguousParts(short[1], short[2], year);
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) {
      return isoFromParts(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
    }
    return "";
  }
  function formatDateDdMmYyyy(value) {
    if (value == null || String(value).trim() === "") return "";
    const iso = normalizeToIsoDate(value);
    if (iso) {
      const [y, m, d] = iso.split("-");
      return toDdMmYyyy(d, m, y);
    }
    return String(value).trim();
  }

  // src/utils/dateInput.js
  var DATE_INPUT_MIN = "1900-01-01";
  var DATE_INPUT_MAX = "9999-12-31";
  var COMPLETE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  function isCompleteIsoDate(value) {
    return COMPLETE_ISO_DATE.test(String(value || ""));
  }
  function isValidDateInputValue(value) {
    const raw = String(value ?? "");
    if (!raw) return true;
    if (raw.length > 10) return false;
    const [year = ""] = raw.split("-");
    if (year.length > 4) return false;
    if (isCompleteIsoDate(raw)) {
      return raw >= DATE_INPUT_MIN && raw <= DATE_INPUT_MAX;
    }
    return true;
  }
  function normalizeDateInputValue(value) {
    const raw = String(value ?? "");
    if (!raw) return "";
    if (!isValidDateInputValue(raw)) {
      if (isCompleteIsoDate(raw)) return "";
      return raw.slice(0, 10);
    }
    return raw;
  }
  function isoToDisplayDate(value) {
    const raw = String(value ?? "").trim();
    if (!isCompleteIsoDate(raw)) return "";
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  function parseDisplayDateToIso(text) {
    const raw = String(text ?? "").trim();
    if (!raw) return "";
    const parts = raw.split(/[/.-]/).map((p) => p.replace(/\D/g, ""));
    const [d = "", m = "", y = ""] = parts;
    if (!d && !m && !y) return "";
    if (y.length > 0 && y.length < 4) return null;
    if (y.length === 4 && d && m) {
      const iso = normalizeToIsoDate(`${d}-${m}-${y}`);
      return iso || "";
    }
    return null;
  }
  function finalizeDateInputValue(value) {
    const raw = String(value ?? "");
    if (!raw) return "";
    if (!isCompleteIsoDate(raw)) return raw;
    if (raw < DATE_INPUT_MIN || raw > DATE_INPUT_MAX) return "";
    return raw;
  }

  // src/components/DateInput.jsx
  var import_jsx_runtime = __require("react/jsx-runtime");
  function DateInput({
    value,
    onChange,
    min = DATE_INPUT_MIN,
    max = DATE_INPUT_MAX,
    className = "",
    compact = false,
    disabled = false,
    readOnly = false,
    name,
    id,
    required = false,
    title,
    onBlur,
    onFocus,
    placeholder = "dd/mm/yyyy",
    "aria-label": ariaLabel
  }) {
    const autoId = (0, import_react.useId)();
    const inputId = id || `date-input-${autoId}`;
    const pickerRef = (0, import_react.useRef)(null);
    const isoValue = value ? String(value).slice(0, 10) : "";
    const [textValue, setTextValue] = (0, import_react.useState)(() => isoToDisplayDate(isoValue));
    const [focused, setFocused] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      if (!focused) {
        setTextValue(isoToDisplayDate(isoValue));
      }
    }, [isoValue, focused]);
    const emitIso = (nextIso) => {
      const normalized = normalizeDateInputValue(nextIso);
      onChange?.(normalized);
    };
    const handleTextChange = (event) => {
      if (readOnly || disabled) return;
      const nextText = event.target.value;
      setTextValue(nextText);
      if (!nextText.trim()) {
        emitIso("");
        return;
      }
      const parsed = parseDisplayDateToIso(nextText);
      if (parsed === null) return;
      if (!parsed) return;
      if (!isValidDateInputValue(parsed)) return;
      const finalized = finalizeDateInputValue(parsed);
      if (finalized && finalized >= min && finalized <= max) {
        emitIso(finalized);
      }
    };
    const handleTextBlur = (event) => {
      setFocused(false);
      const parsed = parseDisplayDateToIso(textValue);
      if (!textValue.trim()) {
        emitIso("");
        setTextValue("");
      } else if (isCompleteIsoDate(parsed)) {
        const finalized = finalizeDateInputValue(parsed);
        if (finalized && finalized >= min && finalized <= max) {
          emitIso(finalized);
          setTextValue(isoToDisplayDate(finalized));
        } else {
          emitIso("");
          setTextValue("");
        }
      } else {
        setTextValue(isoToDisplayDate(isoValue));
      }
      onBlur?.(event);
    };
    const handlePickerChange = (event) => {
      if (readOnly || disabled) return;
      const next = event.target.value;
      if (!isValidDateInputValue(next)) return;
      const normalized = finalizeDateInputValue(normalizeDateInputValue(next));
      if (normalized && normalized >= min && normalized <= max) {
        emitIso(normalized);
        setTextValue(isoToDisplayDate(normalized));
      }
    };
    const openCalendar = () => {
      if (readOnly || disabled) return;
      const picker = pickerRef.current;
      if (!picker) return;
      if (isoValue && isCompleteIsoDate(isoValue)) {
        picker.value = isoValue;
      }
      try {
        if (typeof picker.showPicker === "function") {
          picker.showPicker();
          return;
        }
      } catch {
      }
      picker.focus({ preventScroll: true });
      picker.click();
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `erp-date-input flex w-full items-stretch gap-0 overflow-hidden ${className}`.trim(), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "text",
          inputMode: "numeric",
          autoComplete: "off",
          id: inputId,
          name,
          value: textValue,
          onChange: handleTextChange,
          onFocus: (e) => {
            setFocused(true);
            onFocus?.(e);
          },
          onBlur: handleTextBlur,
          disabled,
          readOnly,
          required,
          title: title || "Enter date as dd/mm/yyyy or use calendar",
          "aria-label": ariaLabel,
          placeholder,
          className: `erp-date-input-text min-w-0 flex-1 border-0 bg-transparent px-3 text-inherit placeholder:text-slate-400 focus:outline-none focus:ring-0 ${compact ? "py-1 text-xs" : "text-sm"}`
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          className: `erp-date-input-calendar relative shrink-0 flex items-center justify-center border-l border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 ${disabled || readOnly ? "opacity-50 pointer-events-none" : "cursor-pointer"} ${compact ? "px-2" : "px-2.5"}`,
          onClick: openCalendar,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openCalendar();
            }
          },
          role: "button",
          tabIndex: disabled || readOnly ? -1 : 0,
          title: "Open calendar",
          "aria-label": "Open calendar",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                ref: pickerRef,
                type: "date",
                tabIndex: -1,
                "aria-hidden": true,
                className: "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0",
                value: isoValue,
                min,
                max,
                onChange: handlePickerChange,
                disabled: disabled || readOnly
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Calendar, { className: `pointer-events-none relative z-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}` })
          ]
        }
      )
    ] });
  }

  // src/components/FormDateInput.jsx
  var import_jsx_runtime2 = __require("react/jsx-runtime");
  function FormDateInput({
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    className = "",
    disabled,
    readOnly,
    required,
    name,
    id,
    min,
    max,
    title,
    compact = false,
    "aria-label": ariaLabel
  }) {
    const isoValue = value !== void 0 && value !== null ? value : defaultValue;
    const handleChange = (nextIso) => {
      const v = nextIso ?? "";
      onChange?.({
        target: { value: v, name, id },
        currentTarget: { value: v, name, id }
      });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      DateInput,
      {
        value: isoValue ?? "",
        onChange: handleChange,
        onBlur,
        onFocus,
        className,
        disabled,
        readOnly,
        required,
        name,
        id,
        min,
        max,
        title,
        compact,
        "aria-label": ariaLabel
      }
    );
  }
  var FormDateInput_default = FormDateInput;

  // src/pages/compliance/payroll/wageFormCatalog.js
  var wageHeader = [
    { key: "establishment", label: "Name of the Establishment" },
    { key: "employer", label: "Name of the Employer" },
    { key: "owner", label: "Name of the Owner" },
    { key: "panTan", label: "PAN/TAN of the Employer" },
    { key: "lin", label: "Labour Identification Number (LIN)", wide: true }
  ];
  var WAGE_FORMS = {
    "form-i": {
      id: "form-i",
      button: "Form 1",
      title: "FORM-I",
      rule: "(see rule-17 and 42(1), (2) and (3))",
      name: "Register of Wages, Overtime, Fine, Deduction for damage and Loss",
      note: "Signature is not required if the register is maintained electronically.",
      header: wageHeader,
      columns: [
        ["sr", "Sr. No. in Employee Register"],
        ["name", "Name of the employee"],
        ["designation", "Designation / Department"],
        ["duration", "Duration of Payment of Wages (Monthly/Fortnightly/Weekly/Daily/Piece rated)"],
        ["period", "Wage Period From-To"],
        ["days", "Total no. of days worked during the period"],
        ["otHours", "Total overtime (hours worked or production in case of piece workers)"],
        ["basic", "Rates of wages \u2014 Basic"],
        ["da", "Rates of wages \u2014 DA"],
        ["allowances", "Rates of wages \u2014 Allowances"],
        ["otEarning", "Overtime earning"],
        ["fineNature", "Nature of acts and omissions for which fine imposed with date"],
        ["fineAmount", "Amount of fine imposed"],
        ["damage", "Damage or loss caused to the employer by neglect or default of the employee"],
        ["deduction", "Amount of deduction from wages"],
        ["wagesPaid", "Total amount of wages paid"],
        ["payDate", "Date of Payment"],
        ["attDate", "Attendance \u2014 Date"],
        ["attSign", "Attendance \u2014 Signature"]
      ].map(([key, label]) => ({ key, label }))
    },
    "form-iv": {
      id: "form-iv",
      button: "Form 2",
      title: "FORM II",
      rule: "(see rule 42(3))",
      name: "EMPLOYEE REGISTER",
      note: "Category is Highly Skilled / Skilled / Semi skilled / Unskilled. Specimen signature is not required if the employee register is maintained electronically.",
      header: wageHeader,
      columns: [
        ["sr", "Sr. No."],
        ["code", "Employee Code"],
        ["name", "Name"],
        ["surname", "Surname"],
        ["gender", "Gender"],
        ["fatherSpouse", "Father's / Spouse Name"],
        ["dob", "Date of Birth"],
        ["nationality", "Nationality"],
        ["education", "Education Level"],
        ["doj", "Date of Joining"],
        ["designation", "Designation"],
        ["category", "Category (HS/S/SS/US)"],
        ["employmentType", "Type of Employment"],
        ["mobile", "Mobile No."],
        ["uan", "UAN"],
        ["pan", "PAN"],
        ["esic", "ESIC IP No."],
        ["aadhaar", "AADHAAR"],
        ["account", "Bank A/c Number"],
        ["bank", "Bank"],
        ["ifsc", "Branch (IFSC)"],
        ["presentAddress", "Present Address"],
        ["permanentAddress", "Permanent Address"],
        ["serviceBook", "Service Book No."],
        ["exitDate", "Date of Exit"],
        ["exitReason", "Reason for Exit"],
        ["identification", "Mark of Identification"],
        ["photo", "Photo"],
        ["signature", "Specimen Signature/Thumb Impression"],
        ["remarks", "Remarks"]
      ].map(([key, label]) => ({ key, label }))
    },
    "form-v": {
      id: "form-v",
      button: "Form 3",
      title: "FORM III",
      rule: "(see rule 43)",
      name: "WAGE SLIP",
      note: "Each row is one wage slip. Employer / Pay-in-charge signature is the last column.",
      header: [
        { key: "issueDate", label: "Date of issue" },
        { key: "establishment", label: "Name of the Establishment" },
        { key: "address", label: "Address", wide: true },
        { key: "period", label: "Period" }
      ],
      columns: [
        ["name", "1. Name of employee"],
        ["fatherSpouse", "2. Father's / Spouse name"],
        ["designation", "3. Designation"],
        ["uan", "4. UAN"],
        ["account", "5. Bank Account No."],
        ["wagePeriod", "6. Wage period"],
        ["basic", "7. Rate of wages \u2014 Basic"],
        ["da", "7. Rate of wages \u2014 D.A."],
        ["allowances", "7. Rate of wages \u2014 Other allowances"],
        ["attendance", "8. Total attendance / unit of work done"],
        ["ot", "9. Overtime wages"],
        ["gross", "10. Gross wages payable"],
        ["pf", "11. Total deductions \u2014 PF"],
        ["esi", "11. Total deductions \u2014 ESI"],
        ["otherDed", "11. Total deductions \u2014 Others"],
        ["net", "12. Net wages paid"],
        ["signature", "Employer / Pay-in-charge signature"]
      ].map(([key, label]) => ({ key, label }))
    }
  };
  var WAGE_FORM_LIST = ["form-i", "form-iv", "form-v"].map((id) => WAGE_FORMS[id]);
  function blankWageRow(form) {
    return Object.fromEntries(form.columns.map((column) => [column.key, ""]));
  }

  // src/pages/compliance/payroll/NominationDocument.jsx
  var import_jsx_runtime3 = __require("react/jsx-runtime");
  var line = "h-8 border-b border-slate-400 bg-transparent px-1 text-sm text-slate-900 outline-none focus:border-accent";
  function Blank({ value, onChange, readOnly, className = "w-44", placeholder }) {
    if (readOnly) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `inline-block border-b border-slate-400 px-1 text-sm text-slate-900 ${className}`, children: value || "\xA0" });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "input",
      {
        className: `${line} ${className}`,
        value: value || "",
        placeholder: placeholder || "",
        onChange: (event) => onChange(event.target.value)
      }
    );
  }
  function Block({ children }) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-sm leading-8 text-slate-800", children });
  }
  function DateBlank({ value, onChange, readOnly }) {
    if (readOnly) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "inline-block min-w-24 border-b border-slate-400 px-1 text-sm text-slate-900", children: formatDateDdMmYyyy(value) || "\xA0" });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "mx-1 inline-block w-[9.75rem] align-middle", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      FormDateInput_default,
      {
        compact: true,
        "aria-label": "Date",
        value: value || "",
        onChange: (event) => onChange(event.target.value),
        className: "h-8 rounded-md border border-slate-300 bg-white text-sm"
      }
    ) });
  }
  function SignatureBox({ label, value, onUpload, onClear, readOnly }) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "inline-flex max-w-full flex-wrap items-center gap-2", children: [
      label ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-sm text-slate-800", children: label }) : null,
      value ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "relative inline-flex h-14 w-24 items-center justify-center rounded border border-slate-200 bg-white", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("img", { src: value, alt: "", className: "max-h-12 max-w-[88px] object-contain" }),
        readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": "Remove", onClick: onClear, className: "absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.X, { className: "h-3 w-3", strokeWidth: 2.5 }) })
      ] }) : null,
      readOnly || value ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { "aria-label": label || "Add image", className: "inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Plus, { className: "h-4 w-4" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "file", accept: "image/*", className: "sr-only", onChange: onUpload })
      ] })
    ] });
  }
  function readImageFiles(event, onDone) {
    const files = [...event.target.files || []].filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;
    Promise.all(
      files.map(
        (file) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(file);
        })
      )
    ).then((images) => onDone(images.filter(Boolean)));
  }
  function PhotoStrip({ images, onAdd, onRemove, readOnly, label }) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-xs text-slate-500", children: label }),
      images.map((src, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "relative inline-flex h-14 w-20 items-center justify-center rounded border border-slate-200 bg-white", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("img", { src, alt: "", className: "max-h-12 max-w-[72px] object-contain" }),
        readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", "aria-label": "Remove", onClick: () => onRemove(index), className: "absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-white", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.X, { className: "h-3 w-3", strokeWidth: 2.5 }) })
      ] }, `${label}-${index}`)),
      readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { "aria-label": `Add ${label}`, className: "inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Plus, { className: "h-4 w-4" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "file", accept: "image/*", multiple: true, className: "sr-only", onChange: onAdd })
      ] })
    ] });
  }
  function NominationDocument({ form, header = {}, rows = [], onHeader, onRows, readOnly = false }) {
    const set = (key, value) => onHeader({ ...header, [key]: value });
    const witnesses = Array.isArray(header.witnesses) ? header.witnesses : [
      { name: header.witness1 || "", signature: "" },
      { name: header.witness2 || "", signature: "" }
    ];
    const setWitnesses = (next) => set("witnesses", next);
    const employeeSignatures = Array.isArray(header.employeeSignatures) ? header.employeeSignatures : header.employeeSignature ? [header.employeeSignature] : [];
    const employeeThumbs = Array.isArray(header.employeeThumbs) ? header.employeeThumbs : [];
    const safeRows = rows.length ? rows : [blankWageRow(form)];
    const updateRow = (index, key, value) => {
      onRows(safeRows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    };
    const addRow = () => onRows([...safeRows, blankWageRow(form)]);
    const removeRow = (index) => onRows(safeRows.filter((_, rowIndex) => rowIndex !== index));
    const onSignature = (key) => (event) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => set(key, String(reader.result || ""));
      reader.readAsDataURL(file);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-4 text-slate-800", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "rounded-lg border border-slate-200 bg-white px-4 py-5 text-center sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "text-base font-semibold text-slate-900 sm:text-lg", children: "FORM I" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "mt-1 text-xs italic text-slate-500", children: "[(see rule 6(1), (2), (3) and (4))]" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "mt-2 text-sm font-semibold text-slate-900", children: "Nomination/Fresh Nomination/Modification of Nomination" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Block, { children: [
          "To",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-full max-w-xl", value: header.establishmentTo, onChange: (value) => set("establishmentTo", value), readOnly, placeholder: "Name and full address" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs italic text-slate-500", children: "(Give here name or description of the establishment with full address)" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Block, { children: [
          "1. I, Shri/Shrimati/Kumari",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { value: header.employeeName, onChange: (value) => set("employeeName", value), readOnly, placeholder: "Name in full", className: "w-56" }),
          " ",
          "(Name in full here) whose particulars are given in the statement below, hereby nominate the person(s) mentioned below/ have acquired a family within the meaning of clause (33) of section 2 of Code on Social Security, 2020 with effect from the",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.familyFrom, onChange: (value) => set("familyFrom", value), readOnly }),
          " ",
          "(date here) in the manner indicated below and therefore nominate afresh the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s)."
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-center text-sm font-medium text-slate-900", children: "Or" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Block, { children: [
          "I, Shri/Shrimati/Kumari",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { value: header.modifyName, onChange: (value) => set("modifyName", value), readOnly, placeholder: "Name in full", className: "w-56" }),
          " ",
          "(Name in full here) whose particulars are given in the statement below, hereby give notice that the nomination filled by me on date",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.previousDate, onChange: (value) => set("previousDate", value), readOnly }),
          " ",
          "and recorded under your reference No.",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { value: header.referenceNo, onChange: (value) => set("referenceNo", value), readOnly, placeholder: "Reference no.", className: "w-36" }),
          " ",
          "dated",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.referenceDate, onChange: (value) => set("referenceDate", value), readOnly }),
          " ",
          "shall stand modified in the following manner-"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs italic text-slate-500", children: "*Strike out unnecessary portion." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (33) of section 2 of the Code on Social Security, 2020." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "3. I hereby declare that I have no family within the meaning of clause (33) of section 2 of the said Code." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "(a) My father/mother/parents is/are not dependent on me." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "(b) My husband's father/mother/parents is/are not dependent on my husband." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Block, { children: [
          "4. I have excluded my husband from my family by a notice dated the",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.excludeHusbandDate, onChange: (value) => set("excludeHusbandDate", value), readOnly }),
          " ",
          "to the competent authority in terms of clause (33) of section 2 of the said Code."
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "5. Nomination made herein invalidates my previous nomination." })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "mb-3 text-center text-sm font-semibold text-slate-900", children: "Nominee(s)" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "overflow-x-auto rounded-lg border border-slate-200", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("table", { className: "min-w-[760px] w-full border-collapse text-sm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { className: "bg-[#eef2f6]", children: ["S.No.", "Name in full with full address of nominee(s)", "Relationship with the employee", "Age of nominee", "Proportion by which the gratuity will be shared", ""].map((heading) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("th", { className: "border border-slate-200 px-2 py-2 text-left text-[12px] font-medium text-slate-500", children: heading }, heading || "remove")) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tbody", { children: [
            safeRows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("td", { className: "w-14 border border-slate-200 px-2 text-center text-sm text-slate-500", children: [
                index + 1,
                "."
              ] }),
              ["nameAddress", "relationship", "age", "proportion"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { className: "border border-slate-200 p-0", children: readOnly ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "min-h-7 px-2 py-1 text-sm text-slate-700", children: row[key] || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  className: "h-7 w-full bg-transparent px-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-inset focus:ring-accent/30",
                  value: row[key] || "",
                  onChange: (event) => updateRow(index, key, event.target.value)
                }
              ) }, key)),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { className: "w-10 border border-slate-200 text-center", children: readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "text-xs text-slate-500 hover:text-red-600", onClick: () => removeRow(index), "aria-label": "Remove nominee", children: "\xD7" }) })
            ] }, index)),
            readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("td", { colSpan: 6, className: "border border-slate-200 px-2 py-2", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "text-sm font-medium text-accent", onClick: addRow, children: "Add a line" }) }) })
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "mt-2 text-xs text-slate-500", children: "So on" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-center text-sm font-semibold text-slate-900", children: 'Manner of acquiring a "Family"' }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-sm leading-7 text-slate-800", children: "(Here give details as to how family was acquired. i.e. whether by marriage or parents being rendered dependent or through other process like adoption)" }),
        readOnly ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "min-h-16 whitespace-pre-wrap text-sm text-slate-900", children: header.familyManner || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "textarea",
          {
            className: "min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25",
            value: header.familyManner || "",
            onChange: (event) => set("familyManner", event.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-center text-sm font-semibold text-slate-900", children: "Statement" }),
        [
          ["1. Name of employee in full", "statementName"],
          ["2. Sex", "sex"],
          ["3. Religion", "religion"],
          ["4. Whether unmarried/married/widow/widower", "marital"],
          ["5. Department/Branch/Section where employed", "department"],
          ["6. Post held with Ticket No. or Serial No., if any", "postTicket"]
        ].map(([label, key]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-sm text-slate-800", children: label }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-full", value: header[key], onChange: (value) => set(key, value), readOnly })
        ] }, key)),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-sm text-slate-800", children: "7. Date of appointment" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.appointmentDate, onChange: (value) => set("appointmentDate", value), readOnly })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-sm text-slate-800", children: "8. Permanent address:" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex flex-wrap items-end gap-x-5 gap-y-2 text-sm text-slate-800", children: [
          ["Village", "village", "w-32"],
          ["Thana", "thana", "w-32"],
          ["Sub-division", "subdivision", "w-32"],
          ["Post Office", "postOffice", "w-32"]
        ].map(([label, key, width]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "inline-flex items-center gap-1", children: [
          label,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: width, value: header[key], onChange: (value) => set(key, value), readOnly })
        ] }, key)) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex flex-wrap items-end gap-x-5 gap-y-2 text-sm text-slate-800", children: [
          ["Pin-Code", "pinCode", "w-28"],
          ["District", "district", "w-36"],
          ["State", "stateName", "w-36"]
        ].map(([label, key, width]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "inline-flex items-center gap-1", children: [
          label,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: width, value: header[key], onChange: (value) => set(key, value), readOnly })
        ] }, key)) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex flex-wrap items-end gap-x-5 gap-y-2 text-sm text-slate-800", children: [
          ["E-mail ID", "email", "w-48"],
          ["Mobile Number", "mobile", "w-36"]
        ].map(([label, key, width]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "inline-flex items-center gap-1", children: [
          label,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: width, value: header[key], onChange: (value) => set(key, value), readOnly })
        ] }, key)) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 items-start gap-6 pt-2 sm:grid-cols-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-3", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "block text-sm text-slate-800", children: [
              "Place:",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "mt-1 w-full max-w-xs", value: header.statementPlace, onChange: (value) => set("statementPlace", value), readOnly })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-sm text-slate-800", children: [
              "Date:",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DateBlank, { value: header.statementDate, onChange: (value) => set("statementDate", value), readOnly })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2 sm:text-right", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-sm text-slate-800", children: "Signature/Thumb-impression of the Employee" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              PhotoStrip,
              {
                label: "Signature",
                images: employeeSignatures,
                readOnly,
                onRemove: (index) => set("employeeSignatures", employeeSignatures.filter((_, itemIndex) => itemIndex !== index)),
                onAdd: (event) => readImageFiles(event, (images) => set("employeeSignatures", [...employeeSignatures, ...images]))
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              PhotoStrip,
              {
                label: "Thumb",
                images: employeeThumbs,
                readOnly,
                onRemove: (index) => set("employeeThumbs", employeeThumbs.filter((_, itemIndex) => itemIndex !== index)),
                onAdd: (event) => readImageFiles(event, (images) => set("employeeThumbs", [...employeeThumbs, ...images]))
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-center text-sm font-semibold text-slate-900", children: "DECLARATION BY WITNESSES" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "Fresh nomination signed/thumb-impressed before me." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-sm text-slate-800", children: "Name in full and full address of witnesses, and signature:" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "space-y-2", children: witnesses.map((witness, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "w-5 text-sm text-slate-500", children: [
            index + 1,
            "."
          ] }),
          readOnly ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "min-w-40 flex-1 text-sm text-slate-900", children: witness.name || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              className: "h-8 min-w-40 flex-1 border-b border-slate-400 bg-transparent px-1 text-sm text-slate-900 outline-none focus:border-accent",
              value: witness.name || "",
              placeholder: "Name and address",
              onChange: (event) => setWitnesses(witnesses.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            SignatureBox,
            {
              label: "Signature",
              value: witness.signature,
              readOnly,
              onClear: () => setWitnesses(witnesses.map((item, itemIndex) => itemIndex === index ? { ...item, signature: "" } : item)),
              onUpload: (event) => {
                const file = event.target.files?.[0];
                if (!file || !file.type.startsWith("image/")) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const signature = String(reader.result || "");
                  setWitnesses(witnesses.map((item, itemIndex) => itemIndex === index ? { ...item, signature } : item));
                };
                reader.readAsDataURL(file);
              }
            }
          ),
          readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "text-xs text-slate-500 hover:text-red-600", onClick: () => setWitnesses(witnesses.filter((_, itemIndex) => itemIndex !== index)), children: "Remove" })
        ] }, index)) }),
        readOnly ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "text-sm font-medium text-accent", onClick: () => setWitnesses([...witnesses, { name: "", signature: "" }]), children: "Add a witness" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 gap-3 sm:grid-cols-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "mb-1 block text-sm text-slate-800", children: "Place:" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-full", value: header.witnessPlace, onChange: (value) => set("witnessPlace", value), readOnly })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "mb-1 block text-sm text-slate-800", children: "Date:" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-full", value: header.witnessDate, onChange: (value) => set("witnessDate", value), readOnly })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-center text-sm font-semibold text-slate-900", children: "Certificate by the Employer" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Block, { children: "Certified that the particulars of the above nomination have been verified and recorded in this establishment." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "block text-sm text-slate-800", children: [
          "Employer's Reference No., if any",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-48", value: header.employerReference, onChange: (value) => set("employerReference", value), readOnly })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "block text-sm text-slate-800", children: [
          "Date: ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-40", value: header.employerCertDate, onChange: (value) => set("employerCertDate", value), readOnly })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          SignatureBox,
          {
            label: "Signature of the employer/Officer authorized",
            value: header.employerSignature,
            onUpload: onSignature("employerSignature"),
            onClear: () => set("employerSignature", ""),
            readOnly
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "block text-sm text-slate-800", children: [
          "Designation: ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-56", value: header.employerDesignation, onChange: (value) => set("employerDesignation", value), readOnly })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "block text-sm leading-7 text-slate-800", children: [
          "Name and address of the establishment or rubber stamp thereof.",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "mt-1 w-full", value: header.employerEstablishment, onChange: (value) => set("employerEstablishment", value), readOnly })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-5 text-center sm:px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-sm font-semibold text-slate-900", children: "Acknowledgement by the Employee" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-left text-sm leading-7 text-slate-800", children: "Received the duplicate copy of nomination in Form-I filed by me and duly certified by the employer." }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "text-left text-sm text-slate-800", children: [
          "Date: ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Blank, { className: "w-40", value: header.ackDate, onChange: (value) => set("ackDate", value), readOnly })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          SignatureBox,
          {
            label: "Signature of the Employee",
            value: header.ackSignature,
            onUpload: onSignature("ackSignature"),
            onClear: () => set("ackSignature", ""),
            readOnly
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "pt-4 text-sm leading-6 text-slate-700", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: "By order and in the name of the Governor of Gujarat," }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "mt-3 font-medium text-slate-900", children: "(Drashti Shah)" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "font-semibold text-slate-900", children: "Deputy Secretary to Government." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          SignatureBox,
          {
            label: "(Drashti Shah) \u2014 Deputy Secretary to Government",
            value: header.secretarySignature,
            onUpload: onSignature("secretarySignature"),
            onClear: () => set("secretarySignature", ""),
            readOnly
          }
        )
      ] })
    ] });
  }
})();
