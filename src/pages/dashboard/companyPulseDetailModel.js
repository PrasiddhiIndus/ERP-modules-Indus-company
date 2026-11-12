import { inrShort, pct } from "../finance/lib/formatters";

function n(value) {
  return Number(value) || 0;
}

function countLabel(value) {
  return n(value).toLocaleString("en-IN");
}

function attn(label, value, severity = "watch") {
  if (value == null || value === "" || value === 0 || value === "0") return null;
  return { label, value: typeof value === "number" ? countLabel(value) : String(value), severity };
}

function pushAttn(list, item) {
  if (item) list.push(item);
}

/**
 * Build a detail card for any Company Pulse click target.
 * Uses only data already loaded on the main dashboard (no extra fetches).
 */
export function buildPulseDetail(kind, ctx = {}) {
  const {
    modules = {},
    commercialStats = {},
    pl = {},
    billRate = 0,
    collectRate = 0,
    attendance,
    rangeLabel = "",
    view,
    site,
    month,
    health,
    views = [],
    paths = {},
  } = ctx;

  const company = attendance?.company || {};
  const departments = attendance?.departments || [];

  switch (kind) {
    case "people": {
      const attention = [];
      pushAttn(attention, attn("Leave waiting", modules.leavePending, "watch"));
      pushAttn(attention, attn("Absent today", company.absent, "risk"));
      pushAttn(attention, attn("Late today", company.late, "watch"));
      pushAttn(attention, attn("On leave today", company.leave, "info"));
      return {
        id: "people",
        title: "People",
        subtitle: "Active roster and today’s attendance pressure",
        headline: { label: "Active people", value: countLabel(modules.people) },
        metrics: [
          { label: "Present today", value: company.expected ? `${company.present} / ${company.expected}` : "—" },
          { label: "On time", value: countLabel(company.on) },
          { label: "Late", value: countLabel(company.late) },
          { label: "On leave", value: countLabel(company.leave) },
          { label: "Absent", value: countLabel(company.absent) },
          { label: "Leave queue", value: countLabel(modules.leavePending) },
        ],
        attention,
        rows: departments.slice(0, 8).map((row) => ({
          label: row.name,
          value: row.expected ? `${row.pct.toFixed(0)}%` : "—",
          meta: `${row.present || 0} present · ${row.absent || 0} absent · ${row.late || 0} late`,
        })),
        note: departments.length ? "Top departments by today’s attendance." : "Open HR for the full employee register.",
        actions: [
          paths.people ? { label: "Open people", path: paths.people } : null,
          paths.attendance ? { label: "Open attendance", path: paths.attendance } : null,
        ].filter(Boolean),
      };
    }

    case "revenue":
      return {
        id: "revenue",
        title: "Revenue",
        subtitle: rangeLabel || "Selected period",
        headline: { label: "Revenue", value: inrShort(pl.revenue) },
        metrics: [
          { label: "Expenses", value: inrShort(pl.expense) },
          { label: "Net result", value: inrShort(pl.profit) },
          { label: "Margin", value: pl.revenue ? pct(pl.margin) : "—" },
          { label: "Sites reporting", value: countLabel(pl.sitesReporting) },
        ],
        attention: [
          attn("Sites in loss", pl.lossSites, "risk"),
          attn("Thin margin sites", pl.thinSites, "watch"),
        ].filter(Boolean),
        rows: (pl.siteRows || []).slice(0, 8).map((row) => ({
          label: row.name,
          value: inrShort(row.revenue),
          meta: `Profit ${inrShort(row.profit)} · Margin ${pct(row.margin)}`,
        })),
        note: "Revenue by site for this timeline.",
        actions: paths.ledger ? [{ label: "Open site ledger", path: paths.ledger }] : [],
      };

    case "profit":
      return {
        id: "profit",
        title: "Net result",
        subtitle: rangeLabel || "Selected period",
        headline: { label: "Net result", value: inrShort(pl.profit) },
        metrics: [
          { label: "Revenue", value: inrShort(pl.revenue) },
          { label: "Expenses", value: inrShort(pl.expense) },
          { label: "Margin", value: pl.revenue ? pct(pl.margin) : "—" },
          { label: "Sites reporting", value: countLabel(pl.sitesReporting) },
        ],
        attention: [
          attn("Sites in loss", pl.lossSites, "risk"),
          attn("Thin margin sites", pl.thinSites, "watch"),
          n(pl.profit) < 0 ? attn("Period in loss", inrShort(pl.profit), "risk") : null,
        ].filter(Boolean),
        rows: (pl.siteRows || [])
          .slice()
          .sort((a, b) => a.profit - b.profit)
          .slice(0, 8)
          .map((row) => ({
            label: row.name,
            value: inrShort(row.profit),
            meta: `Revenue ${inrShort(row.revenue)} · Margin ${pct(row.margin)}`,
          })),
        note: "Sites sorted with weakest profit first.",
        actions: paths.ledger ? [{ label: "Open site ledger", path: paths.ledger }] : [],
      };

    case "billed":
      return {
        id: "billed",
        title: "Billed",
        subtitle: rangeLabel || "Selected period",
        headline: { label: "Billed", value: inrShort(commercialStats.billed) },
        metrics: [
          { label: "Contract book", value: inrShort(commercialStats.contractBook) },
          { label: "Unbilled", value: inrShort(commercialStats.unbilled) },
          { label: "Collected", value: inrShort(commercialStats.collected) },
          { label: "Outstanding", value: inrShort(commercialStats.outstanding) },
          { label: "Invoices", value: countLabel(commercialStats.invoiceCount) },
          { label: "Book cover", value: `${billRate}%` },
        ],
        attention: [
          attn("Outstanding", commercialStats.outstanding ? inrShort(commercialStats.outstanding) : 0, "risk"),
          billRate < 70 && n(commercialStats.contractBook) > 0 ? attn("Low book cover", `${billRate}%`, "watch") : null,
        ].filter(Boolean),
        note: "Commercial billing against the contract book.",
        actions: paths.receivables ? [{ label: "Open billing", path: paths.receivables }] : [],
      };

    case "outstanding":
      return {
        id: "outstanding",
        title: "Outstanding",
        subtitle: rangeLabel || "Selected period",
        headline: { label: "Outstanding", value: inrShort(commercialStats.outstanding) },
        metrics: [
          { label: "Billed", value: inrShort(commercialStats.billed) },
          { label: "Collected", value: inrShort(commercialStats.collected) },
          { label: "Collection rate", value: `${collectRate}%` },
          { label: "Invoices", value: countLabel(commercialStats.invoiceCount) },
        ],
        attention: [
          attn("Outstanding dues", commercialStats.outstanding ? inrShort(commercialStats.outstanding) : 0, "risk"),
          collectRate < 75 && n(commercialStats.billed) > 0 ? attn("Collection below 75%", `${collectRate}%`, "watch") : null,
        ].filter(Boolean),
        note: "Uncollected billed amount in this timeline.",
        actions: paths.receivables ? [{ label: "Open receivables", path: paths.receivables }] : [],
      };

    case "sites": {
      const lossSites = (pl.siteRows || []).filter((row) => row.profit < 0);
      const thinSites = (pl.siteRows || []).filter((row) => row.profit >= 0 && row.margin < (pl.warnMargin || 8));
      return {
        id: "sites",
        title: "Sites",
        subtitle: `${countLabel(pl.sitesReporting)} reporting · ${countLabel(pl.lossSites)} in loss`,
        headline: { label: "Reporting / loss", value: `${countLabel(pl.sitesReporting)} / ${countLabel(pl.lossSites)}` },
        metrics: [
          { label: "Revenue", value: inrShort(pl.revenue) },
          { label: "Net result", value: inrShort(pl.profit) },
          { label: "Thin margin", value: countLabel(pl.thinSites) },
          { label: "Warn margin", value: `${pl.warnMargin || 8}%` },
        ],
        attention: [
          attn("Sites in loss", lossSites.length, "risk"),
          attn("Thin margin sites", thinSites.length, "watch"),
        ].filter(Boolean),
        rows: [...lossSites, ...thinSites, ...(pl.siteRows || [])]
          .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
          .slice(0, 10)
          .map((row) => ({
            label: row.name,
            value: inrShort(row.profit),
            meta: row.profit < 0 ? "In loss" : row.margin < (pl.warnMargin || 8) ? "Thin margin" : `Margin ${pct(row.margin)}`,
          })),
        note: "Sites that need a look appear first.",
        actions: paths.ledger ? [{ label: "Open site ledger", path: paths.ledger }] : [],
      };
    }

    case "health": {
      const scored = views.filter((item) => item.visible && item.score != null);
      const flagged = views.filter((item) => item.visible && item.attention);
      return {
        id: "health",
        title: "Company health",
        subtitle: "Average score across modules with live figures",
        headline: { label: "Health", value: health == null ? "—" : String(health) },
        metrics: [
          { label: "Scored modules", value: countLabel(scored.length) },
          { label: "Need a look", value: countLabel(flagged.length) },
          { label: "Open modules", value: countLabel(views.filter((item) => item.visible && item.canOpen).length) },
        ],
        attention: flagged.slice(0, 8).map((item) => ({
          label: item.short,
          value: item.score == null ? "Look" : String(item.score),
          severity: item.score != null && item.score < 75 ? "risk" : "watch",
        })),
        rows: scored
          .slice()
          .sort((a, b) => (a.score ?? 999) - (b.score ?? 999))
          .map((item) => ({
            label: item.name,
            value: String(item.score),
            meta: item.attention ? "Needs a look" : "Steady",
          })),
        note: "Lower scores rise to the top.",
        actions: [],
      };
    }

    case "module": {
      if (!view) return null;
      const attention = [];
      if (view.attention) {
        for (const metric of view.metrics || []) {
          const raw = String(metric.value || "").replace(/,/g, "");
          const num = Number(raw);
          if (Number.isFinite(num) && num > 0 && /pending|waiting|leave|risk|complaint|loss|due|absent/i.test(metric.label)) {
            pushAttn(attention, attn(metric.label, metric.value, /loss|absent|risk/i.test(metric.label) ? "risk" : "watch"));
          }
        }
        if (!attention.length) attention.push({ label: "Needs a look", value: view.short, severity: "watch" });
      }
      return {
        id: `module:${view.id}`,
        title: view.name,
        subtitle: view.planned ? "Planned module" : view.attention ? "Needs attention" : "Module snapshot",
        headline: {
          label: view.score == null ? "Status" : "Health",
          value: view.score == null ? (view.planned ? "Soon" : "Live") : String(view.score),
        },
        metrics: (view.metrics || []).map((metric) => ({ label: metric.label, value: metric.value })),
        attention,
        rows: (view.links || []).map((link) => ({
          label: link.label,
          value: "Open",
          meta: link.path,
          path: link.path,
        })),
        note: view.note || (view.canOpen ? "Open the module dashboard for the full register." : "No access on this login."),
        actions: [
          view.canOpen && view.openPath ? { label: `Open ${view.short}`, path: view.openPath } : null,
          ...(view.links || []).slice(0, 3).map((link) => ({ label: link.label, path: link.path })),
        ].filter(Boolean),
      };
    }

    case "attendance":
      return {
        id: "attendance",
        title: "Attendance today",
        subtitle: "Company presence right now",
        headline: {
          label: "Present",
          value: company.expected ? `${company.present} / ${company.expected}` : "—",
        },
        metrics: [
          { label: "On time", value: countLabel(company.on) },
          { label: "Late", value: countLabel(company.late) },
          { label: "On leave", value: countLabel(company.leave) },
          { label: "Absent", value: countLabel(company.absent) },
          { label: "Presence", value: company.expected ? `${(company.pct || 0).toFixed(1)}%` : "—" },
          { label: "Leave queue", value: countLabel(modules.leavePending) },
        ],
        attention: [
          attn("Absent", company.absent, "risk"),
          attn("Late", company.late, "watch"),
          attn("Leave waiting", modules.leavePending, "watch"),
        ].filter(Boolean),
        rows: departments.slice(0, 10).map((row) => ({
          label: row.name,
          value: row.expected ? `${row.pct.toFixed(0)}%` : "—",
          meta: `Present ${row.present || 0} · Absent ${row.absent || 0} · Late ${row.late || 0}`,
        })),
        note: "Department cut of today’s register.",
        actions: [
          paths.attendance ? { label: "Open attendance", path: paths.attendance } : null,
          paths.people ? { label: "Open people", path: paths.people } : null,
        ].filter(Boolean),
      };

    case "billRate":
      return {
        id: "billRate",
        title: "Billed vs book",
        subtitle: "How much of the contract book is invoiced",
        headline: { label: "Book cover", value: `${billRate}%` },
        metrics: [
          { label: "Contract book", value: inrShort(commercialStats.contractBook) },
          { label: "Billed", value: inrShort(commercialStats.billed) },
          { label: "Unbilled", value: inrShort(commercialStats.unbilled) },
          { label: "Outstanding", value: inrShort(commercialStats.outstanding) },
        ],
        attention: [
          billRate < 70 && n(commercialStats.contractBook) > 0 ? attn("Low billing cover", `${billRate}%`, "watch") : null,
          attn("Unbilled", commercialStats.unbilled ? inrShort(commercialStats.unbilled) : 0, "watch"),
        ].filter(Boolean),
        note: "Billing progress against commercial POs.",
        actions: paths.receivables ? [{ label: "Open billing", path: paths.receivables }] : [],
      };

    case "collectRate":
      return {
        id: "collectRate",
        title: "Collection",
        subtitle: "Cash collected against billed invoices",
        headline: { label: "Collected", value: `${collectRate}%` },
        metrics: [
          { label: "Billed", value: inrShort(commercialStats.billed) },
          { label: "Collected", value: inrShort(commercialStats.collected) },
          { label: "Outstanding", value: inrShort(commercialStats.outstanding) },
          { label: "Invoices", value: countLabel(commercialStats.invoiceCount) },
        ],
        attention: [
          collectRate < 75 && n(commercialStats.billed) > 0 ? attn("Collection below 75%", `${collectRate}%`, "risk") : null,
          attn("Outstanding", commercialStats.outstanding ? inrShort(commercialStats.outstanding) : 0, "risk"),
        ].filter(Boolean),
        note: "Focus on outstanding invoices when collection lags.",
        actions: paths.receivables ? [{ label: "Open receivables", path: paths.receivables }] : [],
      };

    case "month": {
      if (!month) return null;
      return {
        id: `month:${month.key || month.name}`,
        title: month.fullName || month.name || "Month",
        subtitle: "Books for this month",
        headline: { label: "Profit", value: inrShort(month.profit) },
        metrics: [
          { label: "Revenue", value: inrShort(month.revenue) },
          { label: "Expenses", value: inrShort(month.expense) },
          { label: "Profit", value: inrShort(month.profit) },
        ],
        attention: [
          n(month.profit) < 0 ? attn("Month in loss", inrShort(month.profit), "risk") : null,
        ].filter(Boolean),
        note: "Open the ledger filtered to this month for site-level lines.",
        actions: paths.ledger
          ? [
              {
                label: "Open this month in ledger",
                path: month.key
                  ? `${paths.ledger}?slFrom=${month.key}&slTo=${month.key}&slMonth=${month.key}`
                  : paths.ledger,
              },
            ]
          : [],
      };
    }

    case "site": {
      if (!site) return null;
      return {
        id: `site:${site.id || site.name}`,
        title: site.name || "Site",
        subtitle: "Site result in the selected timeline",
        headline: { label: "Profit", value: inrShort(site.profit) },
        metrics: [
          { label: "Revenue", value: inrShort(site.revenue) },
          { label: "Expenses", value: inrShort(site.expense) },
          { label: "Margin", value: pct(site.margin) },
        ],
        attention: [
          n(site.profit) < 0 ? attn("Site in loss", inrShort(site.profit), "risk") : null,
          n(site.profit) >= 0 && n(site.margin) < (pl.warnMargin || 8)
            ? attn("Thin margin", pct(site.margin), "watch")
            : null,
        ].filter(Boolean),
        note: "Open the ledger for this site’s full lines.",
        actions: paths.ledger
          ? [
              {
                label: "Open site in ledger",
                path: site.id ? `${paths.ledger}?slSite=${encodeURIComponent(site.id)}` : paths.ledger,
              },
            ]
          : [],
      };
    }

    case "books":
      return {
        id: "books",
        title: "Books",
        subtitle: rangeLabel || "Selected period",
        headline: { label: "Net result", value: inrShort(pl.profit) },
        metrics: [
          { label: "Revenue", value: inrShort(pl.revenue) },
          { label: "Expenses", value: inrShort(pl.expense) },
          { label: "Margin", value: pl.revenue ? pct(pl.margin) : "—" },
          { label: "Sites reporting", value: countLabel(pl.sitesReporting) },
        ],
        attention: [
          attn("Sites in loss", pl.lossSites, "risk"),
          attn("Thin margin sites", pl.thinSites, "watch"),
        ].filter(Boolean),
        rows: (pl.trend || []).slice(-8).map((row) => ({
          label: row.fullName || row.name,
          value: inrShort(row.profit),
          meta: `Rev ${inrShort(row.revenue)} · Exp ${inrShort(row.expense)}`,
        })),
        note: "Monthly profit trail for this timeline.",
        actions: paths.ledger ? [{ label: "Open site ledger", path: paths.ledger }] : [],
      };

    default:
      return null;
  }
}
