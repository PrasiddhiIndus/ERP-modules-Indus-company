import React from "react";
import { ArrowUpRight } from "lucide-react";
import { Modal, StatusChip } from "../../components/erpUi";

const SEVERITY = {
  risk: "critical",
  watch: "warning",
  info: "info",
  ok: "neutral",
};

export default function CompanyPulseDetail({ detail, onClose, onOpen }) {
  const open = Boolean(detail);
  const title = detail?.title || "Detail";

  const footer =
    detail?.actions?.length > 0 ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="erp-btn-secondary h-9 px-3" onClick={onClose}>
          Close
        </button>
        {detail.actions.map((action) => (
          <button
            key={`${action.label}:${action.path || ""}`}
            type="button"
            className="erp-btn-primary h-9 px-3 inline-flex items-center gap-1.5"
            onClick={() => {
              if (action.path) onOpen?.(action.path);
              onClose?.();
            }}
          >
            {action.label}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    ) : (
      <div className="flex justify-end">
        <button type="button" className="erp-btn-secondary h-9 px-3" onClick={onClose}>
          Close
        </button>
      </div>
    );

  return (
    <Modal open={open} title={title} onClose={onClose} footer={footer} widthClass="max-w-2xl">
      {!detail ? null : (
        <div className="cp-detail space-y-4">
          {detail.subtitle ? <p className="type-meta text-ink-secondary -mt-1">{detail.subtitle}</p> : null}

          {detail.headline ? (
            <div className="rounded-xl border border-border bg-surface-sunken px-4 py-3">
              <p className="type-mono-caption text-ink-muted uppercase tracking-wide">{detail.headline.label}</p>
              <p className="type-figure text-ink-strong mt-1 tabular-nums">{detail.headline.value}</p>
            </div>
          ) : null}

          {detail.attention?.length ? (
            <section>
              <h5 className="type-mono-caption text-ink-muted uppercase tracking-wide mb-2">Needs attention</h5>
              <div className="flex flex-wrap gap-2">
                {detail.attention.map((item) => (
                  <StatusChip
                    key={`${item.label}:${item.value}`}
                    label={`${item.label}: ${item.value}`}
                    severity={SEVERITY[item.severity] || "warning"}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {detail.metrics?.length ? (
            <section>
              <h5 className="type-mono-caption text-ink-muted uppercase tracking-wide mb-2">Snapshot</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {detail.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <p className="type-mono-caption text-ink-muted">{metric.label}</p>
                    <p className="type-body-medium text-ink-strong mt-1 tabular-nums">{metric.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {detail.rows?.length ? (
            <section>
              <h5 className="type-mono-caption text-ink-muted uppercase tracking-wide mb-2">Breakout</h5>
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {detail.rows.map((row) => (
                  <li key={`${row.label}:${row.value}:${row.meta || ""}`}>
                    {row.path ? (
                      <button
                        type="button"
                        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-row-hover"
                        onClick={() => {
                          onOpen?.(row.path);
                          onClose?.();
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block type-body-medium text-ink-strong">{row.label}</span>
                          {row.meta ? <span className="block type-meta text-ink-muted mt-0.5">{row.meta}</span> : null}
                        </span>
                        <span className="shrink-0 inline-flex items-center gap-1 type-num text-ink-strong">
                          {row.value}
                          <ArrowUpRight size={13} className="text-accent" />
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block type-body-medium text-ink-strong">{row.label}</span>
                          {row.meta ? <span className="block type-meta text-ink-muted mt-0.5">{row.meta}</span> : null}
                        </span>
                        <span className="shrink-0 type-num text-ink-strong">{row.value}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.note ? <p className="type-meta text-ink-secondary">{detail.note}</p> : null}
        </div>
      )}
    </Modal>
  );
}
