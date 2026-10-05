import { createContext, useContext, useMemo } from "react";
import { getRecruitmentUi } from "./callingMasterConfig";

const DEFAULT_SITE_TYPE_STATE = {
  siteTypeEnabled: false,
  siteTypeFilter: "",
  allowedSiteTypes: [],
  defaultSiteType: "",
};

const RecruitmentUiContext = createContext({ ...getRecruitmentUi("hr"), ...DEFAULT_SITE_TYPE_STATE });

export function RecruitmentUiProvider({ scope = "hr", siteTypeFilter = "", allowedSiteTypes = [], children }) {
  const value = useMemo(() => {
    const siteTypeEnabled = scope === "hr";
    const allowed = siteTypeEnabled ? allowedSiteTypes : [];
    return {
      ...getRecruitmentUi(scope),
      siteTypeEnabled,
      siteTypeFilter: siteTypeEnabled ? siteTypeFilter : "",
      allowedSiteTypes: allowed,
      defaultSiteType: siteTypeEnabled ? siteTypeFilter || (allowed.length === 1 ? allowed[0] : "") : "",
    };
  }, [scope, siteTypeFilter, allowedSiteTypes]);

  return <RecruitmentUiContext.Provider value={value}>{children}</RecruitmentUiContext.Provider>;
}

export function useRecruitmentUi() {
  return useContext(RecruitmentUiContext);
}
