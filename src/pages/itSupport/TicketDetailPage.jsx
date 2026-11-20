import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock, MessageSquare, Paperclip } from "lucide-react";
import {
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  Timeline,
  TinySelect,
  Modal,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { confirmDialog } from "../../lib/dialog";
import { toast } from "../../lib/toast";
import { presignItSupportR2Get } from "../../lib/itSupportR2";
import { canAgent, canRaise } from "./itSupportAccess";
import { PRIORITIES, STATUSES, impactLabel } from "./itSupportConstants";
import {
  addComment,
  assignTicket,
  attachmentObjectKey,
  changeStatus,
  confirmFixed,
  createItSupportRefreshScheduler,
  getTicketDetail,
  IT_SUPPORT_MAX_FILE_BYTES,
  listAgents,
  reopenTicket,
  setPriority,
  subscribeItSupportRealtime,
  removeTicketAttachment,
  uploadTicketAttachment,
} from "./itSupportApi";
import PriorityBadge from "./components/PriorityBadge";
import StatusBadge from "./components/StatusBadge";
import SlaTimer from "./components/SlaTimer";
import RichTextField from "./components/RichTextField";
import TicketFileList from "./components/TicketFileList";

function displayPerson(p) {
  if (!p) return "—";
  return p.username || p.email || "User";
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const { user, userProfile } = useAuth();
  const agent = canAgent(userProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [ccList, setCcList] = useState([]);
  const [agents, setAgents] = useState([]);
  const [commentBody, setCommentBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusModal, setStatusModal] = useState({ open: false, status: "", remark: "" });
  const agentsLoadedRef = useRef(false);

  const isOwner = ticket?.requester_id === user?.id;
  const isOnCc = Boolean(
    user?.id && (ccList || []).some((c) => c.user_id === user.id)
  );

  const applyDetail = useCallback((detail) => {
    if (!detail) return;
    setTicket(detail.ticket);
    setComments(detail.comments);
    setHistory(detail.history);
    setAttachments(detail.attachments);
    setCcList(detail.cc || []);
  }, []);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!id) return;
      if (!silent) setLoading(true);
      setError("");
      try {
        const detail = await getTicketDetail({ ticketId: id, includeInternal: agent });
        applyDetail(detail);
        if (agent && !agentsLoadedRef.current) {
          const a = await listAgents();
          setAgents(a);
          agentsLoadedRef.current = true;
        }
      } catch (err) {
        setError(err.message || "Could not load ticket.");
        if (!silent) setTicket(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, agent, applyDetail]
  );

  useEffect(() => {
    agentsLoadedRef.current = false;
    load({ silent: false });
  }, [load]);

  useEffect(() => {
    if (!id) return undefined;
    const scheduler = createItSupportRefreshScheduler(() => load({ silent: true }), 400);
    const unsub = subscribeItSupportRealtime(() => scheduler.schedule(), {
      channelName: `it-support-ticket-${id}`,
      includeNotifications: false,
    });
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [id, load]);

  const timelineItems = useMemo(() => {
    const items = [];
    (history || []).forEach((h) => {
      items.push({
        title: h.remark || `${h.event_type}: ${h.to_value || ""}`,
        meta: `${displayPerson(h.actor)} · ${h.created_at ? new Date(h.created_at).toLocaleString() : ""}`,
        at: h.created_at,
      });
    });
    (comments || []).forEach((c) => {
      items.push({
        title: c.is_internal ? `[Internal] ${stripHtml(c.body)}` : stripHtml(c.body),
        meta: `${displayPerson(c.author)} · ${c.created_at ? new Date(c.created_at).toLocaleString() : ""}`,
        at: c.created_at,
      });
    });
    items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    return items;
  }, [history, comments]);

  /** Apply ticket-returning API results in place; soft-refresh activity. No full-page reload. */
  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const snapshot = {
      ticket,
      comments,
      history,
      attachments,
    };
    try {
      const result = await fn();
      if (result?.id && (result.status != null || result.ticket_no != null)) {
        setTicket((t) => ({ ...(t || {}), ...result }));
      } else if (result?.id && result.body != null) {
        setComments((prev) => [...prev, result]);
      }
      if (okMsg) toast.success(okMsg);
      // Sync timeline / attachments without blanking the page.
      await load({ silent: true });
    } catch (err) {
      setTicket(snapshot.ticket);
      setComments(snapshot.comments);
      setHistory(snapshot.history);
      setAttachments(snapshot.attachments);
      setError(err.message || "Action failed.");
      toast.error(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!canRaise(userProfile) && !agent) {
    return <EmptyState title="No access" message="You cannot view this ticket." />;
  }

  if (loading) return <LoadingBlock label="Loading ticket…" />;
  if (!ticket) {
    return (
      <EmptyState
        title="Ticket not found"
        message={error || "This ticket may have been removed."}
        action={
          <Link to="/app/it-support/my">
            <SecondaryButton>Back to my tickets</SecondaryButton>
          </Link>
        }
      />
    );
  }

  const canConfirm =
    isOwner && (ticket.status === "resolved") && !agent;
  const canReopen =
    isOwner &&
    (ticket.status === "resolved" || ticket.status === "closed") &&
    (!ticket.reopen_deadline_at || new Date(ticket.reopen_deadline_at) > new Date());

  return (
    <>
      <PageTaskHeader
        title={ticket.ticket_no || "Ticket"}
        subtitle={ticket.title}
      >
        <Link to={agent ? "/app/it-support/queue" : "/app/it-support/my"}>
          <SecondaryButton>
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
            Back
          </SecondaryButton>
        </Link>
      </PageTaskHeader>

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {isOnCc && !isOwner ? (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800">
            You are on CC
          </span>
        ) : null}
        <SlaTimer
          label="First response"
          dueAt={ticket.first_response_due_at}
          breached={ticket.first_response_breached}
          paused={Boolean(ticket.sla_paused_at)}
        />
        <SlaTimer
          label="Resolution"
          dueAt={ticket.resolution_due_at}
          breached={ticket.resolution_breached}
          paused={Boolean(ticket.sla_paused_at)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Description">
            <div
              className="prose prose-sm max-w-none text-ink"
              dangerouslySetInnerHTML={{ __html: ticket.description || "<p>—</p>" }}
            />
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-muted">Module</dt>
                <dd className="font-medium text-ink-strong">
                  {ticket.erp_module_label || ticket.erp_module_key || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Page / sub-module</dt>
                <dd className="font-medium text-ink-strong">
                  {ticket.erp_submodule_label || ticket.erp_submodule_key || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Issue type</dt>
                <dd className="font-medium text-ink-strong">{ticket.category?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Issue detail</dt>
                <dd className="font-medium text-ink-strong">{ticket.subcategory?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Impact</dt>
                <dd className="font-medium text-ink-strong">{impactLabel(ticket.impact)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ink-muted">CC</dt>
                <dd className="font-medium text-ink-strong">
                  {(ccList || []).length
                    ? ccList
                        .map((c) =>
                          [c.display_name, c.employee_code].filter(Boolean).join(" · ")
                        )
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Raised by</dt>
                <dd className="font-medium text-ink-strong">
                  {ticket.requester?.username ||
                    ticket.requester?.email ||
                    ticket.requester_display_name ||
                    "—"}
                  {ticket.requester_employee_code ? ` (${ticket.requester_employee_code})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Assigned to</dt>
                <dd className="font-medium text-ink-strong">
                  {ticket.assignee?.username ||
                    ticket.assignee?.email ||
                    ticket.assignee_display_name ||
                    "Unassigned"}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Activity">
            {timelineItems.length === 0 ? (
              <p className="text-xs text-ink-muted">No activity yet.</p>
            ) : (
              <Timeline items={timelineItems} />
            )}
          </SectionCard>

          <SectionCard
            title={agent && internalNote ? "Add internal note" : "Add comment"}
            right={
              agent ? (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={internalNote}
                    onChange={(e) => setInternalNote(e.target.checked)}
                  />
                  <Lock className="w-3 h-3" />
                  Internal only
                </label>
              ) : null
            }
          >
            <RichTextField
              value={commentBody}
              onChange={setCommentBody}
              placeholder={internalNote ? "Internal note (not visible to requester)…" : "Write a comment…"}
              minHeight="100px"
            />
            <div className="mt-3">
              <PrimaryButton
                disabled={busy || !stripHtml(commentBody).trim()}
                icon={MessageSquare}
                onClick={() =>
                  run(async () => {
                    const row = await addComment({
                      ticketId: ticket.id,
                      body: commentBody,
                      isInternal: agent && internalNote,
                      authorId: user.id,
                    });
                    setCommentBody("");
                    setInternalNote(false);
                    return row;
                  }, "Comment added")
                }
              >
                Post
              </PrimaryButton>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {agent ? (
            <SectionCard title="Agent actions">
              <div className="space-y-3">
                <FormField label="Priority">
                  <TinySelect
                    value={ticket.priority || ""}
                    disabled={busy}
                    className="w-full"
                    onChange={(e) =>
                      run(
                        () => setPriority({ ticketId: ticket.id, priority: e.target.value || null }),
                        "Priority updated"
                      )
                    }
                  >
                    <option value="">Unset</option>
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </TinySelect>
                </FormField>
                <FormField label="Assigned to">
                  <TinySelect
                    value={ticket.assignee_id || ""}
                    disabled={busy}
                    className="w-full"
                    onChange={(e) =>
                      run(
                        () => assignTicket({ ticketId: ticket.id, assigneeId: e.target.value || null }),
                        "Assigned to updated"
                      )
                    }
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.username || a.email}
                        {a.employee_code ? ` · ${a.employee_code}` : ""}
                      </option>
                    ))}
                  </TinySelect>
                </FormField>
                <FormField label="Status">
                  <TinySelect
                    value={ticket.status}
                    disabled={busy}
                    className="w-full"
                    onChange={(e) =>
                      setStatusModal({ open: true, status: e.target.value, remark: "" })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </TinySelect>
                </FormField>
              </div>
            </SectionCard>
          ) : null}

          {(canConfirm || canReopen) && (
            <SectionCard title="Your actions">
              <div className="flex flex-col gap-2">
                {canConfirm ? (
                  <PrimaryButton
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Confirm fixed",
                        message: "Mark this ticket as closed? Only do this if the issue is resolved.",
                        confirmLabel: "Yes, it's fixed",
                      });
                      if (!ok) return;
                      run(() => confirmFixed({ ticketId: ticket.id }), "Thanks — ticket closed");
                    }}
                  >
                    Confirm fixed
                  </PrimaryButton>
                ) : null}
                {canReopen ? (
                  <SecondaryButton
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Reopen ticket",
                        message: "Reopen this ticket so IT can look at it again?",
                        confirmLabel: "Reopen",
                      });
                      if (!ok) return;
                      run(() => reopenTicket({ ticketId: ticket.id }), "Ticket reopened");
                    }}
                  >
                    Reopen
                  </SecondaryButton>
                ) : null}
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Attachments"
            right={
              <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                <Paperclip className="w-3.5 h-3.5" />
                Upload to Cloudflare
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !ticket?.id) return;
                    if (file.size > IT_SUPPORT_MAX_FILE_BYTES) {
                      toast.error("File is too large (max 10 MB).");
                      return;
                    }
                    setBusy(true);
                    try {
                      const row = await uploadTicketAttachment({
                        ticketId: ticket.id,
                        file,
                        uploadedBy: user?.id,
                      });
                      setAttachments((prev) => [...prev, row]);
                      toast.success("Uploaded to Cloudflare.");
                    } catch (err) {
                      toast.error(err.message || "Upload to Cloudflare failed.");
                      setError(err.message || "Upload failed.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            }
          >
            <TicketFileList
              mode="uploaded"
              attachments={attachments}
              disabled={busy}
              onOpenUploaded={async (a) => {
                try {
                  const key = attachmentObjectKey(a);
                  if (!key) throw new Error("This file has no Cloudflare path.");
                  const url = await presignItSupportR2Get(key);
                  window.open(url, "_blank", "noopener,noreferrer");
                } catch (err) {
                  toast.error(err.message || "Could not open file.");
                }
              }}
              onRemoveUploaded={async (a) => {
                const ok = await confirmDialog({
                  title: "Remove attachment",
                  message: `Remove “${a.file_name || "this file"}” from the ticket?`,
                  confirmLabel: "Remove",
                });
                if (!ok) return;
                setBusy(true);
                try {
                  await removeTicketAttachment(a.id);
                  setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                  toast.success("Attachment removed.");
                } catch (err) {
                  toast.error(err.message || "Could not remove attachment.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </SectionCard>

          <SectionCard title="Details">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Assigned to</dt>
                <dd className="font-medium">{displayPerson(ticket.assignee)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Created</dt>
                <dd>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Updated</dt>
                <dd>{ticket.updated_at ? new Date(ticket.updated_at).toLocaleString() : "—"}</dd>
              </div>
              {ticket.last_status_remark ? (
                <div>
                  <dt className="text-ink-muted">Last remark</dt>
                  <dd className="mt-0.5">{ticket.last_status_remark}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>
        </div>
      </div>

      <Modal
        open={statusModal.open}
        title="Change status"
        onClose={() => setStatusModal({ open: false, status: "", remark: "" })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setStatusModal({ open: false, status: "", remark: "" })}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const updated = await changeStatus({
                    ticketId: ticket.id,
                    status: statusModal.status,
                    remark: statusModal.remark,
                  });
                  setStatusModal({ open: false, status: "", remark: "" });
                  return updated;
                }, "Status updated")
              }
            >
              Save
            </PrimaryButton>
          </div>
        }
      >
        <p className="text-xs text-ink-secondary mb-3">
          Moving to <strong>{STATUSES.find((s) => s.value === statusModal.status)?.label || statusModal.status}</strong>.
          Add a short remark (required for on hold / resolved).
        </p>
        <FormField label="Remark">
          <textarea
            className="w-full min-h-[80px] border border-border rounded-control px-2.5 py-2 text-xs"
            value={statusModal.remark}
            onChange={(e) => setStatusModal((m) => ({ ...m, remark: e.target.value }))}
            placeholder="Why is the status changing?"
          />
        </FormField>
      </Modal>
    </>
  );
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}
