/**
 * Finance report exports — Excel (.xlsx) and PDF from a plain grid.
 * Libraries are loaded on demand so they don't bloat the Site Ledger bundle.
 */

function safeName(s) {
  return String(s || "report").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "report";
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string[]} opts.meta        - filter lines printed above the table (sites, months, etc.)
 * @param {Array<Array<string|number>>} opts.head  - one or more header rows
 * @param {Array<Array<string|number>>} opts.body
 * @param {Array<string|number>} [opts.foot]
 * @param {string} [opts.fileBase]
 */
export async function exportReportExcel({ title, meta = [], head, body, foot, fileBase }) {
  const XLSX = await import("xlsx");
  const aoa = [[title], ...meta.map((m) => [m]), [], ...head, ...body, ...(foot ? [foot] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const width = Math.max(...[...head, ...body].map((r) => r.length), 1);
  ws["!cols"] = Array.from({ length: width }, (_, i) => ({ wch: i === 0 ? 30 : 15 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${safeName(fileBase || title)}.xlsx`);
}

export async function exportReportPdf({ title, meta = [], head, body, foot, fileBase, colorFor }) {
  const [{ default: JsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const width = Math.max(...[...head, ...body].map((r) => r.length), 1);
  const doc = new JsPDF({ orientation: width > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  doc.setFontSize(13);
  doc.text(title, 32, 34);
  doc.setFontSize(8.5);
  doc.setTextColor(100);
  meta.forEach((m, i) => doc.text(String(m), 32, 50 + i * 12));
  doc.setTextColor(0);
  const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : String(v ?? ""));
  autoTable(doc, {
    startY: 50 + meta.length * 12 + 4,
    head: head.map((r) => r.map(fmt)),
    body: body.map((r) => r.map(fmt)),
    foot: foot ? [foot.map(fmt)] : undefined,
    theme: "grid",
    styles: { fontSize: width > 10 ? 6.5 : 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [241, 245, 249], textColor: 40, fontStyle: "bold", halign: "center" },
    footStyles: { fillColor: [236, 253, 245], textColor: 20, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: "auto" } },
    didParseCell: (data) => {
      if (data.column.index > 0 && data.section !== "head") data.cell.styles.halign = "right";
      if (colorFor && data.section === "body") {
        const c = colorFor(data.row.index, data.column.index);
        if (c) data.cell.styles.textColor = c;
      }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(`Generated ${new Date().toLocaleString("en-IN")} · Page ${i} of ${pages}`, 32, doc.internal.pageSize.getHeight() - 14);
  }
  doc.save(`${safeName(fileBase || title)}.pdf`);
}
