import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
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
import { QaBlockedHelp } from "./components/QaHelpButton";
import {
  ISO25010,
  QA_BASE,
  TEST_LEVELS,
  TEST_TYPES,
  TECHNIQUES,
} from "./qaConstants";
import { useQaRelease } from "./QaReleaseContext";
import {
  addCaseVersion,
  createTestCaseWithVersion,
  getCaseVersion,
  getTestCase,
  listRequests,
} from "./qaApi";

const emptyStep = () => ({ action: "", expected: "" });

export default function TestCaseFormPage() {
  const { idOrCode } = useParams();
  const [searchParams] = useSearchParams();
  const isCreate = !idOrCode || idOrCode === "new";
  const isNewVersion = !isCreate;
  const navigate = useNavigate();
  const { access } = useOutletContext();
  const { releaseId } = useQaRelease();
  const [loading, setLoading] = useState(isNewVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [caseId, setCaseId] = useState(null);
  const [nextVersion, setNextVersion] = useState(1);
  const [requestId, setRequestId] = useState(searchParams.get("requestId") || "");
  const [form, setForm] = useState({
    title: "",
    level: "system",
    test_type: "functional",
    iso_char: "functional_suitability",
    technique: "use_case",
    priority: "medium",
    preconditions: "",
    test_data: "",
    change_note: isNewVersion ? "Revised steps" : "Initial version",
  });
  const [steps, setSteps] = useState([emptyStep(), emptyStep()]);

  const patch = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const loadContext = useCallback(async () => {
    if (isCreate) {
      if (releaseId) {
        try {
          const reqs = await listRequests({ releaseId });
          setRequests(reqs);
        } catch {
          /* optional */
        }
      }
      return;
    }
    setLoading(true);
    try {
      const c = await getTestCase(idOrCode);
      if (!c) throw new Error("Test case not found.");
      setCaseId(c.id);
      setNextVersion((c.current_version || 0) + 1);
      const ver = await getCaseVersion(c.id, c.current_version);
      if (ver && isNewVersion) {
        setForm({
          title: ver.title,
          level: ver.level,
          test_type: ver.test_type,
          iso_char: ver.iso_char || "functional_suitability",
          technique: ver.technique,
          priority: ver.priority || "medium",
          preconditions: ver.preconditions || "",
          test_data: ver.test_data || "",
          change_note: "Revised steps",
        });
        setSteps(
          Array.isArray(ver.steps) && ver.steps.length
            ? ver.steps.map((s) => ({ action: s.action || "", expected: s.expected || "" }))
            : [emptyStep()]
        );
      }
      setRequestId(String(c.request_id));
    } catch (err) {
      setError(err.message || "Could not load case.");
    } finally {
      setLoading(false);
    }
  }, [idOrCode, isCreate, isNewVersion, releaseId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const moveStep = (index, dir) => {
    setSteps((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!access.canCreateCase) {
      toast.error(blockedReason("canCreateCase", access.role));
      return;
    }
    const cleanSteps = steps
      .map((s) => ({ action: s.action.trim(), expected: s.expected.trim() }))
      .filter((s) => s.action || s.expected);
    if (!form.title.trim() || cleanSteps.length === 0) {
      toast.error("Title and at least one step are required.");
      return;
    }
    if (isCreate && !requestId) {
      toast.error("Choose a request.");
      return;
    }
    setSaving(true);
    try {
      const versionPayload = { ...form, steps: cleanSteps };
      if (caseId && isNewVersion) {
        await addCaseVersion(caseId, versionPayload, nextVersion);
        toast.success(`Version ${nextVersion} created.`);
        navigate(`${QA_BASE}/cases/${idOrCode}`);
      } else {
        const { case: created } = await createTestCaseWithVersion({
          requestId: Number(requestId),
          version: versionPayload,
        });
        toast.success("Test case created.");
        navigate(`${QA_BASE}/cases/${created.code}`);
      }
    } catch (err) {
      toast.error(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!access.canCreateCase) {
    return (
      <>
        <PageTaskHeader title="Test case" />
        <InlineAlert tone="warning">
          <span className="inline-flex items-center gap-1">
            {blockedReason("canCreateCase", access.role)}
            <QaBlockedHelp />
          </span>
        </InlineAlert>
      </>
    );
  }

  if (loading) return <LoadingBlock label="Loading…" />;

  const title = idOrCode && isNewVersion ? `New version · ${idOrCode}` : "New test case";

  return (
    <>
      <PageTaskHeader title={title} subtitle="Frozen versions cannot be edited — save as a new version instead.">
        <SecondaryButton onClick={() => navigate(idOrCode ? `${QA_BASE}/cases/${idOrCode}` : `${QA_BASE}/cases`)}>
          Cancel
        </SecondaryButton>
      </PageTaskHeader>

      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <SectionCard title="Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            {isCreate ? (
              <FormField label="Request" required>
                <TinySelect value={requestId} onChange={(e) => setRequestId(e.target.value)} required>
                  <option value="">Select…</option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.title}
                    </option>
                  ))}
                </TinySelect>
              </FormField>
            ) : null}
            <FormField label="Title" required className="md:col-span-2">
              <TinyInput value={form.title} onChange={(e) => patch("title", e.target.value)} className="w-full" />
            </FormField>
            <FormField label="Level">
              <TinySelect value={form.level} onChange={(e) => patch("level", e.target.value)}>
                {TEST_LEVELS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Test type">
              <TinySelect value={form.test_type} onChange={(e) => patch("test_type", e.target.value)}>
                {TEST_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="ISO 25010">
              <TinySelect value={form.iso_char} onChange={(e) => patch("iso_char", e.target.value)}>
                {ISO25010.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Technique">
              <TinySelect value={form.technique} onChange={(e) => patch("technique", e.target.value)}>
                {TECHNIQUES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Preconditions">
              <TinyInput
                value={form.preconditions}
                onChange={(e) => patch("preconditions", e.target.value)}
                className="w-full"
              />
            </FormField>
            <FormField label="Test data">
              <TinyInput value={form.test_data} onChange={(e) => patch("test_data", e.target.value)} className="w-full" />
            </FormField>
            <FormField label="Change note">
              <TinyInput value={form.change_note} onChange={(e) => patch("change_note", e.target.value)} className="w-full" />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title="Steps"
          right={
            <SecondaryButton type="button" onClick={() => setSteps((s) => [...s, emptyStep()])}>
              Add step
            </SecondaryButton>
          }
        >
          <ul className="divide-y divide-border">
            {steps.map((step, i) => (
              <li key={i} className="p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-ink-muted">Step {i + 1}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="p-1 rounded border border-border hover:bg-surface-sunken"
                      onClick={() => moveStep(i, -1)}
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded border border-border hover:bg-surface-sunken"
                      onClick={() => moveStep(i, 1)}
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded border border-border hover:bg-critical-soft text-critical"
                      onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                      aria-label="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <FormField label="Action">
                  <TinyInput
                    value={step.action}
                    onChange={(e) =>
                      setSteps((s) => s.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))
                    }
                    className="w-full"
                  />
                </FormField>
                <FormField label="Expected result">
                  <TinyInput
                    value={step.expected}
                    onChange={(e) =>
                      setSteps((s) => s.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))
                    }
                    className="w-full"
                  />
                </FormField>
              </li>
            ))}
          </ul>
        </SectionCard>

        <PrimaryButton type="submit" disabled={saving}>
          {saving ? "Saving…" : idOrCode && isNewVersion ? "Save new version" : "Create case"}
        </PrimaryButton>
      </form>
    </>
  );
}