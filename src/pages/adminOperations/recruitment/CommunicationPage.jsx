import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, PenSquare, Plus, RotateCcw } from "lucide-react";
import { Drawer } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { DELIVERY_STATUSES, TEMPLATE_CATEGORIES, TEMPLATE_PLACEHOLDERS, deliveryStatusMeta } from "./recruitmentConfig";
import { listCandidates, listCommunications, listTemplates, retryCommunication, saveTemplate } from "./recruitmentService";
import {
  ActionModal,
  AsyncBoundary,
  DataTable,
  DetailGrid,
  Field,
  SearchBox,
  SelectField,
  StatusPill,
  Tabs,
  btn,
  fmtDate,
  fmtDateTime,
  inputClass,
  runAction,
  textareaClass,
  useCapabilities,
  useRecruitmentData,
} from "./RecruitmentUi";
import { SendEmailModal } from "./RecruitmentForms";

async function loadCommunicationPage() {
  const [messages, templates, candidates] = await Promise.all([listCommunications(), listTemplates(), listCandidates()]);
  return { messages, templates, candidates };
}

export default function CommunicationPage() {
  const caps = useCapabilities();
  const [params, setParams] = useSearchParams();
  const candidateParam = params.get("candidate") || "";
  const { data, loading, error, reload } = useRecruitmentData(loadCommunicationPage);
  const [tab, setTab] = useState("history");
  const [search, setSearch] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [delivery, setDelivery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);

  const messages = data?.messages || [];
  const templates = data?.templates || [];
  const candidates = data?.candidates || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (candidateParam && m.candidateId !== candidateParam) return false;
      if (templateKey && m.templateType !== templateKey) return false;
      if (delivery && m.deliveryStatus !== delivery) return false;
      if (q && ![m.subject, m.recipient, m.candidateName, m.templateName].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, search, templateKey, delivery, candidateParam]);

  const open = messages.find((m) => m.id === openId) || null;
  const filterCandidate = candidates.find((c) => c.id === candidateParam);
  const failedCount = messages.filter((m) => m.deliveryStatus === "failed").length;

  const clearCandidate = () => {
    const next = new URLSearchParams(params);
    next.delete("candidate");
    setParams(next, { replace: true });
  };

  const columns = [
    {
      key: "subject",
      label: "Subject",
      render: (m) => (
        <span className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
          <span className="max-w-[260px] truncate font-medium">{m.subject}</span>
        </span>
      ),
    },
    { key: "candidateName", label: "Candidate" },
    { key: "recipient", label: "Recipient", render: (m) => <span className="block max-w-[200px] truncate">{m.recipient}</span> },
    { key: "templateName", label: "Template" },
    { key: "sentAt", label: "Date", render: (m) => <span className="tabular-nums">{fmtDateTime(m.sentAt)}</span> },
    { key: "trigger", label: "Sent by", render: (m) => (m.trigger === "automation" ? "Automatic reminder" : m.sentBy || "—") },
    { key: "deliveryStatus", label: "Delivery", render: (m) => <StatusPill meta={deliveryStatusMeta(m.deliveryStatus)} /> },
  ];

  const canEditTemplates = caps.settings || caps.communication;

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-1">
          <Tabs
            ariaLabel="Communication"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "history", label: "Email history", count: messages.length },
              { key: "templates", label: "Templates", count: templates.length },
            ]}
          />
          <div className="flex gap-2">
            {tab === "templates" && canEditTemplates ? (
              <button type="button" className={btn.secondary} onClick={() => setEditTemplate({ key: null, name: "", category: "general", subject: "", body: "", active: true })}>
                <Plus className="h-3.5 w-3.5" /> New template
              </button>
            ) : null}
            <button type="button" className={btn.primary} onClick={() => setComposeOpen(true)}>
              <PenSquare className="h-3.5 w-3.5" /> Compose email
            </button>
          </div>
        </div>

        <AsyncBoundary loading={loading} error={error} onRetry={reload}>
          {tab === "history" ? (
            <>
              <div className="flex flex-wrap items-end gap-3 px-4 py-3">
                <SearchBox value={search} onChange={setSearch} placeholder="Search subject, recipient, candidate…" className="w-full sm:w-72" />
                <SelectField label="Template" value={templateKey} onChange={setTemplateKey} options={templates.map((t) => ({ value: t.key, label: t.name }))} className="w-48" />
                <SelectField label="Delivery" value={delivery} onChange={setDelivery} options={DELIVERY_STATUSES.map((s) => ({ value: s.key, label: s.label }))} className="w-36" />
                {filterCandidate ? (
                  <button type="button" onClick={clearCandidate} className="inline-flex h-8 items-center gap-1 rounded-full border border-accent-border bg-accent-soft px-2.5 text-[11px] text-accent-deep">
                    Candidate: {filterCandidate.name} ×
                  </button>
                ) : null}
                {failedCount ? (
                  <button type="button" className={`${btn.ghost} text-critical`} onClick={() => setDelivery("failed")}>
                    {failedCount} failed
                  </button>
                ) : null}
              </div>
              <div className="px-4 pb-4">
                <DataTable columns={columns} rows={filtered} onRowClick={(m) => setOpenId(m.id)} initialSort={{ key: "sentAt", dir: "desc" }} emptyTitle="No emails" emptyMessage="Emails sent to candidates appear here." />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => (
                <article key={t.key} className="flex flex-col rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-semibold text-ink">{t.name}</h3>
                      <p className="truncate text-[11px] text-ink-muted">{t.subject}</p>
                    </div>
                    <StatusPill meta={{ label: t.active ? "Active" : "Inactive", tone: t.active ? "success" : "neutral" }} size="xs" />
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-line text-[11px] text-ink-secondary">{t.body}</p>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-ink-muted">
                    <span>
                      {TEMPLATE_CATEGORIES.find((c) => c.key === t.category)?.label || t.category} · updated {fmtDate(t.updatedOn)}
                    </span>
                    {canEditTemplates ? (
                      <button type="button" className={btn.ghost} onClick={() => setEditTemplate({ ...t })}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </AsyncBoundary>
      </div>

      <Drawer open={Boolean(open)} title={open?.subject || ""} onClose={() => setOpenId(null)} widthClass="max-w-xl">
        {open ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill meta={deliveryStatusMeta(open.deliveryStatus)} />
              {open.attempts > 1 ? <span className="text-[11px] text-ink-muted">{open.attempts} attempts</span> : null}
            </div>
            {open.deliveryStatus === "failed" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2">
                <p className="text-xs text-critical">{open.error || "Delivery failed."}</p>
                <button type="button" className={btn.secondary} onClick={() => runAction(() => retryCommunication(open.id), "Email resent")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Retry
                </button>
              </div>
            ) : null}
            <DetailGrid
              items={[
                ["Recipient", open.recipient],
                ["Candidate", open.candidateName],
                ["Template", open.templateName],
                ["Date", fmtDateTime(open.sentAt)],
                ["Sent by", open.trigger === "automation" ? "Automatic reminder" : open.sentBy],
                ["Attachment", open.relatedDocument],
              ]}
            />
            <div>
              <p className="mb-1 text-[11px] text-ink-muted">Message</p>
              <div className="whitespace-pre-line rounded-md border border-border bg-surface-sunken p-3 text-xs text-ink">{open.body}</div>
            </div>
          </div>
        ) : null}
      </Drawer>

      <SendEmailModal
        open={composeOpen}
        candidate={filterCandidate || undefined}
        candidates={candidates.filter((c) => c.live || c.stage === "employee_created")}
        templateKey="general"
        onClose={() => setComposeOpen(false)}
      />
      <TemplateEditor template={editTemplate} onClose={() => setEditTemplate(null)} />
    </div>
  );
}

function TemplateEditor({ template, onClose }) {
  const [form, setForm] = useState(template);
  useEffect(() => setForm(template), [template]);
  if (!template || !form) return null;
  const isNew = !template.key;
  return (
    <ActionModal
      open
      title={isNew ? "New template" : `Edit template · ${template.name}`}
      onClose={onClose}
      widthClass="max-w-2xl"
      submitLabel="Save template"
      canSubmit={Boolean(form.name.trim() && form.subject.trim() && form.body.trim())}
      onSubmit={async () => {
        await saveTemplate(form);
        toast.success("Template saved");
        onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} disabled={template.isSystem}>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Subject *">
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Message *">
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${textareaClass} min-h-[200px] font-mono`} />
      </Field>
      <div>
        <p className="mb-1 text-[11px] text-ink-muted">Insert placeholder</p>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <button key={p} type="button" onClick={() => setForm({ ...form, body: `${form.body}${p}` })} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary hover:bg-surface-sunken">
              {p}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        Active (available when sending emails and reminders)
      </label>
    </ActionModal>
  );
}
