import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  BarChart3,
  Wallet,
  CheckSquare,
  HandCoins,
  TrendingDown,
  Stethoscope,
  AlertTriangle,
  FileHeart,
  Building2,
  Home,
  CreditCard,
  History,
  MapPin,
  FileSpreadsheet,
} from "lucide-react";

/** Operations module navigation — path segments under /app/operations */
export const OPERATIONS_BASE = "/app/operations";

export const OPERATIONS_NAV = [
  { id: "dashboard", label: "Dashboard", path: "", icon: LayoutDashboard },
  {
    section: "Site Expenses",
    items: [
      { id: "expenses", label: "Expense List", path: "expenses", icon: Receipt },
      { id: "expense-summary", label: "Monthly Summary", path: "expenses/summary", icon: CalendarDays },
      { id: "expense-site-dashboard", label: "Site Dashboard", path: "expenses/site-dashboard", icon: BarChart3 },
      { id: "dahej-expenses", label: "Dahej Expenses", path: "dahej-expenses/register", icon: FileSpreadsheet },
    ],
  },
  {
    section: "Site Advances",
    items: [
      { id: "advances", label: "Advance Requests", path: "advances", icon: Wallet },
      { id: "advance-approval", label: "Approval Workflow", path: "advances/approval", icon: CheckSquare },
      { id: "advance-settlement", label: "Settlement", path: "advances/settlement", icon: HandCoins },
      { id: "advance-outstanding", label: "Outstanding Dashboard", path: "advances/outstanding", icon: TrendingDown },
    ],
  },
  {
    section: "Medical / PME",
    items: [
      { id: "pme-tracker", label: "Employee PME Tracker", path: "medical", icon: Stethoscope },
      { id: "pme-due", label: "Due / Overdue", path: "medical/due", icon: AlertTriangle },
      { id: "medical-centers", label: "Medical Centers", path: "medical/centers", icon: MapPin },
    ],
  },
  {
    section: "Accommodation & Rent",
    items: [
      { id: "properties", label: "Property Listing", path: "accommodation", icon: Building2 },
      { id: "rent-entry", label: "Rent Payment Entry", path: "accommodation/rent-entry", icon: CreditCard },
      { id: "rent-dashboard", label: "Monthly Rent Dashboard", path: "accommodation/dashboard", icon: Home },
      { id: "rent-history", label: "Payment History", path: "accommodation/history", icon: History },
    ],
  },
];

/** Flat list of all navigable pages */
export const OPERATIONS_PAGES = OPERATIONS_NAV.flatMap((entry) =>
  entry.section ? entry.items : [entry]
);

export function operationsNavHref(pathSegment) {
  if (!pathSegment) return "operations";
  return `operations/${pathSegment}`;
}

export function operationsNavIsActive(item, pathname) {
  const normalized = pathname.replace(/\/$/, "");
  if (item.path?.startsWith("dahej-expenses")) {
    return normalized.startsWith("/app/operations/dahej-expenses");
  }
  const target = `/app/${operationsNavHref(item.path ?? "")}`.replace(/\/$/, "");
  return normalized === target;
}

export function getOperationsPageFromPath(pathname) {
  const suffix = pathname.replace(/^\/app\/operations\/?/, "") || "";
  const segment = suffix.split("?")[0];

  if (!segment) return "dashboard";

  const exact = OPERATIONS_PAGES.find((p) => p.path === segment);
  if (exact) return exact.id;

  if (segment.startsWith("medical/") && !["medical/due", "medical/centers"].includes(segment)) {
    return "medical-record";
  }
  if (segment.startsWith("accommodation/") && !["accommodation/rent-entry", "accommodation/dashboard", "accommodation/history"].includes(segment)) {
    return "property-details";
  }
  if (segment.startsWith("dahej-expenses")) {
    return "dahej-expenses";
  }

  return "dashboard";
}

export function operationsPath(pageId, params = {}) {
  if (pageId === "dashboard") return OPERATIONS_BASE;
  if (pageId === "medical-record" && params.id) return `${OPERATIONS_BASE}/medical/${params.id}`;
  if (pageId === "property-details" && params.id) return `${OPERATIONS_BASE}/accommodation/${params.id}`;

  const page = OPERATIONS_PAGES.find((p) => p.id === pageId);
  if (!page?.path) return OPERATIONS_BASE;
  return `${OPERATIONS_BASE}/${page.path}`;
}

export function getBreadcrumbs(pageId, params = {}) {
  const crumbs = [
    { label: "Operations", path: OPERATIONS_BASE },
    { label: "Manpower Operations", path: OPERATIONS_BASE },
  ];
  if (pageId === "dashboard") return [...crumbs, { label: "Dashboard" }];

  const page = OPERATIONS_PAGES.find((p) => p.id === pageId);
  const section = OPERATIONS_NAV.find(
    (n) => n.section && n.items?.some((i) => i.id === pageId)
  );

  if (section) crumbs.push({ label: section.section });
  if (page) crumbs.push({ label: page.label, path: operationsPath(pageId) });

  if (pageId === "medical-record" && params.name) {
    crumbs.push({ label: params.name });
  }
  if (pageId === "property-details" && params.name) {
    crumbs.push({ label: params.name });
  }

  return crumbs;
}
