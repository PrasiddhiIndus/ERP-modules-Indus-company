/**
 * Persistence for attendance imports. Only Save calls these; the preview is
 * built in memory. The final write goes through site_att_import_commit(),
 * which re-validates on the server and applies everything in one transaction.
 */
import { supabase } from "../../supabase";

const CELL_CHUNK = 500;

function throwIf(error, fallback) {
  if (!error) return;
  const err = new Error(error.message || fallback);
  err.details = error.details || null;
  throw err;
}

export async function findCommittedImport({ siteId, month, year, sha256 }) {
  const { data, error } = await supabase
    .from("site_attendance_import_batches")
    .select("id, file_name, committed_at, status")
    .eq("site_id", siteId)
    .eq("cycle_month", month)
    .eq("cycle_year", year)
    .eq("file_sha256", sha256)
    .in("status", ["committed", "partially_reverted"])
    .limit(1);
  throwIf(error, "Unable to check earlier imports.");
  return data?.[0] || null;
}

async function deleteDraft(batchId) {
  await supabase.from("site_attendance_import_batches").delete().eq("id", batchId);
}

/**
 * Create the batch + cells and commit. On any failure the draft is removed
 * so nothing half-saved is left behind.
 */
export async function saveImportBatch({ siteId, month, year, siteType, file, providerId, providerVersion, dictionaryVersion, summary, warnings, cells }) {
  const { data: batch, error } = await supabase
    .from("site_attendance_import_batches")
    .insert({
      site_id: siteId,
      cycle_month: month,
      cycle_year: year,
      site_type: siteType || null,
      file_name: file.name,
      file_sha256: file.sha256,
      file_size: file.size,
      provider_id: providerId,
      provider_version: providerVersion,
      mark_dictionary_version: dictionaryVersion,
      summary,
      warnings,
    })
    .select("id")
    .single();
  throwIf(error, "Unable to start the import.");

  try {
    for (let i = 0; i < cells.length; i += CELL_CHUNK) {
      const chunk = cells.slice(i, i + CELL_CHUNK).map((c) => ({ ...c, batch_id: batch.id }));
      const { error: cellError } = await supabase.from("site_attendance_import_cells").insert(chunk);
      throwIf(cellError, "Unable to stage import cells.");
    }
    const { data, error: commitError } = await supabase.rpc("site_att_import_commit", { p_batch_id: batch.id });
    throwIf(commitError, "Import could not be saved.");
    return { batchId: batch.id, ...(data || {}) };
  } catch (err) {
    await deleteDraft(batch.id);
    throw err;
  }
}

/** Parse the per-cell errors the commit function puts in the error detail. */
export function parseCommitErrorDetails(details) {
  if (!details) return [];
  try {
    const list = JSON.parse(details);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
