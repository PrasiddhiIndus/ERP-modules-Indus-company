import React from "react";
import OcCreationTab from "../../projects/oc/OcCreationTab";
import { MAINTENANCE_OC_DEPARTMENT } from "./mmOcDepartment";
import PoAtGlanceShell from "./PoAtGlanceShell";

/** Maintenance → PO At Glance: the IEV PO At Glance workflow on Maintenance records, exported in the M&M format. */
export default function MaintenancePoAtGlance() {
  return (
    <PoAtGlanceShell>
      <OcCreationTab department={MAINTENANCE_OC_DEPARTMENT} />
    </PoAtGlanceShell>
  );
}
