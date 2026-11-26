import React from "react";
import { Link, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { helpHrefForPath, QA_BASE_MANUAL } from "../manual/loadManual";

export { helpHrefForPath };

/** Contextual "?" that opens the matching user-manual section. */
export function QaHelpButton({ anchor, className = "", label = "Open user manual" }) {
  const { pathname } = useLocation();
  const href = anchor ? `${QA_BASE_MANUAL}#${anchor}` : helpHrefForPath(pathname);
  return (
    <Link
      to={href}
      className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md border border-border bg-surface text-ink-secondary hover:bg-surface-sunken hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`.trim()}
      aria-label={label}
      title={label}
    >
      <HelpCircle className="w-4 h-4" aria-hidden />
    </Link>
  );
}

/** Inline "?" next to a blocked-action explanation. */
export function QaBlockedHelp({ className = "" }) {
  return (
    <Link
      to={`${QA_BASE_MANUAL}#why-cant-i`}
      className={`inline-flex items-center justify-center min-w-[28px] min-h-[28px] rounded text-ink-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className}`.trim()}
      aria-label="Why can't I? Open user manual"
      title="Why can't I?"
    >
      <HelpCircle className="w-3.5 h-3.5" aria-hidden />
    </Link>
  );
}

export function QaBlockedLine({ children, className = "" }) {
  if (!children) return null;
  return (
    <p className={`text-[10px] text-ink-muted inline-flex items-start gap-1 ${className}`.trim()}>
      <span>{children}</span>
      <QaBlockedHelp />
    </p>
  );
}
