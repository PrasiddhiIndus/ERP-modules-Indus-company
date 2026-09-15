import { createContext, useContext } from "react";
import { getRecruitmentUi } from "./callingMasterConfig";

const RecruitmentUiContext = createContext(getRecruitmentUi("hr"));

export function RecruitmentUiProvider({ scope = "hr", children }) {
  return (
    <RecruitmentUiContext.Provider value={getRecruitmentUi(scope)}>
      {children}
    </RecruitmentUiContext.Provider>
  );
}

export function useRecruitmentUi() {
  return useContext(RecruitmentUiContext);
}
