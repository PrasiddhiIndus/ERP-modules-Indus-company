import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "./PageLoader";
import {
  readCachedAccessToken,
  readCachedSessionUser,
  isCachedAccessTokenExpired,
} from "../lib/authSessionUtils";
import { logLoginStage } from "../lib/loginFlow";

/** True when localStorage still holds a valid JWT (direct REST login path). */
function hasValidCachedSession() {
  const token = readCachedAccessToken();
  return Boolean(token && !isCachedAccessTokenExpired());
}

const ProtectedRoute = ({ children }) => {
  const { user, loading, profileLoading, permissionsReady } = useAuth();
  const location = useLocation();
  const cachedUser = hasValidCachedSession() ? readCachedSessionUser() : null;
  const effectiveUser = user || cachedUser;

  if (loading) {
    return <PageLoader fullScreen label="Checking session…" />;
  }

  if (!effectiveUser) {
    if (hasValidCachedSession()) {
      logLoginStage("route-guard-wait", {
        path: location.pathname,
        reason: "valid-jwt-missing-react-user",
      });
      return <PageLoader fullScreen label="Restoring session…" />;
    }
    logLoginStage("route-guard-deny", {
      path: location.pathname,
      reason: "no-session",
    });
    return <Navigate to="/" replace state={{ from: location.pathname, reason: "session-required" }} />;
  }

  if (profileLoading || !permissionsReady) {
    logLoginStage("route-guard-wait", {
      path: location.pathname,
      reason: "permissions-loading",
    });
    return <PageLoader fullScreen label="Loading permissions…" />;
  }

  logLoginStage("route-guard-allow", {
    path: location.pathname,
    userId: effectiveUser.id,
  });

  return children;
};

export default ProtectedRoute;
