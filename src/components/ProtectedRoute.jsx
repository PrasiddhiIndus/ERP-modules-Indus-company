import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "./PageLoader";
import {
  readCachedAccessToken,
  readCachedSessionUser,
  isCachedAccessTokenExpired,
  hasCachedRefreshToken,
} from "../lib/authSessionUtils";
import { logLoginStage } from "../lib/loginFlow";

/** True when localStorage still holds a usable access JWT. */
function hasValidCachedSession() {
  const token = readCachedAccessToken();
  return Boolean(token && !isCachedAccessTokenExpired());
}

/** Access JWT expired/missing but refresh_token can renew the session. */
function hasRefreshableCachedSession() {
  return hasCachedRefreshToken() && Boolean(readCachedSessionUser()?.id);
}

const ProtectedRoute = ({ children }) => {
  const { user, loading, profileLoading, permissionsReady } = useAuth();
  const location = useLocation();
  const cachedUser =
    hasValidCachedSession() || hasRefreshableCachedSession()
      ? readCachedSessionUser()
      : null;
  const effectiveUser = user || cachedUser;

  if (loading) {
    return <PageLoader fullScreen label="Checking session…" />;
  }

  if (!effectiveUser) {
    if (hasValidCachedSession() || hasRefreshableCachedSession()) {
      logLoginStage("route-guard-wait", {
        path: location.pathname,
        reason: hasValidCachedSession()
          ? "valid-jwt-missing-react-user"
          : "refreshing-expired-jwt",
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
