import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  IT_SUPPORT_BASE,
  normalizeSupportType,
  supportTypeLabel,
  supportTypePath,
} from "./itSupportConstants";

const TYPE_STORAGE_KEY = "itSupport.supportType";

const SupportTypeContext = createContext({
  supportType: "software",
  supportTypeLabel: "Software Support",
  basePath: `${IT_SUPPORT_BASE}/software`,
  pathFor: (suffix = "") => supportTypePath("software", suffix),
  isScoped: false,
  setSupportType: () => {},
});

export function readStoredSupportType() {
  try {
    return normalizeSupportType(sessionStorage.getItem(TYPE_STORAGE_KEY));
  } catch {
    return "software";
  }
}

export function storeSupportType(type) {
  try {
    sessionStorage.setItem(TYPE_STORAGE_KEY, normalizeSupportType(type));
  } catch {
    /* ignore */
  }
}

function typeFromPath(pathname) {
  return pathname.match(/\/it-support\/(software|hardware)(?:\/|$)/)?.[1] || null;
}

export function SupportTypeProvider({ children }) {
  const { supportType: paramType } = useParams();
  const { pathname } = useLocation();
  const [supportType, setSupportTypeState] = useState(() => {
    return normalizeSupportType(paramType || typeFromPath(pathname) || readStoredSupportType());
  });

  useEffect(() => {
    const fromPath = normalizeSupportType(paramType || typeFromPath(pathname));
    if (paramType === "software" || paramType === "hardware" || typeFromPath(pathname)) {
      setSupportTypeState(fromPath);
      storeSupportType(fromPath);
    }
  }, [paramType, pathname]);

  const setSupportType = useCallback((next) => {
    const type = normalizeSupportType(next);
    setSupportTypeState(type);
    storeSupportType(type);
  }, []);

  const value = useMemo(() => {
    const isScoped = Boolean(paramType || typeFromPath(pathname));
    return {
      supportType,
      supportTypeLabel: supportTypeLabel(supportType),
      basePath: `${IT_SUPPORT_BASE}/${supportType}`,
      pathFor: (suffix = "") => supportTypePath(supportType, suffix),
      isScoped,
      setSupportType,
    };
  }, [supportType, paramType, pathname, setSupportType]);

  return <SupportTypeContext.Provider value={value}>{children}</SupportTypeContext.Provider>;
}

export function useSupportType() {
  return useContext(SupportTypeContext);
}
