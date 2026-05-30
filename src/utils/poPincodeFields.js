/** Six-digit pincode for PO bill-to / ship-to. */
export function normalizePoPincode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

/** Default checked when ship-to pin is empty or matches bill-to. */
export function deriveBillToShipToPinSameFromPo(po) {
  const bill = normalizePoPincode(po?.pincode);
  const ship = normalizePoPincode(po?.shipToPincode ?? po?.ship_to_pincode);
  if (!ship) return true;
  return ship === bill;
}

/** Persist ship-to pin only when user unchecked "same as bill-to". */
export function shipToPincodeForPoSave(formData) {
  if (formData?.billToShipToPinSame !== false) return null;
  const ship = String(formData?.shipToPincode ?? '').trim();
  return ship || null;
}

/**
 * Bill-to and ship-to pincodes for invoice preview / PDF (from PO and/or saved invoice).
 */
export function resolveInvoicePartyPincodes({ po, billPinResolved, invoice } = {}) {
  const billToPin = normalizePoPincode(
    billPinResolved ??
      po?.pincode ??
      invoice?.clientPincode ??
      invoice?.client_pincode ??
      invoice?.buyerPincode ??
      invoice?.buyer_pincode
  );
  const shipStored = normalizePoPincode(
    po?.shipToPincode ??
      po?.ship_to_pincode ??
      invoice?.clientShipToPincode ??
      invoice?.client_ship_to_pincode
  );
  const same = po
    ? deriveBillToShipToPinSameFromPo(po)
    : !shipStored || shipStored === billToPin;
  const shipToPin = same ? billToPin : shipStored || billToPin;
  return { billToPin, shipToPin, billToShipToPinSame: same };
}

/** Printed under party address: "Pincode : 380001" */
export function invoicePincodeDisplayLine(pin) {
  const p = normalizePoPincode(pin);
  return `Pincode : ${p || '–'}`;
}
