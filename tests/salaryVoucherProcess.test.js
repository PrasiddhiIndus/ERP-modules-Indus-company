import { describe, it, expect } from "vitest";
import {
  hasGenerateVoucher,
  readVoucherFull,
  readVoucherAmount,
  prorateVoucherByPresentDays,
  voucherLineSnapFromStructure,
} from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";

describe("Voucher tab helpers", () => {
  it("prorates fixed voucher by present days", () => {
    expect(prorateVoucherByPresentDays(12500, 27, 27)).toBe(12500);
    expect(prorateVoucherByPresentDays(12500, 18, 27)).toBe(8333);
    expect(prorateVoucherByPresentDays(12500, 0, 27)).toBe(0);
  });

  it("salary snap starts unprocessed at 0 payable", () => {
    const snap = voucherLineSnapFromStructure(
      { generate_voucher: true, voucher_amount: 10000 },
      { processed: false, presentDays: 20, workingDays: 27 }
    );
    expect(snap.generate_voucher).toBe(true);
    expect(snap.voucher_full).toBe(10000);
    expect(snap.voucher_amount).toBe(0);
    expect(snap.voucher_processed).toBe(false);
  });

  it("processed snap writes P.Days payable", () => {
    const snap = voucherLineSnapFromStructure(
      { generate_voucher: true, voucher_amount: 10000 },
      { processed: true, presentDays: 20, workingDays: 27 }
    );
    expect(snap.voucher_amount).toBe(7407); // round(10000/27*20)
    expect(snap.voucher_processed).toBe(true);
  });

  it("read helpers keep slip at 0 until processed", () => {
    const line = {
      generate_voucher: true,
      voucher_full: 10000,
      voucher_amount: 0,
      voucher_processed: false,
      present_days: 20,
      pay_month_key: "2026-10",
    };
    expect(hasGenerateVoucher(line)).toBe(true);
    expect(readVoucherFull(line)).toBe(10000);
    expect(readVoucherAmount(line)).toBe(0);

    const after = { ...line, voucher_amount: 7407, voucher_processed: true };
    expect(readVoucherAmount(after)).toBe(7407);
  });
});
