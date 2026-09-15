import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import {
  getRecruitmentLandingPath,
  getRecruitmentScopeFromPath,
  hasRecruitmentDashboardAccess,
  normalizeAppPath,
  ADMIN_RECRUITMENT_INDEX_PATH,
  RECRUITMENT_INDEX_PATH,
} from "../../../config/roles";
import CallingMasterDatabasePage from "./CallingMasterDatabasePage";

function toRelativeTabPath(absolutePath, indexPath) {
  const normalized = normalizeAppPath(absolutePath);
  if (normalized === indexPath) return ".";
  return normalized.slice(indexPath.length + 1);
}

/**
 * Index route for Calling Database (HR or Admin).
 * Renders Dashboard only when the user has dashboard tab access; otherwise redirects
 * to the first granted tab so partial grants never leak Dashboard content.
 */
export default function CallingMasterEntry() {
  const { userProfile, accessibleModules, user } = useAuth();
  const { pathname } = useLocation();
  const userMetadata = user?.user_metadata ?? null;
  const scope = getRecruitmentScopeFromPath(pathname);
  const indexPath = scope === "admin" ? ADMIN_RECRUITMENT_INDEX_PATH : RECRUITMENT_INDEX_PATH;

  const hasDashboard = hasRecruitmentDashboardAccess(
    userProfile,
    accessibleModules,
    userMetadata,
    scope
  );

  if (!hasDashboard) {
    const landing = getRecruitmentLandingPath(userProfile, accessibleModules, userMetadata, scope);
    return <Navigate to={toRelativeTabPath(landing, indexPath)} replace />;
  }

  return <CallingMasterDatabasePage />;
}
