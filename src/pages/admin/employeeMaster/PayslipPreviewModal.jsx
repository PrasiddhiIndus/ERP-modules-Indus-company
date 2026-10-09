import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Modal } from "../../adminOperations/components/AdminUi";
import { downloadBlob } from "../../../lib/exportNodeToPdf";
import PayslipTemplate from "./PayslipTemplate";
import { toast } from "../../../lib/toast";
import { supabase } from "../../../lib/supabase";
import { fetchLwpDaysForSlip } from "../../../lib/payslipLwp";

const A4_W_MM = 210;
const A4_H_MM = 297;
const PDF_MARGIN_MM = 6;

/**
 * One A4 page with the slip image scaled to fit, so the PDF keeps the preview's exact layout
 * (no page slicing). The node is an off-screen copy at full A4 width, outside the modal's
 * scroll area, so the capture is not clipped or shifted by scrolling.
 */
async function payslipNodeToPdfBlob(node) {
  const canvas = await html2canvas(node, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    scrollX: 0,
    scrollY: 0,
  });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const maxW = A4_W_MM - PDF_MARGIN_MM * 2;
  const maxH = A4_H_MM - PDF_MARGIN_MM * 2;
  const ratio = canvas.height / canvas.width;
  let w = maxW;
  let h = w * ratio;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", (A4_W_MM - w) / 2, PDF_MARGIN_MM, w, h);
  return pdf.output("blob");
}

export default function PayslipPreviewModal({ payslip: slip, onClose, profileHref }) {
  const exportRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [lwpDays, setLwpDays] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLwpDays(null);
    if (!slip || slip.lwp_days != null) return undefined;
    fetchLwpDaysForSlip(supabase, slip).then((days) => {
      if (!cancelled) setLwpDays(days);
    });
    return () => {
      cancelled = true;
    };
  }, [slip?.id, slip?.employee_code, slip?.month_key, slip?.lwp_days]);

  const payslip = useMemo(
    () => (slip ? { ...slip, lwp_days: slip.lwp_days ?? lwpDays ?? 0 } : slip),
    [slip, lwpDays]
  );

  async function downloadPdf() {
    if (!exportRef.current || !payslip) return;
    setBusy(true);
    try {
      const name = `Payslip_${payslip.employee_code || "EMP"}_${payslip.month_key || "month"}.pdf`;
      const blob = await payslipNodeToPdfBlob(exportRef.current);
      downloadBlob(blob, name);
      toast.success("Payslip PDF downloaded.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to download payslip PDF.");
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
          {profileHref ? (
            <Link
              to={profileHref}
              className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center"
              onClick={onClose}
            >
              Open employee profile
            </Link>
          ) : null}
          <button
            type="button"
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || (slip?.lwp_days == null && lwpDays == null)}
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
          className="bg-white mx-auto"
          style={{
            maxWidth: "210mm",
            boxShadow: "0 1px 3px rgba(26,58,108,0.08), 0 10px 28px rgba(26,58,108,0.12)",
          }}
        >
          <PayslipTemplate payslip={payslip} />
        </div>
      </div>
      {typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden
              style={{ position: "fixed", left: -10000, top: 0, width: "210mm", pointerEvents: "none" }}
            >
              <div ref={exportRef} style={{ width: "210mm", background: "#ffffff" }}>
                <PayslipTemplate payslip={payslip} />
              </div>
            </div>,
            document.body
          )
        : null}
    </Modal>
  );
}
