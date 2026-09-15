import { describe, it, expect } from "vitest";
import {
  getCallingDropdownMasters,
  getCallingMasterFields,
  getCallingMasterFilterEntries,
  getCallingMasterTableColumns,
  getRecruitmentUi,
} from "../src/pages/hr/callingMaster/callingMasterConfig.js";

function fieldKeys(scope) {
  return getCallingMasterFields(scope).flatMap((section) => section.fields.map((field) => field.key));
}

describe("Admin in-house recruitment UI", () => {
  it("keeps HR fire/site calling labels and lists", () => {
    const ui = getRecruitmentUi("hr");
    expect(ui.pageTitle).toBe("Calling Database");
    expect(ui.siteSuitableLabel).toBe("Site Suitable");
    expect(ui.hideSalaryOnDashboard).toBe(false);
    expect(fieldKeys("hr")).toEqual(expect.arrayContaining(["fireCourse", "hmvLmv", "siteSuitable"]));
    expect(getCallingMasterTableColumns("hr").find((col) => col.key === "siteSuitable")?.label).toBe(
      "Site Suitable"
    );
    expect(getCallingDropdownMasters("hr").some((master) => master.key === "fireCourse")).toBe(true);
  });

  it("models Admin recruitment as in-house teams without fire-and-safety fields", () => {
    const ui = getRecruitmentUi("admin");
    expect(ui.pageTitle).toBe("In-house Recruitment");
    expect(ui.siteSuitableLabel).toBe("Teams suitable");
    expect(ui.hideSalaryOnDashboard).toBe(true);
    expect(ui.callingByHelp).toMatch(/Administration/i);

    const keys = fieldKeys("admin");
    expect(keys).toContain("siteSuitable");
    expect(keys).not.toContain("fireCourse");
    expect(keys).not.toContain("yearCompleted");
    expect(keys).not.toContain("hmvLmv");
    expect(keys).not.toContain("drivingLicenseYear");

    expect(getCallingMasterFields("admin").flatMap((section) => section.fields).find((f) => f.key === "siteSuitable")).toMatchObject({
      label: "Teams suitable",
      placeholder: "Select team",
    });
    expect(getCallingMasterTableColumns("admin").find((col) => col.key === "siteSuitable")?.label).toBe(
      "Teams suitable"
    );
    expect(getCallingMasterFilterEntries("admin").map(([key]) => key)).not.toContain("fireCourse");
    expect(getCallingDropdownMasters("admin").some((master) => master.key === "fireCourse")).toBe(false);
    expect(getCallingDropdownMasters("admin").find((master) => master.key === "siteSuitable")?.source).toBe(
      "departments"
    );
  });
});
