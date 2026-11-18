import { describe, expect, it } from "vitest";
import {
  buildUserMgmtSearchOrParts,
  escapeIlikePattern,
  hasActiveUserMgmtFilters,
  DEFAULT_USER_MGMT_FILTERS,
} from "../src/lib/userManagementListApi.js";

describe("userManagementListApi filters", () => {
  it("escapes ilike wildcards in user input", () => {
    expect(escapeIlikePattern("a%b_c")).toBe("a\\%b\\_c");
    expect(escapeIlikePattern("  ada  ")).toBe("ada");
  });

  it("builds search OR parts for email, username, and emp code", () => {
    const parts = buildUserMgmtSearchOrParts("ada", true, ["E1", "E2"]);
    expect(parts).toEqual([
      "email.ilike.%ada%",
      "username.ilike.%ada%",
      "employee_code.ilike.%ada%",
      'employee_code.in.("E1","E2")',
    ]);
  });

  it("omits emp-code clauses when emp code column is unavailable", () => {
    const parts = buildUserMgmtSearchOrParts("ada", false, ["E1"]);
    expect(parts).toEqual(["email.ilike.%ada%", "username.ilike.%ada%"]);
  });

  it("returns no search parts for blank terms", () => {
    expect(buildUserMgmtSearchOrParts("   ", true, ["E1"])).toEqual([]);
  });

  it("detects active filters including combined search + role + team", () => {
    expect(hasActiveUserMgmtFilters(DEFAULT_USER_MGMT_FILTERS)).toBe(false);
    expect(
      hasActiveUserMgmtFilters({
        ...DEFAULT_USER_MGMT_FILTERS,
        search: "ada",
        role: "executive",
        team: "HR",
        linkStatus: "linked",
      })
    ).toBe(true);
    expect(
      hasActiveUserMgmtFilters({
        ...DEFAULT_USER_MGMT_FILTERS,
        linkStatus: "all",
        sort: "created_desc",
      })
    ).toBe(false);
  });
});
