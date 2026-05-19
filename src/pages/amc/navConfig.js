import {
  LayoutDashboard,
  Users,
  FileText,
  MapPin,
  Cpu,
  Calendar,
  Phone,
  Wrench,
  UserCog,
  ClipboardList,
  Bell,
  BarChart3,
  Settings,
} from "lucide-react";

/** AMC Management navigation — path segments under /app/amc */
export const AMC_NAV = [
  { id: "dashboard", label: "Dashboard", path: "", icon: LayoutDashboard },
  { id: "customers", label: "Customers", path: "customers", icon: Users },
  { id: "contracts", label: "Contracts", path: "contracts", icon: FileText },
  { id: "sites", label: "Covered Sites", path: "sites", icon: MapPin },
  { id: "assets", label: "Covered Assets", path: "assets", icon: Cpu },
  { id: "pm-schedule", label: "PM Schedule", path: "pm-schedule", icon: Calendar },
  { id: "complaints", label: "Complaint Calls", path: "complaints", icon: Phone },
  { id: "visits", label: "Service Visits", path: "visits", icon: Wrench },
  { id: "technicians", label: "Technician Allocation", path: "technicians", icon: UserCog },
  { id: "service-reports", label: "Service Reports", path: "service-reports", icon: ClipboardList },
  { id: "alerts", label: "Alerts & SLA", path: "alerts", icon: Bell },
  { id: "reports", label: "Reports", path: "reports", icon: BarChart3 },
  { id: "settings", label: "Settings", path: "settings", icon: Settings },
];

export const AMC_BASE = "/app/amc";

export function getAmcTabFromPath(pathname) {
  const suffix = pathname.replace(/^\/app\/amc\/?/, "") || "dashboard";
  const segment = suffix.split("/")[0] || "dashboard";
  const found = AMC_NAV.find((n) => (n.path || "dashboard") === (segment || "dashboard"));
  return found?.id || "dashboard";
}

export function amcPath(tabId) {
  const item = AMC_NAV.find((n) => n.id === tabId);
  if (!item || !item.path) return AMC_BASE;
  return `${AMC_BASE}/${item.path}`;
}
