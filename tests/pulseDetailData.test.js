import { describe, expect, it } from "vitest";
import { rowsFromDepartments, rowsFromInvoices, rowsFromSites } from "../src/pages/dashboard/pulseDetailData.js";

describe("pulseDetailData mappers", () => {
  it("maps outstanding invoices into readable rows", () => {
    const rows = rowsFromInvoices(
      [
        {
          id: 1,
          taxInvoiceNumber: "INV-1",
          totalAmount: 1000,
          pendingAmount: 400,
          paymentStatus: false,
          clientName: "Acme",
          invoiceDate: "2026-11-01",
        },
        {
          id: 2,
          taxInvoiceNumber: "INV-2",
          totalAmount: 500,
          paymentStatus: true,
          clientName: "Beta",
          invoiceDate: "2026-11-02",
        },
      ],
      { outstandingOnly: true }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("INV-1");
    expect(rows[0].status).toBe("Outstanding");
    expect(rows[0].meta).toContain("Acme");
  });

  it("maps site and department cuts", () => {
    const sites = rowsFromSites(
      [
        { id: "a", name: "Alpha", revenue: 100, profit: 40, margin: 40 },
        { id: "b", name: "Beta", revenue: 80, profit: -10, margin: -12 },
      ],
      { mode: "weakest" }
    );
    expect(sites[0].label).toBe("Beta");
    expect(sites[0].status).toBe("Loss");

    const depts = rowsFromDepartments([
      { name: "Ops", present: 5, expected: 5, late: 0, absent: 0, pct: 100 },
      { name: "HR", present: 2, expected: 4, late: 1, absent: 1, pct: 50 },
    ]);
    expect(depts[0].label).toBe("HR");
    expect(depts[0].status).toBe("Absent");
  });
});
