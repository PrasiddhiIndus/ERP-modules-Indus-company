import React, { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { blockedReason } from "./qaAccess";
import {
  DEFECT_STATUSES,
  PRIORITIES,
  QA_BASE,
  RCA_CATEGORIES,
  RESOLUTIONS,
  SEVERITIES,
} from "./qaConstants";
import {
  createDefect,
  getDefect,
  listDefectHistory,
  listMembers,
  updateDefect,
  userMessage,
} from "./qaApi";
import { PriorityChip, SeverityChip } from "./components/QaChips";

const blank = {
  title: "",
  severity: "S3",
  priority: "P3",
  request_id: "",
  steps_to_reproduce: "",
  expected: "",
  actual: "",
  environment: "QA-01",
  found_in_build: "",
  fixed_in_build: "",
  assigned_to: "",
  resolution: "",
  rca_category: "",
  corrective_action: "",
  preventive_action: "",
  status: "new",
};

export default function DefectDetailPage() {
  const { idOrCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { access, qaRole } = useOutletContext() || {};
  const isNew = idOrCode === "new";
  const [form, setForm] = useState(blank);
  const [history, setHistory] = useState([]);
  const [devs, setDevs] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    listMembers()
      .then((m) => setDevs(m.filter((x) => x.qa_role === "developer" || x.qa_role === "qa_lead")))
      .catch(() => setDevs([]));
  }, []);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await getDefect(idOrCode);
        if (!d) throw new Error("Defect not found.");
        if (cancelled) return;
        setCode(d.code);
        setForm({
          title: d.title,
          severity: d.severity,
          priority: d.priority,
          request_id: d.request_id,
          steps_to_reproduce: d.steps_to_reproduce || "",
          expected: d.expected || "",
          actual: d.actual || "",
          environment: d.environment || "",
          found_in_build: d.found_in_build || "",
          fixed_in_build: d.fixed_in_build || "",
          assigned_to: d.assigned_to || "",
          resolution: d.resolution || "",
          rca_category: d.rca_category || "",
          corrective_action: d.corrective_action || "",
          preventive_action: d.preventive_action || "",
          status: d.status,
          id: d.id,
        });
        const h = await listDefectHistory(d.id);
        if (!cancelled) setHistory(h);
        if (searchParams.get("need") === "fixed_in_build") {
          toast.error("Fixed-in build is required to mark ready for retest.");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load defect.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idOrCode, isNew, searchParams]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        if (!form.title.trim() || !form.request_id) {
          toast.error("Title and request id are required.");
          return;
        }
        const created = await createDefect({
          title: form.title.trim(),
          severity: form.severity,
          priority: form.priority,
          request_id: Number(form.request_id),
          steps_to_reproduce: form.steps_to_reproduce || null,
          expected: form.expected || null,
          actual: form.actual || null,
          environment: form.environment || null,
          found_in_build: form.found_in_build || null,
          assigned_to: form.assigned_to || null,
        });
        toast.success(`Logged ${created.code}`);
        navigate(`${QA_BASE}/defects/${created.code}`, { replace: true });
      } else {
        const patch = {
          title: form.title.trim(),
          severity: form.severity,
          priority: form.priority,
          steps_to_reproduce: form.steps_to_reproduce || null,
          expected: form.expected || null,
          actual: form.actual || null,
          environment: form.environment || null,
          found_in_build: form.found_in_build || null,
          fixed_in_build: form.fixed_in_build || null,
          assigned_to: form.assigned_to || null,
          resolution: form.resolution || null,
          rca_category: form.rca_category || null,
          corrective_action: form.corrective_action || null,
          preventive_action: form.preventive_action || null,
          status: form.status,
        };
        await updateDefect(form.id, patch);
        toast.success("Defect saved");
        const h = await listDefectHistory(form.id);
        setHistory(h);
      }
    } catch (err) {
      toast.error(userMessage(err, "Could not save defect."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading defect…" />;
  if (error) {
    return (
      <>
        <PageTaskHeader title="Defect" />
        <InlineAlert tone="error">{error}</InlineAlert>
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title={isNew ? "Log defect" : code}
        subtitle={isNew ? "Capture a new incident" : form.title}
        actions={
          <div className="flex gap-2">
            <SecondaryButton type="button" onClick={() => navigate(`${QA_BASE}/defects`)}>
              Back
            </SecondaryButton>
            <PrimaryButton type="button" onClick={save} disabled={saving || !access?.canWrite}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        }
      />

      {!isNew ? (
        <div className="flex flex-wrap gap-2 mb-3">
          <SeverityChip severity={form.severity} />
          <PriorityChip priority={form.priority} />
          <span className="text-xs text-ink-muted self-center">Status: {form.status}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Details" className="lg:col-span-2 space-y-3">
          <FormField label="Title">
            <TinyInput value={form.title} onChange={(e) => set("title", e.target.value)} />
          </FormField>
          {isNew ? (
            <FormField label="Request id">
              <TinyInput value={form.request_id} onChange={(e) => set("request_id", e.target.value)} placeholder="Numeric id" />
            </FormField>
          ) : (
            <p className="text-xs text-ink-secondary">
              Request{" "}
              <Link className="text-accent" to={`${QA_BASE}/requests/${form.request_id}`}>
                #{form.request_id}
              </Link>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Severity">
              <TinySelect value={form.severity} onChange={(e) => set("severity", e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Priority">
              <TinySelect value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
          </div>
          <p className="text-[11px] text-ink-muted">
            {SEVERITIES.find((s) => s.value === form.severity)?.help}
          </p>
          <FormField label="Status">
            <TinySelect
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              disabled={isNew}
              title={
                form.status === "new" && !access?.canTriageDefect
                  ? blockedReason("canTriageDefect", qaRole)
                  : undefined
              }
            >
              {DEFECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <FormField label="Assignee">
            <TinySelect value={form.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)}>
              <option value="">Unassigned</option>
              {devs.map((d) => (
                <option key={d.user_id} value={d.user_id}>
                  {d.full_name}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <FormField label="Steps to reproduce">
            <textarea
              className="w-full min-h-[80px] border border-border rounded-control px-2.5 py-2 text-xs"
              value={form.steps_to_reproduce}
              onChange={(e) => set("steps_to_reproduce", e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Expected">
              <TinyInput value={form.expected} onChange={(e) => set("expected", e.target.value)} />
            </FormField>
            <FormField label="Actual">
              <TinyInput value={form.actual} onChange={(e) => set("actual", e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Found in build">
              <TinyInput value={form.found_in_build} onChange={(e) => set("found_in_build", e.target.value)} />
            </FormField>
            <FormField label="Fixed in build">
              <TinyInput value={form.fixed_in_build} onChange={(e) => set("fixed_in_build", e.target.value)} />
            </FormField>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Resolution & CAPA" className="space-y-3">
            <FormField label="Resolution">
              <TinySelect value={form.resolution || ""} onChange={(e) => set("resolution", e.target.value)}>
                <option value="">—</option>
                {RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Root cause">
              <TinySelect value={form.rca_category || ""} onChange={(e) => set("rca_category", e.target.value)}>
                <option value="">—</option>
                {RCA_CATEGORIES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Corrective action">
              <textarea
                className="w-full min-h-[60px] border border-border rounded-control px-2.5 py-2 text-xs"
                value={form.corrective_action}
                onChange={(e) => set("corrective_action", e.target.value)}
              />
            </FormField>
            <FormField label="Preventive action">
              <textarea
                className="w-full min-h-[60px] border border-border rounded-control px-2.5 py-2 text-xs"
                value={form.preventive_action}
                onChange={(e) => set("preventive_action", e.target.value)}
              />
            </FormField>
            {(form.severity === "S1" || form.severity === "S2") && form.status === "closed" ? (
              <InlineAlert tone="warning">S1/S2 require root cause and corrective action to close.</InlineAlert>
            ) : null}
          </SectionCard>

          <SectionCard title="History">
            {history.length === 0 ? (
              <EmptyState title="No history" message="Status changes will appear here." />
            ) : (
              <ul className="space-y-1.5 text-xs">
                {history.map((h) => (
                  <li key={h.id} className="text-ink-secondary">
                    {h.from_status || "—"} → <strong>{h.to_status}</strong>{" "}
                    <span className="text-ink-muted">{new Date(h.changed_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
