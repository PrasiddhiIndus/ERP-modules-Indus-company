import { useMemo } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { canManagePettyCashMasters, canViewPettyCash } from "./pettyCashPermissions";

export { canManagePettyCashMasters, canViewPettyCash };

/** { canView, canManageMasters } for the signed-in user. See pettyCashPermissions.js. */
export function usePettyCashAccess() {
  const { userProfile, accessibleModules, user } = useAuth();
  return useMemo(() => {
    const meta = { ...(user?.user_metadata || {}), email: userProfile?.email || user?.email };
    return {
      canView: canViewPettyCash(userProfile, accessibleModules, meta),
      canManageMasters: canManagePettyCashMasters(userProfile),
    };
  }, [userProfile, accessibleModules, user]);
}
