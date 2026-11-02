import React from "react";
import { Settings, User, Bell, Shield, Database, Palette } from "lucide-react";
import { PageTaskHeader, PageShell, SectionCard, EmptyState } from "../components/erpUi";
import { useTheme } from "../contexts/ThemeContext";

const CATEGORIES = [
  {
    title: "User settings",
    body: "Preferences, profile, and account details.",
    icon: User,
  },
  {
    title: "Notifications",
    body: "Alert preferences for approvals and operational events.",
    icon: Bell,
  },
  {
    title: "Security",
    body: "Password and access controls for your account.",
    icon: Shield,
  },
  {
    title: "Data & backups",
    body: "Retention and backup-related configuration (admin).",
    icon: Database,
  },
  {
    title: "Appearance",
    body: "Theme and density. Use the top-bar moon/sun control for light or dark.",
    icon: Palette,
  },
  {
    title: "System",
    body: "Organization-wide configuration reserved for administrators.",
    icon: Settings,
  },
];

const SettingsPage = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <PageShell className="max-w-6xl mx-auto">
      <PageTaskHeader
        title="Settings"
        subtitle="Account and workspace preferences. Module configuration remains with administrators."
      />

      <SectionCard
        title="Quick controls"
        right={
          <button
            type="button"
            onClick={toggleTheme}
            className="erp-btn-secondary rounded-control px-3 py-1.5 text-xs"
          >
            Theme: {theme === "dark" ? "Dark" : "Light"}
          </button>
        }
      >
        <EmptyState
          icon={Settings}
          title="More settings coming here"
          message="Use User Management for roles and module access. Theme can be toggled anytime from the top bar (moon / sun)."
        />
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className="rounded-card border border-border bg-surface shadow-card p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-accent shrink-0" />
                <h3 className="type-card-title text-ink">{c.title}</h3>
              </div>
              <p className="type-meta text-ink-secondary">{c.body}</p>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
};

export default SettingsPage;
