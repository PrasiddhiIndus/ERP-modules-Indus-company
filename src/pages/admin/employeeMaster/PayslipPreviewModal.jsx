import React, { useRef, useState } from "react";
import { Modal } from "../../adminOperations/components/AdminUi";
import { downloadBlob, exportNodeToPdfBlob } from "../../../lib/exportNodeToPdf";
import PayslipTemplate from "./PayslipTemplate";

export default function PayslipPreviewModal({ payslip, onClose }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    if (!ref.current || !payslip) return;
    setBusy(true);
    try {
      const name = `Payslip_${payslip.employee_code || "EMP"}_${payslip.month_key || "month"}.pdf`;
      const blob = await exportNodeToPdfBlob(ref.current, { marginMm: 8 });
      downloadBlob(blob, name);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || "Could not download payslip PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Payslip · ${payslip?.month_label || ""}`}
      widthClass="max-w-4xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="h-9 px-3 rounded-lg border border-slate-200 text-sm" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            onClick={downloadPdf}
          >
            {busy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      }
    >
      <div className="max-h-[70vh] overflow-auto bg-slate-100 -mx-1 px-1 py-3 rounded-lg">
        <div ref={ref}>
          <PayslipTemplate payslip={payslip} />
        </div>
      </div>
    </Modal>
  );
}
