import React from "react";
import OcCreationTab from "../oc/OcCreationTab";
import { PROJECTS_OC_DEPARTMENT } from "./pjOcDepartment";
import ProjectsPoAtGlanceShell from "./ProjectsPoAtGlanceShell";

/** Projects → PO At Glance: the IEV PO At Glance workflow on Projects records, exported in the Projects format. */
export default function ProjectsPoAtGlance() {
  return (
    <ProjectsPoAtGlanceShell>
      <OcCreationTab department={PROJECTS_OC_DEPARTMENT} />
    </ProjectsPoAtGlanceShell>
  );
}
