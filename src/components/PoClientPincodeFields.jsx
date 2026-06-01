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
}) {
  const billToShipToPinSame = formData.billToShipToPinSame !== false;

  return (
    <>
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
          onChange={(e) =>
            setFormData((p) => ({ ...p, pincode: normalizePoPincode(e.target.value) }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2"
          placeholder="6-digit pincode for invoice / e-invoice"
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-2 pt-1">
        <input
          id={sameCheckboxId}
          type="checkbox"
          checked={billToShipToPinSame}
          onChange={(e) => {
            const checked = e.target.checked;
            setFormData((p) => ({
              ...p,
              billToShipToPinSame: checked,
              ...(checked ? { shipToPincode: '' } : {}),
            }));
          }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label className="text-sm text-gray-700" htmlFor={sameCheckboxId}>
          Bill to pincode is same as ship to
        </label>
      </div>
      {!billToShipToPinSame && (
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
            onChange={(e) =>
              setFormData((p) => ({ ...p, shipToPincode: normalizePoPincode(e.target.value) }))
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            placeholder="6-digit ship-to pincode"
          />
        </div>
      )}
    </>
  );
}
