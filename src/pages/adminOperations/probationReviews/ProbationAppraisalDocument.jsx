/**
 * PERFORMANCE APPRAISAL FORM [PROBATION REVIEW] — ported from Indus One
 * `components/probation/ProbationAppraisalDocument.tsx`. Same layout, fields, rubric,
 * scoring, recommendations, remarks, signatures and actions; keep the two in step.
 *
 * Only difference: Indus One links "My signature" / "Change signature" to its Profile page.
 * The ERP has no such page, so those links open the same signature panel on this page
 * (`onOpenSignature`), which saves to the same shared signature store.
 */
import React, { forwardRef } from "react";
import {
  PROBATION_RECOMMENDATIONS,
  PROBATION_WORKFLOW_STEPS,
  activeProbationCompetencies,
  scoredCompetencyCount,
} from "./probationReviewForm";
import SignatureSection from "./SignatureSection";
import { t } from "./probationStrings";
import "./probationReview.css";

const STEP_LABEL = {
  awaiting_l1: "Awaiting L1",
  in_progress_l1: "L1 filling",
  awaiting_l2: "L2 approval",
  awaiting_hr: "HR sign",
  awaiting_md: "Finalized", // legacy status — MD step removed
  finalized: "Finalized",
};

const ROLE_LABEL = {
  l1: "Reporting Manager (L1)",
  l2: "L2 Approver",
  hr: "HR Manager",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = iso.length === 10 ? iso : iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ProbationAppraisalDocument = forwardRef(function ProbationAppraisalDocument(
  {
    review,
    scores,
    recommendation,
    l1Remarks,
    l2Remarks,
    returnComments,
    canEditL1,
    canEditL2Remarks,
    showReturnComments,
    activeSigRole,
    signatureUrls,
    mySignaturePreviewUrl,
    mySignatureIsForRole,
    hasMySignature,
    signFormLabel,
    onSignForm,
    onOpenSignature,
    busy,
    actionMessage,
    actions,
    onScoreChange,
    onRecommendationChange,
    onL1RemarksChange,
    onL2RemarksChange,
    onReturnCommentsChange,
  },
  ref
) {
  const comps = activeProbationCompetencies(review.is_work_level_2);
  const summary = scoredCompetencyCount(scores, review.is_work_level_2);
  const stage = review.status === "awaiting_md" ? "finalized" : review.status;
  const stepIdx = PROBATION_WORKFLOW_STEPS.indexOf(stage === "correction_required" ? "in_progress_l1" : stage);

  const statusChip =
    stage === "finalized"
      ? { cls: "pr-chip-fin", label: "Finalized" }
      : stage === "correction_required"
        ? { cls: "pr-chip-corr", label: "Correction required" }
        : stage === "cancelled"
          ? { cls: "pr-chip-corr", label: "Cancelled" }
          : {
              cls: "pr-chip-l1",
              label: `Current: ${STEP_LABEL[stage] || stage}${
                review.is_overdue || review.display_status === "overdue" ? " · Overdue" : ""
              }`,
            };

  const sigMeta = [
    { role: "l1", name: review.l1_name, code: review.l1_signer_code || review.l1_code, at: review.l1_submitted_at },
    { role: "l2", name: review.l2_name, code: review.l2_signer_code || review.l2_code, at: review.l2_signed_at },
    { role: "hr", name: review.hr_name, code: review.hr_signer_code || review.hr_code, at: review.hr_signed_at },
  ];

  const signatureLink = (label, className) => (
    <button type="button" className={className} onClick={() => onOpenSignature?.()}>
      {label}
    </button>
  );

  return (
    <div className="pr-sheet" ref={ref}>
      <header className="pr-doc-head">
        <div className="pr-doc-title-row">
          <h1>PERFORMANCE APPRAISAL FORM [PROBATION REVIEW]</h1>
          <span className={`pr-chip ${statusChip.cls}`}>{statusChip.label}</span>
        </div>
        <div className="pr-stripe" />
        <div className="pr-fields">
          <div className="pr-fld">
            <label>Name</label>
            <input readOnly value={review.employee_name || ""} placeholder="Employee full name" />
          </div>
          <div className="pr-fld">
            <label>Employee No</label>
            <input readOnly value={review.employee_code || ""} placeholder="e.g. IFS-0000" />
          </div>
          <div className="pr-fld">
            <label>Designation</label>
            <input readOnly value={review.designation || ""} placeholder="Designation" />
          </div>
          <div className="pr-fld">
            <label>Department</label>
            <input readOnly value={review.department || ""} placeholder="Department" />
          </div>
          <div className="pr-fld">
            <label>Date of Joining</label>
            <input readOnly value={formatDate(review.date_of_joining)} />
          </div>
          <div className="pr-fld">
            <label>Probation Completion Date</label>
            <input readOnly value={formatDate(review.probation_completion_date)} />
          </div>
          <div className="pr-fld">
            <label>Work Level</label>
            <input
              readOnly
              value={review.is_work_level_2 ? "Work Level 2 (includes Supervisory)" : "Work Level 1"}
            />
          </div>
          <div className="pr-fld">
            <label>Review Deadline</label>
            <input
              readOnly
              value={formatDate(review.deadline_date)}
              className={
                review.is_overdue || review.display_status === "overdue" ? "text-[var(--pr-bad,#b3261e)]" : undefined
              }
            />
          </div>
        </div>
        {review.correction_comments ? (
          <div className="pr-banner">
            <strong>{t("probation.correctionBanner")}</strong>
            <p className="m-0 whitespace-pre-wrap">{review.correction_comments}</p>
          </div>
        ) : null}
      </header>

      <section className="pr-section">
        <div className="pr-stage">
          {PROBATION_WORKFLOW_STEPS.map((s, i) => {
            let cls = "pr-step";
            if (stage === "correction_required") {
              if (s === "in_progress_l1") cls += " pr-step-corr";
            } else if (stepIdx >= 0) {
              if (i < stepIdx) cls += " pr-step-done";
              else if (i === stepIdx) cls += " pr-step-cur";
            }
            return (
              <React.Fragment key={s}>
                <span className={cls}>{STEP_LABEL[s]}</span>
                {i < PROBATION_WORKFLOW_STEPS.length - 1 ? <span className="pr-arrow">›</span> : null}
              </React.Fragment>
            );
          })}
          {stage === "correction_required" ? (
            <span className="pr-step pr-step-corr">Correction required: returned to L1</span>
          ) : null}
        </div>
      </section>

      <section className="pr-section">
        <div className="pr-summary">
          <span>
            Competencies scored:{" "}
            <b>
              {summary.scored} / {summary.total}
            </b>
          </span>
          <span>
            Average score: <b>{summary.average != null ? summary.average.toFixed(2) : "–"}</b>
          </span>
          <span style={{ color: "var(--pr-mut)" }}>
            Score 1 = significantly below expectations · Score 5 = exceptional
          </span>
        </div>

        {comps.map((cp) => (
          <div key={cp.key}>
            <h2 className="pr-comp">
              COMPETENCY {cp.n}: {cp.title.toUpperCase()}
            </h2>
            <div className="pr-comp-sub">({cp.subtitle})</div>
            <table className="pr-rub">
              <tbody>
                {cp.levels.map((level, i) => {
                  const n = i + 1;
                  const sel = scores[cp.key] === n;
                  return (
                    <tr key={n} className={sel ? "pr-sel" : undefined}>
                      <td className="pr-sc">
                        <label className={canEditL1 ? undefined : "pr-ro"}>
                          <input
                            type="radio"
                            name={cp.key}
                            value={n}
                            checked={sel}
                            disabled={!canEditL1 || busy}
                            onChange={() => onScoreChange(cp.key, n)}
                          />
                          <span>
                            <span className="pr-n">Score {n}</span>
                          </span>
                        </label>
                      </td>
                      <td>
                        <ul>
                          {level.bullets.map((b) => (
                            <li key={b} className={level.placeholder ? "pr-ph" : undefined}>
                              {b}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="pr-section">
        <h2 className="pr-comp">RECOMMENDATION</h2>
        <div className="pr-recs">
          {PROBATION_RECOMMENDATIONS.map((opt) => {
            const checked = recommendation === opt.value;
            return (
              <label
                key={opt.value}
                className={[checked ? "pr-checked" : "", canEditL1 ? "" : "pr-ro"].filter(Boolean).join(" ")}
              >
                <input
                  type="radio"
                  name="recommendation"
                  value={opt.value}
                  checked={checked}
                  disabled={!canEditL1 || busy}
                  onChange={() => onRecommendationChange(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>

        <div className="pr-rem">
          <div>
            <label>L1 Remarks</label>
            <span className="pr-filled-by">
              {t("probation.remarksFilledBy", {
                name: [review.l1_name, review.l1_code].filter(Boolean).join(" · ") || "—",
              })}
            </span>
            <textarea
              value={l1Remarks}
              disabled={!canEditL1 || busy}
              onChange={(e) => onL1RemarksChange(e.target.value)}
              placeholder="Remarks by reporting manager"
            />
          </div>
          <div>
            <label>L2 Remarks</label>
            <span className="pr-filled-by">
              {t("probation.remarksFilledBy", {
                name: [review.l2_name, review.l2_code].filter(Boolean).join(" · ") || "—",
              })}
            </span>
            <textarea
              value={l2Remarks}
              disabled={!canEditL2Remarks || busy}
              onChange={(e) => onL2RemarksChange(e.target.value)}
              placeholder={canEditL2Remarks ? "Remarks at approval" : t("probation.l2RemarksPending")}
            />
          </div>
        </div>

        {showReturnComments ? (
          <div className="mt-3.5">
            <label className="pr-ret-label">Return comments (required when returning)</label>
            <textarea
              style={{ minHeight: 60, marginTop: 4 }}
              value={returnComments}
              disabled={busy}
              onChange={(e) => onReturnCommentsChange(e.target.value)}
              placeholder="What needs to be corrected"
            />
          </div>
        ) : null}
      </section>

      <section className="pr-section">
        <h2 className="pr-comp">APPROVAL &amp; SIGNATURES</h2>
        <p className="pr-comp-sub pr-no-print" style={{ marginTop: 8 }}>
          {t("probation.signHint")} {signatureLink(t("probation.mySignature"), "io-link font-medium")}
        </p>
        <div className="pr-sigs">
          {sigMeta.map(({ role, name, code, at }) => {
            const active = activeSigRole === role;
            const signed = Boolean(at);
            // Prefer stored signer blob; fall back to caller's own preview for their signed role.
            const imgUrl =
              signatureUrls[role] ||
              ((active || mySignatureIsForRole === role) && mySignaturePreviewUrl ? mySignaturePreviewUrl : null) ||
              null;
            return (
              <div key={role} className={`pr-sig ${active ? "pr-sig-active" : ""}`}>
                <div className="pr-hd">
                  <b>
                    {ROLE_LABEL[role]}
                    {name || code ? (
                      <span className="pr-filled-by" style={{ marginTop: 2 }}>
                        {[name, code].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </b>
                  {signed ? (
                    <span className="pr-st pr-st-ok">Signed {formatDateTime(at)}</span>
                  ) : active ? (
                    <span className="pr-st pr-st-active">Your signature</span>
                  ) : (
                    <span className="pr-st pr-st-p">Pending</span>
                  )}
                </div>
                <div className="pr-box">
                  {imgUrl ? (
                    <img className="pr-sigimg" src={imgUrl} alt={`${ROLE_LABEL[role]} signature`} />
                  ) : signed ? (
                    <span className="pr-st pr-st-ok">Signed {formatDateTime(at)}</span>
                  ) : (
                    <span>Signature will appear here</span>
                  )}
                </div>
                {active && !signed ? (
                  hasMySignature && mySignaturePreviewUrl ? (
                    <div className="pr-sign-tools pr-no-print">
                      <button
                        type="button"
                        className="pr-btn pr-btn-pri"
                        disabled={busy || !onSignForm}
                        onClick={() => onSignForm?.()}
                      >
                        {signFormLabel || t("probation.signForm")}
                      </button>
                      {signatureLink(t("probation.changeSignature"), "io-link text-xs font-medium")}
                    </div>
                  ) : (
                    <div className="pr-box pr-box-missing pr-no-print">
                      <p className="m-0 text-sm text-[var(--pr-bad,#b3261e)]">{t("probation.signatureRequired")}</p>
                      <SignatureSection enabled />
                      <button
                        type="button"
                        className="pr-btn pr-btn-pri"
                        disabled
                        title={t("probation.signatureRequired")}
                      >
                        {signFormLabel || t("probation.signForm")}
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="pr-acts pr-no-print">
        <div className={`pr-msg ${actionMessage ? (actionMessage.ok ? "pr-msg-ok" : "pr-msg-err") : ""}`}>
          {actionMessage?.text || ""}
        </div>
        <div className="pr-acts-r">{actions}</div>
      </div>

      <div className="pr-foot">
        Approval chain: L1 → L2 → HR (code 10935). Returns send the review back to L1 with a new document version.
        Document version {review.document_version}
        {review.finalized_at ? ` · Finalized ${formatDateTime(review.finalized_at)}` : ""}.
      </div>
    </div>
  );
});

export default ProbationAppraisalDocument;
