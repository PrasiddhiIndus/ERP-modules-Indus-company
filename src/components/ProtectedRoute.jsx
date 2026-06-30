import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "./PageLoader";
import {
  readCachedAccessToken,
  readCachedSessionUser,
  isCachedAccessTokenExpired,
} from "../lib/authSessionUtils";

/** True when localStorage still holds a valid JWT (direct REST login path). */
function hasValidCachedSession() {
  const token = readCachedAccessToken();
  return Boolean(token && !isCachedAccessTokenExpired());
}

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const cachedUser = hasValidCachedSession() ? readCachedSessionUser() : null;
  const effectiveUser = user || cachedUser;

  if (loading) {
    return <PageLoader fullScreen label="Checking session…" />;
  }

  if (!effectiveUser) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
