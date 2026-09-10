import React from 'react';
import { normalizePoPincode } from '../utils/poPincodeFields';

/**
 * Bill-to pincode + optional ship-to pincode (Client Identity on PO/WO forms).
 * Optional `billToBeside` / `shipToAddressBeside` render to the right of the matching pincode.
 */
export default function PoClientPincodeFields({
  formData,
  setFormData,
  billToInputId = 'po-pincode-bill',
  shipToInputId = 'po-pincode-ship',
  sameCheckboxId = 'po-pincode-same',
  showBillTo = true,
  showShipTo = true,
  disabled = false,
  sameAsLabel = 'Bill address is same as ship address',
  /** When true, checking "same as" also clears shippingAddress (MT contract form). */
  clearShippingAddressOnSame = false,
  /** Optional node shown beside bill-to pincode (e.g. Location). */
  billToBeside = null,
  /** Optional node shown beside ship-to pincode (e.g. Consignee / Ship-to address). */
  shipToAddressBeside = null,
}) {
  const billToShipToPinSame = formData.billToShipToPinSame !== false;
  // When only ship-to is allowed, always show the ship-to input (ignore "same as bill-to").
  const showShipToInput = showShipTo && (!showBillTo || !billToShipToPinSame);
  const showSameCheckbox = showBillTo && showShipTo;
  const showShipToAddress = Boolean(shipToAddressBeside) && (showShipToInput || !showShipTo);
  const showBillToBeside = Boolean(billToBeside) && showBillTo;

  const billToPincodeField = showBillTo ? (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={billToInputId}>
        Pincode (Bill-to)
      </label>
      <input
        id={billToInputId}
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={formData.pincode}
        disabled={disabled}
        onChange={(e) =>
          setFormData((p) => ({ ...p, pincode: normalizePoPincode(e.target.value) }))
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
        placeholder="6-digit pincode for invoice / e-invoice"
      />
    </div>
  ) : null;

  const shipToPincodeField = showShipToInput ? (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={shipToInputId}>
        Pincode (Ship-to)
      </label>
      <input
        id={shipToInputId}
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={formData.shipToPincode}
        disabled={disabled}
        onChange={(e) =>
          setFormData((p) => ({
            ...p,
            shipToPincode: normalizePoPincode(e.target.value),
            // HR (ship-to only): persist as distinct ship-to pin
            ...(!showBillTo ? { billToShipToPinSame: false } : {}),
          }))
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
        placeholder="6-digit ship-to pincode"
      />
    </div>
  ) : null;

  return (
    <>
      {showBillToBeside ? (
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {billToPincodeField}
          {billToBeside}
        </div>
      ) : (
        billToPincodeField
      )}
      {showSameCheckbox ? (
        <div className="md:col-span-2 flex items-center gap-2 pt-1">
          <input
            id={sameCheckboxId}
            type="checkbox"
            checked={billToShipToPinSame}
            disabled={disabled}
            onChange={(e) => {
              const checked = e.target.checked;
              setFormData((p) => ({
                ...p,
                billToShipToPinSame: checked,
                ...(checked
                  ? {
                      shipToPincode: '',
                      ...(clearShippingAddressOnSame ? { shippingAddress: '' } : {}),
                    }
                  : {}),
              }));
            }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <label className="text-sm text-gray-700" htmlFor={sameCheckboxId}>
            {sameAsLabel}
          </label>
        </div>
      ) : null}
      {showShipToInput && showShipToAddress ? (
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {shipToPincodeField}
          {shipToAddressBeside}
        </div>
      ) : (
        <>
          {shipToPincodeField}
          {showShipToAddress ? shipToAddressBeside : null}
        </>
      )}
    </>
  );
}
