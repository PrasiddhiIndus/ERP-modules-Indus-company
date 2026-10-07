import React from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileSignature,
  FileText,
  Mail,
  MailWarning,
  MessageSquare,
  PhoneCall,
  Send,
  Star,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { ACTIVITY_TYPES, TONE_CLASSES } from "./recruitmentConfig";
import { EmptyState, fmtDateTime } from "./RecruitmentUi";

const ICONS = {
  candidate_added: UserPlus,
  imported: UserPlus,
  called: PhoneCall,
  screened: ClipboardList,
  stage_changed: Star,
  interview_scheduled: CalendarClock,
  interview_rescheduled: CalendarClock,
  interview_attended: CalendarCheck,
  interview_evaluated: CheckCircle2,
  interview_no_show: CalendarX,
  interview_cancelled: CalendarX,
  offer_generated: FileText,
  offer_sent: Send,
  offer_accepted: FileSignature,
  offer_declined: XCircle,
  offer_expired: XCircle,
  appointment_generated: FileText,
  appointment_sent: Send,
  appointment_signed: FileSignature,
  document_submitted: FileCheck2,
  document_resubmitted: FileCheck2,
  document_verified: FileCheck2,
  document_rejected: XCircle,
  employee_created: UserCheck,
  employee_linked: UserCheck,
  email_sent: Mail,
  email_failed: MailWarning,
  closed: XCircle,
  approved: CheckCircle2,
  rejected: XCircle,
  note: MessageSquare,
};

export default function ActivityTimeline({ items }) {
  if (!items?.length) return <EmptyState title="No activity yet" />;
  return (
    <ol className="relative space-y-4 border-l border-divider pl-6">
      {items.map((item) => {
        const meta = ACTIVITY_TYPES[item.type] || { label: String(item.type || "Update").replace(/_/g, " "), tone: "neutral" };
        const Icon = ICONS[item.type] || MessageSquare;
        return (
          <li key={item.id} className="relative">
            <span
              className={`absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border ${TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral}`}
              aria-hidden
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-xs font-medium capitalize text-ink">{meta.label}</p>
              <time dateTime={item.at} className="text-[11px] tabular-nums text-ink-muted">
                {fmtDateTime(item.at)}
              </time>
            </div>
            <p className="text-[11px] text-ink-secondary">by {item.by}</p>
            {item.note ? <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-sunken px-2 py-1 text-[11px] text-ink">{item.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
