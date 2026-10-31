import React from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { OcSignoffAssignmentPanel } from "../../projects/configurationTender/OcSignoffAssignmentPage";
import { MAINTENANCE_OC_DEPARTMENT, mmOcCanConfigure } from "./mmOcDepartment";
import PoAtGlanceShell from "./PoAtGlanceShell";

/** Maintenance → PO At Glance Sign-off Assignment: who signs each M&M box (separate from IEV's assignment). */
export default function MaintenanceSignatureConfig() {
  const { userProfile, accessibleModules } = useAuth();
  return (
    <PoAtGlanceShell>
      <OcSignoffAssignmentPanel
        department={MAINTENANCE_OC_DEPARTMENT}
        canConfigure={mmOcCanConfigure(userProfile, accessibleModules)}
      />
    </PoAtGlanceShell>
  );
}
