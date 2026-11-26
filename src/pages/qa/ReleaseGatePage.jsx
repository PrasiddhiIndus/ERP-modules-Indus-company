import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  Modal,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
} from "../../components/erpUi";
import { toast } from "../../lib/toast";
import { useAuth } from "../../contexts/AuthContext";
import { blockedReason } from "./qaAccess";
import { useQaRelease } from "./QaReleaseContext";
import {
  createWaiver,
  listMembers,
  listReleaseGate,
  listReleaseSignoffs,
  listWaivers,
  signRelease,
  userMessage,
} from "./qaApi";

const SIGN_ROLES = [
  { role: "qa_lead", label: "QA Lead" },
  { role: "product_owner", label: "Product Owner" },
  { role: "business_owner", label: "Business Owner" },
];

export default function ReleaseGatePage() {
  const { access, qaRole } = useOutletContext() || {};
  const { user } = useAuth();
  const { releaseId } = useQaRelease();
  const [gate, setGate] = useState([]);
  const [waivers, setWaivers] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waiveKey, setWaiveKey] = useState(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [signRole, setSignRole] = useState(null);
  const [signName, setSignName] = useState("");
  const [signAgree, setSignAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!releaseId) {
      setGate([]);
      setWaivers([]);
      setSignoffs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [g, w, s, m] = await Promise.all([
        listReleaseGate(releaseId),
        listWaivers(releaseId),
        listReleaseSignoffs(releaseId),
        listMembers(),
      ]);
      setGate(g);
      setWaivers(w);
      setSignoffs(s);
      setMembers(m);
    } catch (err) {
      setError(err.message || "Could not load release gate.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [releaseId]);

  const allOk = gate.length > 0 && gate.every((g) => g.ok);
  const myMember = members.find((m) => m.user_id === user?.id);
  const myFullName = myMember?.full_name || "";

  const waiverByKey = useMemo(
    () => Object.fromEntries(waivers.map((w) => [w.criterion_key, w])),
    [waivers]
  );
  const signByRole = useMemo(
    () => Object.fromEntries(signoffs.map((s) => [s.signer_role, s])),
    [signoffs]
  );

  const submitWaiver = async () => {
    if (!access?.canWaive) {
      toast.error(blockedReason("canWaive", qaRole));
      return;
    }
    if (String(waiveReason || "").trim().length < 15) {
      toast.error("Waiver reason must be at least 15 characters.");
      return;
    }
    setSaving(true);
    try {
      await createWaiver({ releaseId, criterionKey: waiveKey, reason: waiveReason.trim() });
      toast.success("Waiver recorded");
      setWaiveKey(null);
      setWaiveReason("");
      reload();
    } catch (err) {
      toast.error(userMessage(err, "Could not waive criterion."));
    } finally {
      setSaving(false);
    }
  };

  const submitSign = async () => {
    if (!signRole || !access?.canSignAs?.(signRole)) {
      toast.error("You can only sign as your own role.");
      return;
    }
    if (signName.trim() !== myFullName.trim()) {
      toast.error("Retype your full name exactly as enrolled in QA members.");
      return;
    }
    if (!signAgree) {
      toast.error("Confirm the meaning statement.");
      return;
    }
    const meaning = `I approve release ${releaseId} for production based on the test completion report`;
    setSaving(true);
    try {
      await signRelease({ releaseId, signerRole: signRole, meaning });
      toast.success("Sign-off recorded");
      setSignRole(null);
      setSignName("");
      setSignAgree(false);
      reload();
    } catch (err) {
      toast.error(userMessage(err, "Could not sign release."));
    } finally {
      setSaving(false);
    }
  };

  const copyReport = async () => {
    const lines = [
      `Test completion report — Release ${releaseId}`,
      "",
      "Exit criteria:",
      ...gate.map(
        (g) =>
          `- ${g.key}: ${g.description} | actual ${g.actual ?? "—"} / ${g.target} | ${
            g.ok ? (g.waived ? "WAIVED" : "MET") : "NOT MET"
          }${waiverByKey[g.key] ? ` (${waiverByKey[g.key].reason})` : ""}`
      ),
      "",
      "Sign-offs:",
      ...SIGN_ROLES.map((r) => {
        const s = signByRole[r.role];
        return `- ${r.label}: ${s ? `signed ${new Date(s.signed_at).toLocaleString()}` : "pending"}`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Report copied");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  if (!releaseId) {
    return (
      <>
        <PageTaskHeader title="Release gate" subtitle="Select a release to review exit criteria." />
        <EmptyState title="No release selected" message="Choose a release in the module header." />
      </>
    );
  }

  return (
    <>
      <PageTaskHeader
        title="Release gate"
        subtitle={allOk ? `${releaseId} — criteria met` : `${releaseId} — not ready`}
        actions={
          <SecondaryButton type="button" onClick={copyReport}>
            Copy test completion report
          </SecondaryButton>
        }
      />
      {error ? <InlineAlert tone="error" className="mb-3">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingBlock label="Loading gate…" />
      ) : (
        <div className="space-y-4">
          <SectionCard title="Exit criteria">
            <ul className="space-y-2">
              {gate.map((g) => (
                <li
                  key={g.key}
                  className="flex flex-wrap items-center gap-2 py-2 border-b border-border last:border-0"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${g.ok ? "bg-success" : "bg-critical"}`}
                    title={g.ok ? "OK" : "Not met"}
                  />
                  <span className="text-xs font-medium text-ink min-w-[12rem]">{g.description}</span>
                  <span className="text-xs text-ink-muted">
                    {g.actual ?? "—"} / {g.target}
                    {g.waived ? " · waived" : ""}
                  </span>
                  {!g.ok && g.key !== "s1" ? (
                    <SecondaryButton
                      type="button"
                      disabled={!access?.canWaive}
                      title={!access?.canWaive ? blockedReason("canWaive", qaRole) : undefined}
                      onClick={() => {
                        setWaiveKey(g.key);
                        setWaiveReason("");
                      }}
                    >
                      Waive
                    </SecondaryButton>
                  ) : null}
                  {g.key === "s1" && !g.ok ? (
                    <span className="text-[10px] text-critical">Not waivable</span>
                  ) : null}
                  {waiverByKey[g.key] ? (
                    <span className="text-[11px] text-warning w-full">Waiver: {waiverByKey[g.key].reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Release sign-off">
            {!allOk ? (
              <InlineAlert tone="warning" className="mb-3">
                Sign-off is enabled only when every exit criterion is met or validly waived.
              </InlineAlert>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SIGN_ROLES.map((r) => {
                const signed = signByRole[r.role];
                const canSign = allOk && access?.canSignAs?.(r.role);
                return (
                  <div key={r.role} className="rounded-card border border-border p-3 bg-surface">
                    <p className="text-sm font-semibold text-ink">{r.label}</p>
                    {signed ? (
                      <p className="text-xs text-success mt-2">
                        Signed {new Date(signed.signed_at).toLocaleString()}
                      </p>
                    ) : (
                      <PrimaryButton
                        type="button"
                        className="mt-3"
                        disabled={!canSign}
                        title={
                          !allOk
                            ? "Gate not clear"
                            : !access?.canSignAs?.(r.role)
                              ? "You can only sign as your own role"
                              : undefined
                        }
                        onClick={() => {
                          setSignRole(r.role);
                          setSignName("");
                          setSignAgree(false);
                        }}
                      >
                        Sign as {r.label}
                      </PrimaryButton>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      <Modal
        open={Boolean(waiveKey)}
        title="Waive criterion"
        onClose={() => !saving && setWaiveKey(null)}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setWaiveKey(null)} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={submitWaiver} disabled={saving}>
              Save waiver
            </PrimaryButton>
          </div>
        }
      >
        <FormField label="Reason (min 15 characters)">
          <textarea
            className="w-full min-h-[100px] border border-border rounded-control px-2.5 py-2 text-xs"
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
          />
        </FormField>
      </Modal>

      <Modal
        open={Boolean(signRole)}
        title="E-signature"
        onClose={() => !saving && setSignRole(null)}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setSignRole(null)} disabled={saving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={submitSign} disabled={saving}>
              Confirm sign-off
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary mb-3">
          I approve release {releaseId} for production based on the test completion report.
        </p>
        <label className="flex items-start gap-2 text-xs text-ink mb-3">
          <input type="checkbox" checked={signAgree} onChange={(e) => setSignAgree(e.target.checked)} />
          <span>I agree with the meaning statement above.</span>
        </label>
        <FormField label={`Retype your full name (${myFullName || "as in QA members"})`}>
          <TinyInput value={signName} onChange={(e) => setSignName(e.target.value)} autoComplete="off" />
        </FormField>
      </Modal>
    </>
  );
}
