/**
 * Safe delete / detach for expense parent & child heads (FK-aware).
 */
import { supabase } from "../../../lib/supabase";

const SCHEMA = "finance";

function t(name) {
  return supabase.schema(SCHEMA).from(name);
}

export function isFkConflict(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "23503" || /foreign key|violates|409|conflict/i.test(msg);
}

export async function getFallbackParentId() {
  const { data } = await t("expense_parent_heads")
    .select("id, code")
    .eq("is_active", true)
    .order("sort_order");
  const rows = data || [];
  const admin = rows.find((r) => r.code === "admin");
  return admin?.id || rows[0]?.id || null;
}

export async function detachParentHead(parentId, fallbackParentId) {
  if (!parentId) return;
  if (fallbackParentId) {
    await t("expense_child_heads").update({ parent_head_id: fallbackParentId }).eq("parent_head_id", parentId);
  }
  await t("site_expense_structure").delete().eq("parent_head_id", parentId);
}

export async function detachChildHead(childId) {
  if (!childId) return;
  await t("site_expense_structure").delete().eq("child_head_id", childId);
  await t("expense_entry_lines").delete().eq("child_head_id", childId);
  await t("budget_expense_lines").delete().eq("child_head_id", childId);
  await t("cost_allocations").delete().eq("child_head_id", childId);
}

export async function removeParentHeadRow(row, fallbackParentId) {
  await detachParentHead(row.id, fallbackParentId);
  const { error } = await t("expense_parent_heads").delete().eq("id", row.id);
  if (error && isFkConflict(error)) {
    await t("expense_parent_heads").update({ is_active: false }).eq("id", row.id);
    return;
  }
  if (error) throw error;
}

export async function removeChildHeadRow(row) {
  await detachChildHead(row.id);
  const { error } = await t("expense_child_heads").delete().eq("id", row.id);
  if (error && isFkConflict(error)) {
    await t("expense_child_heads").update({ is_active: false }).eq("id", row.id);
    return;
  }
  if (error) throw error;
}

export async function safeDeleteParentHead(id) {
  const fallbackParentId = await getFallbackParentId();
  await removeParentHeadRow({ id }, fallbackParentId);
}

export async function safeDeleteChildHead(id) {
  await removeChildHeadRow({ id });
}
