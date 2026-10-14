import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  applyComplianceWorkbookToRows,
  parseComplianceWorkbook,
} from "../src/pages/compliance/payroll/complianceImport.js";
import { applyEpfDerived, calculateEPFChallan, validateEpfRows } from "../src/pages/compliance/payroll/complianceEpf.js";
import { resolveEsicDaysPaid } from "../src/pages/compliance/payroll/complianceEsic.js";

function workbookFile(sheets, name = "upload.xlsx") {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    name,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

describe("Payroll compliance corrections", () => {
  it("keeps ESIC wages when the same workbook also has a PF sheet", async () => {
    const parsed = await parseComplianceWorkbook(
      workbookFile({
        PF: [
          ["Employee Code", "Name", "UAN", "Gross Wages"],
          ["101", "Amit Sharma", "101247934235", 18000],
          ["205", "Bharat Rao", "100000000001", 45000],
        ],
        ESIC: [
          ["Employee Code", "IP Name", "IP Number", "No of days", "Total Monthly Wages"],
          ["101", "Amit Sharma", "1234567890", 22, 17500],
          ["205", "Bharat Rao", "1098765432", 0, 0],
        ],
      })
    );
    const applied = applyComplianceWorkbookToRows({
      epfRows: [
        { id: "e1", employeeMasterId: 1, employeeCode: "101", name: "Amit Sharma", uan: "", grossWages: 18000, epfWages: 15000, age: 30 },
        { id: "e2", employeeMasterId: 2, employeeCode: "205", name: "Bharat Rao", uan: "", grossWages: 45000, epfWages: 15000, age: 30 },
      ],
      esicRows: [
        { id: "s1", employeeMasterId: 1, employeeCode: "101", ipName: "Amit Sharma", ipNumber: "", daysPaid: 26, monthlyWages: 18000 },
        { id: "s2", employeeMasterId: 2, employeeCode: "205", ipName: "Bharat Rao", ipNumber: "", daysPaid: 26, monthlyWages: 0 },
      ],
      parsed,
    });
    const amit = applied.esicRows.find((r) => r.employeeCode === "101");
    const bharat = applied.esicRows.find((r) => r.employeeCode === "205");
    expect(amit.monthlyWages).toBe(17500);
    expect(amit.daysPaid).toBe(22);
    expect(bharat.monthlyWages).toBe(0);
    expect(bharat.daysPaid).toBe(0);
  });

  it("does not replace a code-matched UAN with a similar name", async () => {
    const parsed = await parseComplianceWorkbook(
      workbookFile({
        PF: [
          ["Employee Code", "Name", "UAN", "Gross Wages"],
          ["101", "AMIT KUMAR SHARMA", "101247934235", 18000],
          ["205", "SHARMA AMIT", "555566667777", 12000],
        ],
      })
    );
    const applied = applyComplianceWorkbookToRows({
      epfRows: [
        {
          id: "e1",
          employeeMasterId: 1,
          employeeCode: "101",
          name: "AMIT KUMAR SHARMA",
          uan: "",
          grossWages: 18000,
          epfWages: 15000,
          age: 30,
        },
      ],
      esicRows: [],
      parsed,
    });
    expect(applied.epfRows[0].uan).toBe("101247934235");
  });

  it("forces EPS wages to 0 at age 58 even when an amount is typed", () => {
    const calc = calculateEPFChallan({ epfWages: 15000, age: 60, epsWagesOverride: 15000 });
    expect(calc.epsWages).toBe(0);
    expect(calc.epsContnAmt).toBe(0);
    expect(calc.epfContn).toBe(1800);
    expect(calc.edliWages).toBe(15000);

    const row = applyEpfDerived({
      epfWages: 15000,
      grossWages: 40000,
      age: 60,
      epsWagesManual: true,
      epsWages: 15000,
    });
    expect(row.epsWages).toBe(0);
    expect(row.epsContnAmt).toBe(0);

    const checked = validateEpfRows([
      {
        uan: "100441271101",
        name: "Ravendra",
        grossWages: 40000,
        epfWages: 15000,
        age: 60,
        age58Plus: true,
        epsWagesManual: true,
        epsWages: 15000,
        ncpDays: 0,
      },
    ]);
    expect(checked.ok).toBe(false);
    expect(checked.errors[0].messages.join(" ")).toMatch(/EPS wages must be 0/);
  });

  it("flags EPF wages above gross and NCP days above the month", () => {
    const checked = validateEpfRows([
      {
        uan: "101247934235",
        name: "Amit Sharma",
        grossWages: 18000,
        epfWages: 25000,
        age: 30,
        ncpDays: 45,
      },
    ]);
    const text = checked.errors[0].messages.join(" ");
    expect(text).toMatch(/higher than gross/);
    expect(text).toMatch(/NCP days/);
  });

  it("keeps saved ESIC days and uses attendance only when nothing was filed", () => {
    expect(resolveEsicDaysPaid({ daysPaid: 20, daysPaidFromFiling: true }, 25)).toBe(20);
    expect(resolveEsicDaysPaid({ daysPaid: 0, daysPaidFromFiling: true }, 25)).toBe(0);
    expect(resolveEsicDaysPaid({ daysPaid: 26, daysPaidFromFiling: false }, 22)).toBe(22);
    expect(resolveEsicDaysPaid({ daysPaid: 10 }, null)).toBe(10);
  });
});
