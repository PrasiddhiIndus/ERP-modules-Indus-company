/** Survey Management — create / edit a survey, choose its audience, save as draft or publish. */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  PageTaskHeader,
  SectionCard,
  TinyInput,
  TinySelect,
  Modal,
  PrimaryButton,
  SecondaryButton,
  FormField,
  LoadingBlock,
  InlineAlert,
  Breadcrumbs,
} from "../../../components/erpUi";
import { toast } from "../../../lib/toast";
import {
  createSurvey,
  describeAssignmentSync,
  getSurvey,
  listSurveyEmployees,
  updateSurvey,
} from "../../../lib/adminSurveysApi";
import {
  SURVEY_KINDS,
  normalizeSurveyInput,
  todayIsoIst,
  validateSurvey,
} from "../../../../shared/surveyModel.mjs";
import SurveyQuestionBuilder, { blankQuestion } from "./SurveyQuestionBuilder";
import SurveyAudiencePicker from "./SurveyAudiencePicker";

const EMPTY_FORM = {
  title: "",
  description: "",
  kind: "pulse",
  due_date: "",
  estimated_minutes: "",
  anonymous: false,
  is_active: true,
  audience_type: "all",
  audience_employee_codes: [],
  questions: [blankQuestion("rating")],
};

function formFromTemplate(t) {
  return {
    title: t.title || "",
    description: t.description || "",
    kind: t.kind || "pulse",
    due_date: t.due_date || "",
    estimated_minutes: t.estimated_minutes ?? "",
    anonymous: Boolean(t.anonymous),
    is_active: t.is_active !== false,
    audience_type: t.audience_type === "selected" ? "selected" : "all",
    audience_employee_codes: t.audience_employee_codes || [],
    questions: (t.questions || []).map((q) => ({ ...q, options: q.options ? [...q.options] : undefined })),
  };
}

export default function SurveyEditorPage() {
  const { surveyId } = useParams();
  const isEdit = Boolean(surveyId);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [existing, setExisting] = useState(null);
  const [responseCount, setResponseCount] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSurveyEmployees()
      .then((rows) => !cancelled && setEmployees(rows))
      .catch((err) => !cancelled && toast.error("Could not load employees", err?.message || ""))
      .finally(() => !cancelled && setEmployeesLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    setLoading(true);
    getSurvey(surveyId)
      .then((data) => {
        if (cancelled) return;
        setExisting(data.survey);
        setResponseCount(data.summary?.completed || 0);
        setForm(formFromTemplate(data.survey));
      })
      .catch((err) => !cancelled && setLoadError(err?.message || "Could not load survey."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isEdit, surveyId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isLive = existing?.status === "published";
  const archived = existing?.status === "archived";
  const today = todayIsoIst();

  const activeCount = employees.length;
  const audienceSummary = useMemo(
    () =>
      form.audience_type === "all"
        ? `${activeCount || "All"} active employees`
        : `${form.audience_employee_codes.length} selected employee(s)`,
    [form.audience_type, form.audience_employee_codes.length, activeCount]
  );

  const validate = () => {
    const normalized = normalizeSurveyInput(form);
    const dueChanged = !existing || existing.due_date !== normalized.due_date;
    const next = validateSurvey(normalized, { checkDueDate: dueChanged, today });
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Please fix the highlighted fields", Object.values(next)[0]);
      return null;
    }
    return normalized;
  };

  const save = async (mode) => {
    const survey = validate();
    if (!survey) return;
    setSaving(true);
    try {
      const out = isEdit ? await updateSurvey(surveyId, survey, mode) : await createSurvey(survey, mode);
      if (out.assignment) toast.success(isLive && mode !== "publish" ? "Survey updated" : "Survey published", describeAssignmentSync(out.assignment));
      else toast.success("Draft saved");
      navigate(`/app/admin/employee/surveys/${out.survey.id}`);
    } catch (err) {
      if (err?.fields) setErrors(err.fields);
      toast.error("Could not save survey", err?.message || "Please try again.");
    } finally {
      setSaving(false);
      setConfirmAll(false);
    }
  };

  const requestPublish = () => {
    if (!validate()) return;
    if (form.audience_type === "all") setConfirmAll(true);
    else void save("publish");
  };

  if (loading) return <LoadingBlock rows={8} />;

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Surveys", path: "/app/admin/employee/surveys" },
          { label: isEdit ? existing?.title || "Edit" : "New survey" },
        ]}
      />
      <PageTaskHeader
        title={isEdit ? "Edit survey" : "Create survey"}
        subtitle={
          isLive
            ? "This survey is live. Saving re-syncs the audience and due date in Indus One."
            : "Build the questions, choose who should answer, then save as draft or publish."
        }
      >
        <SecondaryButton onClick={() => navigate(isEdit ? `/app/admin/employee/surveys/${surveyId}` : "/app/admin/employee/surveys")}>
          Cancel
        </SecondaryButton>
        {!isLive ? (
          <SecondaryButton onClick={() => void save(isEdit ? "save" : "draft")} disabled={saving || archived}>
            Save as draft
          </SecondaryButton>
        ) : null}
        <PrimaryButton onClick={isLive ? () => void save("save") : requestPublish} disabled={saving || archived}>
          {saving ? "Saving…" : isLive ? "Save changes" : "Publish & assign"}
        </PrimaryButton>
      </PageTaskHeader>

      <InlineAlert>{loadError}</InlineAlert>
      {archived ? <InlineAlert tone="warning">Archived surveys are read-only. Duplicate it to reuse the questions.</InlineAlert> : null}
      {isEdit && responseCount > 0 ? (
        <InlineAlert tone="warning">
          {responseCount} response(s) already submitted. Changing or removing questions can make earlier answers
          inconsistent with the new version.
        </InlineAlert>
      ) : null}

      <SectionCard title="Details">
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Title" required error={errors.title}>
            <TinyInput type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className="w-full" />
          </FormField>
          <FormField label="Kind">
            <TinySelect value={form.kind} onChange={(e) => set({ kind: e.target.value })} className="w-full">
              {SURVEY_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </TinySelect>
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Description" hint="Shown to employees above the questions.">
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                className="w-full rounded-control border border-border bg-surface px-2.5 py-2 text-xs text-ink shadow-sm focus:border-accent focus:shadow-focus"
              />
            </FormField>
          </div>
          <FormField label="Due date" hint="Optional. Today or later." error={errors.due_date}>
            <TinyInput type="date" value={form.due_date} min={today} onChange={(e) => set({ due_date: e.target.value })} />
          </FormField>
          <FormField label="Estimated minutes" hint="Optional, shown in Indus One.">
            <TinyInput
              type="number"
              min={1}
              max={240}
              value={form.estimated_minutes}
              onChange={(e) => set({ estimated_minutes: e.target.value })}
              className="w-28"
            />
          </FormField>
          <label className="flex items-start gap-2 text-xs text-ink">
            <input type="checkbox" checked={form.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} className="mt-0.5" />
            <span>
              <span className="font-medium">Anonymous responses</span>
              <span className="block text-[11px] text-ink-muted">
                Admins see answers and totals only — no employee names, codes or submission times.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-ink">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="mt-0.5" />
            <span>
              <span className="font-medium">Active</span>
              <span className="block text-[11px] text-ink-muted">
                Untick to pause a published survey without unpublishing it.
              </span>
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title={`Questions (${form.questions.length})`}>
        <SurveyQuestionBuilder questions={form.questions} onChange={(questions) => set({ questions })} errors={errors} />
      </SectionCard>

      <SectionCard title="Audience" right={<span className="text-[11px] text-ink-muted">{audienceSummary}</span>}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={form.audience_type === "all"}
                onChange={() => set({ audience_type: "all" })}
              />
              All employees
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="audience"
                checked={form.audience_type === "selected"}
                onChange={() => set({ audience_type: "selected" })}
              />
              Selected employees
            </label>
          </div>
          {form.audience_type === "all" ? (
            <p className="text-[11px] text-ink-muted">
              Every Employee Master record with status Active and an employee code. Employees who join later are added
              when you re-publish or save the live survey.
            </p>
          ) : (
            <>
              <SurveyAudiencePicker
                employees={employees}
                loading={employeesLoading}
                selectedCodes={form.audience_employee_codes}
                onChange={(codes) => set({ audience_employee_codes: codes })}
              />
              {errors.audience ? <p className="text-[11px] text-critical">{errors.audience}</p> : null}
            </>
          )}
        </div>
      </SectionCard>

      <Modal
        open={confirmAll}
        title="Publish to all employees?"
        onClose={() => setConfirmAll(false)}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <SecondaryButton onClick={() => setConfirmAll(false)}>Cancel</SecondaryButton>
            <PrimaryButton disabled={saving} onClick={() => void save("publish")}>
              {saving ? "Publishing…" : "Publish"}
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary">
          &quot;{form.title}&quot; will be assigned to {activeCount ? `${activeCount} ` : "all "}active employees and
          appear in their Indus One Surveys page.
        </p>
      </Modal>
    </div>
  );
}
