/**
 * Central ERP toaster API.
 * Mount <AppToaster /> once near the app root (see App.jsx).
 *
 * Use for transient action feedback (save/delete/export).
 * Keep inline field/page banners for persistent validation errors.
 */

const listeners = new Set();
let items = [];
let seq = 0;

const DEFAULT_DURATION_MS = 3200;
const MAX_VISIBLE = 5;

function emit() {
  const snapshot = items;
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore subscriber errors
    }
  });
}

function dismiss(id) {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

function push(partial) {
  const id = `toast-${Date.now()}-${++seq}`;
  const tone = partial.tone || "default";
  const durationMs =
    typeof partial.durationMs === "number" ? partial.durationMs : DEFAULT_DURATION_MS;
  const entry = {
    id,
    title: String(partial.title || "").trim() || "Notice",
    message: partial.message ? String(partial.message) : "",
    tone,
  };
  items = [...items, entry].slice(-MAX_VISIBLE);
  emit();
  if (durationMs > 0 && typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), durationMs);
  }
  return id;
}

/** Subscribe to toast list changes. Returns unsubscribe. */
export function subscribeToasts(listener) {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}

export function dismissToast(id) {
  dismiss(id);
}

/**
 * Drop-in compatible with Calling Master pushToast(title, message, tone).
 * tone: "success" | "warning" | "error" | "default" | "info"
 */
export function pushToast(title, message = "", tone = "default") {
  const normalized =
    tone === "error" ? "warning" : tone === "info" ? "default" : tone || "default";
  return push({ title, message, tone: normalized });
}

export const toast = {
  success(title, message = "") {
    return push({ title, message, tone: "success" });
  },
  warning(title, message = "") {
    return push({ title, message, tone: "warning" });
  },
  error(title, message = "") {
    return push({ title, message, tone: "warning" });
  },
  info(title, message = "") {
    return push({ title, message, tone: "default" });
  },
  /** Prefer toast.success / toast.error; kept for generic callers. */
  show(title, message = "", tone = "default") {
    return pushToast(title, message, tone);
  },
};

export default toast;
