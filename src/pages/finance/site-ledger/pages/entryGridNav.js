/**
 * Keyboard navigation for the dense figures grid — pure helpers (no DOM access).
 * Enter moves to the next amount field; Shift+Enter moves back. The last field stays put.
 */

/** Marker attribute placed on every amount input in the grid. */
export const AMOUNT_FIELD_ATTR = "data-amount-field";

/**
 * Index of the field to focus after pressing Enter on `currentIndex`.
 * @param {number} total       number of amount fields in tab order
 * @param {number} currentIndex index of the field that received Enter (-1 when unknown)
 * @param {boolean} [backwards] true for Shift+Enter
 * @returns {number} next index, or -1 when there is nothing to move to
 */
export function nextAmountFieldIndex(total, currentIndex, backwards = false) {
  if (!Number.isInteger(total) || total <= 0) return -1;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= total) return -1;
  const next = currentIndex + (backwards ? -1 : 1);
  if (next < 0 || next >= total) return -1;
  return next;
}

/**
 * Handle an Enter keydown inside the grid container. Returns true when focus moved.
 * @param {KeyboardEvent|import("react").KeyboardEvent} e
 * @param {HTMLElement|null} container
 */
export function handleAmountEnterNavigation(e, container) {
  if (!container || e.key !== "Enter" || e.isComposing) return false;
  const target = e.target;
  if (!target || typeof target.hasAttribute !== "function" || !target.hasAttribute(AMOUNT_FIELD_ATTR)) {
    return false;
  }
  const fields = Array.from(container.querySelectorAll(`[${AMOUNT_FIELD_ATTR}]`))
    .filter((el) => !el.disabled);
  const idx = fields.indexOf(target);
  const nextIdx = nextAmountFieldIndex(fields.length, idx, !!e.shiftKey);
  e.preventDefault();
  if (nextIdx < 0) return false;
  const next = fields[nextIdx];
  next.focus();
  if (typeof next.select === "function") next.select();
  return true;
}
