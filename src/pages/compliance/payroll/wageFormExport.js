import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import { WAGE_FORM_LIST } from "./wageFormCatalog";

const BLANK = "________";

function orBlank(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "—") return BLANK;
  return text;
}

function shownDate(value) {
  return formatDateDdMmYyyy(value) || BLANK;
}

function fileBase(pack, forms) {
  const first = formsOf(forms)[0];
  const header = pack?.forms?.[first?.id]?.header || pack?.forms?.["form-i"]?.header || {};
  const name = header.establishment || header.contractor || header.employeeName || first?.button || "compliance-forms";
  const safe = String(name).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return safe || "compliance-forms";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function groupHead(columns) {
  const cells = [];
  let index = 0;
  while (index < columns.length) {
    const name = columns[index].group || "";
    let span = 1;
    while (index + span < columns.length && (columns[index + span].group || "") === name) span += 1;
    cells.push({ content: name, colSpan: span, styles: { halign: "center", valign: "middle" } });
    index += span;
  }
  return cells;
}

function thinBorder() {
  const edge = { style: "thin", color: { argb: "FFB7C0C7" } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function formsOf(forms) {
  return forms?.length ? forms : WAGE_FORM_LIST;
}

function sheetName(form, index, used) {
  const raw = String(form.sheet || form.button || form.title || `Form ${index + 1}`)
    .split("")
    .map((ch) => "\\/*?:[]".includes(ch) ? " " : ch)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  let name = raw || `Form ${index + 1}`;
  if (used.has(name)) name = `${name.slice(0, 27)} ${index + 1}`.slice(0, 31);
  used.add(name);
  return name;
}

function excelColumnWidth(column) {
  if (column.excelWidth) return column.excelWidth;
  if (column.width) return Math.max(8, Math.round(column.width / 7));
  return Math.min(34, Math.max(16, Math.ceil(String(column.label || "").length / 2.6)));
}

function writeLine(sheet, row, span, text, font, align = "left") {
  sheet.mergeCells(row, 1, row, span);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = font;
  cell.alignment = { horizontal: align, vertical: "top", wrapText: true };
  sheet.getRow(row).height = Math.min(96, 18 + Math.ceil(String(text || "").length / 110) * 12);
  return row + 1;
}

function employeeMarks(header) {
  const marks = Array.isArray(header.employeeMarks) ? header.employeeMarks : [];
  const images = marks.filter((item) => String(item || "").startsWith("data:image"));
  if (images.length) return images;
  return String(header.employeeSignature || "").startsWith("data:image") ? [header.employeeSignature] : [];
}

function placeSheetImage(workbook, sheet, image, col, row) {
  const base64 = String(image).split(",")[1];
  const extension = String(image).includes("png") ? "png" : "jpeg";
  const imageId = workbook.addImage({ base64, extension });
  sheet.addImage(imageId, { tl: { col, row }, ext: { width: 120, height: 48 } });
}

function nominationWitnesses(header) {
  if (Array.isArray(header.witnesses)) return header.witnesses;
  return [
    { name: header.witness1 || "", signature: "" },
    { name: header.witness2 || "", signature: "" },
  ];
}

function writeNominationSheet(workbook, form, part, name) {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  const span = 4;
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 42;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 28;
  const h = part.header || {};
  let row = 1;
  const body = { name: "Calibri", size: 11 };
  const bold = { name: "Calibri", size: 12, bold: true };
  row = writeLine(sheet, row, span, "FORM I", { name: "Calibri", size: 16, bold: true }, "center");
  row = writeLine(sheet, row, span, "[(see rule 6(1), (2), (3) and (4))]", { name: "Calibri", size: 10, italic: true }, "center");
  row = writeLine(sheet, row, span, "Nomination/Fresh Nomination/Modification of Nomination", bold, "center");
  row = writeLine(sheet, row, span, `To ${orBlank(h.establishmentTo)}`, body);
  row = writeLine(sheet, row, span, "(Give here name or description of the establishment with full address)", { name: "Calibri", size: 10, italic: true });
  row = writeLine(
    sheet,
    row,
    span,
    `1. I, Shri/Shrimati/Kumari ${h.employeeName || BLANK} (Name in full here) whose particulars are given in the statement below, hereby nominate the person(s) mentioned below/ have acquired a family within the meaning of clause (33) of section 2 of Code on Social Security, 2020 with effect from the ${shownDate(h.familyFrom)} (date here) in the manner indicated below and therefore nominate afresh the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s).`,
    body
  );
  row = writeLine(sheet, row, span, "Or", bold, "center");
  row = writeLine(
    sheet,
    row,
    span,
    `I, Shri/Shrimati/Kumari ${h.modifyName || BLANK} (Name in full here) whose particulars are given in the statement below, hereby give notice that the nomination filled by me on date ${shownDate(h.previousDate)} and recorded under your reference No. ${h.referenceNo || BLANK} dated ${shownDate(h.referenceDate)} shall stand modified in the following manner-`,
    body
  );
  row = writeLine(sheet, row, span, "*Strike out unnecessary portion.", { name: "Calibri", size: 10, italic: true });
  [
    "2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (33) of section 2 of the Code on Social Security, 2020.",
    "3. I hereby declare that I have no family within the meaning of clause (33) of section 2 of the said Code.",
    "(a) My father/mother/parents is/are not dependent on me.",
    "(b) My husband's father/mother/parents is/are not dependent on my husband.",
    `4. I have excluded my husband from my family by a notice dated the ${shownDate(h.excludeHusbandDate)} to the competent authority in terms of clause (33) of section 2 of the said Code.`,
    "5. Nomination made herein invalidates my previous nomination.",
    "Nominee(s)",
  ].forEach((text) => {
    row = writeLine(sheet, row, span, text, text === "Nominee(s)" ? bold : body, text === "Nominee(s)" ? "center" : "left");
  });
  const heads = ["S.No.", "Name in full with full address of nominee(s)", "Relationship / age", "Proportion"];
  heads.forEach((heading, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = heading;
    cell.font = { name: "Calibri", size: 10, bold: true };
    cell.alignment = { wrapText: true };
  });
  row += 1;
  (part.rows || []).forEach((item, index) => {
    sheet.getCell(row, 1).value = `${index + 1}.`;
    sheet.getCell(row, 2).value = orBlank(item.nameAddress);
    sheet.getCell(row, 3).value = `${orBlank(item.relationship)} / ${orBlank(item.age)}`;
    sheet.getCell(row, 4).value = orBlank(item.proportion);
    row += 1;
  });
  row = writeLine(sheet, row, span, "So on", body);
  row = writeLine(sheet, row, span, 'Manner of acquiring a "Family"', bold, "center");
  row = writeLine(sheet, row, span, "(Here give details as to how family was acquired. i.e. whether by marriage or parents being rendered dependent or through other process like adoption)", body);
  row = writeLine(sheet, row, span, orBlank(h.familyManner), body);
  row = writeLine(sheet, row, span, "Statement", bold, "center");
  [
    ["1. Name of employee in full", h.statementName],
    ["2. Sex", h.sex],
    ["3. Religion", h.religion],
    ["4. Whether unmarried/married/widow/widower", h.marital],
    ["5. Department/Branch/Section where employed", h.department],
    ["6. Post held with Ticket No. or Serial No., if any", h.postTicket],
    ["7. Date of appointment", h.appointmentDate],
    ["8. Permanent address", `Village ${orBlank(h.village)}, Thana ${orBlank(h.thana)}, Sub-division ${orBlank(h.subdivision)}, Post Office ${orBlank(h.postOffice)}, Pin-Code ${orBlank(h.pinCode)}, District ${orBlank(h.district)}, State ${orBlank(h.stateName)}, E-mail ${orBlank(h.email)}, Mobile ${orBlank(h.mobile)}`],
    ["Place", h.statementPlace],
    ["Date", h.statementDate],
  ].forEach(([label, value]) => {
    const shown = /date/i.test(label) ? shownDate(value) : orBlank(value);
    row = writeLine(sheet, row, span, `${label}: ${shown}`, body);
  });
  row = writeLine(sheet, row, span, "DECLARATION BY WITNESSES", bold, "center");
  row = writeLine(sheet, row, span, "Fresh nomination signed/thumb-impressed before me.", body);
  nominationWitnesses(h).forEach((witness, index) => {
    row = writeLine(sheet, row, span, `${index + 1}. ${orBlank(witness.name)}`, body);
    if (!String(witness.signature || "").startsWith("data:image")) return;
    const base64 = String(witness.signature).split(",")[1];
    const extension = String(witness.signature).includes("png") ? "png" : "jpeg";
    const imageId = workbook.addImage({ base64, extension });
    sheet.addImage(imageId, { tl: { col: 1, row: row - 1 }, ext: { width: 120, height: 36 } });
    row += 2;
  });
  [
    ["Witness place", h.witnessPlace, true],
    ["Witness date", h.witnessDate, true],
    ["Certificate by the Employer", ""],
    ["Certified that the particulars of the above nomination have been verified and recorded in this establishment.", ""],
    ["Employer's Reference No., if any", h.employerReference, true],
    ["Date", h.employerCertDate, true],
    ["Designation", h.employerDesignation, true],
    ["Name and address of the establishment or rubber stamp thereof.", h.employerEstablishment, true],
    ["Acknowledgement by the Employee", ""],
    ["Received the duplicate copy of nomination in Form-I filed by me and duly certified by the employer.", ""],
    ["Date", h.ackDate, true],
    ["Signature of the Employee", ""],
    ["By order and in the name of the Governor of Gujarat,", ""],
    ["(Drashti Shah)", ""],
    ["Deputy Secretary to Government.", ""],
  ].forEach(([label, value, fill]) => {
    if (!fill) {
      row = writeLine(sheet, row, span, label, body);
      return;
    }
    const shown = /date/i.test(label) ? shownDate(value) : orBlank(value);
    row = writeLine(sheet, row, span, `${label}: ${shown}`, body);
  });
  row = writeLine(sheet, row, span, "Signature/Thumb-impression of the Employee", bold);
  employeeMarks(h).forEach((image, index) => placeSheetImage(workbook, sheet, image, index, row - 1));
  if (employeeMarks(h).length) row += 3;
  [
    ["Signature of the employer/Officer authorized", h.employerSignature],
    ["Signature of the Employee", h.ackSignature],
    ["(Drashti Shah) — Deputy Secretary to Government", h.secretarySignature],
  ].forEach(([label, image]) => {
    row = writeLine(sheet, row, span, label, bold);
    if (!String(image || "").startsWith("data:image")) return;
    placeSheetImage(workbook, sheet, image, 0, row - 1);
    row += 3;
  });
}

function leaveYearRows(worker) {
  return Array.isArray(worker?.years) && worker.years.length ? worker.years : [{}];
}

const DATE_KEYS = new Set(["joiningDate", "exitDate", "lieuPayDate", "leaveFrom", "leaveTo", "dischargeDate", "dob", "issueDate", "appointmentDate", "payDate", "attendanceDate"]);
const YEAR_TABLES = [
  ["calendarYear", "leaveDue", "leaveFrom", "leaveTo", "leaveDays"],
  ["daysWorked", "layOff", "maternity", "leaveEnjoyed", "workingTotal", "regularLeave", "leaveBalance"],
  ["paidLeaveDays", "wageRate", "totalAmount", "dischargeDate", "balanceDays", "dischargeRate", "dischargePayment", "workerSignature"],
];

function leaveCell(column, value) {
  const text = String(value ?? "").trim();
  if (text.startsWith("data:image")) return "Uploaded";
  if (DATE_KEYS.has(column?.key)) return formatDateDdMmYyyy(text) || BLANK;
  return text || BLANK;
}

function paintExcelTable(sheet, row, columns, records) {
  const grouped = columns.some((column) => column.group);
  if (grouped) {
    const groupRow = sheet.getRow(row);
    groupRow.getCell(1).border = thinBorder();
    groupRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
    let index = 0;
    while (index < columns.length) {
      const name = columns[index].group || "";
      let spanCount = 1;
      while (name && index + spanCount < columns.length && columns[index + spanCount].group === name) spanCount += 1;
      const cell = groupRow.getCell(index + 2);
      cell.value = name;
      cell.font = { name: "Calibri", size: 9, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
      cell.border = thinBorder();
      if (spanCount > 1) sheet.mergeCells(row, index + 2, row, index + 1 + spanCount);
      index += spanCount;
    }
    groupRow.height = 22;
    row += 1;
  }
  const head = sheet.getRow(row);
  head.height = 36;
  ["S.No.", ...columns.map((column) => column.label)].forEach((label, index) => {
    const cell = head.getCell(index + 1);
    cell.value = label;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF64748B" } };
    cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
    cell.border = thinBorder();
    sheet.getColumn(index + 1).width = index === 0 ? 8 : excelColumnWidth(columns[index - 1]);
  });
  row += 1;
  const lines = records.length ? records : [{}];
  lines.forEach((record, recordIndex) => {
    const line = sheet.getRow(row);
    line.getCell(1).value = String(recordIndex + 1);
    columns.forEach((column, index) => {
      const cell = line.getCell(index + 2);
      cell.value = leaveCell(column, record?.[column.key]);
      cell.font = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = thinBorder();
    });
    line.getCell(1).border = thinBorder();
    line.getCell(1).font = { name: "Calibri", size: 10 };
    line.getCell(1).alignment = { horizontal: "center" };
    row += 1;
  });
  return row + 1;
}

function writeLeaveSheet(workbook, form, part, name) {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 8 },
  });
  const years = form.yearColumns || [];
  const span = Math.max(years.length + 1, 4);
  let row = 1;
  const body = { name: "Calibri", size: 11 };
  const bold = { name: "Calibri", size: 12, bold: true };
  row = writeLine(sheet, row, span, form.title, { name: "Calibri", size: 16, bold: true }, "center");
  row = writeLine(sheet, row, span, form.rule, { name: "Calibri", size: 10, italic: true }, "center");
  row = writeLine(sheet, row, span, form.name, bold, "center");
  if (form.note) row = writeLine(sheet, row, span, form.note, body);
  const workers = part.rows?.length ? part.rows : [{}];
  const byKey = Object.fromEntries(years.map((column) => [column.key, column]));
  workers.forEach((worker, workerIndex) => {
    row = writeLine(sheet, row, span, `S.No. ${workerIndex + 1}`, bold);
    (form.columns || []).forEach((column, fieldIndex) => {
      row = writeLine(sheet, row, span, `${fieldIndex + 1}. ${column.label}: ${leaveCell(column, worker?.[column.key])}`, body);
    });
    YEAR_TABLES.forEach((keys) => {
      row = paintExcelTable(sheet, row, keys.map((key) => byKey[key]).filter(Boolean), leaveYearRows(worker));
    });
  });
}

function writeIdentitySheet(workbook, form, part, name) {
  const sheet = workbook.addWorksheet(name, {
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  sheet.getColumn(1).width = 62;
  sheet.getColumn(2).width = 42;
  let row = 1;
  const body = { name: "Calibri", size: 11 };
  const bold = { name: "Calibri", size: 12, bold: true };
  row = writeLine(sheet, row, 2, form.title, { name: "Calibri", size: 16, bold: true }, "center");
  row = writeLine(sheet, row, 2, form.rule, { name: "Calibri", size: 10, italic: true }, "center");
  row = writeLine(sheet, row, 2, form.name, bold, "center");
  const cards = part.rows?.length ? part.rows : [{}];
  cards.forEach((card, cardIndex) => {
    row = writeLine(sheet, row, 2, `S.No. ${cardIndex + 1}`, bold);
    (form.columns || []).forEach((column) => {
      row = writeLine(sheet, row, 2, column.label, bold);
      const image = card?.[column.key];
      if (String(image || "").startsWith("data:image")) {
        placeSheetImage(workbook, sheet, image, 0, row - 1);
        row += 3;
        return;
      }
      row = writeLine(sheet, row, 2, leaveCell(column, image), body);
    });
    row += 1;
  });
}

function drawLeavePdf(doc, form, part) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let y = 14;
  const center = (text, size) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(20);
    doc.text(String(text || ""), pageWidth / 2, y, { align: "center" });
    y += size * 0.45 + 2;
  };
  center(form.title, 16);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(String(form.rule || ""), pageWidth / 2, y, { align: "center" });
  y += 6;
  center(form.name, 12);
  if (form.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(form.note, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }
  const years = form.yearColumns || [];
  const workers = part.rows?.length ? part.rows : [{}];
  workers.forEach((worker, workerIndex) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(`S.No. ${workerIndex + 1}`, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    (form.columns || []).forEach((column, fieldIndex) => {
      const lines = doc.splitTextToSize(`${fieldIndex + 1}. ${column.label}: ${leaveCell(column, worker?.[column.key])}`, pageWidth - margin * 2);
      if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 16) {
        doc.addPage();
        y = 14;
      }
      doc.text(lines, margin, y);
      y += lines.length * 4 + 1;
    });
    const byKey = Object.fromEntries(years.map((column) => [column.key, column]));
    YEAR_TABLES.forEach((keys) => {
      const tableColumns = keys.map((key) => byKey[key]).filter(Boolean);
      const grouped = tableColumns.some((column) => column.group);
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 14;
      }
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: { fontSize: 7, textColor: [51, 65, 85], overflow: "linebreak" },
        headStyles: { fillColor: [238, 242, 246], textColor: [100, 116, 139], fontStyle: "normal", halign: "center" },
        horizontalPageBreak: true,
        horizontalPageBreakRepeat: [0],
        showHead: "everyPage",
        head: [
          ...(grouped ? [[{ content: "" }, ...groupHead(tableColumns)]] : []),
          ["S.No.", ...tableColumns.map((column) => column.label)],
        ],
        body: leaveYearRows(worker).map((year, yearIndex) => [String(yearIndex + 1), ...tableColumns.map((column) => leaveCell(column, year?.[column.key]))]),
      });
      y = doc.lastAutoTable.finalY + 6;
    });
  });
}

function drawIdentityPdf(doc, form, part) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;
  const ensure = (need) => {
    if (y + need <= doc.internal.pageSize.getHeight() - 14) return;
    doc.addPage("a4", "portrait");
    y = 16;
  };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(form.title, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(form.rule || "", pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(form.name || "", pageWidth / 2, y, { align: "center" });
  y += 8;
  const cards = part.rows?.length ? part.rows : [{}];
  cards.forEach((card, cardIndex) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`S.No. ${cardIndex + 1}`, margin, y);
    y += 6;
    (form.columns || []).forEach((column) => {
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text(column.label, margin, y);
      y += 4;
      const image = card?.[column.key];
      if (String(image || "").startsWith("data:image")) {
        ensure(24);
        try {
          doc.addImage(image, margin, y, 42, 16);
        } catch {
          doc.setFont("helvetica", "normal");
          doc.text("Image added", margin, y + 4);
        }
        y += 20;
        return;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(String(leaveCell(column, image)), pageWidth - margin * 2);
      ensure(lines.length * 4.4 + 2);
      doc.text(lines, margin, y);
      y += lines.length * 4.4 + 3;
    });
    y += 4;
  });
}

export async function buildWagePackWorkbook(pack, forms) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Indus ERP";
  workbook.created = new Date();
  const usedNames = new Set();

  formsOf(forms).forEach((form, formIndex) => {
    const part = pack.forms?.[form.id] || { header: {}, rows: [] };
    if (form.kind === "nomination") {
      writeNominationSheet(workbook, form, part, sheetName(form, formIndex, usedNames));
      return;
    }
    if (form.kind === "leave") {
      writeLeaveSheet(workbook, form, part, sheetName(form, formIndex, usedNames));
      return;
    }
    if (form.kind === "identity") {
      writeIdentitySheet(workbook, form, part, sheetName(form, formIndex, usedNames));
      return;
    }
    const sheet = workbook.addWorksheet(sheetName(form, formIndex, usedNames), {
      pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: false },
    });
    const sheetColumns = [{ key: "__sno", label: "S.No.", excelWidth: 8 }, ...form.columns];
    const span = Math.max(sheetColumns.length, 1);

    const writeMerged = (rowNumber, value, font, height) => {
      sheet.mergeCells(rowNumber, 1, rowNumber, span);
      const cell = sheet.getCell(rowNumber, 1);
      cell.value = value;
      cell.font = font;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (height) sheet.getRow(rowNumber).height = height;
    };

    writeMerged(1, form.title, { name: "Calibri", size: 16, bold: true }, 24);
    writeMerged(2, form.rule, { name: "Calibri", size: 10, italic: true, color: { argb: "FF5B6B74" } }, 18);
    writeMerged(3, form.name, { name: "Calibri", size: 12, bold: true }, 22);

    let row = 5;
    const fields = form.header || [];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const next = fields[index + 1];
      const pair = next && !field.wide && !next.wide;
      const labelCell = sheet.getCell(row, 1);
      labelCell.value = field.label;
      labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
      const valueCell = sheet.getCell(row, 2);
      valueCell.value = orBlank(part.header?.[field.key]);
      valueCell.font = { name: "Calibri", size: 10 };
      if (pair) {
        const secondLabel = sheet.getCell(row, 4);
        secondLabel.value = next.label;
        secondLabel.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
        const secondValue = sheet.getCell(row, 5);
        secondValue.value = orBlank(part.header?.[next.key]);
        secondValue.font = { name: "Calibri", size: 10 };
        index += 1;
      }
      row += 1;
    }

    row += 1;
    if (form.columns.some((column) => column.group)) {
      const groupRow = sheet.getRow(row);
      const lead = groupRow.getCell(1);
      lead.value = "";
      lead.border = thinBorder();
      lead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
      let index = 0;
      while (index < form.columns.length) {
        const name = form.columns[index].group || "";
        let spanCount = 1;
        while (name && index + spanCount < form.columns.length && form.columns[index + spanCount].group === name) spanCount += 1;
        const cell = groupRow.getCell(index + 2);
        cell.value = name;
        cell.font = { name: "Calibri", size: 9, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
        cell.border = thinBorder();
        if (spanCount > 1) sheet.mergeCells(row, index + 2, row, index + 1 + spanCount);
        index += spanCount;
      }
      groupRow.height = 22;
      row += 1;
    }
    const headingRow = sheet.getRow(row);
    headingRow.height = 64;
    sheet.views = [{ state: "frozen", ySplit: headingRow.number, showGridLines: true }];
    sheet.pageSetup.printTitlesRow = `${headingRow.number}:${headingRow.number}`;
    sheetColumns.forEach((column, index) => {
      const headingCell = headingRow.getCell(index + 1);
      headingCell.value = column.label;
      headingCell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF64748B" } };
      headingCell.alignment = { horizontal: "left", vertical: "bottom", wrapText: true };
      headingCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
      headingCell.border = thinBorder();
      sheet.getColumn(index + 1).width = column.key === "__sno" ? 8 : excelColumnWidth(column);
    });

    row += 1;
    const rows = part.rows?.length ? part.rows : [{}];
    rows.forEach((data, rowIndex) => {
      const dataRow = sheet.getRow(row);
      sheetColumns.forEach((column, index) => {
        const cell = dataRow.getCell(index + 1);
        const raw = column.key === "__sno" ? String(rowIndex + 1) : data?.[column.key] || "";
        cell.value = column.key === "__sno" ? raw : leaveCell(column, raw);
        cell.font = { name: "Calibri", size: 10 };
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = thinBorder();
      });
      row += 1;
    });

    row += 1;
    sheet.mergeCells(row, 1, row, span);
    const note = sheet.getCell(row, 1);
    note.value = form.note || "";
    note.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF5B6B74" } };
    note.alignment = { wrapText: true };
  });

  return workbook;
}

export async function exportWagePackExcel(pack, forms) {
  const workbook = await buildWagePackWorkbook(pack, forms);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(pack, forms)}.xlsx`
  );
}

function drawNominationPdf(doc, part) {
  const h = part.header || {};
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const width = pageWidth - margin * 2;
  let y = 16;
  const ensure = (need) => {
    if (y + need <= doc.internal.pageSize.getHeight() - 14) return;
    doc.addPage("a4", "portrait");
    y = 16;
  };
  const center = (text, size, style) => {
    ensure(8);
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(20);
    doc.text(text, pageWidth / 2, y, { align: "center" });
    y += size * 0.45 + 2;
  };
  const paragraph = (text) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30);
    const lines = doc.splitTextToSize(text, width);
    ensure(lines.length * 4.6 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.6 + 2;
  };
  center("FORM I", 16, "bold");
  center("[(see rule 6(1), (2), (3) and (4))]", 9, "italic");
  center("Nomination/Fresh Nomination/Modification of Nomination", 12, "bold");
  paragraph(`To ${orBlank(h.establishmentTo)}`);
  paragraph("(Give here name or description of the establishment with full address)");
  paragraph(`1. I, Shri/Shrimati/Kumari ${h.employeeName || BLANK} (Name in full here) whose particulars are given in the statement below, hereby nominate the person(s) mentioned below/ have acquired a family within the meaning of clause (33) of section 2 of Code on Social Security, 2020 with effect from the ${shownDate(h.familyFrom)} (date here) in the manner indicated below and therefore nominate afresh the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s).`);
  center("Or", 11, "bold");
  paragraph(`I, Shri/Shrimati/Kumari ${h.modifyName || BLANK} (Name in full here) whose particulars are given in the statement below, hereby give notice that the nomination filled by me on date ${shownDate(h.previousDate)} and recorded under your reference No. ${h.referenceNo || BLANK} dated ${shownDate(h.referenceDate)} shall stand modified in the following manner-`);
  paragraph("*Strike out unnecessary portion.");
  paragraph("2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (33) of section 2 of the Code on Social Security, 2020.");
  paragraph("3. I hereby declare that I have no family within the meaning of clause (33) of section 2 of the said Code.");
  paragraph("(a) My father/mother/parents is/are not dependent on me.");
  paragraph("(b) My husband's father/mother/parents is/are not dependent on my husband.");
  paragraph(`4. I have excluded my husband from my family by a notice dated the ${shownDate(h.excludeHusbandDate)} to the competent authority in terms of clause (33) of section 2 of the said Code.`);
  paragraph("5. Nomination made herein invalidates my previous nomination.");
  center("Nominee(s)", 12, "bold");
  const nomineeRows = part.rows?.length ? part.rows : [{}];
  const body = nomineeRows.map((row, index) => [String(index + 1), orBlank(row.nameAddress), orBlank(row.relationship), orBlank(row.age), orBlank(row.proportion)]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8, textColor: [30, 41, 59], overflow: "linebreak" },
    headStyles: { fillColor: [238, 242, 246], textColor: [71, 85, 105], fontStyle: "normal" },
    head: [["S.No.", "Name in full with full address of nominee(s)", "Relationship with the employee", "Age of nominee", "Proportion by which the gratuity will be shared"]],
    body,
  });
  y = doc.lastAutoTable.finalY + 6;
  paragraph("So on");
  center('Manner of acquiring a "Family"', 12, "bold");
  paragraph("(Here give details as to how family was acquired. i.e. whether by marriage or parents being rendered dependent or through other process like adoption)");
  paragraph(orBlank(h.familyManner));
  center("Statement", 12, "bold");
  paragraph(`1. Name of employee in full: ${orBlank(h.statementName)}`);
  paragraph(`2. Sex: ${orBlank(h.sex)}`);
  paragraph(`3. Religion: ${orBlank(h.religion)}`);
  paragraph(`4. Whether unmarried/married/widow/widower: ${orBlank(h.marital)}`);
  paragraph(`5. Department/Branch/Section where employed: ${orBlank(h.department)}`);
  paragraph(`6. Post held with Ticket No. or Serial No., if any: ${orBlank(h.postTicket)}`);
  paragraph(`7. Date of appointment: ${shownDate(h.appointmentDate)}`);
  paragraph(`8. Permanent address: Village ${orBlank(h.village)}  Thana ${orBlank(h.thana)}  Sub-division ${orBlank(h.subdivision)}  Post Office ${orBlank(h.postOffice)}  Pin-Code ${orBlank(h.pinCode)}  District ${orBlank(h.district)}  State ${orBlank(h.stateName)}  E-mail ID ${orBlank(h.email)}  Mobile Number ${orBlank(h.mobile)}`);
  paragraph(`Place: ${orBlank(h.statementPlace)}    Date: ${shownDate(h.statementDate)}`);
  const paintSign = (label, image) => {
    paragraph(label);
    if (!String(image || "").startsWith("data:image")) return;
    ensure(28);
    doc.addImage(image, margin, y, 42, 16);
    y += 20;
  };
  paragraph("Signature/Thumb-impression of the Employee");
  const marks = employeeMarks(h);
  marks.forEach((image, index) => {
    const column = index % 4;
    if (column === 0 && index > 0) y += 20;
    ensure(28);
    doc.addImage(image, margin + column * 46, y, 42, 16);
  });
  if (marks.length) y += 20;
  center("DECLARATION BY WITNESSES", 12, "bold");
  paragraph("Fresh nomination signed/thumb-impressed before me.");
  paragraph("Name in full and full address of witnesses, and signature:");
  nominationWitnesses(h).forEach((witness, index) => {
    paragraph(`${index + 1}. ${orBlank(witness.name)}`);
    paintSign("Signature", witness.signature);
  });
  paragraph(`Place: ${orBlank(h.witnessPlace)}    Date: ${shownDate(h.witnessDate)}`);
  center("Certificate by the Employer", 12, "bold");
  paragraph("Certified that the particulars of the above nomination have been verified and recorded in this establishment.");
  paragraph(`Employer's Reference No., if any: ${orBlank(h.employerReference)}`);
  paragraph(`Date: ${shownDate(h.employerCertDate)}`);
  paintSign("Signature of the employer/Officer authorized", h.employerSignature);
  paragraph(`Designation: ${orBlank(h.employerDesignation)}`);
  paragraph(`Name and address of the establishment or rubber stamp thereof. ${orBlank(h.employerEstablishment)}`);
  center("Acknowledgement by the Employee", 12, "bold");
  paragraph("Received the duplicate copy of nomination in Form-I filed by me and duly certified by the employer.");
  paragraph(`Date: ${shownDate(h.ackDate)}`);
  paintSign("Signature of the Employee", h.ackSignature);
  paragraph("By order and in the name of the Governor of Gujarat,");
  center("(Drashti Shah)", 11, "bold");
  center("Deputy Secretary to Government.", 11, "bold");
  paintSign("Signature of (Drashti Shah), Deputy Secretary to Government", h.secretarySignature);
}

export function buildWagePackPdf(pack, forms) {
  const list = formsOf(forms);
  const doc = new jsPDF({
    orientation: list[0]?.kind === "nomination" ? "portrait" : "landscape",
    unit: "mm",
    format: list[0]?.kind === "nomination" ? "a4" : "a3",
  });
  const margin = 10;

  list.forEach((form, formIndex) => {
    const portrait = form.kind === "nomination" || form.kind === "identity";
    if (formIndex > 0) doc.addPage(portrait ? "a4" : "a3", portrait ? "portrait" : "landscape");
    const part = pack.forms?.[form.id] || { header: {}, rows: [] };
    if (form.kind === "nomination") {
      drawNominationPdf(doc, part);
      return;
    }
    if (form.kind === "leave") {
      drawLeavePdf(doc, form, part);
      return;
    }
    if (form.kind === "identity") {
      drawIdentityPdf(doc, form, part);
      return;
    }
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 14;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(form.title, pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(form.rule, pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(form.name, pageWidth / 2, y, { align: "center" });
    y += 8;

    let tableStart = y;
    if (form.header?.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        tableWidth: pageWidth - margin * 2,
        theme: "plain",
        styles: { fontSize: 9, textColor: [20, 28, 36], cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 92 } },
        body: form.header.map((field) => [field.label, orBlank(part.header?.[field.key])]),
      });
      tableStart = doc.lastAutoTable.finalY + 4;
    }

    const rows = part.rows?.length ? part.rows : [{}];
    autoTable(doc, {
      startY: tableStart,
      margin: { left: margin, right: margin, bottom: 12 },
      tableWidth: pageWidth - margin * 2,
      theme: "grid",
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: [0, 1],
      showHead: "everyPage",
      styles: {
        fontSize: 8,
        cellPadding: 1.6,
        overflow: "linebreak",
        valign: "middle",
        textColor: [20, 28, 36],
        lineColor: [183, 192, 199],
        lineWidth: 0.15,
        minCellWidth: 28,
      },
      headStyles: {
        fillColor: [238, 242, 246],
        textColor: [100, 116, 139],
        fontStyle: "normal",
        halign: "center",
        valign: "bottom",
        fontSize: 7.5,
        minCellHeight: 16,
      },
      head: [
        ...(form.columns.some((column) => column.group)
          ? [[{ content: "", styles: { halign: "center" } }, ...groupHead(form.columns)]]
          : []),
        ["S.No.", ...form.columns.map((column) => column.label)],
      ],
      body: rows.map((row, rowIndex) => [
        String(rowIndex + 1),
        ...form.columns.map((column) => leaveCell(column, row?.[column.key])),
      ]),
    });

    let noteY = doc.lastAutoTable.finalY + 6;
    if (noteY > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage();
      noteY = 14;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(form.note || "", margin, noteY, { maxWidth: pageWidth - margin * 2 });
  });

  return doc;
}

export function exportWagePackPdf(pack, forms) {
  const doc = buildWagePackPdf(pack, forms);
  downloadBlob(doc.output("blob"), `${fileBase(pack, forms)}.pdf`);
}
