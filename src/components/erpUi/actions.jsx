import React from "react";

/** Shared action / form chrome used across modules — keep in erpUi, do not fork. */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  icon: Icon,
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`erp-btn-primary inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...rest}
    >
      {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`erp-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, message, description, action, className = "" }) {
  const body = message || description;
  return (
    <div className={`text-center py-12 px-4 ${className}`.trim()}>
      {Icon ? <Icon className="w-10 h-10 mx-auto text-ink-disabled mb-3" /> : null}
      {title ? <h3 className="text-sm font-semibold text-ink-strong">{title}</h3> : null}
      {body ? <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function FormField({ label, error, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-secondary">
        {label}
        {required ? <span className="text-critical ml-0.5">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {hint && !error ? <p className="text-[10px] text-ink-muted mt-0.5">{hint}</p> : null}
      {error ? <p className="text-[10px] text-critical mt-0.5">{error}</p> : null}
    </label>
  );
}

/** Optional page wrapper: canvas padding already comes from Layout; use for consistent stack gap. */
export function PageShell({ children, className = "" }) {
  return <div className={`space-y-4 ${className}`.trim()}>{children}</div>;
}
