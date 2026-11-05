/**
 * Corporate HR/Admin → Probation Reviews (list). Ported from Indus One
 * `pages/ProbationReviewsPage.tsx`: same RPC (`list_my_probation_reviews`), same
 * pending / history split and row layout. Route access is enforced by ProbationReviewsGuard.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Hash } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { empCodesMatch, fetchMyProbationReviews } from "./probationReviewApi";
import { needsMyProbationAction } from "./probationReviewForm";
import { PROBATION_REVIEWS_PATH, useProbationReviewsAccess } from "./probationAccess";
import { t } from "./probationStrings";
import "./probationIoTheme.css";

function statusClass(status) {
  if (status === "overdue" || status === "correction_required") return "io-badge io-badge-danger";
  if (status === "finalized") return "io-badge io-badge-success";
  if (status === "cancelled") return "io-badge io-badge-neutral";
  return "io-badge io-badge-warning";
}

export function ProbationPageHeader() {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="io-text text-[24px] font-semibold tracking-tight sm:text-[26px]">{t("probation.title")}</h1>
        <p className="io-text-secondary mt-1 max-w-2xl text-sm leading-relaxed">{t("probation.subtitle")}</p>
      </div>
    </div>
  );
}

export function ProbationSkeleton() {
  return (
    <div className="io-panel overflow-hidden p-4" aria-busy="true">
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function ProbationReviewsPage() {
  const { userProfile } = useAuth();
  const access = useProbationReviewsAccess();
  const myCode = String(userProfile?.employee_code || "").trim() || access.employeeCode || null;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchMyProbationReviews(true)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        console.error("[probation-reviews] list", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { pending, history } = useMemo(
    () => ({
      pending: rows.filter((r) => needsMyProbationAction(r, myCode, empCodesMatch)),
      history: rows.filter((r) => !needsMyProbationAction(r, myCode, empCodesMatch)),
    }),
    [rows, myCode]
  );

  return (
    <div className="probation-io space-y-8 p-4 sm:p-6">
      <ProbationPageHeader />

      {loading ? (
        <ProbationSkeleton />
      ) : failed ? (
        <div
          role="alert"
          className="rounded-[14px] border border-[var(--status-danger)]/20 bg-[var(--status-danger-wash)] px-5 py-6 text-sm text-[var(--status-danger)]"
        >
          {t("probation.loadFailed")}
        </div>
      ) : rows.length === 0 ? (
        <div className="io-panel overflow-hidden">
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="io-text text-[15px] font-semibold">{t("probation.empty")}</p>
          </div>
        </div>
      ) : (
        <>
          <Section title={t("probation.pendingSection")} items={pending} />
          <Section title={t("probation.historySection")} items={history} />
        </>
      )}
    </div>
  );
}

function Section({ title, items }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="io-text text-base font-semibold">{title}</h2>
        <span className="font-mono-io io-text-muted text-xs">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="io-panel px-5 py-6">
          <p className="io-text-muted text-sm">{t("probation.noneInSection")}</p>
        </div>
      ) : (
        <ul className="io-panel divide-y divide-[var(--border-subtle)] overflow-hidden">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                to={`${PROBATION_REVIEWS_PATH}/${encodeURIComponent(r.id)}`}
                className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--card-muted)] sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="io-text truncate font-semibold">{r.employee_name || r.employee_code}</p>
                    <span className={`shrink-0 capitalize ${statusClass(r.display_status)}`}>
                      {t(`probation.status.${r.display_status}`, { defaultValue: r.display_status })}
                    </span>
                  </div>
                  <div className="io-text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                      {r.employee_code}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                      DOJ {r.date_of_joining}
                    </span>
                    <span>Trigger {r.trigger_date}</span>
                    <span
                      className={
                        r.is_overdue || r.display_status === "overdue"
                          ? "font-semibold text-[var(--status-danger)]"
                          : undefined
                      }
                    >
                      Due {r.deadline_date}
                    </span>
                  </div>
                </div>
                <ArrowRight className="io-text-muted h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-primary)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
