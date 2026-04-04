export function roundInvoiceAmount(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const integer = Math.floor(abs);
  const fraction = abs - integer;
  const roundedAbs = fraction < 0.5 ? integer : integer + 1;
  return n < 0 ? -roundedAbs : roundedAbs;
}

