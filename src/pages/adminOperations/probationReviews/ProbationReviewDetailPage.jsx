/**
 * Corporate HR/Admin → Probation Reviews → review form. Ported from Indus One
 * `pages/ProbationReviewDetailPage.tsx`: same RPCs, same permission rules for who may
 * edit (L1) or act (L2 / HR), same confirmations, signature handling and PDF export.
 * The ERP has no react-query, so loads/mutations use local state; behaviour is unchanged.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "../../../lib/toast";
import { scoresComplete } from "./probationReviewForm";
import {
  actOnProbationReview,
  empCodesMatch,
  fetchProbationReview,
  fetchProbationSignerSignatureBlob,
  saveProbationReviewDraft,
  submitProbationReviewL1,
} from "./probationReviewApi";
import {
  fetchMySignatureBlobUrlFresh,
  fetchMySignatureMeta as fetchOwnSignatureMeta,
  fetchMySignaturePreviewUrl,
  revokeSignaturePreview,
} from "./probationSignatureApi";
import ProbationAppraisalDocument from "./ProbationAppraisalDocument";
import SignatureSection from "./SignatureSection";
import { downloadBlob, exportNodeToPdfBlob } from "./exportProbationPdf";
import { PROBATION_REVIEWS_PATH, useProbationReviewsAccess } from "./probationAccess";
import { t } from "./probationStrings";
import "./probationReview.css";
import "./probationIoTheme.css";
import { confirmDialog } from "../../../lib/dialog";

export default function ProbationReviewDetailPage() {
  const { id = "" } = useParams();
  const { userProfile } = useAuth();
  const access = useProbationReviewsAccess();
  const myCode = String(userProfile?.employee_code || "").trim() || access.employeeCode || "";
  const pdfRef = useRef(null);
  const signaturePanelRef = useRef(null);

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(null); // 'draft' | 'submit' | 'act'
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);

  const loadReview = useCallback(
    async ({ silent = false } = {}) => {
      if (!id) return;
      if (!silent) setLoading(true);
      try {
        const next = await fetchProbationReview(id);
        setReview(next);
        setLoadError(false);
      } catch (err) {
        console.error("[probation-reviews] detail", err);
        if (!silent) setLoadError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const canEditL1 =
    !!review &&
    !!myCode &&
    empCodesMatch(review.l1_code, myCode) &&
    ["awaiting_l1", "in_progress_l1", "correction_required"].includes(review.status);

  const stageAction = useMemo(() => {
    if (!review || !myCode) return null;
    if (review.status === "awaiting_l2" && empCodesMatch(review.l2_code, myCode)) return "l2";
    if (review.status === "awaiting_hr" && empCodesMatch(review.hr_code, myCode)) return "hr";
    return null;
  }, [review, myCode]);

  const activeSigRole = useMemo(() => {
    if (!review || !myCode) return null;
    if (canEditL1) return "l1";
    if (stageAction) return stageAction;
    return null;
  }, [review, myCode, canEditL1, stageAction]);

  const [scores, setScores] = useState({});
  const [recommendation, setRecommendation] = useState(null);
  const [l1Remarks, setL1Remarks] = useState("");
  const [l2Remarks, setL2Remarks] = useState("");
  const [comments, setComments] = useState("");
  const [actionMessage, setActionMessage] = useState(null);
  const [sigUrls, setSigUrls] = useState({});
  const [hasMySignature, setHasMySignature] = useState(false);
  const [mySignaturePreviewUrl, setMySignaturePreviewUrl] = useState(null);

  useEffect(() => {
    if (!review) return;
    setScores(review.draft_scores || review.scores || {});
    setRecommendation(review.draft_recommendation || review.recommendation || null);
    setL1Remarks(review.l1_remarks || "");
    setL2Remarks(review.l2_remarks || "");
    setActionMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.id, review?.updated_at]);

  useEffect(() => {
    // Revoke only on leave — keep blob URL alive after sign so preview stays visible.
    return () => {
      revokeSignaturePreview();
    };
  }, []);

  const iAmSignedL1 = Boolean(myCode && review?.l1_submitted_at && empCodesMatch(review.l1_code, myCode));
  const iAmSignedL2 = Boolean(
    myCode && review?.l2_signed_at && review.l2_code && empCodesMatch(review.l2_code, myCode)
  );
  const iAmSignedHr = Boolean(myCode && review?.hr_signed_at && empCodesMatch(review.hr_code, myCode));
  const needOwnSignatureImage = Boolean(activeSigRole || iAmSignedL1 || iAmSignedL2 || iAmSignedHr);

  useEffect(() => {
    let cancelled = false;
    let pollTimer;
    let found = false;

    async function loadMine() {
      if (!needOwnSignatureImage) {
        setHasMySignature(false);
        return;
      }
      try {
        const meta = await fetchOwnSignatureMeta();
        if (cancelled) return;
        setHasMySignature(meta.has_signature);
        if (meta.has_signature) {
          found = true;
          const url = await fetchMySignaturePreviewUrl();
          if (!cancelled) setMySignaturePreviewUrl(url);
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = undefined;
          }
        } else {
          setMySignaturePreviewUrl(null);
        }
      } catch {
        if (!cancelled) {
          setHasMySignature(false);
          setMySignaturePreviewUrl(null);
        }
      }
    }

    void loadMine();
    // After upload via SignatureSection, pick up the new signature without a full page reload.
    if (activeSigRole) {
      pollTimer = setInterval(() => {
        if (!found) void loadMine();
      }, 2500);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSigRole, needOwnSignatureImage, review?.id, review?.updated_at]);

  const ownedSigUrlsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const created = [];

    async function resolveSignerUrl(...codes) {
      const tried = new Set();
      for (const raw of codes) {
        const code = raw != null ? String(raw).trim() : "";
        if (!code || tried.has(code.toLowerCase())) continue;
        tried.add(code.toLowerCase());
        try {
          const url = await fetchProbationSignerSignatureBlob(review.id, code);
          if (url) return url;
        } catch {
          /* try next code / fallback */
        }
      }
      // Own signature: get-employee-signature works even when probation edge lookup misses.
      for (const raw of codes) {
        const code = raw != null ? String(raw).trim() : "";
        if (!code || !myCode || !empCodesMatch(code, myCode)) continue;
        try {
          return await fetchMySignatureBlobUrlFresh();
        } catch {
          return null;
        }
      }
      return null;
    }

    async function loadSigs() {
      if (!review) return;
      const next = {};
      const pairs = [
        ["l1", [review.l1_signer_code, review.l1_code], Boolean(review.l1_submitted_at)],
        ["l2", [review.l2_signer_code, review.l2_code], Boolean(review.l2_signed_at)],
        ["hr", [review.hr_signer_code, review.hr_code], Boolean(review.hr_signed_at)],
      ];
      for (const [key, codes, signed] of pairs) {
        if (!signed) continue;
        const url = await resolveSignerUrl(...codes);
        if (!url) continue;
        created.push(url);
        next[key] = url;
      }
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      // Replace previous owned URLs only after successful merge (never write null over a preview).
      const prevOwned = ownedSigUrlsRef.current;
      ownedSigUrlsRef.current = created;
      setSigUrls((prev) => ({ ...prev, ...next }));
      prevOwned.forEach((u) => {
        if (!created.includes(u)) URL.revokeObjectURL(u);
      });
    }
    void loadSigs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.id, review?.status, review?.l1_submitted_at, review?.l2_signed_at, review?.hr_signed_at, myCode]);

  useEffect(() => {
    return () => {
      ownedSigUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      ownedSigUrlsRef.current = [];
    };
  }, []);

  /** Keep signature image visible immediately after signing (before blob reload). */
  const seedSignedPreview = (role) => {
    void (async () => {
      let url = null;
      try {
        url = await fetchMySignatureBlobUrlFresh();
      } catch {
        /* ignore */
      }
      if (!url && mySignaturePreviewUrl) {
        try {
          const res = await fetch(mySignaturePreviewUrl);
          url = URL.createObjectURL(await res.blob());
        } catch {
          url = mySignaturePreviewUrl;
        }
      }
      if (!url) return;
      ownedSigUrlsRef.current.push(url);
      setSigUrls((prev) => ({ ...prev, [role]: url }));
    })();
  };

  /** Run a mutation like Indus One's useMutation: busy flag, success/error messages, refetch. */
  const runMutation = async (kind, fn, onSuccess) => {
    setPending(kind);
    try {
      const result = await fn();
      await onSuccess(result);
      await loadReview({ silent: true });
    } catch (err) {
      if (err?.message === "cancelled") return;
      const text = err?.message || t("errors.generic");
      setActionMessage({ text, ok: false });
      toast.error(text);
    } finally {
      setPending(null);
    }
  };

  const saveDraft = () =>
    runMutation(
      "draft",
      () => saveProbationReviewDraft(id, scores, recommendation, l1Remarks),
      async () => {
        setActionMessage({ text: t("probation.draftSaved"), ok: true });
        toast.success(t("probation.draftSaved"));
      }
    );

  const submitL1 = () =>
    runMutation(
      "submit",
      async () => {
        if (!recommendation) throw new Error(t("probation.recommendationRequired"));
        if (!review || !scoresComplete(scores, review.is_work_level_2)) {
          throw new Error(t("probation.scoresRequired"));
        }
        const meta = await fetchOwnSignatureMeta();
        if (!meta.has_signature) throw new Error(t("probation.signatureRequired"));
        if (!(await confirmDialog({ title: "Submit review", message: t("probation.submitConfirm"), confirmLabel: "Submit" }))) throw new Error("cancelled");
        return submitProbationReviewL1(id, scores, recommendation, l1Remarks);
      },
      async () => {
        seedSignedPreview("l1");
        setActionMessage({ text: t("probation.submitted"), ok: true });
        toast.success(t("probation.submitted"));
      }
    );

  const act = (action) =>
    runMutation(
      "act",
      async () => {
        if (!stageAction) throw new Error(t("probation.notAuthorized"));
        if (action === "return" && !comments.trim()) throw new Error(t("probation.correctionRequired"));
        if (action === "approve") {
          const meta = await fetchOwnSignatureMeta();
          if (!meta.has_signature) throw new Error(t("probation.signatureRequired"));
          if (!(await confirmDialog({ title: "Approve review", message: t("probation.approveConfirm"), confirmLabel: "Approve" }))) throw new Error("cancelled");
        }
        const note = action === "approve" && stageAction === "l2" ? l2Remarks : comments;
        return actOnProbationReview(id, stageAction, action, note);
      },
      async () => {
        if (action === "approve" && stageAction) seedSignedPreview(stageAction);
        const text = action === "approve" ? t("probation.approved") : t("probation.returned");
        setActionMessage({ text, ok: true });
        toast.success(text);
        setComments("");
      }
    );

  /** Load every signed role's signature image into the DOM before PDF capture. */
  const ensureSignaturesForPdf = async () => {
    if (!review) return;
    const pairs = [
      ["l1", [review.l1_signer_code, review.l1_code], Boolean(review.l1_submitted_at)],
      ["l2", [review.l2_signer_code, review.l2_code], Boolean(review.l2_signed_at)],
      ["hr", [review.hr_signer_code, review.hr_code], Boolean(review.hr_signed_at)],
    ];
    const next = { ...sigUrls };
    for (const [role, codes, signed] of pairs) {
      if (!signed || next[role]) continue;
      const tried = new Set();
      for (const raw of codes) {
        const code = raw != null ? String(raw).trim() : "";
        if (!code || tried.has(code.toLowerCase())) continue;
        tried.add(code.toLowerCase());
        try {
          const url = await fetchProbationSignerSignatureBlob(review.id, code);
          if (url) {
            ownedSigUrlsRef.current.push(url);
            next[role] = url;
            break;
          }
        } catch {
          /* try next */
        }
      }
      if (!next[role] && myCode && codes.some((c) => c && empCodesMatch(String(c), myCode))) {
        try {
          const url = await fetchMySignatureBlobUrlFresh();
          if (url) {
            ownedSigUrlsRef.current.push(url);
            next[role] = url;
          }
        } catch {
          /* ignore */
        }
      }
    }
    flushSync(() => {
      setSigUrls(next);
    });
    const root = pdfRef.current;
    if (!root) return;
    await Promise.all(
      Array.from(root.querySelectorAll("img.pr-sigimg")).map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return img.decode().catch(() => undefined);
      })
    );
  };

  const exportPdf = async () => {
    if (!pdfRef.current || !review) return;
    try {
      await ensureSignaturesForPdf();
      const blob = await exportNodeToPdfBlob(pdfRef.current);
      downloadBlob(blob, `probation-review-${review.employee_code}-v${review.document_version}.pdf`);
      toast.success(t("probation.pdfReady"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.generic"));
    }
  };

  const openSignaturePanel = () => {
    setShowSignaturePanel(true);
    requestAnimationFrame(() => signaturePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const backLink = (
    <Link to={PROBATION_REVIEWS_PATH} className="io-link inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="h-4 w-4" />
      {t("probation.back")}
    </Link>
  );

  if (loading) {
    return (
      <div className="probation-io space-y-4 p-4 pb-6 sm:p-6">
        <div className="io-panel flex items-center justify-center gap-2 px-5 py-16 text-sm">
          <Loader2 className="io-text-muted h-4 w-4 animate-spin" />
          <span className="io-text-muted">{t("probation.loading")}</span>
        </div>
      </div>
    );
  }

  if (loadError || !review) {
    return (
      <div className="probation-io space-y-4 p-4 pb-6 sm:p-6">
        {backLink}
        <div
          role="alert"
          className="rounded-[14px] border border-[var(--status-danger)]/20 bg-[var(--status-danger-wash)] px-5 py-6 text-sm text-[var(--status-danger)]"
        >
          {t("probation.loadFailed")}
        </div>
      </div>
    );
  }

  const busy = pending != null;

  const signFormLabel = canEditL1
    ? t("probation.signForm")
    : stageAction === "l2"
      ? t("probation.approveSign")
      : stageAction === "hr"
        ? t("probation.signFinalize")
        : t("probation.signForm");

  const onSignForm = () => {
    if (canEditL1) {
      void submitL1();
      return;
    }
    if (stageAction) void act("approve");
  };

  const actions = (() => {
    if (review.status === "finalized") {
      return (
        <span style={{ color: "var(--pr-ok, #1f7a4d)", fontWeight: 600 }}>
          Review finalized. Use Download PDF for the signed copy.
        </span>
      );
    }
    if (canEditL1) {
      return (
        <button type="button" className="pr-btn" disabled={busy} onClick={() => void saveDraft()}>
          {t("probation.saveDraft")}
        </button>
      );
    }
    if (stageAction) {
      return (
        <button type="button" className="pr-btn pr-btn-warn" disabled={busy} onClick={() => void act("return")}>
          {t("probation.returnToL1")}
        </button>
      );
    }
    return null;
  })();

  return (
    <div className="probation-io pr-page space-y-4 p-4 pb-6 sm:p-6">
      <div className="io-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        {backLink}
        <div className="flex flex-wrap items-center gap-2">
          {(review.status === "finalized" || review.l1_submitted_at || canEditL1) && (
            <button
              type="button"
              onClick={() => void exportPdf()}
              className="io-btn-secondary io-btn-sm inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {t("probation.downloadPdf")}
            </button>
          )}
        </div>
      </div>

      <ProbationAppraisalDocument
        ref={pdfRef}
        review={review}
        scores={scores}
        recommendation={recommendation}
        l1Remarks={l1Remarks}
        l2Remarks={l2Remarks}
        returnComments={comments}
        canEditL1={canEditL1}
        canEditL2Remarks={stageAction === "l2"}
        showReturnComments={Boolean(stageAction)}
        activeSigRole={activeSigRole}
        signatureUrls={sigUrls}
        mySignaturePreviewUrl={mySignaturePreviewUrl}
        mySignatureIsForRole={
          myCode && review.l1_submitted_at && empCodesMatch(review.l1_code, myCode)
            ? "l1"
            : myCode && review.l2_signed_at && review.l2_code && empCodesMatch(review.l2_code, myCode)
              ? "l2"
              : myCode && review.hr_signed_at && empCodesMatch(review.hr_code, myCode)
                ? "hr"
                : null
        }
        hasMySignature={hasMySignature}
        signFormLabel={signFormLabel}
        onSignForm={onSignForm}
        onOpenSignature={openSignaturePanel}
        busy={busy}
        actionMessage={actionMessage}
        actions={actions}
        onScoreChange={(key, n) => setScores((prev) => ({ ...prev, [key]: n }))}
        onRecommendationChange={setRecommendation}
        onL1RemarksChange={setL1Remarks}
        onL2RemarksChange={setL2Remarks}
        onReturnCommentsChange={setComments}
      />

      {showSignaturePanel ? (
        <div ref={signaturePanelRef}>
          <SignatureSection enabled />
        </div>
      ) : null}

      {review.history && review.history.length > 0 ? (
        <section className="io-panel p-4 sm:p-5">
          <h2 className="io-text mb-3 text-base font-semibold">{t("probation.timeline")}</h2>
          <ol className="space-y-0">
            {review.history.map((h) => (
              <li
                key={h.id}
                className="io-row-divider flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm last:border-0"
              >
                <div>
                  <p className="io-text font-medium">{h.event_type}</p>
                  <p className="io-text-muted text-xs">
                    {[h.actor_name || h.actor_code, h.to_status ? `→ ${h.to_status}` : ""].filter(Boolean).join(" ")}
                  </p>
                </div>
                <time className="io-text-muted shrink-0 text-xs">{new Date(h.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
