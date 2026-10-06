import { isSalaryFiguresHidden } from "./salaryAccess";

/** Shown in place of a salary amount or account number. */
export const MASKED_SECRET = "XXXXX";

let figuresHidden = false;

/** Call from the signed-in app shell before salary screens render. */
export function syncSalaryFiguresHidden(profile, user = null) {
  figuresHidden = isSalaryFiguresHidden(profile, user);
  return figuresHidden;
}

export function salaryFiguresHidden() {
  return figuresHidden;
}

/** Amount text. Empty stays empty so blank fields do not look filled in. */
export function maskAmountText(value, empty = "—") {
  if (!figuresHidden) return null;
  if (value == null || value === "" || Number.isNaN(Number(value))) return empty;
  return MASKED_SECRET;
}

/** Account, IFSC, UAN, ESIC. Same mask, so the number cannot be read. */
export function maskAccountText(value, empty = "—") {
  if (!figuresHidden) return null;
  const raw = value == null ? "" : String(value).trim();
  if (!raw || raw === "—") return empty;
  return MASKED_SECRET;
}
