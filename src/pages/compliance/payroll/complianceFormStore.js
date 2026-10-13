/**
 * Saved Compliance Forms live in admin_compliance_form_packs.
 * If that table is not available yet, the same records stay in this browser.
 */

import { supabase } from "../../../lib/supabase";

export const COMPLIANCE_FORM_CODES = Object.freeze({
  wages: "wages",
  social: "social",
  osh: "osh",
  wageSheet: "wage-sheet",
});

const LOCAL_KEYS = {
  wages: "indus-wage-code-packs-v1",
  social: "indus-ss-code-packs-v1",
  osh: "indus-oshwc-packs-v1",
  "wage-sheet": "indus-wage-code-sheets-v1",
};

const TABLE = "admin_compliance_form_packs";

function errText(err) {
  return `${err?.message || ""} ${err?.details || ""} ${err?.code || ""}`;
}

function isMissingTable(err) {
  const msg = errText(err);
  return (
    err?.code === "PGRST205" ||
    err?.code === "42P01" ||
    /schema cache|does not exist|Could not find the table/i.test(msg)
  );
}

function readLocal(code) {
  const key = LOCAL_KEYS[code];
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(code, packs) {
  const key = LOCAL_KEYS[code];
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(packs));
}

function packLabel(pack) {
  const forms = pack?.forms || {};
  for (const part of Object.values(forms)) {
    const header = part?.header || {};
    const name = header.establishment || header.contractor || header.employeeName || header.establishmentTo;
    if (String(name || "").trim()) return String(name).trim();
  }
  return pack?.label || "";
}

function fromRow(row) {
  const payload = row?.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
  return {
    ...payload,
    id: row.id,
    savedAt: row.saved_at || payload.savedAt || row.updated_at || "",
  };
}

async function pushMissingLocal(code, serverPacks) {
  const local = readLocal(code);
  if (!local.length) return serverPacks;
  const seen = new Set(serverPacks.map((pack) => String(pack.id)));
  const missing = local.filter((pack) => pack?.id && !seen.has(String(pack.id)));
  if (!missing.length) return serverPacks;
  const uploaded = [];
  for (const pack of missing) {
    const saved = await upsertPack(code, pack);
    if (saved) uploaded.push(saved);
  }
  return uploaded.length ? [...uploaded, ...serverPacks] : serverPacks;
}

async function upsertPack(code, pack) {
  const id = String(pack?.id || "").trim();
  if (!id) return null;
  const savedAt = new Date().toISOString();
  const payload = { ...pack, id, savedAt };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        id,
        code,
        label: packLabel(payload),
        payload_json: payload,
        saved_at: savedAt,
      },
      { onConflict: "id" }
    )
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : payload;
}

export async function listFormPacks(code) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("code", code)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data || []).map(fromRow);
    const merged = await pushMissingLocal(code, rows);
    writeLocal(code, merged);
    return merged;
  } catch (err) {
    if (!isMissingTable(err)) console.warn("Compliance forms: load skipped", err);
    return readLocal(code);
  }
}

export async function saveFormPack(code, pack) {
  const next = { ...pack, savedAt: new Date().toISOString() };
  try {
    const saved = await upsertPack(code, next);
    const all = readLocal(code).filter((item) => item.id !== next.id);
    writeLocal(code, [saved || next, ...all]);
    return saved || next;
  } catch (err) {
    if (!isMissingTable(err)) console.warn("Compliance forms: save skipped", err);
    const all = readLocal(code);
    const index = all.findIndex((item) => item.id === next.id);
    if (index >= 0) all[index] = next;
    else all.unshift(next);
    writeLocal(code, all);
    return next;
  }
}

export async function deleteFormPack(code, id) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("code", code);
    if (error) throw error;
  } catch (err) {
    if (!isMissingTable(err)) console.warn("Compliance forms: delete skipped", err);
  }
  writeLocal(
    code,
    readLocal(code).filter((pack) => pack.id !== id)
  );
}
