import React from "react";
import OcCreationTab from "../../projects/oc/OcCreationTab";
import { RM_OC_DEPARTMENT } from "./rmOcDepartment";
import RmPoAtGlanceShell from "./RmPoAtGlanceShell";

/** R&M → PO At Glance: the IEV PO At Glance workflow on R&M records, exported in the R&M format. */
export default function RmPoAtGlance() {
  return (
    <RmPoAtGlanceShell>
      <OcCreationTab department={RM_OC_DEPARTMENT} />
    </RmPoAtGlanceShell>
  );
}
