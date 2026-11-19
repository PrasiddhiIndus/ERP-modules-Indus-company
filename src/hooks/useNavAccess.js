import { useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { canSeeNavPath, canSeeSubModule } from "../config/roles";

/**
 * Permission checks for in-page menus, tab bars, dropdowns and dashboard cards.
 * Uses the same rules as the sidebar, so a link is only offered when the user may open it.
 */
export function useNavAccess() {
  const { user, userProfile, accessibleModules, subModulePaths } = useAuth();
  const email = userProfile?.email || user?.email || "";
  const canSeePath = useCallback(
    (path) =>
      canSeeNavPath(path, {
        profile: userProfile,
        accessibleModules,
        subModulePaths,
        userMetadata: { ...(user?.user_metadata || {}), email },
      }),
    [userProfile, accessibleModules, subModulePaths, user?.user_metadata, email]
  );
  const canSeePage = useCallback(
    (pageKey) => canSeeSubModule(userProfile, accessibleModules, pageKey, { ...(user?.user_metadata || {}), email }),
    [userProfile, accessibleModules, user?.user_metadata, email]
  );
  return { canSeePath, canSeePage };
}

export default useNavAccess;
