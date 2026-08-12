import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import {
  getRecruitmentLandingPath,
  hasRecruitmentDashboardAccess,
  normalizeAppPath,
  RECRUITMENT_INDEX_PATH,
} from "../../../config/roles";
import CallingMasterDatabasePage from "./CallingMasterDatabasePage";

function toRelativeTabPath(absolutePath) {
  const normalized = normalizeAppPath(absolutePath);
  if (normalized === RECRUITMENT_INDEX_PATH) return ".";
  return normalized.slice(RECRUITMENT_INDEX_PATH.length + 1);
}

/**
 * Index route for /app/hr/calling-master.
 * Renders Dashboard only when the user has dashboard tab access; otherwise redirects
 * to the first granted tab so partial grants never leak Dashboard content.
 */
export default function CallingMasterEntry() {
  const { userProfile, accessibleModules, user } = useAuth();
  const userMetadata = user?.user_metadata ?? null;

  const hasDashboard = hasRecruitmentDashboardAccess(
    userProfile,
    accessibleModules,
    userMetadata
  );

  if (!hasDashboard) {
    const landing = getRecruitmentLandingPath(userProfile, accessibleModules, userMetadata);
    return <Navigate to={toRelativeTabPath(landing)} replace />;
  }

  return <CallingMasterDatabasePage />;
}
