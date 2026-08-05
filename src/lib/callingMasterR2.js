import { supabase } from "./supabase";
import { apiUrl } from "./apiBase";
import { getAdminApiAccessToken } from "./userManagementAuthToken";

function callingMasterR2Url(subpath) {
  const sub = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return apiUrl(`/api/hr-calling/r2${sub}`);
}

async function callingMasterR2Fetch(subpath, init = {}) {
  let token = await getAdminApiAccessToken(supabase);
  if (!token) {
    throw new Error("You must be signed in to upload Calling Master files.");
  }

  const doFetch = (accessToken) =>
    fetch(callingMasterR2Url(subpath), {
      ...init,
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

/**
 * Upload one file to Cloudflare R2 (bucket indus-erp-uploads, prefix hr-calling/).
 * @returns {Promise<{ objectKey: string, fileName: string, contentType: string }>}
 */
export async function uploadCallingMasterFileToR2({ file, candidateKey }) {
  const formData = new FormData();
  formData.append("candidateKey", String(candidateKey || "draft").trim());
  formData.append("fileName", file.name);
  if (file.type) formData.append("contentType", file.type);
  formData.append("file", file);

  const res = await callingMasterR2Fetch("/upload", {
    method: "POST",
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `Upload failed (${res.status}).`);
  }
  if (!body.objectKey) throw new Error("Upload response missing object key.");
  return {
    objectKey: String(body.objectKey),
    filePath: String(body.objectKey),
    bucket: String(body.bucket || "indus-erp-uploads"),
    fileName: String(body.fileName || file.name),
    contentType: String(body.contentType || file.type || ""),
  };
}

export async function presignCallingMasterR2Get(objectKey) {
  const res = await callingMasterR2Fetch("/presign-get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Download link failed (${res.status}).`);
  if (!body.getUrl) throw new Error("Missing download URL.");
  return body.getUrl;
}

export function fileLabelFromCallingAttachment(item) {
  if (!item) return "file";
  if (item.fileName) return item.fileName;
  const key = String(item.objectKey || item.filePath || "");
  const tail = key.slice(key.lastIndexOf("/") + 1);
  const match = tail.match(/^\d+-(.+)$/);
  return match ? match[1] : tail || "file";
}

/** R2 object key / storage path stored on the candidate row. */
export function callingAttachmentStoragePath(item) {
  if (!item) return "";
  if (typeof item === "string") return item.trim();
  return String(item.filePath || item.objectKey || "").trim();
}

export function isPreviewableCallingAttachment(item) {
  const type = String(item?.contentType || "").toLowerCase();
  const name = fileLabelFromCallingAttachment(item).toLowerCase();
  if (type.startsWith("image/") || type === "application/pdf") return true;
  return /\.(png|jpe?g|gif|webp|bmp|pdf)$/i.test(name);
}
