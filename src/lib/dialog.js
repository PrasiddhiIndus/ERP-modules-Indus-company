/**
 * Central ERP dialog API — promise-based replacements for the browser's
 * native window.confirm / window.prompt / window.alert.
 * Mount <AppDialogHost /> once near the app root (see App.jsx).
 *
 *   if (!(await confirmDialog({ title: "Delete site", message: "…", confirmLabel: "Delete", tone: "danger" }))) return;
 *   const reason = await promptDialog({ title: "Reason", label: "Reason", defaultValue: "" }); // null when cancelled
 *   await alertDialog({ title: "Heads up", message: "…" }); // acknowledge-only
 *
 * For transient feedback (saved / failed) use the toaster in ./toast.js instead.
 */

const listeners = new Set();
let queue = [];
let seq = 0;

function emit() {
  const current = queue[0] || null;
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch {
      // ignore subscriber errors
    }
  });
}

function normalize(input) {
  if (input == null) return {};
  if (typeof input === "string" || typeof input === "number") return { message: String(input) };
  return { ...input };
}

function open(kind, input, fallback) {
  // Host not mounted (e.g. unit test / non-browser) → resolve like a cancelled dialog.
  if (typeof window === "undefined" || listeners.size === 0) {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    queue = [...queue, { id: `dialog-${++seq}`, kind, ...normalize(input), resolve }];
    emit();
  });
}

/** Subscribe to the active dialog (or null). Returns unsubscribe. */
export function subscribeDialogs(listener) {
  listeners.add(listener);
  listener(queue[0] || null);
  return () => listeners.delete(listener);
}

/** Settle the active dialog with `value` and show the next queued one. */
export function settleDialog(id, value) {
  const entry = queue.find((d) => d.id === id);
  if (!entry) return;
  queue = queue.filter((d) => d.id !== id);
  try {
    entry.resolve(value);
  } finally {
    emit();
  }
}

/**
 * Ask the user to confirm an action.
 * @param {string|{title?:string,message?:string,confirmLabel?:string,cancelLabel?:string,tone?:"primary"|"danger"}} input
 * @returns {Promise<boolean>} true only when the user confirms.
 */
export function confirmDialog(input) {
  return open("confirm", input, false);
}

/**
 * Ask the user for a line of text.
 * Mirrors window.prompt: resolves to the entered string ("" allowed) or null when cancelled.
 * @param {string|{title?:string,message?:string,label?:string,defaultValue?:string,placeholder?:string,confirmLabel?:string,cancelLabel?:string,multiline?:boolean,readOnly?:boolean,selectOnOpen?:boolean}} input
 * @returns {Promise<string|null>}
 */
export function promptDialog(input) {
  return open("prompt", input, null);
}

/**
 * Show a message the user must acknowledge.
 * @param {string|{title?:string,message?:string,confirmLabel?:string,tone?:"primary"|"danger"}} input
 * @returns {Promise<void>}
 */
export function alertDialog(input) {
  return open("alert", input, undefined).then(() => undefined);
}

export default { confirm: confirmDialog, prompt: promptDialog, alert: alertDialog };
