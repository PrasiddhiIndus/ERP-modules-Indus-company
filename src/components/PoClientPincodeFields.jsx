import React from 'react';
import { normalizePoPincode } from '../utils/poPincodeFields';

/**
 * Bill-to pincode + optional ship-to pincode (Client Identity on PO/WO forms).
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
}) {
  const billToShipToPinSame = formData.billToShipToPinSame !== false;
  // When only ship-to is allowed, always show the ship-to input (ignore "same as bill-to").
  const showShipToInput = showShipTo && (!showBillTo || !billToShipToPinSame);
  const showSameCheckbox = showBillTo && showShipTo;

  return (
    <>
      {showBillTo ? (
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
      ) : null}
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
                ...(checked ? { shipToPincode: '' } : {}),
              }));
            }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <label className="text-sm text-gray-700" htmlFor={sameCheckboxId}>
            Bill to pincode is same as ship to
          </label>
        </div>
      ) : null}
      {showShipToInput ? (
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
      ) : null}
    </>
  );
}
