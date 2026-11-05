/**
 * Employee signature (own) for probation signing — same Edge Functions Indus One uses
 * (`get-employee-signature`, `upload-employee-signature`, `delete-employee-signature`),
 * so a signature saved in either app is the one used in both.
 * Ported from Indus One `services/employeeSignatureApi.ts` + `lib/signatureSafety.ts`.
 */
import { supabase } from "../../../lib/supabase";
import { getSupabaseAnonKey, getSupabaseUrl } from "../../../lib/supabaseConfig";

export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
export const SIGNATURE_ACCEPT = "image/png,.png";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class SignatureUnsafeError extends Error {
  constructor(message) {
    super(message);
    this.name = "SignatureUnsafeError";
  }
}

/** Client-side signature gate: PNG only, under 2 MB, magic-byte check. Server re-validates. */
export async function assertSignatureFileSafe(file) {
  if (!file || file.size <= 0) throw new SignatureUnsafeError("Please choose a PNG signature image.");
  if (file.size > SIGNATURE_MAX_BYTES) throw new SignatureUnsafeError("Signature must be under 2 MB.");

  const name = String(file.name || "").toLowerCase();
  if (!name.endsWith(".png")) throw new SignatureUnsafeError("Only PNG images are allowed.");
  if ((name.match(/\./g) || []).length > 1) throw new SignatureUnsafeError("Suspicious file name.");

  const mime = String(file.type || "").toLowerCase().split(";")[0].trim();
  if (mime && mime !== "image/png") throw new SignatureUnsafeError("Only PNG images are allowed.");

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (header.length < PNG_SIG.length || PNG_SIG.some((b, i) => header[i] !== b)) {
    throw new SignatureUnsafeError("File is not a valid PNG image.");
  }
}

async function authHeaders(json = true) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  const headers = { Authorization: `Bearer ${session.access_token}`, apikey: getSupabaseAnonKey() };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function readErrorMessage(res, deployHint) {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const data = JSON.parse(text);
      const msg = String(data?.error || data?.message || "").trim();
      if (msg) {
        if (res.status === 404 || /not found/i.test(msg) || data?.code === "NOT_FOUND") {
          if (/has_signature/i.test(text)) return msg;
          return `Signature service is not deployed. Ask an admin to run: ${deployHint}`;
        }
        return msg;
      }
    } catch {
      const trimmed = text.trim().slice(0, 200);
      if (trimmed) return trimmed;
    }
  }
  if (res.status === 404) return `Signature service is not deployed. Ask an admin to run: ${deployHint}`;
  return `Request failed (${res.status})`;
}

function corsFriendlyError(err, fnName) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|CORS|Load failed/i.test(msg)) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return new Error(
      `Could not reach ${fnName}. Deploy the function and ensure Edge secret ALLOWED_ORIGIN includes ${origin}.`
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

async function callFn(fnName, init) {
  try {
    return await fetch(`${getSupabaseUrl()}/functions/v1/${fnName}`, { method: "POST", ...init });
  } catch (err) {
    throw corsFriendlyError(err, fnName);
  }
}

/** Metadata only — does not download image bytes. */
export async function fetchMySignatureMeta() {
  const res = await callFn("get-employee-signature", {
    headers: await authHeaders(true),
    body: JSON.stringify({ delivery: "meta" }),
  });
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (res.status === 404 && contentType.includes("application/json")) return { has_signature: false };
  if (!res.ok) throw new Error(await readErrorMessage(res, "supabase functions deploy get-employee-signature"));

  const data = await res.json();
  if (data.error && !data.has_signature) throw new Error(data.error);
  return {
    has_signature: Boolean(data.has_signature),
    employee_code: data.employee_code,
    content_type: data.content_type,
    size_bytes: data.size_bytes,
    file_name: data.file_name,
    updated_at: data.updated_at,
  };
}

/** Caller's signature as a new blob URL (null when none). Caller revokes it. */
async function fetchOwnSignatureBlobUrl() {
  const res = await callFn("get-employee-signature", {
    headers: await authHeaders(true),
    body: JSON.stringify({ delivery: "proxy", disposition: "inline" }),
  });
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (res.status === 404 && contentType.includes("application/json")) return null;
  if (!res.ok) throw new Error(await readErrorMessage(res, "supabase functions deploy get-employee-signature"));
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (!data.has_signature) return null;
    throw new Error(data.error || "Could not load signature");
  }
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: contentType || "image/png" }));
}

let previewBlobUrl = null;

export function revokeSignaturePreview() {
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = null;
  }
}

/** Fetch caller's signature for in-app preview (shared blob URL; previous one revoked). */
export async function fetchMySignaturePreviewUrl() {
  const url = await fetchOwnSignatureBlobUrl();
  revokeSignaturePreview();
  previewBlobUrl = url;
  return url;
}

/** Fresh blob URL for the caller's signature — does not touch the shared preview URL. */
export async function fetchMySignatureBlobUrlFresh() {
  return fetchOwnSignatureBlobUrl();
}

export async function uploadMySignature(file) {
  if (file.size > SIGNATURE_MAX_BYTES) throw new SignatureUnsafeError("Signature must be under 2 MB.");
  await assertSignatureFileSafe(file);

  const form = new FormData();
  form.append("file", file, file.name.endsWith(".png") ? file.name : "signature.png");
  const res = await callFn("upload-employee-signature", { headers: await authHeaders(false), body: form });
  if (!res.ok) throw new Error(await readErrorMessage(res, "supabase functions deploy upload-employee-signature"));

  const data = await res.json();
  if (data.error && !data.has_signature) throw new Error(data.error);
  revokeSignaturePreview();
  return {
    has_signature: true,
    employee_code: data.employee_code,
    content_type: data.content_type || "image/png",
    size_bytes: data.size_bytes,
    file_name: data.file_name,
    updated_at: data.updated_at,
  };
}

export async function deleteMySignature() {
  const res = await callFn("delete-employee-signature", {
    headers: await authHeaders(true),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "supabase functions deploy delete-employee-signature"));
  revokeSignaturePreview();
}
