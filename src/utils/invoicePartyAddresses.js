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
  const clientShippingAddress = shipToDiffers ? shipRaw : shipRaw || null;

  return {
    billToAddress,
    shipToAddress: shipToDiffers ? shipRaw : billToAddress,
    shipToDiffers,
    clientShippingAddress,
  };
}
