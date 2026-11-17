/**
 * Document store used by the payroll screens.
 * Same shape as the prototype database: collection/doc, snapshot, set, delete.
 * Writes go to public.pay_documents. If that table is not installed yet, the
 * session keeps data in memory and says so — nothing is written to the browser.
 */

const SENSITIVE = /account|aadhaar|aadhar|^pan$|ifsc|^acct$|uan/i;

function redact(value, depth = 0) {
  if (value == null || depth > 5) return value == null ? value : "…";
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length > 40) return { count: value.length };
    return value.map((item) => redact(item, depth + 1));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "_id") continue;
    if (SENSITIVE.test(key)) {
      out[key] = item ? "••••" : "";
      continue;
    }
    if (key === "list" || key === "att" || key === "rows" || key === "pay" || key === "snap" || key === "recovered") {
      out[key] = Array.isArray(item) ? { count: item.length } : item && typeof item === "object" ? { count: Object.keys(item).length } : item;
      continue;
    }
    out[key] = redact(item, depth + 1);
  }
  return out;
}

function snapFor(store, col) {
  const docs = Object.keys(store[col] || {}).map((id) => ({
    id,
    exists: true,
    data: () => JSON.parse(JSON.stringify(store[col][id])),
  }));
  return {
    docs,
    size: docs.length,
    empty: !docs.length,
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => [],
  };
}

function memoryDb() {
  const store = {};
  const subs = [];
  const notify = (col) => {
    subs.filter((s) => s.col === col).forEach((s) => {
      try { s.next(snapFor(store, col)); } catch { /* screen not mounted */ }
    });
  };
  const db = {
    ephemeral: true,
    collection(col) {
      return {
        onSnapshot(next, err) {
          const sub = { col, next, err };
          subs.push(sub);
          try { next(snapFor(store, col)); } catch (e) { if (err) err(e); }
          return () => {
            const i = subs.indexOf(sub);
            if (i >= 0) subs.splice(i, 1);
          };
        },
      };
    },
    doc(path) {
      const slash = path.indexOf("/");
      const col = path.slice(0, slash);
      const id = path.slice(slash + 1);
      return {
        async set(data) {
          store[col] = store[col] || {};
          store[col][id] = JSON.parse(JSON.stringify(data));
          notify(col);
        },
        async delete() {
          if (store[col]) delete store[col][id];
          notify(col);
        },
        async get() {
          const has = !!(store[col] && Object.prototype.hasOwnProperty.call(store[col], id));
          return { exists: has, data: () => (has ? store[col][id] : undefined) };
        },
      };
    },
  };
  return db;
}

function deniedDb(error) {
  const err = error || { message: "permission denied", code: "42501" };
  return {
    collection() {
      return {
        onSnapshot(_next, onErr) {
          if (onErr) onErr(err);
          return () => {};
        },
      };
    },
    doc() {
      return {
        async set() { throw err; },
        async delete() { throw err; },
        async get() { throw err; },
      };
    },
  };
}

function isPermission(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /permission|denied|42501|forbidden|not allowed/i.test(text);
}

function isMissingTable(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /pay_documents|schema cache|does not exist|42P01|PGRST205|PGRST204/i.test(text);
}

export async function openPayrollDb(supabase, actor) {
  const probe = await supabase.from("pay_documents").select("doc_id").limit(1);
  if (probe.error) {
    if (isPermission(probe.error)) return deniedDb(probe.error);
    if (isMissingTable(probe.error)) return memoryDb();
    const err = new Error(probe.error.message || "Database error");
    err.code = probe.error.code;
    throw err;
  }
  return supabaseDb(supabase, actor);
}

function supabaseDb(supabase, actor) {
  const store = {};
  const subs = [];
  const notify = (col) => {
    subs.filter((s) => s.col === col).forEach((s) => {
      try { s.next(snapFor(store, col)); } catch { /* screen not mounted */ }
    });
  };

  async function load(col) {
    const { data, error } = await supabase.from("pay_documents").select("doc_id,data").eq("collection", col);
    if (error) throw error;
    const next = {};
    for (const row of data || []) next[row.doc_id] = row.data;
    store[col] = next;
  }

  function audit(action, col, id, before, after) {
    const row = {
      action,
      collection: col,
      doc_id: id,
      summary: `${action} ${col}/${id}`,
      before: before ? redact(before) : null,
      after: after ? redact(after) : null,
      actor_id: actor?.id || null,
      actor_name: actor?.name || "",
    };
    supabase.from("pay_audit_log").insert(row).then(() => {}, () => {});
  }

  return {
    collection(col) {
      return {
        onSnapshot(next, err) {
          const sub = { col, next, err };
          subs.push(sub);
          load(col).then(() => next(snapFor(store, col))).catch((e) => { if (err) err(e); });
          return () => {
            const i = subs.indexOf(sub);
            if (i >= 0) subs.splice(i, 1);
          };
        },
      };
    },
    doc(path) {
      const slash = path.indexOf("/");
      const col = path.slice(0, slash);
      const id = path.slice(slash + 1);
      return {
        async set(data) {
          const payload = JSON.parse(JSON.stringify(data));
          const before = store[col]?.[id] ? JSON.parse(JSON.stringify(store[col][id])) : null;
          const { error } = await supabase.from("pay_documents").upsert(
            {
              collection: col,
              doc_id: id,
              data: payload,
              updated_at: new Date().toISOString(),
              updated_by: actor?.id || null,
            },
            { onConflict: "collection,doc_id" }
          );
          if (error) throw error;
          store[col] = store[col] || {};
          store[col][id] = payload;
          audit(before ? "update" : "insert", col, id, before, payload);
          notify(col);
        },
        async delete() {
          const before = store[col]?.[id] ? JSON.parse(JSON.stringify(store[col][id])) : null;
          const { error } = await supabase.from("pay_documents").delete().eq("collection", col).eq("doc_id", id);
          if (error) throw error;
          if (store[col]) delete store[col][id];
          audit("delete", col, id, before, null);
          notify(col);
        },
        async get() {
          if (!store[col]) await load(col);
          const has = !!(store[col] && Object.prototype.hasOwnProperty.call(store[col], id));
          return { exists: has, data: () => (has ? JSON.parse(JSON.stringify(store[col][id])) : undefined) };
        },
      };
    },
  };
}

/**
 * Browser-only document store. Same collection/doc shape as the payroll screens.
 * Nothing is sent to a server. Data stays in this browser (IndexedDB).
 */
export async function openLocalPayrollDb() {
  const mem = memoryDb();
  let idb = null;
  try {
    idb = await openPayrollIdb();
    const rows = await idbGetAll(idb);
    for (const row of rows) {
      if (!row || !row.collection || row.id == null) continue;
      await mem.doc(`${row.collection}/${row.id}`).set(row.data || {});
    }
  } catch {
    idb = null;
  }
  const db = {
    local: true,
    ephemeral: !idb,
    collection(col) {
      return mem.collection(col);
    },
    doc(path) {
      const ref = mem.doc(path);
      return {
        async set(data) {
          const payload = JSON.parse(JSON.stringify(data));
          if (idb) {
            const slash = path.indexOf("/");
            const collection = path.slice(0, slash);
            const id = path.slice(slash + 1);
            try {
              await idbPut(idb, { collection, id, data: payload });
            } catch (error) {
              if (error && error.name === "QuotaExceededError") error.code = "quota_exceeded";
              throw error;
            }
          }
          await ref.set(payload);
        },
        async delete() {
          if (idb) {
            const slash = path.indexOf("/");
            await idbDelete(idb, path.slice(0, slash), path.slice(slash + 1));
          }
          await ref.delete();
        },
        get: () => ref.get(),
      };
    },
  };
  return db;
}

function openPayrollIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("indus-payroll", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Could not open payroll data"));
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readonly");
    const req = tx.objectStore("docs").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, row) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readwrite");
    tx.objectStore("docs").put({ key: `${row.collection}\u0000${row.id}`, ...row });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db, collection, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("docs", "readwrite");
    tx.objectStore("docs").delete(`${collection}\u0000${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function browserDownloads() {
  return {
    async save({ filename, data }) {
      const bin = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
      const blob = bin
        ? new Blob([bin])
        : new Blob([typeof data === "string" ? data : String(data ?? "")]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { status: "saved" };
    },
  };
}

export function payrollDownloads(supabase, actor) {
  return {
    async save({ filename, data }) {
      const bin = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
      const blob = bin
        ? new Blob([bin])
        : new Blob([typeof data === "string" ? data : String(data ?? "")]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      supabase.from("pay_audit_log").insert({
        action: "export",
        collection: "files",
        doc_id: filename,
        summary: filename,
        actor_id: actor?.id || null,
        actor_name: actor?.name || "",
      }).then(() => {}, () => {});
      return { status: "saved" };
    },
  };
}
