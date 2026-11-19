import { supabase } from "../../lib/supabase";
import { ACCESS_KEYS } from "./itSupportConstants";
import { uploadItSupportFileToR2 } from "../../lib/itSupportR2";

/** Max attachment size — must match server R2_IT_SUPPORT_MAX_BYTES (10 MB). */
export const IT_SUPPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;

const ATTACHMENT_SELECT =
  "id, ticket_id, comment_id, file_name, content_type, size_bytes, file_path, r2_key, storage, created_at, uploaded_by";

/** R2 object key from an attachment row (Cloudflare). */
export function attachmentObjectKey(row) {
  const path = String(row?.file_path || row?.r2_key || "").trim().replace(/^\/+/, "");
  return path;
}

function assertUploadableFile(file) {
  if (!file) throw new Error("No file selected.");
  if (file.size > IT_SUPPORT_MAX_FILE_BYTES) {
    throw new Error(`“${file.name}” is too large (max 10 MB).`);
  }
}

const TICKET_SELECT = `
  id, ticket_no, title, description, category_id, subcategory_id,
  requester_id, requester_employee_code, requester_department,
  requester_display_name, assignee_display_name,
  impact, priority, status, assignee_id,
  first_response_due_at, resolution_due_at, first_responded_at,
  sla_paused_at, sla_paused_total_mins, first_response_breached, resolution_breached,
  created_at, updated_at, resolved_at, closed_at, reopen_deadline_at, auto_close_at,
  deleted_at, last_status_remark,
  category:it_ticket_categories!category_id(id, name),
  subcategory:it_ticket_subcategories!subcategory_id(id, name),
  assignee:profiles!assignee_id(id, username, email, employee_code),
  requester:profiles!requester_id(id, username, email, employee_code)
`;

function throwIf(error, fallback = "Something went wrong.") {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error("[itSupportApi]", error);
  const msg = error.message || fallback;
  throw new Error(msg);
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Soft-delete filter applied to ticket queries. */
function liveTickets(query) {
  return query.is("deleted_at", null);
}

export async function listMyTickets({ userId, search = "", status = "" } = {}) {
  let q = liveTickets(
    supabase
      .from("it_tickets")
      .select(TICKET_SELECT)
      .eq("requester_id", userId)
      .order("created_at", { ascending: false })
  );
  if (status) q = q.eq("status", status);
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},ticket_no.ilike.${s}`);
  }
  const { data, error } = await q;
  throwIf(error, "Could not load your tickets.");
  return data || [];
}

export async function listQueueTickets({
  search = "",
  status = "",
  priority = "",
  assigneeId = "",
  categoryId = "",
  breachedOnly = false,
} = {}) {
  let q = liveTickets(
    supabase.from("it_tickets").select(TICKET_SELECT).order("created_at", { ascending: false })
  );
  if (status) q = q.eq("status", status);
  if (priority) q = q.eq("priority", priority);
  if (assigneeId === "unassigned") q = q.is("assignee_id", null);
  else if (assigneeId) q = q.eq("assignee_id", assigneeId);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (breachedOnly) {
    q = q.or("first_response_breached.eq.true,resolution_breached.eq.true");
  }
  if (search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`title.ilike.${s},ticket_no.ilike.${s}`);
  }
  const { data, error } = await q;
  throwIf(error, "Could not load the ticket queue.");
  return data || [];
}

/**
 * @param {{ ticketId: string, includeInternal?: boolean }} opts
 * includeInternal — agents/admins see internal notes; employees never do.
 */
export async function getTicketDetail({ ticketId, includeInternal = false }) {
  const { data: ticket, error } = await liveTickets(
    supabase.from("it_tickets").select(TICKET_SELECT).eq("id", ticketId)
  ).maybeSingle();
  throwIf(error, "Could not load this ticket.");
  if (!ticket) throw new Error("Ticket not found.");

  let commentsQ = supabase
    .from("it_ticket_comments")
    .select(
      "id, ticket_id, body, is_internal, created_at, author_id, author:profiles!author_id(id, username, email)"
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (!includeInternal) commentsQ = commentsQ.eq("is_internal", false);

  const [commentsRes, historyRes, attachmentsRes] = await Promise.all([
    commentsQ,
    supabase
      .from("it_ticket_history")
      .select("id, ticket_id, event_type, from_value, to_value, remark, created_at, actor_id, actor:profiles!actor_id(id, username, email)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    supabase
      .from("it_ticket_attachments")
      .select(ATTACHMENT_SELECT)
      .eq("ticket_id", ticketId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  throwIf(commentsRes.error, "Could not load comments.");
  throwIf(historyRes.error, "Could not load history.");
  throwIf(attachmentsRes.error, "Could not load attachments.");

  return {
    ticket,
    comments: commentsRes.data || [],
    history: historyRes.data || [],
    attachments: attachmentsRes.data || [],
  };
}

/**
 * Upload one file to Cloudflare R2, then insert a row in it_ticket_attachments
 * with storage='r2' and file_path / r2_key = object key.
 */
export async function uploadTicketAttachment({ ticketId, file, uploadedBy, commentId = null }) {
  assertUploadableFile(file);
  if (!ticketId) throw new Error("Ticket id is required for upload.");

  const { objectKey, contentType } = await uploadItSupportFileToR2({
    file,
    ticketId,
  });
  const key = String(objectKey || "").trim();
  if (!key.startsWith("it-support/")) {
    throw new Error("Upload did not return a valid Cloudflare R2 key.");
  }

  const row = {
    ticket_id: ticketId,
    comment_id: commentId || null,
    file_name: file.name,
    content_type: contentType || file.type || null,
    size_bytes: file.size || 0,
    file_path: key,
    r2_key: key,
    storage: "r2",
    uploaded_by: uploadedBy,
  };

  const { data, error } = await supabase
    .from("it_ticket_attachments")
    .insert(row)
    .select(ATTACHMENT_SELECT)
    .single();
  throwIf(error, "File uploaded to Cloudflare, but saving the attachment record failed.");
  return data;
}

export async function createTicket({
  title,
  description,
  categoryId,
  subcategoryId,
  impact,
  requesterId,
  requesterEmployeeCode,
  requesterDepartment,
  files = [],
}) {
  const payload = {
    title: String(title || "").trim(),
    description: description || "",
    category_id: categoryId || null,
    subcategory_id: subcategoryId || null,
    impact: impact || "only_me",
    requester_id: requesterId,
    requester_employee_code: requesterEmployeeCode || null,
    requester_department: requesterDepartment || null,
  };

  let ticket = null;

  const rpc = await supabase.rpc("it_create_ticket", {
    p_title: payload.title,
    p_description: payload.description,
    p_category_id: payload.category_id,
    p_subcategory_id: payload.subcategory_id,
    p_impact: payload.impact,
  });

  if (!rpc.error && rpc.data) {
    ticket = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  } else {
    // Fallback: allocate number then insert
    const alloc = await supabase.rpc("it_allocate_ticket_no");
    let ticketNo = null;
    if (!alloc.error && alloc.data != null) {
      ticketNo = Array.isArray(alloc.data) ? alloc.data[0] : alloc.data;
    }
    const insertRow = {
      ...payload,
      status: "new",
      ...(ticketNo ? { ticket_no: String(ticketNo) } : {}),
    };
    const { data, error } = await supabase.from("it_tickets").insert(insertRow).select(TICKET_SELECT).single();
    throwIf(error || rpc.error, "Could not create the ticket.");
    ticket = data;
  }

  const uploadErrors = [];
  if (ticket?.id && files?.length) {
    for (const file of files) {
      try {
        await uploadTicketAttachment({
          ticketId: ticket.id,
          file,
          uploadedBy: requesterId,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[itSupportApi] Cloudflare R2 attachment upload failed", err);
        uploadErrors.push(err?.message || `Could not upload ${file.name}`);
      }
    }
  }

  if (uploadErrors.length) {
    ticket = {
      ...ticket,
      _attachmentWarnings: uploadErrors,
    };
  }

  return ticket;
}

export async function assignTicket({ ticketId, assigneeId }) {
  const patch = {
    assignee_id: assigneeId || null,
    updated_at: new Date().toISOString(),
  };
  if (assigneeId) patch.status = "open";
  const { data, error } = await supabase
    .from("it_tickets")
    .update(patch)
    .eq("id", ticketId)
    .is("deleted_at", null)
    .select(TICKET_SELECT)
    .single();
  throwIf(error, "Could not assign the ticket.");
  await appendHistory({
    ticketId,
    eventType: "assign",
    toValue: assigneeId || "",
    remark: assigneeId ? "Assigned" : "Unassigned",
  });
  return data;
}

export async function setPriority({ ticketId, priority }) {
  const { data, error } = await supabase
    .from("it_tickets")
    .update({ priority: priority || null, updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .is("deleted_at", null)
    .select(TICKET_SELECT)
    .single();
  throwIf(error, "Could not update priority.");
  if (priority) {
    await supabase.rpc("it_apply_sla_for_ticket", { p_ticket_id: ticketId });
  }
  await appendHistory({
    ticketId,
    eventType: "priority",
    toValue: priority || "",
    remark: priority ? `Priority set to ${priority}` : "Priority cleared",
  });
  // Re-fetch so SLA due dates from the trigger/RPC are visible
  const refreshed = await liveTickets(
    supabase.from("it_tickets").select(TICKET_SELECT).eq("id", ticketId)
  ).maybeSingle();
  if (!refreshed.error && refreshed.data) return refreshed.data;
  return data;
}

export async function changeStatus({ ticketId, status, remark = "" }) {
  const now = new Date().toISOString();
  const patch = {
    status,
    last_status_remark: remark || null,
    updated_at: now,
  };
  if (status === "resolved") patch.resolved_at = now;
  if (status === "closed") patch.closed_at = now;
  if (status === "on_hold") patch.sla_paused_at = now;
  if (status === "in_progress" || status === "open") {
    patch.sla_paused_at = null;
  }
  if (status === "reopened") {
    patch.resolved_at = null;
    patch.closed_at = null;
  }

  const { data, error } = await supabase
    .from("it_tickets")
    .update(patch)
    .eq("id", ticketId)
    .is("deleted_at", null)
    .select(TICKET_SELECT)
    .single();
  throwIf(error, "Could not update status.");
  await appendHistory({
    ticketId,
    eventType: "status",
    toValue: status,
    remark: remark || `Status → ${status}`,
  });
  return data;
}

export async function reopenTicket({ ticketId, remark = "" }) {
  return changeStatus({ ticketId, status: "reopened", remark: remark || "Reopened by requester" });
}

export async function confirmFixed({ ticketId, remark = "" }) {
  return changeStatus({ ticketId, status: "closed", remark: remark || "Confirmed fixed by requester" });
}

export async function addComment({ ticketId, body, isInternal = false, authorId }) {
  const { data, error } = await supabase
    .from("it_ticket_comments")
    .insert({
      ticket_id: ticketId,
      body: String(body || "").trim(),
      is_internal: Boolean(isInternal),
      author_id: authorId,
    })
    .select(
      "id, ticket_id, body, is_internal, created_at, author_id, author:profiles!author_id(id, username, email)"
    )
    .single();
  throwIf(error, "Could not add the comment.");
  return data;
}

async function appendHistory({ ticketId, eventType, fromValue = null, toValue = null, remark = "" }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("it_ticket_history").insert({
    ticket_id: ticketId,
    event_type: eventType,
    from_value: fromValue,
    to_value: toValue,
    remark,
    actor_id: user?.id || null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[itSupportApi] history insert failed", error);
  }
}

export async function listCategories() {
  const [{ data: cats, error: cErr }, { data: subs, error: sErr }] = await Promise.all([
    supabase
      .from("it_ticket_categories")
      .select("id, name, description, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("it_ticket_subcategories")
      .select("id, category_id, name, description, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  throwIf(cErr, "Could not load categories.");
  throwIf(sErr, "Could not load subcategories.");
  return { categories: cats || [], subcategories: subs || [] };
}

export async function listSlaRules() {
  const { data, error } = await supabase
    .from("it_sla_rules")
    .select(
      "id, name, impact, priority, first_response_mins, resolution_mins, is_active, created_at, updated_at"
    )
    .order("priority", { ascending: true })
    .order("name", { ascending: true });
  throwIf(error, "Could not load SLA rules.");
  return data || [];
}

export async function upsertCategory(row) {
  const payload = {
    id: row.id || undefined,
    name: String(row.name || "").trim(),
    description: row.description || null,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
  };
  const { data, error } = await supabase
    .from("it_ticket_categories")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  throwIf(error, "Could not save category.");
  return data;
}

export async function upsertSubcategory(row) {
  const payload = {
    id: row.id || undefined,
    category_id: row.category_id,
    name: String(row.name || "").trim(),
    description: row.description || null,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
  };
  const { data, error } = await supabase
    .from("it_ticket_subcategories")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  throwIf(error, "Could not save subcategory.");
  return data;
}

export async function upsertSlaRule(row) {
  const payload = {
    id: row.id || undefined,
    name: String(row.name || "").trim(),
    impact: row.impact || null,
    priority: row.priority || null,
    first_response_mins: Number(row.first_response_mins) || 0,
    resolution_mins: Number(row.resolution_mins) || 0,
    is_active: row.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("it_sla_rules")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  throwIf(error, "Could not save SLA rule.");
  return data;
}

/** IT agents for assign dropdown (RPC — profiles are otherwise self-only under RLS). */
export async function listAgents() {
  const { data, error } = await supabase.rpc("it_list_support_agents");
  if (!error && Array.isArray(data)) return data;

  // Fallback if RPC not deployed yet
  const { data: rows, error: err2 } = await supabase
    .from("profiles")
    .select("id, username, email, employee_code, role, allowed_modules, allowed_sub_modules")
    .order("username", { ascending: true });
  if (err2) throwIf(error || err2, "Could not load agents.");
  return (rows || []).filter((p) => {
    const role = p.role;
    if (role === "super_admin" || role === "super_admin_pro") return true;
    const mods = Array.isArray(p.allowed_modules) ? p.allowed_modules.map(String) : [];
    if (mods.includes("itIs")) return true;
    const subs = Array.isArray(p.allowed_sub_modules) ? p.allowed_sub_modules.map(String) : [];
    return (
      subs.includes(ACCESS_KEYS.agent) ||
      subs.includes(ACCESS_KEYS.admin) ||
      subs.some((s) => s.includes("helpdesk-agent") || s.includes("helpdesk-admin"))
    );
  });
}

export async function dashboardCounts({ userId } = {}) {
  const today = startOfTodayIso();
  const base = () => liveTickets(supabase.from("it_tickets").select("id", { count: "exact", head: true }));

  const [newRes, mineRes, holdRes, breachedRes, resolvedRes] = await Promise.all([
    base().eq("status", "new"),
    userId ? base().eq("assignee_id", userId).not("status", "in", '("closed","resolved")') : Promise.resolve({ count: 0 }),
    base().eq("status", "on_hold"),
    liveTickets(
      supabase
        .from("it_tickets")
        .select("id", { count: "exact", head: true })
        .or("first_response_breached.eq.true,resolution_breached.eq.true")
        .not("status", "in", '("closed")')
    ),
    liveTickets(
      supabase
        .from("it_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "resolved")
        .gte("resolved_at", today)
    ),
  ]);

  [newRes, mineRes, holdRes, breachedRes, resolvedRes].forEach((r) => {
    if (r?.error) throwIf(r.error, "Could not load dashboard counts.");
  });

  return {
    newCount: newRes.count || 0,
    assignedToMe: mineRes.count || 0,
    onHold: holdRes.count || 0,
    slaBreached: breachedRes.count || 0,
    resolvedToday: resolvedRes.count || 0,
  };
}

export async function reportAggregates({ fromDate, toDate } = {}) {
  let q = liveTickets(
    supabase
      .from("it_tickets")
      .select(
        "id, status, priority, category_id, created_at, resolved_at, first_response_breached, resolution_breached, category:it_ticket_categories!category_id(name)"
      )
  );
  if (fromDate) q = q.gte("created_at", fromDate);
  if (toDate) q = q.lte("created_at", toDate);
  const { data, error } = await q;
  throwIf(error, "Could not load report data.");
  const rows = data || [];

  const byStatus = {};
  const byPriority = {};
  const byCategory = {};
  let breached = 0;
  let resolved = 0;

  rows.forEach((r) => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const p = r.priority || "unset";
    byPriority[p] = (byPriority[p] || 0) + 1;
    const cat = r.category?.name || "Uncategorised";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (r.first_response_breached || r.resolution_breached) breached += 1;
    if (r.status === "resolved" || r.status === "closed") resolved += 1;
  });

  return {
    total: rows.length,
    breached,
    resolved,
    byStatus: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
    byPriority: Object.entries(byPriority).map(([name, value]) => ({ name, value })),
    byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
    rows,
  };
}

export async function listNotifications({ userId, limit = 30 } = {}) {
  const { data, error } = await supabase
    .from("it_notifications")
    .select("id, user_id, ticket_id, title, body, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIf(error, "Could not load notifications.");
  return data || [];
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from("it_notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  throwIf(error, "Could not mark notification as read.");
  return true;
}
