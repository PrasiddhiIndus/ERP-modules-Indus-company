import React from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { OcSignoffAssignmentPanel } from "../configurationTender/OcSignoffAssignmentPage";
import { PROJECTS_OC_DEPARTMENT, pjOcCanConfigure } from "./pjOcDepartment";
import ProjectsPoAtGlanceShell from "./ProjectsPoAtGlanceShell";

/** Projects → PO At Glance Sign-off Assignment: who signs each Projects box (separate from IEV and Maintenance). */
export default function ProjectsSignatureConfig() {
  const { userProfile, accessibleModules } = useAuth();
  return (
    <ProjectsPoAtGlanceShell>
      <OcSignoffAssignmentPanel
        department={PROJECTS_OC_DEPARTMENT}
        canConfigure={pjOcCanConfigure(userProfile, accessibleModules)}
      />
    </ProjectsPoAtGlanceShell>
  );
}
