/** Survey Management — list of survey campaigns assigned to employees in Indus One. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, RefreshCw } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Modal,
  KpiTile,
  CollapsibleHelp,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  LoadingBlock,
  InlineAlert,
} from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  archiveSurvey,
  deleteSurvey,
  describeAssignmentSync,
  duplicateSurvey,
  listSurveys,
  publishSurvey,
  setSurveyActive,
  unpublishSurvey,
} from "../../../lib/adminSurveysApi";
import { surveyKindLabel } from "../../../../shared/surveyModel.mjs";

const STATUS_CHIP = {
  draft: { label: "Draft", severity: "neutral" },
  published: { label: "Published", severity: "info" },
  archived: { label: "Archived", severity: "warning" },
};

function audienceLabel(s) {
  return s.audience_type === "selected" ? `${s.selected_count} selected` : "All employees";
}

export default function SurveysListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await listSurveys());
    } catch (err) {
      setLoadError(err?.message || "Could not load surveys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (statusFilter === "active" && s.status === "archived") return false;
      if (statusFilter !== "active" && statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !`${s.title} ${s.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const kpis = useMemo(() => {
    const live = rows.filter((s) => s.status === "published");
    const assigned = live.reduce((n, s) => n + (s.summary?.assigned || 0), 0);
    const completed = live.reduce((n, s) => n + (s.summary?.completed || 0), 0);
    return {
      total: rows.filter((s) => s.status !== "archived").length,
      live: live.length,
      drafts: rows.filter((s) => s.status === "draft").length,
      completion: assigned ? Math.round((completed / assigned) * 100) : 0,
    };
  }, [rows]);

  const runAction = async (survey, action) => {
    setBusyId(survey.id);
    try {
      if (action === "publish") {
        const out = await publishSurvey(survey.id);
        toast.success("Survey published", describeAssignmentSync(out.assignment));
      } else if (action === "unpublish") {
        await unpublishSurvey(survey.id);
        toast.success("Survey unpublished", "Employees no longer see it in Indus One.");
      } else if (action === "duplicate") {
        const out = await duplicateSurvey(survey.id);
        toast.success("Survey duplicated", "Opening the copy as a draft.");
        navigate(`/app/admin/employee/surveys/${out.survey.id}/edit`);
        return;
      } else if (action === "archive") {
        await archiveSurvey(survey.id);
        toast.success("Survey archived");
      } else if (action === "delete") {
        await deleteSurvey(survey.id);
        toast.success("Survey deleted", "The survey and all its responses were permanently removed.");
      } else if (action === "activate") {
        await setSurveyActive(survey.id, true);
        toast.success("Survey active", "Employees can see it again in Indus One (if published).");
      } else if (action === "deactivate") {
        await setSurveyActive(survey.id, false);
        toast.success("Survey inactive", "Paused — employees will not see it until you make it active again.");
      }
      await load();
    } catch (err) {
      toast.error("Action failed", err?.message || "Please try again.");
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  };

  /** Publishing to everyone, archive, and delete are confirmed first. */
  const requestAction = (survey, action) => {
    if ((action === "publish" && survey.audience_type === "all") || action === "archive" || action === "delete") {
      setConfirm({ survey, action });
      return;
    }
    void runAction(survey, action);
  };

  const columns = [
    {
      key: "title",
      label: "Survey",
      render: (s) => (
        <div className="min-w-[220px] max-w-[360px]">
          <p className="font-medium text-ink-strong truncate">{s.title}</p>
          <p className="text-[11px] text-ink-muted truncate">
            {surveyKindLabel(s)} · {s.question_count} question{s.question_count === 1 ? "" : "s"}
            {s.anonymous ? " · Anonymous" : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (s) => {
        const chip = STATUS_CHIP[s.status] || STATUS_CHIP.draft;
        return (
          <span className="inline-flex items-center gap-1.5">
            <StatusChip label={chip.label} severity={chip.severity} />
            {s.status === "published" && !s.is_active ? <StatusChip label="Paused" severity="warning" /> : null}
          </span>
        );
      },
    },
    {
      key: "is_active",
      label: "Active",
      render: (s) => {
        if (s.status === "archived") {
          return <span className="text-[11px] text-ink-muted">—</span>;
        }
        const busy = busyId === s.id;
        const on = s.is_active !== false;
        return (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={busy}
            title={on ? "Active — click to pause" : "Inactive — click to activate"}
            onClick={(e) => {
              e.stopPropagation();
              void runAction(s, on ? "deactivate" : "activate");
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
              on ? "border-accent bg-accent" : "border-border bg-surface-sunken"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                on ? "translate-x-6" : "translate-x-1"
              }`}
            />
            <span className="sr-only">{on ? "Active" : "Inactive"}</span>
          </button>
        );
      },
    },
    { key: "audience", label: "Audience", render: audienceLabel },
    { key: "due_date", label: "Due date", render: (s) => (s.due_date ? formatDateDdMmYyyy(s.due_date) : "—") },
    { key: "assigned", label: "Assigned", cellClassName: "tabular-nums", render: (s) => s.summary?.assigned ?? 0 },
    {
      key: "completed",
      label: "Completed",
      cellClassName: "tabular-nums",
      render: (s) =>
        s.summary?.assigned ? `${s.summary.completed} (${s.summary.completion_pct}%)` : s.summary?.completed ?? 0,
    },
    { key: "created_at", label: "Created", render: (s) => formatDateDdMmYyyy(s.created_at) },
    {
      key: "actions",
      label: "Actions",
      render: (s) => {
        const busy = busyId === s.id;
        const btn = "text-[11px] font-medium text-accent hover:underline disabled:opacity-50";
        const stop = (fn) => (e) => {
          e.stopPropagation();
          fn();
        };
        return (
          <div className="flex items-center gap-3">
            <button type="button" className={btn} onClick={stop(() => navigate(`/app/admin/employee/surveys/${s.id}`))}>
              Responses
            </button>
            {s.status !== "archived" ? (
              <button type="button" className={btn} onClick={stop(() => navigate(`/app/admin/employee/surveys/${s.id}/edit`))}>
                Edit
              </button>
            ) : null}
            {s.status === "draft" ? (
              <button type="button" className={btn} disabled={busy} onClick={stop(() => requestAction(s, "publish"))}>
                Publish
              </button>
            ) : null}
            {s.status === "published" ? (
              <button type="button" className={btn} disabled={busy} onClick={stop(() => requestAction(s, "unpublish"))}>
                Unpublish
              </button>
            ) : null}
            <button type="button" className={btn} disabled={busy} onClick={stop(() => requestAction(s, "duplicate"))}>
              Duplicate
            </button>
            {s.status !== "archived" ? (
              <button
                type="button"
                className="text-[11px] font-medium text-critical hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={stop(() => requestAction(s, "archive"))}
              >
                Archive
              </button>
            ) : null}
            <button
              type="button"
              className="text-[11px] font-medium text-critical hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={stop(() => requestAction(s, "delete"))}
            >
              Delete
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Surveys"
        subtitle="Create surveys, assign them to all or selected employees, and track responses from Indus One."
      >
        <SecondaryButton onClick={() => void load()} disabled={loading}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </SecondaryButton>
        <PrimaryButton icon={Plus} onClick={() => navigate("/app/admin/employee/surveys/new")}>
          Create survey
        </PrimaryButton>
      </PageTaskHeader>
      <CollapsibleHelp>
        Draft surveys are only visible here. Publishing creates one assignment per employee — &quot;All employees&quot;
        means every Employee Master record with status <b>Active</b> and an employee code. Re-publishing never
        duplicates assignments: new employees are added, removed employees with an unfinished survey are revoked,
        and completed responses are always kept. Employees fill surveys under Indus One → Surveys.
      </CollapsibleHelp>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Surveys" value={kpis.total} sub="Excluding archived" />
        <KpiTile label="Live" value={kpis.live} sub="Published to Indus One" />
        <KpiTile label="Drafts" value={kpis.drafts} />
        <KpiTile label="Completion" value={`${kpis.completion}%`} sub="Across live surveys" />
      </div>

      <InlineAlert>{loadError}</InlineAlert>

      <SectionCard title="All surveys">
        <div className="space-y-3">
          <FilterBar>
            <TinyInput
              type="search"
              placeholder="Search title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
              aria-label="Search surveys"
            />
            <TinySelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="active">Draft + published</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </TinySelect>
          </FilterBar>
          {loading ? (
            <LoadingBlock rows={5} />
          ) : rows.length === 0 && !loadError ? (
            <EmptyState
              icon={ClipboardList}
              title="No surveys yet"
              message="Create your first survey and publish it to employees in Indus One."
              action={
                <PrimaryButton icon={Plus} onClick={() => navigate("/app/admin/employee/surveys/new")}>
                  Create survey
                </PrimaryButton>
              }
            />
          ) : (
            <DenseTable
              columns={columns}
              rows={filtered}
              onRowClick={(s) => navigate(`/app/admin/employee/surveys/${s.id}`)}
              density="comfortable"
            />
          )}
        </div>
      </SectionCard>

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.action === "delete"
            ? "Delete survey permanently?"
            : confirm?.action === "archive"
              ? "Archive survey?"
              : "Publish to all employees?"
        }
        onClose={() => setConfirm(null)}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <SecondaryButton onClick={() => setConfirm(null)}>Cancel</SecondaryButton>
            <PrimaryButton
              disabled={busyId === confirm?.survey?.id}
              onClick={() => confirm && void runAction(confirm.survey, confirm.action)}
            >
              {confirm?.action === "delete" ? "Delete forever" : confirm?.action === "archive" ? "Archive" : "Publish"}
            </PrimaryButton>
          </div>
        }
      >
        {confirm?.action === "delete" ? (
          <p className="text-xs text-ink-secondary">
            &quot;{confirm?.survey?.title}&quot; will be permanently deleted, including all employee assignments and
            responses. This cannot be undone.
          </p>
        ) : confirm?.action === "archive" ? (
          <p className="text-xs text-ink-secondary">
            &quot;{confirm?.survey?.title}&quot; will be hidden from employees and can no longer be edited. Responses stay
            available here.
          </p>
        ) : (
          <p className="text-xs text-ink-secondary">
            &quot;{confirm?.survey?.title}&quot; will be assigned to every active employee and appear in their Indus One
            Surveys page.
          </p>
        )}
      </Modal>
    </div>
  );
}
