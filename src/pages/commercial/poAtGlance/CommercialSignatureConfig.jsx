import React from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { OcSignoffAssignmentPanel } from "../../projects/configurationTender/OcSignoffAssignmentPage";
import { COMMERCIAL_OC_DEPARTMENT, cmOcCanConfigure } from "./cmOcDepartment";
import CommercialPoAtGlanceShell from "./CommercialPoAtGlanceShell";

/** Commercial → PO At Glance Sign-off Assignment: who signs each Commercial box (separate from IEV, R&M, Maintenance and Projects). */
export default function CommercialSignatureConfig() {
  const { userProfile, accessibleModules } = useAuth();
  return (
    <CommercialPoAtGlanceShell>
      <OcSignoffAssignmentPanel
        department={COMMERCIAL_OC_DEPARTMENT}
        canConfigure={cmOcCanConfigure(userProfile, accessibleModules)}
      />
    </CommercialPoAtGlanceShell>
  );
}
