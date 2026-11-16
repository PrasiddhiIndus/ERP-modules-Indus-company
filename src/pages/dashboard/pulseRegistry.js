/**
 * Company Pulse auto-discovery.
 *
 * Every NAV_MODULE_TREE entry appears on the main dashboard.
 * Optional providers enrich signals / footprint loads from:
 *   - dashboard/pulseProviders/*.js
 *   - any module folder's pulseProvider.js (via Vite glob)
 *
 * Adding a module to NAV_MODULE_TREE is enough for it to show.
 * Drop a pulseProvider.js beside the module to feed live metrics
 * without editing CompanyPulse.jsx.
 */

import { NAV_MODULE_TREE, MODULE_LANDING_PATHS } from "../../config/roles";
import { builtInProviders } from "./pulseProviders/builtIn";

const SHORT_FALLBACK = {
  hr: "HR",
  compliance: "Compliance",
  admin: "Admin",
  commercialMt: "Manpower",
  commercialRm: "R&M",
  marketing: "Marketing",
  maintenance: "Maint.",
  billing: "Billing",
  operations: "Operations",
  projects: "Projects",
  procurement: "Procurement",
  amc: "AMC",
  finance: "Finance",
  fireTender: "IEV",
  itIs: "IT / IS",
  crmOutreach: "Outreach",
};

function normalizeProvider(raw, source = "file") {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    source,
    meta: {
      short: raw.meta?.short || SHORT_FALLBACK[id] || id,
      revenue: Boolean(raw.meta?.revenue),
      planned: Boolean(raw.meta?.planned),
      order: Number.isFinite(raw.meta?.order) ? raw.meta.order : 999,
      icon: raw.meta?.icon || id,
    },
    linkKeys: Array.isArray(raw.linkKeys) ? raw.linkKeys : [],
    note: typeof raw.note === "string" ? raw.note : "",
    signals: typeof raw.signals === "function" ? raw.signals : null,
    load: typeof raw.load === "function" ? raw.load : null,
    realtimeTables: Array.isArray(raw.realtimeTables) ? raw.realtimeTables : [],
  };
}

function collectFileProviders() {
  const byId = new Map();

  const local = import.meta.glob("./pulseProviders/*.js", { eager: true });
  for (const [path, mod] of Object.entries(local)) {
    if (path.endsWith("/builtIn.js") || path.endsWith("/index.js")) continue;
    const candidate = mod?.default || mod?.provider || null;
    const list = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
    for (const item of list) {
      const provider = normalizeProvider(item, path);
      if (provider) byId.set(provider.id, provider);
    }
  }

  const scattered = import.meta.glob("../**/pulseProvider.js", { eager: true });
  for (const [path, mod] of Object.entries(scattered)) {
    const candidate = mod?.default || mod?.provider || null;
    const list = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
    for (const item of list) {
      const provider = normalizeProvider(item, path);
      if (provider) byId.set(provider.id, provider);
    }
  }

  for (const item of builtInProviders) {
    const provider = normalizeProvider(item, "builtIn");
    if (provider && !byId.has(provider.id)) byId.set(provider.id, provider);
  }

  return byId;
}

let cachedProviders = null;

export function getPulseProviderMap({ refresh = false } = {}) {
  if (!cachedProviders || refresh) cachedProviders = collectFileProviders();
  return cachedProviders;
}

export function getPulseProvider(id) {
  return getPulseProviderMap().get(id) || null;
}

/** Tree ∩ providers — every nav module is discoverable. */
export function discoverPulseCatalog() {
  const providers = getPulseProviderMap();
  return NAV_MODULE_TREE.map((mod, index) => {
    const provider = providers.get(mod.value);
    const subs = (mod.subModules || [])
      .filter((sub) => sub?.label && sub?.pathPrefix)
      .map((sub) => ({
        key: sub.value,
        label: sub.label,
        path: sub.pathPrefix,
      }));
    const meta = provider?.meta || {
      short: SHORT_FALLBACK[mod.value] || mod.label?.split(/[—-]/)[0]?.trim() || mod.value,
      revenue: false,
      planned: subs.length === 0,
      order: 900 + index,
      icon: mod.value,
    };
    return {
      id: mod.value,
      name: mod.label,
      short: meta.short,
      revenue: Boolean(meta.revenue),
      planned: Boolean(meta.planned) || subs.length === 0,
      order: meta.order ?? 900 + index,
      icon: meta.icon || mod.value,
      path: MODULE_LANDING_PATHS[mod.value] || subs[0]?.path || "",
      subs,
      linkKeys: provider?.linkKeys || [],
      note: provider?.note || "",
      provider,
      discovered: !provider,
    };
  }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
}

export function emptyPulseFootprint() {
  return {
    people: 0,
    leavePending: 0,
    marketing: 0,
    maintenance: 0,
    projects: 0,
    manpowerTotal: 0,
    manpowerPending: 0,
    manpowerApproved: 0,
    manpowerDueSoon: 0,
    fireTenderTotal: 0,
    fireTenderPending: 0,
    amcActive: 0,
    amcAtRisk: 0,
    amcComplaints: 0,
    commercialPending: 0,
  };
}

/** Run every provider.load() and merge into one footprint bag. */
export async function loadPulseFootprint(deps = {}) {
  const out = emptyPulseFootprint();
  const providers = [...getPulseProviderMap().values()].filter((p) => p.load);
  const chunks = await Promise.all(
    providers.map(async (provider) => {
      try {
        const slice = await provider.load(deps);
        return slice && typeof slice === "object" ? slice : {};
      } catch (err) {
        console.warn(`[pulseRegistry] load failed for ${provider.id}`, err);
        return {};
      }
    })
  );
  for (const slice of chunks) {
    for (const [key, value] of Object.entries(slice)) {
      if (value == null) continue;
      out[key] = value;
    }
  }
  return out;
}

/** Unique realtime table specs declared by providers. */
export function collectPulseRealtimeTables() {
  const seen = new Set();
  const tables = [];
  for (const provider of getPulseProviderMap().values()) {
    for (const spec of provider.realtimeTables || []) {
      const schema = spec.schema || "public";
      const table = spec.table;
      if (!table) continue;
      const key = `${schema}.${table}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tables.push({ schema, table });
    }
  }
  return tables;
}

export function pulseDiscoverySummary() {
  const catalog = discoverPulseCatalog();
  const withProvider = catalog.filter((m) => m.provider).length;
  return {
    modules: catalog.length,
    withProvider,
    autoDiscovered: catalog.length - withProvider,
    ids: catalog.map((m) => m.id),
  };
}
