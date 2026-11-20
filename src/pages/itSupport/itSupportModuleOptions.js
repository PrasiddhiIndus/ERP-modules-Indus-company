import {
  getAuthorisedSidebarNavByModule,
  listAllSidebarNavPagesByModule,
} from "../../config/sidebarNavPages";

/** Extra choice when the issue is not tied to a specific ERP screen. */
export const ERP_MODULE_GENERAL = {
  value: "_general",
  label: "General / not module-specific",
  subModules: [],
};

/**
 * Full sidebar catalog for agent filters.
 * Sub Module options are first-level Indus One sidebar pages (not UM categories).
 */
export function getItSupportModuleOptions() {
  return [
    ERP_MODULE_GENERAL,
    ...listAllSidebarNavPagesByModule().map((m) => ({
      value: m.value,
      label: m.sidebarLabel || m.label,
      subModules: (m.pages || []).map((p) => ({ value: p.value, label: p.label })),
    })),
  ];
}

/**
 * Modules + Sub Module options from the same first-level sidebar catalog Layout shows,
 * filtered with the same visibility gates.
 */
export function getItSupportModuleOptionsForUser(
  userProfile,
  accessibleModules,
  userMetadata = null,
  subModulePaths = null,
  flags = null
) {
  const general = ERP_MODULE_GENERAL;
  if (!userProfile) return [general];

  const modules = getAuthorisedSidebarNavByModule(
    userProfile,
    accessibleModules,
    userMetadata,
    subModulePaths,
    flags
  );

  return [
    general,
    ...modules.map((m) => ({
      value: m.value,
      label: m.label,
      subModules: (m.pages || []).map((p) => ({ value: p.value, label: p.label })),
    })),
  ];
}

export function findModuleOption(moduleKey, options = getItSupportModuleOptions()) {
  return options.find((m) => m.value === moduleKey) || null;
}

export function findSubmoduleOption(moduleKey, submoduleKey, options = getItSupportModuleOptions()) {
  const mod = findModuleOption(moduleKey, options);
  if (!mod) return null;
  return (mod.subModules || []).find((s) => s.value === submoduleKey) || null;
}

/** Short display: "HR Site › Attendance" or "General / not module-specific". */
export function formatErpModulePath(ticket) {
  const mod = ticket?.erp_module_label || ticket?.erp_module_key;
  if (!mod) return "—";
  const sub = ticket?.erp_submodule_label || ticket?.erp_submodule_key;
  return sub ? `${mod} › ${sub}` : mod;
}
