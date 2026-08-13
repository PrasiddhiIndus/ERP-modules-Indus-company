import React, { useRef, useState } from "react";
import { Download } from "lucide-react";
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
      const blob = await exportNodeToPdfBlob(ref.current, { marginMm: 6 });
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
      title={`Salary slip · ${payslip?.month_label || ""}`}
      widthClass="max-w-4xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            onClick={downloadPdf}
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      }
    >
      <div className="max-h-[72vh] overflow-auto bg-[#e8e8e8] -mx-1 px-3 py-5 rounded-lg">
        <div
          ref={ref}
          className="bg-white mx-auto"
          style={{
            maxWidth: "210mm",
            boxShadow: "0 1px 3px rgba(26,58,108,0.08), 0 10px 28px rgba(26,58,108,0.12)",
          }}
        >
          <PayslipTemplate payslip={payslip} />
        </div>
      </div>
    </Modal>
  );
}
