import React, { useEffect, useRef, useState } from "react";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "../../../lib/toast";
import { getSettings, runRemindersNow, saveDocumentType, saveSettings } from "./recruitmentService";
import { AsyncBoundary, Card, Field, IconButton, btn, inputClass, runAction, useRecruitmentData } from "./RecruitmentUi";

function ListEditor({ items, onChange, placeholder, label }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      toast.error(`${v} already exists.`);
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-divider rounded-md border border-border">
        {items.map((item, idx) => (
          <li key={item} className="flex items-center justify-between px-3 py-1.5 text-xs text-ink">
            {item}
            <IconButton icon={Trash2} label={`Remove ${item}`} tone="danger" onClick={() => onChange(items.filter((_, i) => i !== idx))} />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Add {label}</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className={inputClass}
          />
        </label>
        <button type="button" className={btn.secondary} disabled={!draft.trim()} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function InterviewerEditor({ items, onChange }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (items.some((i) => i.name.toLowerCase() === n.toLowerCase())) {
      toast.error(`${n} already exists.`);
      return;
    }
    onChange([...items, { name: n, email: email.trim() }]);
    setName("");
    setEmail("");
  };
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-divider rounded-md border border-border">
        {items.map((item, idx) => (
          <li key={item.name} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-ink">
            <span>
              {item.name} {item.email ? <span className="text-ink-muted">· {item.email}</span> : null}
            </span>
            <IconButton icon={Trash2} label={`Remove ${item.name}`} tone="danger" onClick={() => onChange(items.filter((_, i) => i !== idx))} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${inputClass} flex-1`} aria-label="Interviewer name" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className={`${inputClass} flex-1`} aria-label="Interviewer email" />
        <button type="button" className={btn.secondary} disabled={!name.trim()} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

function DocumentTypes({ types }) {
  const [newLabel, setNewLabel] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const update = (doc, patch) => runAction(() => saveDocumentType({ ...doc, ...patch }), "Checklist updated");
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-divider rounded-md border border-border">
        {types.map((d) => (
          <li key={d.key} className={`flex flex-wrap items-center gap-3 px-3 py-2 text-xs ${d.active ? "" : "opacity-60"}`}>
            <span className="min-w-0 flex-1 text-ink">{d.label}</span>
            <label className="flex items-center gap-1.5 text-ink-secondary">
              <input type="checkbox" checked={d.required} onChange={(e) => update(d, { required: e.target.checked })} />
              Required
            </label>
            <label className="flex items-center gap-1.5 text-ink-secondary">
              <input type="checkbox" checked={d.active} onChange={(e) => update(d, { active: e.target.checked })} />
              Active
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Medical fitness certificate" className={`${inputClass} flex-1`} aria-label="New document" />
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
          Required
        </label>
        <button
          type="button"
          className={btn.secondary}
          disabled={!newLabel.trim()}
          onClick={async () => {
            const ok = await runAction(() => saveDocumentType({ label: newLabel.trim(), required: newRequired, active: true }), "Document added");
            if (ok !== undefined) setNewLabel("");
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add document
        </button>
      </div>
      <p className="text-[11px] text-ink-muted">Changes apply to candidates whose document collection starts after the change.</p>
    </div>
  );
}

const NUMBER_FIELDS = [
  ["offerValidityDays", "Offer validity (days)", 1, 90],
  ["portalLinkDays", "Candidate link validity (days)", 1, 60],
  ["approvalLevels", "Requisition approval levels", 1, 3],
  ["interviewReminderHours", "Interview reminder (hours before)", 1, 168],
  ["offerReminderDays", "Offer reminder every (days)", 1, 30],
  ["documentReminderDays", "Document reminder every (days)", 1, 30],
  ["joiningReminderDays", "Joining reminder (days before)", 0, 14],
  ["maxReminders", "Maximum reminders per item", 0, 10],
];

export default function SettingsPage() {
  const { data, loading, error, reload } = useRecruitmentData(getSettings);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const loadedRef = useRef(null);

  const comparable = (s) => (s ? JSON.stringify({ ...s, documentTypes: undefined }) : "");
  useEffect(() => {
    if (!data) return;
    setForm((prev) => (!prev || comparable(prev) === comparable(loadedRef.current) ? data : prev));
    loadedRef.current = data;
  }, [data]);

  const dirty = form && data && comparable(form) !== comparable(data);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      NUMBER_FIELDS.forEach(([k]) => (payload[k] = Number(payload[k])));
      loadedRef.current = form;
      await saveSettings(payload);
      toast.success("Recruitment settings saved");
    } catch (err) {
      loadedRef.current = data;
      toast.error("Could not save settings", err?.message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const out = await runRemindersNow();
      const s = out || {};
      toast.success("Reminders processed", `${s.sent || 0} sent, ${s.failed || 0} failed, ${s.expiredOffers || 0} offers expired`);
    } catch (err) {
      toast.error("Could not run reminders", err?.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={6}>
      {form ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <Card title="Joining document checklist">
                <DocumentTypes types={data.documentTypes} />
              </Card>
              <Card title="Interview panel">
                <InterviewerEditor items={form.interviewers} onChange={(interviewers) => setForm({ ...form, interviewers })} />
              </Card>
              <Card title="Evaluation criteria">
                <ListEditor label="criterion" items={form.evaluationCriteria} onChange={(evaluationCriteria) => setForm({ ...form, evaluationCriteria })} placeholder="e.g. Safety awareness" />
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="Company & timings">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Company name on letters" className="sm:col-span-2">
                    <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputClass} />
                  </Field>
                  {NUMBER_FIELDS.map(([k, label, min, max]) => (
                    <Field key={k} label={label}>
                      <input type="number" min={min} max={max} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass} />
                    </Field>
                  ))}
                </div>
              </Card>
              <Card
                title="Automation"
                right={
                  <button type="button" className={btn.ghost} onClick={runNow} disabled={running}>
                    {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run now
                  </button>
                }
              >
                <fieldset className="space-y-1.5">
                  <legend className="mb-1 text-[11px] font-medium text-ink-secondary">Automatic reminders</legend>
                  {[
                    ["interview", "Interview reminder"],
                    ["offer", "Offer reminder until it is answered or expires"],
                    ["documents", "Pending document reminder"],
                    ["joining", "Joining reminder"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-ink">
                      <input type="checkbox" checked={Boolean(form.autoReminders[key])} onChange={(e) => setForm({ ...form, autoReminders: { ...form.autoReminders, [key]: e.target.checked } })} />
                      {label}
                    </label>
                  ))}
                  <label className="mt-2 flex items-center gap-2 border-t border-divider pt-2 text-xs text-ink">
                    <input type="checkbox" checked={form.autoConvertOnJoin} onChange={(e) => setForm({ ...form, autoConvertOnJoin: e.target.checked })} />
                    Create the employee record automatically when a candidate is marked joined
                  </label>
                </fieldset>
                <p className="mt-2 text-[11px] text-ink-muted">Offers expire automatically after their validity date. Reminders are checked every 15 minutes.</p>
              </Card>
              <Card title="Candidate sources">
                <ListEditor label="source" items={form.sources} onChange={(sources) => setForm({ ...form, sources })} placeholder="e.g. Campus drive" />
                <p className="mt-2 text-[11px] text-ink-muted">Candidates added with the “Referral” source must name the referring employee.</p>
              </Card>
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
            {dirty ? <span className="mr-auto text-[11px] text-warning">Unsaved changes</span> : null}
            <button type="button" className={btn.secondary} disabled={!dirty || saving} onClick={() => setForm(data)}>
              Discard
            </button>
            <button type="button" className={btn.primary} disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save settings
            </button>
          </div>
        </div>
      ) : null}
    </AsyncBoundary>
  );
}
