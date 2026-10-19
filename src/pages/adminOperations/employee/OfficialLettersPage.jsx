/** Official Letters — issue HR letters and track probation reviews (2 / 4 / 5.5 months).
 *  Personal Letters tab — birthday & wedding-anniversary greeting cards (8:00 IST). */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Gift,
  Heart,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
  Modal,
  KpiTile,
  CollapsibleHelp,
} from "../components/AdminUi";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { ERP_TIMEZONE, formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  confirmedThisYearCount,
  deriveProbationStage,
  fetchLettersForEmployee,
  fetchLettersForEmployees,
  fetchOfficialLetterEmployees,
  fetchReviewsForEmployee,
  fetchReviewsForEmployees,
  friendlyOfficialLettersError,
  insertOfficialLetter,
  isEmployeePermanent,
  isMissingOfficialLettersTableError,
  isOfficialLetterAcknowledged,
  lettersIssuedThisMonthCount,
  matchesProbationFilter,
  officialLetterAckStatusLabel,
  PROBATION_MILESTONES,
  stampEmployeeConfirmationDate,
  syncEmployeeMasterFromProbationReviews,
  upsertProbationReview,
  buildProbationSchedule,
} from "../../../lib/officialLettersApi";
import {
  buildOfficialLetterHtml,
  downloadOfficialLetter,
  letterPayloadFromEmployeeAndForm,
  OFFICIAL_LETTER_TYPES,
  officialLetterTypeLabel,
} from "../../../lib/officialLetterDocuments";
import {
  fetchPersonalLetterImageBlobUrl,
  fetchPersonalLetters,
  friendlyPersonalLettersError,
  isMissingPersonalLettersTableError,
  personalLetterKindLabel,
  runPersonalLettersGeneration,
} from "../../../lib/personalLettersApi";
import { supabase } from "../../../lib/supabase";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import { getSalaryStructure } from "../salaryAdmin/salaryData";
import { fetchRuleVersions, findRuleVersionById } from "../salaryAdmin/payrollRulesDb";
import { buildCtcHistory, isAnnexureRecord } from "../salaryAdmin/annexureCtcRecord";
import { printAnnexure } from "../salaryAdmin/annexurePrint";

const ANNEXURE_LETTER_TYPES = new Set(["appointment", "confirmation", "promotion"]);

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const COL_MIN = "min-w-[120px]";
const COL_NAME = "min-w-[200px]";
const COL_DATE = "min-w-[130px]";
const OFFICIAL_TAB = "official";
const PERSONAL_TAB = "personal";

function pageTabClass(active) {
  return `inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-colors ${
    active
      ? "bg-accent text-white border-accent"
      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
  }`;
}

const PROBATION_FILTER_OPTIONS = [
  { value: "all", label: "All probation stages" },
  { value: "due_now", label: "Due now" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming_30", label: "Upcoming (30 days)" },
  { value: "confirmed", label: "Confirmed" },
];

const OUTCOME_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "continue", label: "Continue probation" },
  { value: "confirm", label: "Confirm employment" },
  { value: "extend", label: "Extend probation" },
  { value: "exit", label: "Exit / separate" },
];

function emptyLetterForm() {
  return {
    letterType: "warning",
    subject: "",
    reason: "",
    notes: "",
    referenceNo: "",
    letterDate: new Date().toISOString().slice(0, 10),
    effectiveDate: "",
    newDesignation: "",
    letterBody: "",
    stampConfirmation: true,
  };
}

function emptyReviewForm(milestone, scheduledDate) {
  return {
    milestone,
    scheduled_date: scheduledDate || "",
    held_on: new Date().toISOString().slice(0, 10),
    outcome: "continue",
    with_appraisal: false,
    notes: "",
  };
}

function uniqueSorted(values) {
  return [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function applyEmployeeMasterPatch(employee, masterPatch, reviewsMap) {
  if (!employee) return employee;
  const merged = masterPatch ? { ...employee, ...masterPatch } : employee;
  const stageInfo = deriveProbationStage(merged, reviewsMap || {});
  return {
    ...merged,
    probation_stage: stageInfo.stage,
    probation_severity: stageInfo.severity,
    probation_next_due: stageInfo.nextDue,
    probation_next_milestone: stageInfo.nextMilestone,
    _stageInfo: stageInfo,
  };
}

export function OfficialLettersPage() {
  const { user } = useAuth();
  const [pageTab, setPageTab] = useState(OFFICIAL_TAB);
  const [rows, setRows] = useState([]);
  const [reviewsByEmployee, setReviewsByEmployee] = useState(() => new Map());
  const [letterTypesByEmployee, setLetterTypesByEmployee] = useState(() => new Map());
  const [lettersThisMonth, setLettersThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tablesMissing, setTablesMissing] = useState(false);

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [employmentType, setEmploymentType] = useState("");
  const [probationFilter, setProbationFilter] = useState("all");
  const [issuedLetterType, setIssuedLetterType] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const [personalLetters, setPersonalLetters] = useState([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [personalMissing, setPersonalMissing] = useState(false);
  const [personalKindFilter, setPersonalKindFilter] = useState("");
  const [personalSearch, setPersonalSearch] = useState("");
  const [generatingPersonal, setGeneratingPersonal] = useState(false);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);
  const [cardPreviewUrl, setCardPreviewUrl] = useState("");
  const [cardPreviewTitle, setCardPreviewTitle] = useState("");
  const [cardPreviewId, setCardPreviewId] = useState("");
  const [cardPreviewLoading, setCardPreviewLoading] = useState(false);
  const [cardPreviewError, setCardPreviewError] = useState("");
  const [employeePersonalLetters, setEmployeePersonalLetters] = useState([]);
  const cardPreviewAbortRef = React.useRef(null);

  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [letterForm, setLetterForm] = useState(() => emptyLetterForm());
  const [savingLetter, setSavingLetter] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Letter preview");
  const [previewLetterType, setPreviewLetterType] = useState("");
  const previewFrameRef = React.useRef(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState(() => emptyReviewForm("m2", ""));
  const [savingReview, setSavingReview] = useState(false);

  const enrichEmployees = useCallback((employees, reviewRows, letterRows) => {
    const reviewsMap = new Map();
    for (const r of reviewRows || []) {
      const key = String(r.employee_master_id);
      const bucket = reviewsMap.get(key) || {};
      bucket[r.milestone] = r;
      reviewsMap.set(key, bucket);
    }
    const typesMap = new Map();
    for (const l of letterRows || []) {
      const key = String(l.employee_master_id);
      const set = typesMap.get(key) || new Set();
      set.add(l.letter_type);
      typesMap.set(key, set);
    }
    setReviewsByEmployee(reviewsMap);
    setLetterTypesByEmployee(typesMap);
    setLettersThisMonth(lettersIssuedThisMonthCount(letterRows));

    return (employees || []).map((emp) => {
      const stageInfo = deriveProbationStage(emp, reviewsMap.get(String(emp.id)) || {});
      return {
        ...emp,
        probation_stage: stageInfo.stage,
        probation_severity: stageInfo.severity,
        probation_next_due: stageInfo.nextDue,
        probation_next_milestone: stageInfo.nextMilestone,
        _stageInfo: stageInfo,
      };
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const employees = await fetchOfficialLetterEmployees();
      let reviewRows = [];
      let letterRows = [];
      try {
        const ids = employees.map((e) => e.id);
        [reviewRows, letterRows] = await Promise.all([
          fetchReviewsForEmployees(ids),
          fetchLettersForEmployees(ids),
        ]);
        setTablesMissing(false);
      } catch (relErr) {
        if (isMissingOfficialLettersTableError(relErr)) {
          setTablesMissing(true);
        } else {
          throw relErr;
        }
      }
      setRows(enrichEmployees(employees, reviewRows, letterRows));
    } catch (err) {
      console.error(err);
      setError(friendlyOfficialLettersError(err, "Could not load employees."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enrichEmployees]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPersonalLetters = useCallback(async () => {
    setPersonalLoading(true);
    try {
      const list = await fetchPersonalLetters();
      setPersonalLetters(list);
      setPersonalMissing(false);
    } catch (err) {
      console.error(err);
      if (isMissingPersonalLettersTableError(err)) {
        setPersonalMissing(true);
        setPersonalLetters([]);
      } else {
        toast.error(friendlyPersonalLettersError(err, "Could not load personal letters."));
      }
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageTab === PERSONAL_TAB) loadPersonalLetters();
  }, [pageTab, loadPersonalLetters]);

  useEffect(() => {
    return () => {
      if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl);
      cardPreviewAbortRef.current?.abort?.();
    };
  }, [cardPreviewUrl]);

  const closeCardPreview = useCallback(() => {
    cardPreviewAbortRef.current?.abort?.();
    cardPreviewAbortRef.current = null;
    setCardPreviewOpen(false);
    setCardPreviewLoading(false);
    setCardPreviewError("");
    setCardPreviewTitle("");
    setCardPreviewId("");
    setCardPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  }, []);

  const employeeById = useMemo(() => {
    const map = new Map();
    for (const e of rows) map.set(String(e.id), e);
    return map;
  }, [rows]);

  const filteredPersonalLetters = useMemo(() => {
    const q = personalSearch.trim().toLowerCase();
    return (personalLetters || []).filter((row) => {
      if (personalKindFilter && row.letter_kind !== personalKindFilter) return false;
      if (!q) return true;
      const emp = employeeById.get(String(row.employee_master_id));
      const hay = [
        row.employee_full_name,
        row.subject,
        emp?.employee_code,
        emp?.department,
        emp?.designation,
        personalLetterKindLabel(row.letter_kind),
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [personalLetters, personalKindFilter, personalSearch, employeeById]);

  const personalKpiBirthday = useMemo(
    () => personalLetters.filter((r) => r.letter_kind === "birthday").length,
    [personalLetters]
  );
  const personalKpiAnniversary = useMemo(
    () => personalLetters.filter((r) => r.letter_kind === "anniversary").length,
    [personalLetters]
  );
  const personalKpiToday = useMemo(() => {
    // Match server occasion_date (IST calendar day), not the browser's local date.
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: ERP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return personalLetters.filter((r) => r.occasion_date === iso).length;
  }, [personalLetters]);

  const openPersonalCard = async (row, { download = false } = {}) => {
    const title = row.subject || personalLetterKindLabel(row.letter_kind);
    const fileName = row.file_name || `${row.employee_full_name || "card"}.jpg`;

    if (download) {
      try {
        const url = await fetchPersonalLetterImageBlobUrl(row.id, { download: true });
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        toast.success("Download started");
      } catch (err) {
        console.error(err);
        toast.error(friendlyPersonalLettersError(err, "Could not download the greeting card."));
      }
      return;
    }

    // Open popup immediately so production feels responsive while the image loads.
    cardPreviewAbortRef.current?.abort?.();
    const controller = new AbortController();
    cardPreviewAbortRef.current = controller;
    setCardPreviewOpen(true);
    setCardPreviewLoading(true);
    setCardPreviewError("");
    setCardPreviewTitle(title);
    setCardPreviewId(row.id);
    setCardPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });

    try {
      const url = await fetchPersonalLetterImageBlobUrl(row.id, { signal: controller.signal });
      if (controller.signal.aborted) {
        URL.revokeObjectURL(url);
        return;
      }
      setCardPreviewUrl(url);
      setCardPreviewLoading(false);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
      const message = friendlyPersonalLettersError(err, "Could not open the greeting card.");
      setCardPreviewLoading(false);
      setCardPreviewError(message);
      toast.error(message);
    }
  };

  const handleGeneratePersonalToday = async () => {
    setGeneratingPersonal(true);
    try {
      const out = await runPersonalLettersGeneration();
      const created = Number(out.created || 0);
      const skipped = Number(out.skipped || 0);
      const failed = Number(out.failed || 0);
      const matched =
        Number(out.birthdayCount || 0) + Number(out.anniversaryCount || 0);
      if (created) {
        toast.success(
          `Generated ${created} personal letter${created === 1 ? "" : "s"} for ${out.occasionDate || "today"}.`
        );
      } else if (skipped) {
        toast.info("Today’s birthday and anniversary cards are already generated.");
      } else if (failed && matched) {
        toast.error(
          `Found ${matched} occasion${matched === 1 ? "" : "s"} today but could not create cards. Check the API server logs.`
        );
      } else {
        toast.info("No birthdays or wedding anniversaries fall today.");
      }
      await loadPersonalLetters();
    } catch (err) {
      console.error(err);
      toast.error(friendlyPersonalLettersError(err, "Could not generate today’s cards."));
    } finally {
      setGeneratingPersonal(false);
    }
  };

  const departmentOptions = useMemo(
    () => [{ value: "", label: "All departments" }, ...uniqueSorted(rows.map((r) => r.department)).map((v) => ({ value: v, label: v }))],
    [rows]
  );
  const designationOptions = useMemo(
    () => [{ value: "", label: "All designations" }, ...uniqueSorted(rows.map((r) => r.designation)).map((v) => ({ value: v, label: v }))],
    [rows]
  );
  const employmentTypeOptions = useMemo(
    () => [{ value: "", label: "All employment types" }, ...uniqueSorted(rows.map((r) => r.employment_type)).map((v) => ({ value: v, label: v }))],
    [rows]
  );
  const statusOptions = useMemo(() => {
    const statuses = uniqueSorted(rows.map((r) => r.status));
    const base = [{ value: "", label: "All statuses" }, { value: "Active", label: "Active" }];
    for (const s of statuses) {
      if (s !== "Active" && !base.some((b) => b.value === s)) base.push({ value: s, label: s });
    }
    return base;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && String(row.status || "") !== statusFilter) return false;
      if (department && String(row.department || "") !== department) return false;
      if (designation && String(row.designation || "") !== designation) return false;
      if (employmentType && String(row.employment_type || "") !== employmentType) return false;
      if (!matchesProbationFilter(row._stageInfo, probationFilter)) return false;
      if (issuedLetterType) {
        const set = letterTypesByEmployee.get(String(row.id));
        if (!set?.has(issuedLetterType)) return false;
      }
      if (!q) return true;
      const hay = [row.full_name, row.employee_code, row.department, row.designation, row.probation_stage]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [
    rows,
    search,
    statusFilter,
    department,
    designation,
    employmentType,
    probationFilter,
    issuedLetterType,
    letterTypesByEmployee,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, statusFilter, department, designation, employmentType, probationFilter, issuedLetterType]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const kpiDue = useMemo(
    () => rows.filter((r) => String(r.probation_stage || "").startsWith("Due")).length,
    [rows]
  );
  const kpiOverdue = useMemo(
    () => rows.filter((r) => String(r.probation_stage || "").startsWith("Overdue")).length,
    [rows]
  );
  const kpiConfirmedYear = useMemo(() => confirmedThisYearCount(rows), [rows]);

  const openEmployee = async (row) => {
    setSelected(row);
    setDrawerLoading(true);
    setHistory([]);
    setReviews([]);
    setEmployeePersonalLetters([]);
    try {
      const [letterRows, reviewRows, personalRows] = await Promise.all([
        fetchLettersForEmployee(row.id),
        fetchReviewsForEmployee(row.id),
        fetchPersonalLetters({ employeeMasterId: row.id }).catch((err) => {
          if (isMissingPersonalLettersTableError(err)) {
            setPersonalMissing(true);
            return [];
          }
          throw err;
        }),
      ]);
      setHistory(letterRows);
      setReviews(reviewRows);
      setEmployeePersonalLetters(personalRows);
    } catch (err) {
      console.error(err);
      if (isMissingOfficialLettersTableError(err)) {
        setTablesMissing(true);
        toast.warning(friendlyOfficialLettersError(err));
      } else {
        toast.error(friendlyOfficialLettersError(err, "Could not load employee letters."));
      }
    } finally {
      setDrawerLoading(false);
    }
  };

  const reviewByMilestone = useMemo(() => {
    const map = {};
    for (const r of reviews) map[r.milestone] = r;
    return map;
  }, [reviews]);

  const schedule = useMemo(
    () => buildProbationSchedule(selected?.date_of_joining),
    [selected?.date_of_joining]
  );

  const selectedIsPermanent = useMemo(
    () => (selected ? isEmployeePermanent(selected) : false),
    [selected]
  );

  const openIssueModal = () => {
    const form = emptyLetterForm();
    form.newDesignation = selected?.designation || "";
    form.subject = "";
    setLetterForm(form);
    setIssueOpen(true);
  };

  const openReviewModal = (milestone, scheduledDate) => {
    const existing = reviewByMilestone[milestone];
    setReviewForm({
      milestone,
      scheduled_date: existing?.scheduled_date || scheduledDate || "",
      held_on: existing?.held_on || new Date().toISOString().slice(0, 10),
      outcome: existing?.outcome && existing.outcome !== "pending" ? existing.outcome : "continue",
      with_appraisal: existing?.with_appraisal === true,
      notes: existing?.notes || "",
    });
    setReviewOpen(true);
  };

  const handlePreviewLetter = (payload) => {
    try {
      const html = buildOfficialLetterHtml(payload);
      setPreviewLetterType(payload?.letterType || "");
      setPreviewTitle(
        `${officialLetterTypeLabel(payload?.letterType)} — ${payload?.employeeName || payload?.fullName || "Letter"}`
      );
      setPreviewHtml(html);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not open preview.");
    }
  };

  const handlePrintPreview = () => {
    const frame = previewFrameRef.current;
    if (!frame?.contentWindow) {
      toast.error("Preview is not ready to print yet.");
      return;
    }
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      console.error(err);
      toast.error("Could not open the print dialog.");
    }
  };

  const handlePrintAnnexure = async () => {
    if (!selected?.id) return;
    try {
      const [structure, versions, empRes] = await Promise.all([
        getSalaryStructure(selected.id),
        fetchRuleVersions(),
        supabase.from("admin_ifsp_employee_master").select("*").eq("id", selected.id).maybeSingle(),
      ]);
      if (!isAnnexureRecord(structure)) {
        toast.warning("No salary breakup yet. Create the CTC on the new salary structure in Employee Master first.");
        return;
      }
      const history = buildCtcHistory(structure);
      const prior = history[1];
      printAnnexure({
        employee: empRes.data || selected,
        record: structure,
        previous: previewLetterType === "promotion" && isAnnexureRecord(prior) ? prior : null,
        ruleVersion: findRuleVersionById(versions, structure.rule_version_id),
        segment: employmentTypeLabel((empRes.data || selected).employment_type),
      });
    } catch (err) {
      console.error("Official letters: Annexure print failed", err);
      toast.error("Could not print the salary breakup.");
    }
  };

  const handleDownloadLetter = async (payload) => {
    try {
      await downloadOfficialLetter(payload);
      toast.success("Letter downloaded.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Could not download letter.");
    }
  };

  const handleSaveAndIssue = async ({ preview, download }) => {
    if (!selected) return;
    if (!letterForm.letterType) {
      toast.warning("Choose a letter type.");
      return;
    }
    setSavingLetter(true);
    try {
      const payload = letterPayloadFromEmployeeAndForm(selected, letterForm);
      if (!payload.subject) {
        payload.subject = officialLetterTypeLabel(payload.letterType);
      }

      const row = await insertOfficialLetter({
        employee_master_id: selected.id,
        letter_type: payload.letterType,
        subject: payload.subject,
        reason: payload.reason || null,
        reference_no: payload.referenceNo || null,
        letter_date: payload.letterDate || null,
        effective_date: payload.effectiveDate || null,
        body_fields: payload,
        created_by: user?.id || null,
      });

      if (payload.letterType === "confirmation" && letterForm.stampConfirmation) {
        try {
          const stamped = await stampEmployeeConfirmationDate(
            selected.id,
            payload.effectiveDate || payload.letterDate,
            { actorEmail: user?.email || null }
          );
          const reviewsMap = reviewsByEmployee.get(String(selected.id)) || {};
          setSelected((prev) =>
            prev ? applyEmployeeMasterPatch(prev, stamped, reviewsMap) : prev
          );
          setRows((prev) =>
            prev.map((r) =>
              r.id === selected.id ? applyEmployeeMasterPatch(r, stamped, reviewsMap) : r
            )
          );
        } catch (stampErr) {
          console.error(stampErr);
          toast.warning("Letter saved, but employee master could not be updated.");
        }
      }

      setHistory((prev) => [row, ...prev]);
      setLetterTypesByEmployee((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(String(selected.id)) || []);
        set.add(payload.letterType);
        next.set(String(selected.id), set);
        return next;
      });
      setLettersThisMonth((n) => n + 1);
      toast.success("Letter saved.");

      setIssueOpen(false);
      if (preview) handlePreviewLetter(payload);
      if (download) await handleDownloadLetter(payload);
    } catch (err) {
      console.error(err);
      toast.error(friendlyOfficialLettersError(err, "Could not save the letter."));
    } finally {
      setSavingLetter(false);
    }
  };

  const handleSaveReview = async () => {
    if (!selected) return;
    setSavingReview(true);
    try {
      const saved = await upsertProbationReview({
        employee_master_id: selected.id,
        milestone: reviewForm.milestone,
        scheduled_date: reviewForm.scheduled_date || null,
        held_on: reviewForm.held_on || null,
        outcome: reviewForm.outcome || "pending",
        with_appraisal: reviewForm.with_appraisal === true,
        notes: reviewForm.notes || null,
        updated_by: user?.id || null,
      });

      const nextReviewsMap = {
        ...(reviewsByEmployee.get(String(selected.id)) || {}),
        [saved.milestone]: saved,
      };

      setReviews((prev) => {
        const others = prev.filter((r) => r.milestone !== saved.milestone);
        return [...others, saved];
      });
      setReviewsByEmployee((prev) => {
        const next = new Map(prev);
        next.set(String(selected.id), nextReviewsMap);
        return next;
      });

      let masterSynced = null;
      try {
        masterSynced = await syncEmployeeMasterFromProbationReviews(
          selected.id,
          nextReviewsMap,
          selected,
          { actorEmail: user?.email || null }
        );
      } catch (syncErr) {
        console.error(syncErr);
        toast.warning("Review saved, but employee master could not be updated.");
      }

      if (masterSynced) {
        setSelected((prev) =>
          prev ? applyEmployeeMasterPatch(prev, masterSynced, nextReviewsMap) : prev
        );
        setRows((prev) =>
          prev.map((r) =>
            r.id === selected.id
              ? applyEmployeeMasterPatch(r, masterSynced, nextReviewsMap)
              : r
          )
        );
      } else {
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== selected.id) return r;
            return applyEmployeeMasterPatch(r, null, nextReviewsMap);
          })
        );
        setSelected((prev) =>
          prev ? applyEmployeeMasterPatch(prev, null, nextReviewsMap) : prev
        );
      }

      toast.success(
        masterSynced
          ? "Probation review saved and employee master updated."
          : "Probation review saved."
      );
      setReviewOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(friendlyOfficialLettersError(err, "Could not save the review."));
    } finally {
      setSavingReview(false);
    }
  };

  const replayLetter = (row) => {
    const payload = {
      ...(row.body_fields || {}),
      letterType: row.letter_type,
      subject: row.subject,
      reason: row.reason,
      referenceNo: row.reference_no,
      letterDate: row.letter_date,
      effectiveDate: row.effective_date,
      employeeCode: selected?.employee_code,
      employeeName: selected?.full_name,
      designation: selected?.designation,
      department: selected?.department,
      dateOfJoining: selected?.date_of_joining,
    };
    return payload;
  };

  const columns = useMemo(
    () => [
      {
        key: "employee_code",
        label: "Code",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => (
          <span className="font-mono text-[11px] tabular-nums">{row.employee_code || "—"}</span>
        ),
      },
      {
        key: "full_name",
        label: "Name",
        headerClassName: COL_NAME,
        cellClassName: COL_NAME,
        render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
      },
      {
        key: "department",
        label: "Department",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => row.department || "—",
      },
      {
        key: "designation",
        label: "Designation",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => row.designation || "—",
      },
      {
        key: "date_of_joining",
        label: "Joined",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        render: (row) => formatDateDdMmYyyy(row.date_of_joining) || "—",
      },
      {
        key: "probation_stage",
        label: "Probation",
        headerClassName: "min-w-[160px]",
        cellClassName: "min-w-[160px]",
        render: (row) => (
          <StatusChip label={row.probation_stage || "N/A"} severity={row.probation_severity || "neutral"} />
        ),
      },
    ],
    []
  );

  const personalColumns = useMemo(
    () => [
      {
        key: "employee_full_name",
        label: "Employee",
        headerClassName: COL_NAME,
        cellClassName: COL_NAME,
        render: (row) => {
          const emp = employeeById.get(String(row.employee_master_id));
          return (
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{row.employee_full_name || emp?.full_name || "—"}</p>
              <p className="text-[11px] text-gray-500 truncate">
                {emp?.employee_code || "—"}
                {emp?.department ? ` · ${emp.department}` : ""}
              </p>
            </div>
          );
        },
      },
      {
        key: "letter_kind",
        label: "Type",
        headerClassName: COL_MIN,
        cellClassName: COL_MIN,
        render: (row) => (
          <StatusChip
            label={personalLetterKindLabel(row.letter_kind)}
            severity={row.letter_kind === "anniversary" ? "info" : "warning"}
          />
        ),
      },
      {
        key: "occasion_date",
        label: "Occasion",
        headerClassName: COL_DATE,
        cellClassName: COL_DATE,
        render: (row) => formatDateDdMmYyyy(row.occasion_date) || "—",
      },
      {
        key: "subject",
        label: "Subject",
        headerClassName: "min-w-[220px]",
        cellClassName: "min-w-[220px]",
        render: (row) => row.subject || "—",
      },
      {
        key: "actions",
        label: "",
        headerClassName: "min-w-[150px]",
        cellClassName: "min-w-[150px]",
        render: (row) => (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openPersonalCard(row)}
              className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
            >
              View card
            </button>
            <button
              type="button"
              onClick={() => openPersonalCard(row, { download: true })}
              className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
            >
              Download
            </button>
          </div>
        ),
      },
    ],
    [employeeById]
  );

  return (
    <div className="space-y-4 p-3 sm:p-4 max-w-[1680px] mx-auto min-w-0">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 border border-sky-100">
          <ScrollText className="h-5 w-5 text-sky-700" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTaskHeader
            title="Official Letters"
            subtitle={
              pageTab === PERSONAL_TAB
                ? "Birthday and wedding-anniversary greeting cards are created automatically at 8:00 AM IST for employees whose occasion falls that day."
                : "Issue warning, show-cause, appointment, experience, confirmation, promotion and other letters. Track probation reviews at 2, 4 and 5.5 months."
            }
          >
            {pageTab === PERSONAL_TAB ? (
              <>
                <button
                  type="button"
                  onClick={handleGeneratePersonalToday}
                  disabled={generatingPersonal || personalMissing}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Gift className={`w-3.5 h-3.5 ${generatingPersonal ? "animate-pulse" : ""}`} />
                  {generatingPersonal ? "Generating…" : "Generate today’s cards"}
                </button>
                <button
                  type="button"
                  onClick={loadPersonalLetters}
                  disabled={personalLoading}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${personalLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </PageTaskHeader>
          <CollapsibleHelp label="how this works">
            {pageTab === PERSONAL_TAB ? (
              <ul className="list-disc pl-4 space-y-1">
                <li>Each morning at 8:00 AM IST, cards are created for employees with a birthday or wedding anniversary that day.</li>
                <li>Employee full name from Employee Master replaces the name placeholder on the Indus greeting template.</li>
                <li>Cards appear here under Personal Letters and against the employee when you open their profile.</li>
                <li>Use Generate today’s cards if the server was offline at 8:00 AM or you need to re-check today’s occasions.</li>
              </ul>
            ) : (
              <ul className="list-disc pl-4 space-y-1">
                <li>Select an employee to open letters and probation reviews.</li>
                <li>Probation milestones are calculated from date of joining (2 months, 4 months, 5.5 months).</li>
                <li>Mark a review as held, optionally with appraisal, and choose the outcome.</li>
                <li>
                  Review outcomes update Employee Master — confirm → Permanent, continue/extend → Probation,
                  exit → Inactive (latest logged milestone wins).
                </li>
                <li>
                  Permanent employees (Employee Master) skip probation logging; confirmation date is shown when set.
                </li>
                <li>
                  Letter history shows Indus One acknowledgment status when the employee agrees and signs there.
                </li>
                <li>Confirmation letters can also update confirmation date and employment type on the master record.</li>
                <li>Preview shows the letter in-app (Print from there). Download saves a Word document you can replace with company templates later.</li>
              </ul>
            )}
          </CollapsibleHelp>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === OFFICIAL_TAB}
          className={pageTabClass(pageTab === OFFICIAL_TAB)}
          onClick={() => setPageTab(OFFICIAL_TAB)}
        >
          <ScrollText className="h-4 w-4 shrink-0" />
          Official letters
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === PERSONAL_TAB}
          className={pageTabClass(pageTab === PERSONAL_TAB)}
          onClick={() => setPageTab(PERSONAL_TAB)}
        >
          <Heart className="h-4 w-4 shrink-0" />
          Personal letters
        </button>
      </div>

      {pageTab === OFFICIAL_TAB && tablesMissing ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Letter history and probation logs need a database update. You can still browse employees; saving letters will work after IT applies the Official Letters migration.
        </p>
      ) : null}

      {pageTab === PERSONAL_TAB && personalMissing ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Personal Letters needs a database update. Ask IT to apply the latest migration, then use Generate today’s cards.
        </p>
      ) : null}

      {pageTab === OFFICIAL_TAB ? (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="Due reviews" value={String(kpiDue)} />
        <KpiTile label="Overdue" value={String(kpiOverdue)} />
        <KpiTile label="Confirmed this year" value={String(kpiConfirmedYear)} />
        <KpiTile label="Letters this month" value={String(lettersThisMonth)} />
      </div>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiTile label="Birthday cards" value={String(personalKpiBirthday)} />
        <KpiTile label="Anniversary cards" value={String(personalKpiAnniversary)} />
        <KpiTile label="Created today" value={String(personalKpiToday)} />
      </div>
      )}

      {pageTab === PERSONAL_TAB ? (
      <SectionCard title={`Personal letters (${filteredPersonalLetters.length})`}>
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[180px]">
            Search
            <TinyInput
              value={personalSearch}
              onChange={(e) => setPersonalSearch(e.target.value)}
              placeholder="Name, code, department…"
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Type
            <TinySelect value={personalKindFilter} onChange={(e) => setPersonalKindFilter(e.target.value)}>
              <option value="">All types</option>
              <option value="birthday">Birthday</option>
              <option value="anniversary">Wedding anniversary</option>
            </TinySelect>
          </label>
        </FilterBar>
        <div className="mt-3">
          {personalLoading ? (
            <p className="text-sm text-ink-secondary py-6 text-center">Loading personal letters…</p>
          ) : filteredPersonalLetters.length === 0 ? (
            <p className="text-xs text-gray-500 py-8 text-center border border-gray-200 rounded-lg">
              No personal letters yet. Cards are created at 8:00 AM IST on each birthday or wedding anniversary, or use Generate today’s cards.
            </p>
          ) : (
            <DenseTable
              columns={personalColumns}
              rows={filteredPersonalLetters}
              onRowClick={(row) => {
                const emp = employeeById.get(String(row.employee_master_id));
                if (emp) openEmployee(emp);
                else openPersonalCard(row);
              }}
            />
          )}
        </div>
      </SectionCard>
      ) : (
      <SectionCard title={`Employee register (${filteredRows.length})`}>
        <FilterBar>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5 flex-1 min-w-[180px]">
            Search
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, name, dept, designation…"
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Status
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {statusOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Department
            <TinySelect value={department} onChange={(e) => setDepartment(e.target.value)}>
              {departmentOptions.map((o) => (
                <option key={o.value || "all-dept"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Designation
            <TinySelect value={designation} onChange={(e) => setDesignation(e.target.value)}>
              {designationOptions.map((o) => (
                <option key={o.value || "all-desig"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Employment
            <TinySelect value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              {employmentTypeOptions.map((o) => (
                <option key={o.value || "all-emp"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Probation
            <TinySelect value={probationFilter} onChange={(e) => setProbationFilter(e.target.value)}>
              {PROBATION_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Letter issued
            <TinySelect value={issuedLetterType} onChange={(e) => setIssuedLetterType(e.target.value)}>
              <option value="">Any letter issued</option>
              {OFFICIAL_LETTER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  Has {t.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-[11px] text-gray-600 flex flex-col gap-0.5">
            Rows
            <TinySelect value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </TinySelect>
          </label>
        </FilterBar>

        {error ? (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-ink-secondary py-6 text-center">Loading employees…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-xs text-gray-500 py-8 text-center border border-gray-200 rounded-lg">
              No employees match these filters.
            </p>
          ) : (
            <DenseTable columns={columns} rows={pageRows} onRowClick={openEmployee} />
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-secondary">
          <span>
            Showing {filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </SectionCard>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.full_name || "Employee"}
        widthClass="max-w-xl"
      >
        {selected ? (
          <div className="space-y-4">
            <p className="text-[11px] text-ink-secondary -mt-1">
              {selected.employee_code || "—"} · {selected.department || "—"} · {selected.designation || "—"}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedIsPermanent ? (
                <StatusChip label="Permanent" severity="info" />
              ) : (
                <StatusChip
                  label={selected.probation_stage || "N/A"}
                  severity={selected.probation_severity || "neutral"}
                />
              )}
              {selected.confirmation_date ? (
                <StatusChip
                  label={`Confirmed ${formatDateDdMmYyyy(selected.confirmation_date)}`}
                  severity="info"
                />
              ) : null}
              {selected.employment_type && !selectedIsPermanent ? (
                <StatusChip label={selected.employment_type} severity="neutral" />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-ink-muted">Date of joining</p>
                <p className="font-medium">{formatDateDdMmYyyy(selected.date_of_joining) || "—"}</p>
              </div>
              <div>
                <p className="text-ink-muted">Status</p>
                <p className="font-medium">{selected.status || "—"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openIssueModal}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90"
              >
                <FileText className="w-3.5 h-3.5" />
                Issue letter
              </button>
            </div>

            <SectionCard title="Probation reviews">
              {drawerLoading ? (
                <p className="text-xs text-ink-secondary">Loading…</p>
              ) : selectedIsPermanent ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50/90 px-3 py-3 text-gray-500">
                  <p className="text-xs font-medium text-gray-600">Employee is permanent — probation reviews not required.</p>
                  <p className="text-xs mt-2">
                    <span className="text-gray-500">Confirmation date: </span>
                    <span className="font-medium text-gray-700">
                      {formatDateDdMmYyyy(selected.confirmation_date) || ""}
                    </span>
                  </p>
                  {schedule.length > 0 ? (
                    <ul className="mt-3 divide-y divide-gray-200/70 opacity-60 pointer-events-none select-none">
                      {schedule.map((item) => {
                        const existing = reviewByMilestone[item.milestone];
                        const milestoneMeta = PROBATION_MILESTONES.find((m) => m.key === item.milestone);
                        return (
                          <li key={item.milestone} className="py-2 first:pt-0">
                            <p className="text-sm font-medium text-gray-700">{milestoneMeta?.label || item.label}</p>
                            <p className="text-[11px] text-gray-500">
                              Due {formatDateDdMmYyyy(item.scheduled_date) || "—"}
                              {existing?.held_on ? ` · Held ${formatDateDdMmYyyy(existing.held_on)}` : ""}
                              {existing?.outcome && existing.outcome !== "pending"
                                ? ` · ${OUTCOME_OPTIONS.find((o) => o.value === existing.outcome)?.label || existing.outcome}`
                                : ""}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : schedule.length === 0 ? (
                <p className="text-xs text-ink-secondary">Add a date of joining to schedule probation reviews.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {schedule.map((item) => {
                    const existing = reviewByMilestone[item.milestone];
                    const milestoneMeta = PROBATION_MILESTONES.find((m) => m.key === item.milestone);
                    return (
                      <li key={item.milestone} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{milestoneMeta?.label || item.label}</p>
                          <p className="text-[11px] text-gray-500">
                            Due {formatDateDdMmYyyy(item.scheduled_date) || "—"}
                            {existing?.held_on ? ` · Held ${formatDateDdMmYyyy(existing.held_on)}` : ""}
                            {existing?.with_appraisal ? " · With appraisal" : ""}
                            {existing?.outcome && existing.outcome !== "pending"
                              ? ` · ${OUTCOME_OPTIONS.find((o) => o.value === existing.outcome)?.label || existing.outcome}`
                              : " · Not logged"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openReviewModal(item.milestone, item.scheduled_date)}
                          className="h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium hover:bg-gray-50"
                        >
                          {existing ? "Update" : "Log review"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Personal letters">
              {drawerLoading ? (
                <p className="text-xs text-ink-secondary">Loading…</p>
              ) : employeePersonalLetters.length === 0 ? (
                <p className="text-xs text-ink-secondary">
                  No birthday or anniversary cards yet for this employee.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {employeePersonalLetters.map((row) => (
                    <li key={row.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {row.subject || personalLetterKindLabel(row.letter_kind)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {personalLetterKindLabel(row.letter_kind)}
                          {row.occasion_date ? ` · ${formatDateDdMmYyyy(row.occasion_date)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPersonalCard(row)}
                          className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
                        >
                          View card
                        </button>
                        <button
                          type="button"
                          onClick={() => openPersonalCard(row, { download: true })}
                          className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
                        >
                          Download
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Letter history">
              {drawerLoading ? (
                <p className="text-xs text-ink-secondary">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-ink-secondary">No letters issued yet for this employee.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {history.map((row) => {
                    const acknowledged = isOfficialLetterAcknowledged(row);
                    return (
                      <li key={row.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {row.subject || officialLetterTypeLabel(row.letter_type)}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {officialLetterTypeLabel(row.letter_type)}
                            {row.letter_date ? ` · ${formatDateDdMmYyyy(row.letter_date)}` : ""}
                            {row.reference_no ? ` · Ref ${row.reference_no}` : ""}
                            {acknowledged && row.acknowledged_at
                              ? ` · Acknowledged ${formatDateDdMmYyyy(row.acknowledged_at)}`
                              : " · Awaiting acknowledgment on Indus One"}
                            {acknowledged && row.acknowledged_name
                              ? ` · Signed ${row.acknowledged_name}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusChip
                            label={officialLetterAckStatusLabel(row)}
                            severity={acknowledged ? "info" : "warning"}
                          />
                          <button
                            type="button"
                            onClick={() => handlePreviewLetter(replayLetter(row))}
                            className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadLetter(replayLetter(row))}
                            className="h-7 px-2 rounded-lg border border-gray-200 text-[11px] hover:bg-gray-50"
                          >
                            DOCX
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={issueOpen}
        onClose={() => !savingLetter && setIssueOpen(false)}
        title="Issue official letter"
        widthClass="max-w-lg"
      >
        <div className="space-y-3">
          {selected ? (
            <p className="text-[11px] text-ink-secondary">
              {selected.full_name} ({selected.employee_code || "—"})
            </p>
          ) : null}
          <label className="block text-xs">
            <span className="text-ink-muted">Letter type</span>
            <select
              className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
              value={letterForm.letterType}
              onChange={(e) => setLetterForm((f) => ({ ...f, letterType: e.target.value }))}
            >
              {OFFICIAL_LETTER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-ink-muted">Subject</span>
            <input
              className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
              value={letterForm.subject}
              onChange={(e) => setLetterForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder={officialLetterTypeLabel(letterForm.letterType)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-ink-muted">Letter date</span>
              <input
                type="date"
                className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
                value={letterForm.letterDate}
                onChange={(e) => setLetterForm((f) => ({ ...f, letterDate: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              <span className="text-ink-muted">Effective date</span>
              <input
                type="date"
                className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
                value={letterForm.effectiveDate}
                onChange={(e) => setLetterForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-ink-muted">Reference no.</span>
            <input
              className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
              value={letterForm.referenceNo}
              onChange={(e) => setLetterForm((f) => ({ ...f, referenceNo: e.target.value }))}
            />
          </label>
          {letterForm.letterType === "promotion" ? (
            <label className="block text-xs">
              <span className="text-ink-muted">New designation</span>
              <input
                className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
                value={letterForm.newDesignation}
                onChange={(e) => setLetterForm((f) => ({ ...f, newDesignation: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="block text-xs">
            <span className="text-ink-muted">Reason / particulars</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm min-h-[64px]"
              value={letterForm.reason}
              onChange={(e) => setLetterForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            <span className="text-ink-muted">Custom body (optional — leave blank for standard wording)</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm min-h-[80px]"
              value={letterForm.letterBody}
              onChange={(e) => setLetterForm((f) => ({ ...f, letterBody: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            <span className="text-ink-muted">Internal notes</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm min-h-[48px]"
              value={letterForm.notes}
              onChange={(e) => setLetterForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          {letterForm.letterType === "confirmation" ? (
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={letterForm.stampConfirmation}
                onChange={(e) => setLetterForm((f) => ({ ...f, stampConfirmation: e.target.checked }))}
              />
              Update confirmation date on employee master
            </label>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={savingLetter}
              onClick={() => setIssueOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingLetter}
              onClick={() =>
                handlePreviewLetter(letterPayloadFromEmployeeAndForm(selected, letterForm))
              }
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium"
            >
              Preview only
            </button>
            <button
              type="button"
              disabled={savingLetter}
              onClick={() => handleSaveAndIssue({ preview: true, download: false })}
              className="h-8 px-3 rounded-lg border border-accent-border bg-accent-soft text-xs font-medium"
            >
              {savingLetter ? "Saving…" : "Save & preview"}
            </button>
            <button
              type="button"
              disabled={savingLetter}
              onClick={() => handleSaveAndIssue({ preview: false, download: true })}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium"
            >
              {savingLetter ? "Saving…" : "Save & download"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewHtml)}
        onClose={() => setPreviewHtml("")}
        title={previewTitle}
        widthClass="max-w-3xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setPreviewHtml("")}
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium"
            >
              Close
            </button>
            {ANNEXURE_LETTER_TYPES.has(previewLetterType) && selected ? (
              <button
                type="button"
                onClick={handlePrintAnnexure}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium"
              >
                Print Annexure-I
              </button>
            ) : null}
            <button
              type="button"
              onClick={handlePrintPreview}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium"
            >
              Print
            </button>
          </div>
        }
      >
        <iframe
          ref={previewFrameRef}
          title="Official letter preview"
          srcDoc={previewHtml}
          className="w-full h-[min(70vh,720px)] rounded-lg border border-gray-200 bg-white"
        />
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => !savingReview && setReviewOpen(false)}
        title="Log probation review"
        widthClass="max-w-md"
      >
        <div className="space-y-3">
          <p className="text-[11px] text-ink-secondary">
            {PROBATION_MILESTONES.find((m) => m.key === reviewForm.milestone)?.label || reviewForm.milestone}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-ink-muted">Scheduled date</span>
              <input
                type="date"
                className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
                value={reviewForm.scheduled_date}
                onChange={(e) => setReviewForm((f) => ({ ...f, scheduled_date: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              <span className="text-ink-muted">Held on</span>
              <input
                type="date"
                className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
                value={reviewForm.held_on}
                onChange={(e) => setReviewForm((f) => ({ ...f, held_on: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-ink-muted">Outcome</span>
            <select
              className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm"
              value={reviewForm.outcome}
              onChange={(e) => setReviewForm((f) => ({ ...f, outcome: e.target.value }))}
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={reviewForm.with_appraisal}
              onChange={(e) => setReviewForm((f) => ({ ...f, with_appraisal: e.target.checked }))}
            />
            Meeting included appraisal
          </label>
          <label className="block text-xs">
            <span className="text-ink-muted">Notes</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm min-h-[72px]"
              value={reviewForm.notes}
              onChange={(e) => setReviewForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={savingReview}
              onClick={() => setReviewOpen(false)}
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingReview}
              onClick={handleSaveReview}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium"
            >
              {savingReview ? "Saving…" : "Save review"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={cardPreviewOpen}
        onClose={closeCardPreview}
        title={cardPreviewTitle || "Greeting card"}
        widthClass="max-w-3xl"
      >
        <div className="space-y-3">
          {cardPreviewLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-ink-secondary">
              <RefreshCw className="h-5 w-5 animate-spin text-accent" />
              <p>Loading greeting card…</p>
            </div>
          ) : null}
          {cardPreviewError && !cardPreviewLoading ? (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{cardPreviewError}</p>
          ) : null}
          {cardPreviewUrl && !cardPreviewLoading ? (
            <img
              src={cardPreviewUrl}
              alt={cardPreviewTitle || "Greeting card"}
              className="w-full h-auto max-h-[70vh] object-contain rounded-lg border border-gray-200 bg-white"
            />
          ) : null}
          <div className="flex justify-end gap-2">
            {cardPreviewId && !cardPreviewLoading ? (
              <button
                type="button"
                onClick={() =>
                  openPersonalCard(
                    {
                      id: cardPreviewId,
                      subject: cardPreviewTitle,
                      file_name: `${String(cardPreviewTitle || "card").replace(/[^\w.\- ]+/g, "_")}.jpg`,
                      employee_full_name: cardPreviewTitle,
                    },
                    { download: true }
                  )
                }
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium hover:bg-gray-50"
              >
                Download
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeCardPreview}
              className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default OfficialLettersPage;
