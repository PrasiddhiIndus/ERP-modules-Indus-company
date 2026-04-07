export function roundInvoiceAmount(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const integer = Math.floor(abs);
  const fraction = abs - integer;
  const roundedAbs = fraction < 0.5 ? integer : integer + 1;
  return n < 0 ? -roundedAbs : roundedAbs;
}

/** Display qty / line amounts: up to 3 decimal places, trim trailing zeros. */
export function formatAmountUpTo3Decimals(value) {
  const n = Number(value) || 0;
  const s = n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return s;
}

/** Invoice total after 0.50 round rule, shown with up to 3 dp (e.g. 13796 or 13796.5). */
export function formatInvoiceTotalDisplay(value) {
  const r = roundInvoiceAmount(value);
  return r.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

