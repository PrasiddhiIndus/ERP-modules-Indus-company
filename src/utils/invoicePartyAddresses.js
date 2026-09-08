/** Normalize address text for invoice party blocks. */
function normAddress(value) {
  return String(value ?? '').trim();
}

/**
 * Resolve bill-to vs ship-to addresses for tax invoice / e-invoice display.
 * @param {string} billingAddress
 * @param {string} shippingAddress
 */
export function resolveInvoicePartyAddresses(billingAddress, shippingAddress) {
  const billToAddress = normAddress(billingAddress);
  const shipRaw = normAddress(shippingAddress);
  const shipToDiffers = !!(
    shipRaw &&
    billToAddress &&
    shipRaw.toLowerCase() !== billToAddress.toLowerCase()
  );
  const shipToAddress = shipToDiffers ? shipRaw : billToAddress;

  return {
    billToAddress,
    shipToAddress,
    shipToDiffers,
    // Always keep a concrete ship-to value for invoice print (falls back to bill-to when same).
    clientShippingAddress: shipToAddress || null,
  };
}
