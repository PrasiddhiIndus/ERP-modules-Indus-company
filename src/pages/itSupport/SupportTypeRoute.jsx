import React from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { normalizeSupportType, supportTypePath } from "./itSupportConstants";

/** Validates /software|/hardware segment. Support type context lives in ItSupportLayout. */
export default function SupportTypeRoute() {
  const { supportType } = useParams();
  if (supportType !== "software" && supportType !== "hardware") {
    return <Navigate to={supportTypePath(normalizeSupportType(supportType))} replace />;
  }
  return <Outlet />;
}
