import { getAdminApiAccessToken } from "./userManagementAuthToken";

/**
 * Super Admin: set a user's Auth password via dedicated Node API.
 * Does not touch profile / modules / team / emp code.
 */
export async function resetUserPassword(supabase, { userId, password }) {
  const token = await getAdminApiAccessToken(supabase);
  if (!token) {
    return { ok: false, message: "Not signed in. Sign in again and retry." };
  }

  const id = String(userId || "").trim();
  if (!id) {
    return { ok: false, message: "User id is required." };
  }

  try {
    const res = await fetch("/api/admin/reset-user-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: id, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        message:
          (typeof data?.error === "string" && data.error) ||
          `Could not reset password (${res.status}).`,
        status: res.status,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || "Could not reach the server. Try again.",
      status: 0,
    };
  }
}
