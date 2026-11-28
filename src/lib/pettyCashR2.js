import { supabase } from "./supabase";
import { apiUrl } from "./apiBase";
import { getAdminApiAccessToken } from "./userManagementAuthToken";

const PREFIX = "petty-cash/";

export const PETTY_CASH_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";
export const PETTY_CASH_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const PETTY_CASH_ATTACHMENT_MAX_FILES = 8;

function pettyCashR2Url(subpath) {
  const sub = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return apiUrl(`/api/petty-cash/r2${sub}`);
}

async function pettyCashR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error("You must be signed in to upload petty cash files.");
  }

  const doFetch = (accessToken) =>
    fetch(pettyCashR2Url(subpath), {
      ...init,
      cache: "no-store",
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
    if (refreshed && refreshed !== token) {
      res = await doFetch(refreshed);
    }
  }
  return res;
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

function friendlyR2NetworkError(err) {
  const msg = String(err?.message || err || "");
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed|econnrefused/i.test(msg)) {
    return [
      "Could not reach the petty cash file service.",
      import.meta.env.DEV
        ? "Run `npm run dev` (Vite + API on port 8787) and retry."
        : "On the live server, confirm the Node API is running and /api is reverse-proxied.",
    ].join(" ");
  }
  return msg || "Could not open the file.";
}

/** Upload one receipt/bill to Cloudflare R2 (browser → Express → R2). */
export async function uploadPettyCashFileToR2({ file, voucherId }) {
  if (file?.size > PETTY_CASH_ATTACHMENT_MAX_BYTES) {
    throw new Error(`“${file.name}” is too large (max 25 MB).`);
  }
  const formData = new FormData();
  formData.append("voucherId", String(voucherId || "draft").trim() || "draft");
  formData.append("fileName", file.name);
  if (file.type) formData.append("contentType", file.type);
  formData.append("file", file);

  let res;
  try {
    res = await pettyCashR2Fetch("/upload", { method: "POST", body: formData });
  } catch (err) {
    throw new Error(friendlyR2NetworkError(err));
  }
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Upload failed (${res.status}).`);
  const { objectKey, contentType, fileName } = body;
  if (!objectKey) throw new Error("Upload response missing file location.");
  return {
    objectKey: String(objectKey),
    contentType: contentType || file.type || null,
    fileName: fileName || file.name,
  };
}

export async function presignPettyCashR2Get(objectKey, { download = false, fileName } = {}) {
  const key = String(objectKey || "").trim().replace(/^\/+/, "");
  if (!key.startsWith(PREFIX)) {
    throw new Error("This file is not stored in cloud file storage.");
  }

  let res;
  try {
    res = await pettyCashR2Fetch("/presign-get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectKey: key,
        download: Boolean(download),
        ...(fileName ? { fileName } : {}),
      }),
    });
  } catch (err) {
    throw new Error(friendlyR2NetworkError(err));
  }
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error("Download link was not returned.");
  return body.getUrl;
}

export async function deletePettyCashR2Object(objectKey) {
  const key = String(objectKey || "").trim().replace(/^\/+/, "");
  if (!key.startsWith(PREFIX)) return true;
  const res = await pettyCashR2Fetch("/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey: key }),
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body.message || `Delete failed (${res.status}).`);
  return true;
}

export function fileLabelFromPettyCashAttachment(att) {
  if (!att) return "file";
  if (typeof att === "string") {
    const leaf = att.split("/").pop() || att;
    return leaf.replace(/^\d+-/, "") || leaf;
  }
  return att.fileName || fileLabelFromPettyCashAttachment(att.objectKey);
}
