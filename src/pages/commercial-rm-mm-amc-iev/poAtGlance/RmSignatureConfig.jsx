import React from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { OcSignoffAssignmentPanel } from "../../projects/configurationTender/OcSignoffAssignmentPage";
import { RM_OC_DEPARTMENT, rmOcCanConfigure } from "./rmOcDepartment";
import RmPoAtGlanceShell from "./RmPoAtGlanceShell";

/** R&M → PO At Glance Sign-off Assignment: who signs each R&M box (separate from IEV, Maintenance and Projects). */
export default function RmSignatureConfig() {
  const { userProfile, accessibleModules } = useAuth();
  return (
    <RmPoAtGlanceShell>
      <OcSignoffAssignmentPanel
        department={RM_OC_DEPARTMENT}
        canConfigure={rmOcCanConfigure(userProfile, accessibleModules)}
      />
    </RmPoAtGlanceShell>
  );
}
