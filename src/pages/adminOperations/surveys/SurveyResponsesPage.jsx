/** Survey Management — assignment progress, per-question stats and individual responses. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, MessageSquare, RefreshCw } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
  KpiTile,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  LoadingBlock,
  InlineAlert,
  Breadcrumbs,
} from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import { describeAssignmentSync, getSurvey, publishSurvey } from "../../../lib/adminSurveysApi";
import { RATING_MAX, RATING_MIN, formatAnswer, surveyKindLabel } from "../../../../shared/surveyModel.mjs";

const ASSIGNMENT_CHIP = {
  pending: { label: "Not started", severity: "neutral" },
  in_progress: { label: "In progress", severity: "warning" },
  completed: { label: "Completed", severity: "info" },
};

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, header, rows) {
  const content = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Bar({ value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

function QuestionStats({ stat, index }) {
  const typeLabel = {
    rating: "Rating",
    single_choice: "Single choice",
    multi_choice: "Multiple choice",
    short_text: "Short text",
    long_text: "Long text",
  }[stat.type];
  let body = null;
  if (stat.type === "rating") {
    const max = Math.max(0, ...Object.values(stat.distribution || {}));
    body = (
      <div className="space-y-1.5">
        <p className="text-xs text-ink">
          Average{" "}
          <span className="type-figure text-ink-strong">{stat.average == null ? "—" : stat.average.toFixed(2)}</span>
          <span className="text-ink-muted"> / {RATING_MAX}</span>
        </p>
        {Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MAX - i).map((n) => (
          <div key={n} className="grid grid-cols-[2rem_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className="text-ink-muted">{n}★</span>
            <Bar value={stat.distribution?.[n] || 0} max={max} />
            <span className="text-right tabular-nums text-ink-secondary">{stat.distribution?.[n] || 0}</span>
          </div>
        ))}
      </div>
    );
  } else if (stat.counts) {
    const entries = Object.entries(stat.counts);
    const max = Math.max(0, ...entries.map(([, c]) => c));
    body = (
      <div className="space-y-1.5">
        {entries.map(([option, count]) => (
          <div key={option} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className="truncate text-ink-secondary" title={option}>
              {option}
            </span>
            <Bar value={count} max={max} />
            <span className="text-right tabular-nums text-ink-secondary">{count}</span>
          </div>
        ))}
      </div>
    );
  } else {
    body = <p className="text-[11px] text-ink-muted">Free-text answers — see individual responses.</p>;
  }
  return (
    <div className="rounded-card border border-border bg-surface p-3 space-y-2">
      <div>
        <p className="text-xs font-medium text-ink-strong">
          Q{index + 1}. {stat.label}
        </p>
        <p className="text-[11px] text-ink-muted">
          {typeLabel} · {stat.answered} answer{stat.answered === 1 ? "" : "s"}
        </p>
      </div>
      {body}
    </div>
  );
}

export default function SurveyResponsesPage() {
  const { surveyId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("responses");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openResponse, setOpenResponse] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setData(await getSurvey(surveyId));
    } catch (err) {
      setLoadError(err?.message || "Could not load survey.");
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const survey = data?.survey;
  const questions = useMemo(() => survey?.questions || [], [survey]);
  const anonymous = Boolean(survey?.anonymous);
  const summary = data?.summary || { assigned: 0, completed: 0, pending: 0, started: 0, completion_pct: 0 };

  const assignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.assignments || []).filter((a) => {
      if (assignmentFilter === "open" && a.status === "completed") return false;
      if (assignmentFilter !== "all" && assignmentFilter !== "open" && a.status !== assignmentFilter) return false;
      if (q && !`${a.employee_code} ${a.full_name} ${a.department} ${a.site}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, assignmentFilter, search]);

  const responses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || anonymous) return data?.responses || [];
    return (data?.responses || []).filter((r) =>
      `${r.employee_code} ${r.full_name} ${r.department}`.toLowerCase().includes(q)
    );
  }, [data, search, anonymous]);

  const exportCsv = () => {
    const identity = anonymous ? ["Submitted on"] : ["Employee code", "Name", "Department", "Submitted at"];
    const header = [...identity, ...questions.map((q, i) => `Q${i + 1}. ${q.label}`)];
    const rows = (data?.responses || []).map((r) => [
      ...(anonymous
        ? [formatDateDdMmYyyy(r.submitted_on)]
        : [r.employee_code, r.full_name, r.department, formatDateTimeDdMmYyyy(r.submitted_at)]),
      ...questions.map((q) => formatAnswer(q, r.answers?.[q.id])),
    ]);
    const slug = String(survey?.title || "survey").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    downloadCsv(`${slug || "survey"}-responses.csv`, header, rows);
    toast.success("Export started", `${rows.length} response(s)`);
  };

  const publishNow = async () => {
    setPublishing(true);
    try {
      const out = await publishSurvey(surveyId);
      toast.success("Survey published", describeAssignmentSync(out.assignment));
      await load();
    } catch (err) {
      toast.error("Could not publish", err?.message || "");
    } finally {
      setPublishing(false);
    }
  };

  if (loading && !data) return <LoadingBlock rows={8} />;
  if (!survey) {
    return (
      <div className="space-y-4">
        <InlineAlert>{loadError || "Survey not found."}</InlineAlert>
        <SecondaryButton onClick={() => navigate("/app/admin/employee/surveys")}>Back to surveys</SecondaryButton>
      </div>
    );
  }

  const firstPreviewQuestion = questions.find((q) => q.type !== "long_text") || questions[0];

  const responseColumns = [
    ...(anonymous
      ? [{ key: "submitted_on", label: "Submitted on", render: (r) => formatDateDdMmYyyy(r.submitted_on) }]
      : [
          { key: "employee_code", label: "Code", cellClassName: "font-mono" },
          { key: "full_name", label: "Employee", render: (r) => r.full_name || "—" },
          { key: "department", label: "Department", render: (r) => r.department || "—" },
          { key: "submitted_at", label: "Submitted", render: (r) => formatDateTimeDdMmYyyy(r.submitted_at) },
        ]),
    {
      key: "preview",
      label: firstPreviewQuestion ? `Q${questions.indexOf(firstPreviewQuestion) + 1} answer` : "Answers",
      render: (r) => (
        <span className="block max-w-[320px] truncate text-ink-secondary">
          {firstPreviewQuestion ? formatAnswer(firstPreviewQuestion, r.answers?.[firstPreviewQuestion.id]) || "—" : "—"}
        </span>
      ),
    },
    {
      key: "open",
      label: "",
      render: (r) => (
        <button
          type="button"
          className="text-[11px] font-medium text-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setOpenResponse(r);
          }}
        >
          View
        </button>
      ),
    },
  ];

  const assignmentColumns = [
    { key: "employee_code", label: "Code", cellClassName: "font-mono" },
    { key: "full_name", label: "Employee", render: (a) => a.full_name || "—" },
    { key: "department", label: "Department", render: (a) => a.department || "—" },
    { key: "site", label: "Site", render: (a) => a.site || "—" },
    {
      key: "status",
      label: "Status",
      render: (a) => {
        const chip = ASSIGNMENT_CHIP[a.status] || ASSIGNMENT_CHIP.pending;
        return <StatusChip label={chip.label} severity={chip.severity} />;
      },
    },
    { key: "assigned_at", label: "Assigned", render: (a) => formatDateDdMmYyyy(a.assigned_at) },
    { key: "completed_at", label: "Completed", render: (a) => (a.completed_at ? formatDateTimeDdMmYyyy(a.completed_at) : "—") },
  ];

  const tabBtn = (key, label) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-control px-3 py-1.5 text-xs font-medium ${
        tab === key ? "bg-accent-soft text-accent" : "text-ink-secondary hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Surveys", path: "/app/admin/employee/surveys" }, { label: survey.title }]} />
      <PageTaskHeader
        title={survey.title}
        subtitle={[
          surveyKindLabel(survey),
          survey.audience_type === "selected"
            ? `${(survey.audience_employee_codes || []).length} selected employees`
            : "All employees",
          survey.due_date ? `Due ${formatDateDdMmYyyy(survey.due_date)}` : "No due date",
          anonymous ? "Anonymous" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <SecondaryButton onClick={() => void load()} disabled={loading}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </SecondaryButton>
        <SecondaryButton onClick={exportCsv} disabled={!data?.responses?.length}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </SecondaryButton>
        {survey.status !== "archived" ? (
          <SecondaryButton onClick={() => navigate(`/app/admin/employee/surveys/${surveyId}/edit`)}>Edit</SecondaryButton>
        ) : null}
        {survey.status === "draft" && survey.audience_type === "selected" ? (
          <PrimaryButton onClick={() => void publishNow()} disabled={publishing}>
            {publishing ? "Publishing…" : "Publish & assign"}
          </PrimaryButton>
        ) : null}
      </PageTaskHeader>

      <InlineAlert>{loadError}</InlineAlert>
      {survey.status === "draft" ? (
        <InlineAlert tone="info">
          Draft — employees cannot see this survey yet.
          {survey.audience_type === "all" ? " Open Edit and choose Publish & assign to send it to all employees." : ""}
        </InlineAlert>
      ) : null}
      {survey.status === "published" && !survey.is_active ? (
        <InlineAlert tone="warning">Paused — the survey is published but marked inactive, so employees cannot see it.</InlineAlert>
      ) : null}
      {survey.status === "archived" ? <InlineAlert tone="warning">Archived — hidden from employees.</InlineAlert> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Assigned" value={summary.assigned} />
        <KpiTile label="Completed" value={summary.completed} />
        <KpiTile label="Pending" value={summary.pending} sub={summary.started ? `${summary.started} in progress` : undefined} />
        <KpiTile label="Completion" value={`${summary.completion_pct}%`} />
      </div>

      <SectionCard title="Question summary">
        {data?.responses?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data.aggregates || []).map((stat, i) => (
              <QuestionStats key={stat.id} stat={stat} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState icon={MessageSquare} title="No responses yet" message="Stats appear once employees submit the survey in Indus One." />
        )}
      </SectionCard>

      <SectionCard
        title="Details"
        right={
          <div className="flex items-center gap-1">
            {tabBtn("responses", `Responses (${data?.responses?.length || 0})`)}
            {!anonymous ? tabBtn("assignments", `Assignments (${data?.assignments?.length || 0})`) : null}
          </div>
        }
      >
        <div className="space-y-3">
          {!anonymous ? (
            <FilterBar>
              <TinyInput
                type="search"
                placeholder="Search code, name, department"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
                aria-label="Search"
              />
              {tab === "assignments" ? (
                <TinySelect value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} aria-label="Status">
                  <option value="all">All statuses</option>
                  <option value="open">Not completed</option>
                  <option value="pending">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </TinySelect>
              ) : null}
            </FilterBar>
          ) : (
            <p className="text-[11px] text-ink-muted">
              Anonymous survey — employee identity, assignment list and submission times are hidden.
            </p>
          )}

          {tab === "assignments" && !anonymous ? (
            <DenseTable columns={assignmentColumns} rows={assignments} density="comfortable" />
          ) : responses.length ? (
            <DenseTable columns={responseColumns} rows={responses} onRowClick={setOpenResponse} density="comfortable" />
          ) : (
            <EmptyState icon={MessageSquare} title="No responses yet" />
          )}
        </div>
      </SectionCard>

      <Drawer
        open={Boolean(openResponse)}
        title={anonymous ? "Anonymous response" : `${openResponse?.full_name || openResponse?.employee_code || "Response"}`}
        onClose={() => setOpenResponse(null)}
      >
        {openResponse ? (
          <div className="space-y-4">
            <p className="text-[11px] text-ink-muted">
              {anonymous
                ? `Submitted on ${formatDateDdMmYyyy(openResponse.submitted_on)}`
                : `${openResponse.employee_code} · ${openResponse.department || "—"} · ${formatDateTimeDdMmYyyy(openResponse.submitted_at)}`}
            </p>
            {questions.map((q, i) => (
              <div key={q.id}>
                <p className="text-xs font-medium text-ink-strong">
                  Q{i + 1}. {q.label}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-secondary">
                  {formatAnswer(q, openResponse.answers?.[q.id]) || "—"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
