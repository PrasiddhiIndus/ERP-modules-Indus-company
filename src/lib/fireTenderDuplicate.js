// Duplicate a Fire Tender costing sheet to a brand-new client.
//
// What "duplicate" means here (so anyone maintaining this understands the logic):
//  1. We read the SOURCE tender (the costing sheet you picked).
//  2. We create a NEW tender record that reuses the source's scope (source,
//     type, mode, vehicle type, estimation, description) but takes the NEW
//     client's name/contact/address that the user typed. The new tender is
//     created as "Approved" with fresh enquiry + tender numbers so its costing
//     sheet can be opened immediately.
//  3. We copy every per-tender costing table (costing_rows, costing_accessories,
//     costing_summary, moc_prices) from the source tender_id to the new
//     tender_id. Each copied row drops its own id/timestamps, points at the new
//     tender, and is re-owned by the current user.
//
// We intentionally do NOT copy tender_contacts (those belong to the old client).

const PER_TENDER_COSTING_TABLES = [
  "costing_rows",
  "costing_accessories",
  "costing_summary",
  "moc_prices",
];

// Scope fields carried over from the source tender (everything except client/
// contact/address and lifecycle fields, which we set explicitly).
const SCOPE_FIELDS = [
  "source",
  "type_of_tender",
  "mode_of_tender",
  "vehicle_type",
  "costing_template",
  "tender_id_available",
  "estimation",
  "description",
  "handled_by",
  "authorization_to",
];

async function generateEnquiryNumber(supabase) {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `ENQ/IFSPL/FT/${year}-${month}`;
  try {
    const { data, error } = await supabase
      .from("tenders")
      .select("enquiry_number")
      .ilike("enquiry_number", `${prefix}/%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    if (data?.length > 0) {
      const lastNum = parseInt(String(data[0].enquiry_number).split("/").pop(), 10) || 0;
      return `${prefix}/${String(lastNum + 1).padStart(4, "0")}`;
    }
  } catch {
    /* fall through to first number */
  }
  return `${prefix}/0001`;
}

async function generateTenderNumber(supabase) {
  let count = 0;
  try {
    const { count: c } = await supabase
      .from("tenders")
      .select("id", { count: "exact", head: true })
      .not("tender_number", "is", null);
    count = c || 0;
  } catch {
    count = 0;
  }
  const running = String(count + 1).padStart(5, "0");
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  return `IFSPL/Ad-X/${running}/${month}-${year}-${count + 1}`;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ sourceTenderId: number|string, newClient: {
 *   client: string, phone?: string, email?: string, street?: string,
 *   city?: string, state?: string, zip?: string, country?: string, source?: string
 * } }} params
 * @returns {Promise<{ id: number, tender_number: string }>} the new tender
 */
export async function duplicateCostingSheet(supabase, { sourceTenderId, newClient }) {
  if (!sourceTenderId) throw new Error("Missing source costing sheet.");
  if (!newClient?.client?.trim()) throw new Error("New client name is required.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id || null;

  const { data: src, error: srcErr } = await supabase
    .from("tenders")
    .select("*")
    .eq("id", sourceTenderId)
    .single();
  if (srcErr) throw srcErr;
  if (!src) throw new Error("Source tender not found.");

  const [enquiry_number, tender_number] = await Promise.all([
    generateEnquiryNumber(supabase),
    generateTenderNumber(supabase),
  ]);

  const newTenderPayload = {
    enquiry_number,
    tender_number,
    client: newClient.client.trim(),
    phone: newClient.phone?.trim() || null,
    email: newClient.email?.trim() || null,
    street: newClient.street?.trim() || null,
    street2: null,
    city: newClient.city?.trim() || null,
    state: newClient.state?.trim() || null,
    zip: newClient.zip?.trim() || null,
    country: newClient.country?.trim() || null,
    publish_date: null,
    // `due_date` is NOT NULL on tenders — copy from source or default to today.
    due_date: src.due_date || new Date().toISOString().slice(0, 10),
    status: "Approved",
    user_id: userId,
  };
  for (const field of SCOPE_FIELDS) {
    newTenderPayload[field] = src[field] ?? null;
  }
  // Allow the new client to use a different source (affects Gem-only NET TOTAL rows).
  if (newClient.source) newTenderPayload.source = newClient.source;

  const { data: newTender, error: insErr } = await supabase
    .from("tenders")
    .insert([newTenderPayload])
    .select()
    .single();
  if (insErr) throw insErr;

  const newId = newTender.id;

  for (const table of PER_TENDER_COSTING_TABLES) {
    const { data: rows, error: readErr } = await supabase
      .from(table)
      .select("*")
      .eq("tender_id", sourceTenderId);
    if (readErr) throw readErr;
    if (!rows || rows.length === 0) continue;

    const copies = rows.map((row) => {
      const { id, created_at, updated_at, ...rest } = row;
      void id;
      void created_at;
      void updated_at;
      const copy = { ...rest, tender_id: newId };
      if ("user_id" in rest && userId) copy.user_id = userId;
      return copy;
    });

    const { error: writeErr } = await supabase.from(table).insert(copies);
    if (writeErr) throw writeErr;
  }

  return newTender;
}
