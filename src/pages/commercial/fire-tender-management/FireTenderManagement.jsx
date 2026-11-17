/**
 * Commercial → Fire Tender Management.
 *
 * Live view over Fleet Management's own tables — no separate vehicle or
 * deployment records:
 *  - operations_fire_tender_vehicle_master (vehicles, read-only here except the
 *    vehicle_status change Fleet itself makes when a deployment starts/ends)
 *  - operations_fire_tender_vehicle_trips   (fire-tender deployments: create,
 *    edit, demobilize — same record shape as Fleet → Vehicle Trips)
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  ExternalLink,
  History,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../lib/toast";
import { fleetQueryErrorMessage } from "../../fireTenderVehicle/fleetLoadUtils";
import { STATUS_TONES } from "../../../theme/tokens";
import {
  PageShell,
  PageTaskHeader,
  SectionCard,
  KpiTile,
  FilterBar,
  TinyInput,
  TinySelect,
  DenseTable,
  Drawer,
  Modal,
  FormField,
  InlineAlert,
  LoadingBlock,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from "../../../components/erpUi";
import {
  HOME_BASE,
  SCOPE_OPTIONS,
  STATUS,
  STATUS_ORDER,
  TRIPS_TABLE,
  VEHICLES_TABLE,
  buildDeploymentPayload,
  buildRoster,
  contractDaysLeft,
  daysBetween,
  expirySeverity,
  fmtDate,
  fmtDuration,
  isFireTenderFleetRow,
  startOfToday,
  stripScope,
} from "./fireTenderModel";
import { confirmDialog } from "../../../lib/dialog";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "register", label: "Fire Tender Register", icon: Truck },
  { key: "deployment", label: "Current Deployment", icon: MapPin },
  { key: "movement", label: "Movement History", icon: History },
  { key: "contracts", label: "Contracts & Schedule", icon: CalendarClock },
];

const SCHEDULE_WINDOW_DAYS = 45;
const EXPIRY_WINDOW_DAYS = 90;
const TABLE_MAX_H = "calc(100dvh - 19rem)";

/* ------------------------------------------------------------------ */
/* Presentational helpers                                               */
/* ------------------------------------------------------------------ */

function Chip({ severity = "neutral", children }) {
  return (
    <span className={`erp-badge inline-flex items-center gap-1 border whitespace-nowrap ${STATUS_TONES[severity] || STATUS_TONES.neutral}`}>
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS["indus-house"];
  return (
    <Chip severity={s.severity}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.bar}`} aria-hidden />
      {s.label}
    </Chip>
  );
}

function Mono({ children, className = "" }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}

function Muted({ children = "—" }) {
  return <span className="text-ink-disabled">{children}</span>;
}

function ExpiryChip({ contract }) {
  if (!contract) return <Muted />;
  if (contract.upcoming) return <Chip severity="info">Starts {fmtDate(contract.start || null)}</Chip>;
  const sev = expirySeverity(contractDaysLeft(contract));
  return sev ? <Chip severity={sev.severity}>{sev.label}</Chip> : <Muted>No end date</Muted>;
}

function ValidityBar({ contract }) {
  if (!contract?.start || !contract?.end) return <Muted />;
  const total = Math.max(1, daysBetween(contract.start, contract.end));
  const pct = Math.max(0, Math.min(100, Math.round((daysBetween(contract.start, startOfToday()) / total) * 100)));
  const left = contractDaysLeft(contract);
  const tone = left <= 30 ? "bg-critical" : left <= 60 ? "bg-warning" : "bg-accent";
  return (
    <div className="flex items-center gap-2 min-w-[120px]" title={`${pct}% of contract period elapsed`}>
      <div className="h-1.5 flex-1 rounded-full bg-surface-sunken overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <Mono className="text-[11px] text-ink-muted w-8 text-right">{pct}%</Mono>
    </div>
  );
}

function HBarList({ rows, total, onSelect }) {
  if (!rows.length) return <p className="text-xs text-ink-muted py-2">No records.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onSelect?.(r.key)} className="w-full text-left group" disabled={!onSelect}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-ink truncate group-hover:text-accent">{r.label}</span>
              <span className="shrink-0 text-ink-muted">
                <Mono className="text-ink-strong font-medium">{r.count}</Mono>
                {total ? <Mono className="ml-1.5">{Math.round((r.count / total) * 100)}%</Mono> : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
              <div className="h-full rounded-full bg-accent/80" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MiniStat({ label, value, mono }) {
  return (
    <div className="rounded-control border border-divider px-3 py-2 min-w-0">
      <p className="type-mono-caption text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-[13px] font-medium text-ink-strong truncate ${mono ? "font-mono tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder, label }) {
  return (
    <div className="relative">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
      <TinyInput type="search" value={value} onChange={onChange} placeholder={placeholder} className="pl-8 w-64" aria-label={label} />
    </div>
  );
}

function groupCount(list, keyFn) {
  const m = new Map();
  for (const v of list) {
    const k = keyFn(v);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count);
}

function kindIcon(kind) {
  return kind === "client" ? Building2 : Warehouse;
}

function RouteStrip({ movements, max = 6 }) {
  if (!movements.length) return <p className="text-xs text-ink-muted">No deployment records in Fleet Management.</p>;
  const items = movements.slice(-max);
  const hidden = movements.length - items.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hidden > 0 ? <span className="text-[11px] text-ink-muted">+{hidden} earlier</span> : null}
      {items.map((m, i) => {
        const Icon = kindIcon(m.kind);
        return (
          <React.Fragment key={m.seq}>
            {i > 0 || hidden > 0 ? <ArrowRight className="w-3 h-3 text-ink-disabled shrink-0" aria-hidden /> : null}
            <span
              className={`inline-flex items-center gap-1 rounded-badge border px-1.5 py-0.5 text-[11px] ${
                m.current ? "border-accent-border bg-accent-soft text-accent font-medium" : "border-border bg-surface-sunken/60 text-ink-secondary"
              }`}
              title={`${m.site || m.location} — ${fmtDate(m.from)} to ${m.to ? fmtDate(m.to) : "present"}`}
            >
              <Icon className="w-3 h-3 shrink-0" aria-hidden />
              {m.location}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MovementTimeline({ movements }) {
  if (!movements.length) return <p className="text-xs text-ink-muted">No deployment records in Fleet Management.</p>;
  const items = [...movements].reverse();
  return (
    <ol className="relative ml-1">
      {items.map((m, i) => {
        const Icon = kindIcon(m.kind);
        return (
          <li key={m.seq} className="relative pl-8 pb-4 last:pb-0">
            {i < items.length - 1 ? <span className="absolute left-[11px] top-6 bottom-0 w-px bg-divider" aria-hidden /> : null}
            <span
              className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${
                m.current ? "border-accent bg-accent text-surface" : "border-border bg-surface text-ink-muted"
              }`}
              aria-hidden
            >
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-ink-strong">{m.location}</p>
              {m.current ? <Chip severity="live">Current</Chip> : null}
              <span className="type-mono-caption text-ink-muted">{m.label}</span>
            </div>
            {m.site || m.driver ? (
              <p className="text-[12px] text-ink-secondary mt-0.5">{[m.site, m.driver ? `Driver: ${m.driver}` : null].filter(Boolean).join(" · ")}</p>
            ) : null}
            <p className="text-[11px] text-ink-muted mt-0.5">
              <Mono>{fmtDate(m.from)}</Mono> → <Mono>{m.to ? fmtDate(m.to) : "Present"}</Mono>
              <span className="mx-1.5">·</span>
              {fmtDuration(m.from, m.to)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ScheduleCell({ v }) {
  const { mobilization, demobilization } = v.schedule;
  if (!mobilization && !demobilization) return <Muted />;
  return (
    <div className="space-y-0.5 text-[12px]">
      {mobilization ? (
        <p>
          <span className="text-ink-muted">Mob:</span> <Mono className="text-ink">{fmtDate(mobilization)}</Mono>
        </p>
      ) : null}
      {demobilization ? (
        <p>
          <span className="text-ink-muted">Demob:</span> <Mono className="text-ink">{fmtDate(demobilization)}</Mono>
        </p>
      ) : null}
    </div>
  );
}

function ScopeCell({ v }) {
  if (!v.fuelType && !v.capacity && !v.scope) return <Muted />;
  return (
    <div className="text-[12px] leading-snug max-w-[240px] whitespace-normal">
      <p>
        <span className="text-ink-muted">Fuel:</span> {v.fuelType || "—"}
        {v.scope ? <span className="text-ink-secondary"> · {v.scope.fuel} scope</span> : null}
      </p>
      <p>
        <span className="text-ink-muted">Media:</span> {v.capacity || "—"}
        {v.scope ? <span className="text-ink-secondary"> · {v.scope.media} scope</span> : null}
      </p>
    </div>
  );
}

function presentStatusText(v) {
  if (v.status === "deployed" || v.status === "scheduled") {
    return [v.current.location !== HOME_BASE ? v.current.location : v.contract?.location, v.current.site || v.contract?.site]
      .filter(Boolean)
      .join(" · ");
  }
  return v.current.location;
}

function RowAction({ v, onAssign }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAssign(v);
      }}
      className="rounded-control border border-border px-2 py-1 text-[11.5px] text-ink-secondary hover:border-accent hover:text-accent transition-colors duration-theme"
    >
      {v.activeTrip ? "Edit" : "Assign"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Derived data                                                         */
/* ------------------------------------------------------------------ */

function useDerived(vehicles) {
  return useMemo(() => {
    const today = startOfToday();
    const byStatus = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
    for (const v of vehicles) byStatus[v.status] += 1;

    const events = [];
    for (const v of vehicles) {
      if (v.schedule.mobilization) {
        events.push({ id: `${v.id}-mob`, type: "Mobilization", date: v.schedule.mobilization, vehicle: v, place: v.contract?.location });
      }
      if (v.schedule.demobilization) {
        events.push({ id: `${v.id}-demob`, type: "Demobilization", date: v.schedule.demobilization, vehicle: v, place: v.contract?.location });
      }
    }
    events.sort((a, b) => a.date - b.date);
    const upcoming = events.filter((e) => {
      const d = daysBetween(today, e.date);
      return d >= 0 && d <= SCHEDULE_WINDOW_DAYS;
    });

    const contracts = vehicles.filter((v) => v.contract).map((v) => ({ ...v.contract, vehicle: v, daysLeft: contractDaysLeft(v.contract) }));
    const expiryAlerts = contracts
      .filter((c) => !c.upcoming && c.daysLeft != null && c.daysLeft <= EXPIRY_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const deployed = vehicles.filter((v) => v.status === "deployed");
    return {
      byStatus,
      events,
      upcoming,
      contracts,
      expiryAlerts,
      deployed,
      byLocation: groupCount(deployed, (v) => v.current.location),
      ownership: groupCount(vehicles, (v) => v.ownership || "Not set in Fleet"),
      withRecord: vehicles.filter((v) => v.activeTrip).length,
    };
  }, [vehicles]);
}

/* ------------------------------------------------------------------ */
/* Sections                                                             */
/* ------------------------------------------------------------------ */

function DashboardView({ vehicles, d, onOpen, goTo }) {
  const total = vehicles.length;
  const offRoad = d.byStatus.maintenance + d.byStatus.breakdown;
  const mobCount = d.upcoming.filter((e) => e.type === "Mobilization").length;
  const critical = d.expiryAlerts.filter((c) => c.daysLeft <= 30).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Total fire tenders" value={<Mono>{total}</Mono>} sub="Fleet Management" onClick={() => goTo("register")} />
        <KpiTile
          label="Currently deployed"
          value={<Mono>{d.byStatus.deployed}</Mono>}
          sub={`${total ? Math.round((d.byStatus.deployed / total) * 100) : 0}% utilisation`}
          onClick={() => goTo("deployment", { status: "deployed" })}
        />
        <KpiTile label="At Indus House" value={<Mono>{d.byStatus["indus-house"]}</Mono>} sub="Available" onClick={() => goTo("register", { status: "indus-house" })} />
        <KpiTile
          label="Maintenance / repair"
          value={<Mono>{offRoad}</Mono>}
          sub={`${d.byStatus.maintenance} maintenance · ${d.byStatus.breakdown} repair`}
          onClick={() => goTo("register", { status: "off-road" })}
        />
        <KpiTile
          label={`Mob / demob · ${SCHEDULE_WINDOW_DAYS}d`}
          value={<Mono>{d.upcoming.length}</Mono>}
          sub={`${mobCount} mob · ${d.upcoming.length - mobCount} demob`}
          onClick={() => goTo("contracts", { window: "schedule" })}
        />
        <KpiTile
          label="Contract expiry alerts"
          value={<Mono>{d.expiryAlerts.length}</Mono>}
          sub={`${critical} within 30d / expired`}
          tone={critical ? "border-critical-border" : undefined}
          onClick={() => goTo("contracts", { window: "90" })}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SectionCard title="Fleet status" className="xl:col-span-2" right={<span className="type-meta text-ink-muted">{total} vehicles</span>}>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label="Fleet status distribution">
            {STATUS_ORDER.filter((k) => d.byStatus[k]).map((k) => (
              <div
                key={k}
                className={`${STATUS[k].bar} h-full border-r-2 border-surface last:border-r-0`}
                style={{ width: `${(d.byStatus[k] / Math.max(total, 1)) * 100}%` }}
                title={`${STATUS[k].label}: ${d.byStatus[k]}`}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {STATUS_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => goTo("register", { status: k })}
                className="text-left rounded-control border border-divider px-2.5 py-1.5 hover:border-accent-border hover:bg-row-hover transition-colors duration-theme"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-ink-muted truncate">
                  <span className={`w-2 h-2 shrink-0 rounded-full ${STATUS[k].bar}`} aria-hidden />
                  {STATUS[k].label}
                </span>
                <Mono className="mt-0.5 block text-base font-semibold text-ink-strong">{d.byStatus[k]}</Mono>
              </button>
            ))}
          </div>
          <p className="type-section-caption text-ink-caption mt-4 mb-2">Deployed by location</p>
          <HBarList rows={d.byLocation.slice(0, 8)} total={d.byStatus.deployed} onSelect={(loc) => goTo("deployment", { location: loc })} />
        </SectionCard>

        <SectionCard title="Ownership">
          <HBarList rows={d.ownership} total={total} onSelect={(o) => goTo("register", { ownership: o })} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Active deployments" value={d.withRecord} mono />
            <MiniStat label="Fleet vehicles" value={total} mono />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title={`Upcoming mobilization / demobilization · ${SCHEDULE_WINDOW_DAYS} days`}>
          {d.upcoming.length === 0 ? (
            <p className="text-xs text-ink-muted">Nothing scheduled in this window.</p>
          ) : (
            <ul className="divide-y divide-divider -my-1.5">
              {d.upcoming.slice(0, 8).map((e) => {
                const inDays = daysBetween(startOfToday(), e.date);
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => onOpen(e.vehicle)} className="w-full flex items-center gap-3 py-2 text-left group">
                      <Mono className="w-24 shrink-0 text-[12px] text-ink">{fmtDate(e.date)}</Mono>
                      <Mono className="w-28 shrink-0 text-[12.5px] font-medium text-ink-strong group-hover:text-accent">{e.vehicle.registrationNumber}</Mono>
                      <Chip severity={e.type === "Mobilization" ? "live" : "info"}>{e.type}</Chip>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{e.place || ""}</span>
                      <span className="shrink-0 text-[11px] text-ink-muted">{inDays === 0 ? "Today" : `in ${inDays}d`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Contract expiry alerts · ${EXPIRY_WINDOW_DAYS} days`}>
          {d.expiryAlerts.length === 0 ? (
            <p className="text-xs text-ink-muted">No contract periods ending in this window.</p>
          ) : (
            <ul className="divide-y divide-divider -my-1.5">
              {d.expiryAlerts.slice(0, 8).map((c) => (
                <li key={c.tripId}>
                  <button type="button" onClick={() => onOpen(c.vehicle)} className="w-full flex items-center gap-3 py-2 text-left group">
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${c.daysLeft <= 30 ? "text-critical" : c.daysLeft <= 60 ? "text-warning" : "text-info"}`}
                      aria-hidden
                    />
                    <Mono className="w-28 shrink-0 text-[12.5px] font-medium text-ink-strong group-hover:text-accent">{c.vehicle.registrationNumber}</Mono>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
                      {c.location} · ends <Mono>{fmtDate(c.end)}</Mono>
                    </span>
                    <ExpiryChip contract={c} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function RegisterView({ vehicles, filters, setFilters, onOpen, onAssign, activeId }) {
  const types = useMemo(() => [...new Set(vehicles.map((v) => v.vehicleType))].sort(), [vehicles]);
  const ownerships = useMemo(() => [...new Set(vehicles.map((v) => v.ownership || "Not set in Fleet"))].sort(), [vehicles]);
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (filters.status === "off-road") {
        if (v.status !== "maintenance" && v.status !== "breakdown") return false;
      } else if (filters.status !== "all" && v.status !== filters.status) return false;
      if (filters.ownership !== "all" && (v.ownership || "Not set in Fleet") !== filters.ownership) return false;
      if (filters.type !== "all" && v.vehicleType !== filters.type) return false;
      if (!q) return true;
      return [v.registrationNumber, v.description, v.makeModel, v.current.location, v.current.site, v.ownerName]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [vehicles, filters]);

  const columns = [
    {
      key: "desc",
      label: "Description of Fire Tender",
      render: (v) => (
        <div className="max-w-[280px] whitespace-normal">
          <p className="text-ink font-medium truncate" title={v.description}>{v.description}</p>
          {v.makeModel ? <p className="text-[11px] text-ink-muted truncate">{v.makeModel}</p> : null}
        </div>
      ),
    },
    { key: "reg", label: "Registration No.", render: (v) => <Mono className="font-medium text-ink-strong">{v.registrationNumber}</Mono> },
    { key: "mfg", label: "Make Year", render: (v) => (v.mfgYear ? <Mono>{v.mfgYear}</Mono> : <Muted />) },
    {
      key: "own",
      label: "Vehicle's Ownership",
      render: (v) =>
        v.ownership ? (
          <div className="max-w-[170px] whitespace-normal">
            <p className="text-ink">{v.ownership}</p>
            {v.ownerName ? <p className="text-[11px] text-ink-muted truncate">{v.ownerName}</p> : null}
          </div>
        ) : (
          <Muted />
        ),
    },
    {
      key: "status",
      label: "Present Deployment Status",
      render: (v) => (
        <div className="max-w-[240px] whitespace-normal space-y-1">
          <StatusBadge status={v.status} />
          <p className="text-[11.5px] text-ink-secondary truncate" title={presentStatusText(v)}>{presentStatusText(v)}</p>
        </div>
      ),
    },
    { key: "sched", label: "Expected Mobilization / Demobilization Schedule", render: (v) => <ScheduleCell v={v} /> },
    { key: "scope", label: "Scope of Fuel / Firefighting Media", render: (v) => <ScopeCell v={v} /> },
    { key: "act", label: "", render: (v) => <RowAction v={v} onAssign={onAssign} /> },
  ];

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={filters.search} onChange={set("search")} placeholder="Search reg. no, description, location…" label="Search fire tenders" />
        <TinySelect value={filters.status} onChange={set("status")} aria-label="Status">
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((k) => (
            <option key={k} value={k}>{STATUS[k].label}</option>
          ))}
          <option value="off-road">Maintenance + repair</option>
        </TinySelect>
        <TinySelect value={filters.type} onChange={set("type")} aria-label="Type">
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </TinySelect>
        <TinySelect value={filters.ownership} onChange={set("ownership")} aria-label="Ownership">
          <option value="all">All ownership</option>
          {ownerships.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </TinySelect>
        <span className="ml-auto self-center type-meta text-ink-muted">
          <Mono className="text-ink-strong">{rows.length}</Mono> of <Mono>{vehicles.length}</Mono>
        </span>
      </FilterBar>
      <DenseTable
        columns={columns}
        rows={rows}
        onRowClick={onOpen}
        showSerialNumber
        serialLabel="Sr. No."
        stickyHeader
        scrollMaxHeight={TABLE_MAX_H}
        density="comfortable"
        activeRowId={activeId}
      />
    </div>
  );
}

function DeploymentView({ vehicles, filters, setFilters, onOpen, onAssign, activeId }) {
  const locations = useMemo(() => groupCount(vehicles, (v) => v.current.location), [vehicles]);
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (filters.location !== "all" && v.current.location !== filters.location) return false;
      if (filters.status !== "all" && v.status !== filters.status) return false;
      if (!q) return true;
      return [v.registrationNumber, v.current.location, v.current.site]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q));
    });
  }, [vehicles, filters]);

  const columns = [
    {
      key: "veh",
      label: "Fleet vehicle",
      render: (v) => (
        <div>
          <Mono className="font-medium text-ink-strong">{v.registrationNumber}</Mono>
          <p className="text-[11px] text-ink-muted truncate max-w-[180px]">
            {v.vehicleType}
            {v.fleetStatus ? ` · ${v.fleetStatus}` : ""}
          </p>
        </div>
      ),
    },
    { key: "status", label: "Status", render: (v) => <StatusBadge status={v.status} /> },
    {
      key: "loc",
      label: "Current deployment location",
      render: (v) => (
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <MapPin className="w-3 h-3 text-ink-muted" />
          {v.current.location}
        </span>
      ),
    },
    { key: "site", label: "Site", render: (v) => v.current.site || <Muted /> },
    { key: "since", label: "Since", render: (v) => (v.current.since ? <Mono>{fmtDate(v.current.since)}</Mono> : <Muted />) },
    { key: "dur", label: "Duration", render: (v) => (v.current.since ? <Mono className="text-ink-secondary">{fmtDuration(v.current.since)}</Mono> : <Muted />) },
    { key: "exp", label: "Contract period", render: (v) => <ExpiryChip contract={v.contract} /> },
    { key: "act", label: "", render: (v) => <RowAction v={v} onAssign={onAssign} /> },
  ];

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchBox value={filters.search} onChange={set("search")} placeholder="Search reg. no, location, site…" label="Search deployments" />
        <TinySelect value={filters.location} onChange={set("location")} aria-label="Location" className="min-w-[200px] max-w-[280px]">
          <option value="all">All locations ({vehicles.length})</option>
          {locations.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label} ({l.count})
            </option>
          ))}
        </TinySelect>
        <TinySelect value={filters.status} onChange={set("status")} aria-label="Status">
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((k) => (
            <option key={k} value={k}>{STATUS[k].label}</option>
          ))}
        </TinySelect>
        <span className="ml-auto self-center type-meta text-ink-muted">
          <Mono className="text-ink-strong">{rows.length}</Mono> vehicles
        </span>
      </FilterBar>
      <DenseTable
        columns={columns}
        rows={rows}
        onRowClick={onOpen}
        showSerialNumber
        serialLabel="Sr. No."
        stickyHeader
        scrollMaxHeight={TABLE_MAX_H}
        density="comfortable"
        activeRowId={activeId}
      />
    </div>
  );
}

function MovementView({ vehicles, selectedId, setSelectedId, onOpen }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vehicles;
    return vehicles.filter((v) => [v.registrationNumber, v.current.location].filter(Boolean).some((x) => x.toLowerCase().includes(s)));
  }, [vehicles, q]);
  const selected = vehicles.find((v) => v.id === selectedId) || list[0] || null;

  const recent = useMemo(() => {
    const today = startOfToday();
    const out = [];
    for (const v of vehicles) {
      for (const m of v.movements) {
        const ago = daysBetween(m.from, today);
        if (ago >= 0 && ago <= 90) out.push({ v, m, ago });
      }
    }
    return out.sort((a, b) => a.ago - b.ago).slice(0, 12);
  }, [vehicles]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <div className="bg-surface rounded-card border border-border/80 shadow-card flex flex-col min-h-0 max-h-[32rem] lg:max-h-[calc(100dvh-16rem)]">
          <div className="p-2.5 border-b border-divider">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <TinyInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find vehicle…" className="pl-8 w-full" aria-label="Find vehicle" />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-divider">
            {list.map((v) => {
              const active = selected?.id === v.id;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`w-full text-left px-3 py-2 border-l-[3px] transition-colors duration-theme ${
                      active ? "border-l-accent bg-row-hover" : "border-l-transparent hover:bg-row-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Mono className={`text-[12.5px] text-ink-strong ${active ? "font-semibold" : "font-medium"}`}>{v.registrationNumber}</Mono>
                      <span className={`w-2 h-2 rounded-full ${STATUS[v.status].bar}`} title={STATUS[v.status].label} />
                    </div>
                    <p className="text-[11px] text-ink-muted truncate mt-0.5">
                      {v.trips.filter((t) => t.trip_status !== "Cancelled").length} deployments · {v.current.location}
                    </p>
                  </button>
                </li>
              );
            })}
            {list.length === 0 ? <li className="px-3 py-6 text-xs text-ink-muted text-center">No match</li> : null}
          </ul>
        </div>

        {selected ? (
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Mono>{selected.registrationNumber}</Mono>
                <StatusBadge status={selected.status} />
              </span>
            }
            right={<SecondaryButton onClick={() => onOpen(selected)}>Vehicle details</SecondaryButton>}
          >
            <p className="text-[12px] text-ink-secondary">{selected.description}</p>
            <div className="mt-3 rounded-control border border-divider bg-surface-sunken/40 px-3 py-2.5">
              <RouteStrip movements={selected.movements} max={8} />
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              <MiniStat label="Current location" value={selected.current.location} />
              <MiniStat label="Since" value={fmtDate(selected.current.since)} mono />
              <MiniStat label="Time at location" value={fmtDuration(selected.current.since)} mono />
              <MiniStat label="Deployment records" value={selected.trips.length} mono />
            </div>
            <p className="type-section-caption text-ink-caption mt-4 mb-2.5">Movement timeline</p>
            <MovementTimeline movements={selected.movements} />
          </SectionCard>
        ) : (
          <EmptyState icon={History} title="No vehicle selected" message="Pick a vehicle to see its movement history." />
        )}
      </div>

      <SectionCard title="Recent movements · last 90 days">
        {recent.length === 0 ? (
          <p className="text-xs text-ink-muted">No movements recorded in this window.</p>
        ) : (
          <ul className="divide-y divide-divider -my-1.5">
            {recent.map(({ v, m, ago }) => (
              <li key={`${v.id}-${m.seq}`}>
                <button type="button" onClick={() => setSelectedId(v.id)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-left group">
                  <Mono className="w-24 shrink-0 text-[11.5px] text-ink-muted">{fmtDate(m.from)}</Mono>
                  <Mono className="w-28 shrink-0 text-[12.5px] font-medium text-ink-strong group-hover:text-accent">{v.registrationNumber}</Mono>
                  <span className="type-mono-caption text-ink-muted w-44 shrink-0 truncate">{m.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{[m.location, m.site].filter(Boolean).join(" · ")}</span>
                  <span className="text-[11px] text-ink-muted">{ago === 0 ? "today" : `${ago}d ago`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ScheduleStrip({ events, onOpen }) {
  const today = startOfToday();
  const span = 90;
  const ticks = [0, 15, 30, 45, 60, 75, 90];
  const inWindow = events.filter((e) => {
    const d = daysBetween(today, e.date);
    return d >= 0 && d <= span;
  });
  if (!inWindow.length) return <p className="text-xs text-ink-muted">No mobilization or demobilization dates in the next {span} days.</p>;
  const label = (t) => new Date(today.getTime() + t * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 mb-1">
          <span />
          <div className="relative h-4">
            {ticks.map((t) => (
              <span
                key={t}
                className={`absolute whitespace-nowrap text-[10px] font-mono text-ink-muted ${t === 0 ? "" : t === span ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: `${(t / span) * 100}%` }}
              >
                {t === 0 ? "Today" : label(t)}
              </span>
            ))}
          </div>
        </div>
        <ul className="space-y-1">
          {inWindow.map((e) => {
            const days = daysBetween(today, e.date);
            const mob = e.type === "Mobilization";
            return (
              <li key={e.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 items-center">
                <button type="button" onClick={() => onOpen(e.vehicle)} className="text-left truncate">
                  <Mono className="text-[12px] text-ink-strong hover:text-accent">{e.vehicle.registrationNumber}</Mono>
                </button>
                <div className="relative h-6 rounded-control bg-surface-sunken/50">
                  {ticks.slice(1, -1).map((t) => (
                    <span key={t} className="absolute top-0 bottom-0 w-px bg-divider" style={{ left: `${(t / span) * 100}%` }} />
                  ))}
                  <button
                    type="button"
                    onClick={() => onOpen(e.vehicle)}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-badge border px-1.5 py-0.5 text-[10.5px] font-medium ${
                      mob ? STATUS_TONES.live : STATUS_TONES.info
                    }`}
                    style={{ left: `clamp(44px, ${(days / span) * 100}%, calc(100% - 44px))` }}
                    title={`${e.type} · ${fmtDate(e.date)}${e.place ? ` · ${e.place}` : ""}`}
                  >
                    {mob ? "Mob" : "Demob"} <Mono>{label(days)}</Mono>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ContractsView({ d, filters, setFilters, onOpen }) {
  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return d.contracts
      .filter((c) => {
        const w = filters.window;
        if (w === "upcoming" && !c.upcoming) return false;
        if (w === "expired" && !(c.daysLeft != null && c.daysLeft < 0)) return false;
        if (["30", "60", "90"].includes(w) && (c.upcoming || c.daysLeft == null || c.daysLeft > Number(w))) return false;
        if (w === "schedule" && !(c.vehicle.schedule.mobilization || c.vehicle.schedule.demobilization)) return false;
        if (!q) return true;
        return [c.location, c.site, c.vehicle.registrationNumber].some((s) => s && s.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.upcoming ? 1 : 0) - (b.upcoming ? 1 : 0) || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  }, [d.contracts, filters]);

  const columns = [
    { key: "reg", label: "Vehicle", render: (c) => <Mono className="font-medium text-ink-strong">{c.vehicle.registrationNumber}</Mono> },
    { key: "loc", label: "Deployment location", render: (c) => <span className="font-medium text-ink">{c.location || "—"}</span> },
    { key: "site", label: "Site", render: (c) => c.site || <Muted /> },
    { key: "start", label: "Contract start", render: (c) => (c.start ? <Mono>{fmtDate(c.start)}</Mono> : <Muted />) },
    { key: "end", label: "Contract end", render: (c) => (c.end ? <Mono>{fmtDate(c.end)}</Mono> : <Muted />) },
    { key: "validity", label: "Period elapsed", render: (c) => (c.upcoming ? <Muted>Not started</Muted> : <ValidityBar contract={c} />) },
    { key: "left", label: "Validity", render: (c) => <ExpiryChip contract={c} /> },
    { key: "mob", label: "Mobilization", render: (c) => <Mono>{fmtDate(c.vehicle.activeTrip?.date_of_mobilisation)}</Mono> },
    { key: "demob", label: "Expected demob.", render: (c) => <Mono>{fmtDate(c.vehicle.schedule.demobilization)}</Mono> },
  ];

  const windows = [
    ["all", "All"],
    ["30", "≤ 30 days"],
    ["60", "≤ 60 days"],
    ["90", "≤ 90 days"],
    ["expired", "Expired"],
    ["upcoming", "Upcoming"],
    ["schedule", "Mob / demob dated"],
  ];

  return (
    <div className="space-y-4">
      <SectionCard title="Mobilization / demobilization schedule · next 90 days">
        <ScheduleStrip events={d.events} onOpen={onOpen} />
      </SectionCard>
      <div className="space-y-3">
        <FilterBar>
          <SearchBox
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search vehicle, location, site…"
            label="Search contracts"
          />
          <TinySelect value={filters.window} onChange={(e) => setFilters((f) => ({ ...f, window: e.target.value }))} aria-label="Validity window">
            {windows.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </TinySelect>
          <span className="ml-auto self-center type-meta text-ink-muted">
            <Mono className="text-ink-strong">{rows.length}</Mono> active deployments
          </span>
        </FilterBar>
        <DenseTable
          columns={columns}
          rows={rows.map((c) => ({ ...c, id: c.tripId }))}
          onRowClick={(c) => onOpen(c.vehicle)}
          showSerialNumber
          serialLabel="Sr. No."
          stickyHeader
          scrollMaxHeight={TABLE_MAX_H}
          density="comfortable"
        />
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 py-1.5 border-b border-divider last:border-b-0">
      <dt className="text-[11.5px] text-ink-muted">{label}</dt>
      <dd className="text-[12.5px] text-ink">{children ?? <Muted />}</dd>
    </div>
  );
}

function VehicleDrawer({ vehicle: v, onClose, onShowMovement, onAssign, onDemobilize, busy }) {
  if (!v) return null;
  const notes = v.activeTrip ? stripScope(v.activeTrip.notes) : "";
  return (
    <Drawer open title={<span className="font-mono">{v.registrationNumber}</span>} onClose={onClose} widthClass="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge status={v.status} />
          <div className="flex items-center gap-2">
            {v.activeTrip ? (
              <SecondaryButton onClick={() => onDemobilize(v)} disabled={busy}>
                Demobilize
              </SecondaryButton>
            ) : null}
            <PrimaryButton onClick={() => onAssign(v)} disabled={busy}>
              {v.activeTrip ? "Edit deployment" : "Assign vehicle"}
            </PrimaryButton>
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-1">
            <p className="type-section-caption text-ink-caption">Vehicle</p>
            <Link to="/app/fire-tender-vehicle-management" className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline">
              Fleet Management <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <dl>
            <DetailRow label="Description">{v.description}</DetailRow>
            <DetailRow label="Make / model">{v.makeModel}</DetailRow>
            <DetailRow label="Make year">{v.mfgYear ? <Mono>{v.mfgYear}</Mono> : null}</DetailRow>
            <DetailRow label="Ownership">{[v.ownership, v.ownerName].filter(Boolean).join(" · ") || null}</DetailRow>
            <DetailRow label="Fleet status">{v.fleetStatus}</DetailRow>
            <DetailRow label="Fuel type">{v.fuelType}</DetailRow>
            <DetailRow label="Pump">{v.pump}</DetailRow>
            <DetailRow label="Assigned driver">{v.assignedDriver}</DetailRow>
            <DetailRow label="Registration valid till">{v.registryValidity ? <Mono>{fmtDate(v.registryValidity)}</Mono> : null}</DetailRow>
            <DetailRow label="Next service due">{v.nextServiceDue ? <Mono>{fmtDate(v.nextServiceDue)}</Mono> : null}</DetailRow>
          </dl>
        </section>

        <section>
          <p className="type-section-caption text-ink-caption mb-1">Current deployment</p>
          <dl>
            <DetailRow label="Location">{v.current.location}</DetailRow>
            <DetailRow label="Site">{v.current.site}</DetailRow>
            <DetailRow label="Since">
              {v.current.since ? (
                <>
                  <Mono>{fmtDate(v.current.since)}</Mono> <span className="text-ink-muted">· {fmtDuration(v.current.since)}</span>
                </>
              ) : null}
            </DetailRow>
            {v.scope ? (
              <DetailRow label="Scope">
                Fuel: {v.scope.fuel} · Media: {v.scope.media}
              </DetailRow>
            ) : null}
            {notes ? <DetailRow label="Notes">{notes}</DetailRow> : null}
          </dl>
          {v.status === "deployed" && !v.current.fromRecord ? (
            <p className="mt-2 text-[11px] text-ink-muted">Fleet shows this vehicle On Duty without a fire-tender deployment record; location is from the vehicle master.</p>
          ) : null}
        </section>

        {v.contract ? (
          <section className="rounded-card border border-border bg-surface-sunken/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-ink-strong">{v.contract.upcoming ? "Upcoming contract period" : "Contract period"}</p>
              <ExpiryChip contract={v.contract} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="type-mono-caption text-ink-muted">Start → end</p>
                <p className="mt-0.5">
                  <Mono>{fmtDate(v.contract.start)}</Mono> → <Mono>{fmtDate(v.contract.end)}</Mono>
                </p>
              </div>
              <div>
                <p className="type-mono-caption text-ink-muted">Mobilization</p>
                <p className="mt-0.5">
                  <Mono>{fmtDate(v.activeTrip?.date_of_mobilisation)}</Mono>
                </p>
              </div>
            </div>
            {!v.contract.upcoming && v.contract.start && v.contract.end ? (
              <div className="mt-3">
                <ValidityBar contract={v.contract} />
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between mb-2.5">
            <p className="type-section-caption text-ink-caption">Movement timeline</p>
            <button type="button" onClick={() => onShowMovement(v)} className="text-[11.5px] text-accent hover:underline">
              Movement History →
            </button>
          </div>
          <MovementTimeline movements={v.movements} />
        </section>
      </div>
    </Drawer>
  );
}

const isoDay = (v) => (v ? String(v).slice(0, 10) : "");

function formFromVehicle(v) {
  const t = v?.activeTrip;
  return {
    tripId: t?.id ?? null,
    fleetId: v ? String(v.fleetId) : "",
    driverName: t?.driver_name || t?.issued_to_name || v?.assignedDriver || "",
    location: t?.deployment_location || "",
    site: t?.site_name || "",
    mobilizationDate: isoDay(t?.date_of_mobilisation),
    contractStart: isoDay(t?.contract_start_date),
    contractEnd: isoDay(t?.contract_end_date),
    fuelScope: v?.scope?.fuel || "",
    mediaScope: v?.scope?.media || "",
    notes: stripScope(t?.notes),
  };
}

/** Create or edit a fire-tender deployment record (Fleet's trips table). */
function AssignVehicleModal({ open, initialVehicle, vehicles, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => formFromVehicle(initialVehicle));
  const [errors, setErrors] = useState({});
  const editing = Boolean(form.tripId);

  useEffect(() => {
    if (!open) return;
    setForm(formFromVehicle(initialVehicle));
    setErrors({});
  }, [open, initialVehicle]);

  const options = useMemo(
    () => vehicles.filter((v) => isFireTenderFleetRow({ vehicle_category: v.fleetCategory, vehicle_type: v.vehicleType }) || v.activeTrip),
    [vehicles]
  );
  const selected = vehicles.find((v) => String(v.fleetId) === form.fleetId) || null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickVehicle = (e) => {
    const v = vehicles.find((x) => String(x.fleetId) === e.target.value) || null;
    setForm(v ? formFromVehicle(v) : { ...formFromVehicle(null), fleetId: e.target.value });
  };

  const submit = () => {
    const errs = {};
    if (!form.fleetId) errs.fleetId = "Select a vehicle";
    if (!form.location.trim()) errs.location = "Required";
    if (!form.site.trim()) errs.site = "Required";
    if (!form.mobilizationDate) errs.mobilizationDate = "Required";
    if (form.contractStart && form.contractEnd && form.contractEnd < form.contractStart) errs.contractEnd = "Must be after start";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({ ...form, driverName: "", location: form.location.trim(), site: form.site.trim() });
  };

  const input = "w-full h-9 border border-border rounded-control px-2.5 text-xs bg-surface text-ink focus:border-accent focus:shadow-focus disabled:bg-surface-sunken";
  return (
    <Modal
      open={open}
      title={editing ? "Edit deployment" : "Assign Vehicle"}
      onClose={saving ? () => {} : onClose}
      widthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <SecondaryButton onClick={onClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Assign vehicle"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-3.5">
        <FormField label="Fleet Management vehicle" required error={errors.fleetId}>
          <select value={form.fleetId} onChange={pickVehicle} className={input} aria-label="Fleet vehicle" disabled={editing}>
            <option value="">Select a registered vehicle…</option>
            {options.map((v) => (
              <option key={v.fleetId} value={String(v.fleetId)}>
                {v.registrationNumber} — {v.vehicleType}
                {v.activeTrip ? ` (deployed: ${v.activeTrip.deployment_location || "active"})` : v.fleetStatus ? ` (${v.fleetStatus})` : ""}
              </option>
            ))}
          </select>
        </FormField>
        {selected ? (
          <div className="rounded-control border border-divider bg-surface-sunken/50 px-3 py-2 text-[12px] text-ink-secondary flex flex-wrap gap-x-4 gap-y-1">
            <span>{selected.description}</span>
            <span>
              <span className="text-ink-muted">Make year:</span> <Mono>{selected.mfgYear ?? "—"}</Mono>
            </span>
            <span>
              <span className="text-ink-muted">Ownership:</span> {selected.ownership || "—"}
            </span>
            <span>
              <span className="text-ink-muted">Fleet status:</span> {selected.fleetStatus || "—"}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Deployment location" required error={errors.location}>
            <input className={input} value={form.location} onChange={set("location")} placeholder="Client / place" />
          </FormField>
          <FormField label="Site name" required error={errors.site}>
            <input className={input} value={form.site} onChange={set("site")} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Date of mobilisation" required error={errors.mobilizationDate} hint="A future date schedules the mobilization">
            <input type="date" className={input} value={form.mobilizationDate} onChange={set("mobilizationDate")} />
          </FormField>
          <FormField label="Contract start">
            <input type="date" className={input} value={form.contractStart} onChange={set("contractStart")} />
          </FormField>
          <FormField label="Contract end (expected demob.)" error={errors.contractEnd}>
            <input type="date" className={input} value={form.contractEnd} onChange={set("contractEnd")} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Scope of fuel">
            <select className={input} value={form.fuelScope} onChange={set("fuelScope")}>
              <option value="">Not specified</option>
              {SCOPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o} scope</option>
              ))}
            </select>
          </FormField>
          <FormField label="Scope of firefighting media">
            <select className={input} value={form.mediaScope} onChange={set("mediaScope")}>
              <option value="">Not specified</option>
              {SCOPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o} scope</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea className={`${input} h-16 py-2`} value={form.notes} onChange={set("notes")} />
        </FormField>

        {!editing && selected?.activeTrip ? (
          <InlineAlert tone="warning">
            {selected.registrationNumber} already has an active deployment at {selected.activeTrip.deployment_location || "a site"}. Assigning creates a second active
            record — use Edit or Demobilize on the existing one instead.
          </InlineAlert>
        ) : null}
        <p className="text-[11px] text-ink-muted">
          Saved as a fire-tender deployment in Fleet Management → Vehicle Trips. A new assignment sets the vehicle On Duty, the same as assigning it in Fleet.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const DEFAULT_REGISTER_FILTERS = { search: "", status: "all", ownership: "all", type: "all" };
const DEFAULT_DEPLOY_FILTERS = { search: "", location: "all", status: "all" };

const TRIP_COLUMNS =
  "id, vehicle_id, assignment_type, trip_status, issued_to_name, driver_name, start_date_time, end_date_time, origin_location, destination_location, deployment_location, site_name, date_of_mobilisation, contract_start_date, contract_end_date, notes, created_at, updated_at";

export default function FireTenderManagement() {
  const [fleetRows, setFleetRows] = useState([]);
  const [tripRows, setTripRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [openVehicleId, setOpenVehicleId] = useState(null);
  const [movementId, setMovementId] = useState(null);
  const [registerFilters, setRegisterFilters] = useState(DEFAULT_REGISTER_FILTERS);
  const [deployFilters, setDeployFilters] = useState(DEFAULT_DEPLOY_FILTERS);
  const [contractFilters, setContractFilters] = useState({ search: "", window: "all" });
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [veh, trips] = await Promise.all([
        supabase
          .from(VEHICLES_TABLE)
          .select("*, operations_fire_tender_vehicle_drivers(full_name, contact_number)")
          .order("registration_number", { ascending: true }),
        supabase
          .from(TRIPS_TABLE)
          .select(TRIP_COLUMNS)
          .or("assignment_type.eq.fire-tender,assignment_type.is.null")
          .order("start_date_time", { ascending: false }),
      ]);
      if (veh.error) throw veh.error;
      if (trips.error) throw trips.error;
      setFleetRows(veh.data || []);
      setTripRows(trips.data || []);
      setLoadedAt(new Date());
    } catch (e) {
      console.error("Fire Tender Management: load failed", e);
      setError(fleetQueryErrorMessage(e) || "Could not load Fleet Management data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vehicles = useMemo(() => buildRoster(fleetRows, tripRows), [fleetRows, tripRows]);
  const d = useDerived(vehicles);
  const openVehicle = vehicles.find((v) => v.id === openVehicleId) || null;

  const openAssign = (v = null) => {
    setAssignTarget(v);
    setAssignOpen(true);
  };

  /** Mirrors Fleet → Vehicle Trips: write the trip, then set vehicle_status. */
  const saveDeployment = async (form) => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired — sign in again.");
      const payload = buildDeploymentPayload(form, user.id);
      if (form.tripId) {
        // Keep the record's owner and status; only deployment fields change.
        const update = { ...payload };
        delete update.user_id;
        delete update.trip_status;
        const { error: e } = await supabase.from(TRIPS_TABLE).update(update).eq("id", form.tripId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from(TRIPS_TABLE).insert([{ ...payload, expense_attachments: null }]);
        if (e) throw e;
        const { error: se } = await supabase.from(VEHICLES_TABLE).update({ vehicle_status: "On Duty" }).eq("id", Number(form.fleetId));
        if (se) toast.warning("Partial success", "Deployment saved, but the vehicle status could not be set to On Duty.");
      }
      const reg = vehicles.find((v) => String(v.fleetId) === String(form.fleetId))?.registrationNumber || "Vehicle";
      toast.success(form.tripId ? "Updated" : "Assigned", form.tripId ? `${reg} deployment updated` : `${reg} assigned to ${form.location}`);
      setAssignOpen(false);
      await load();
      setOpenVehicleId(`fleet-${form.fleetId}`);
    } catch (e) {
      console.error("Fire Tender Management: save failed", e);
      toast.error("Save failed", fleetQueryErrorMessage(e) || String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  /** Mirrors Fleet's "Complete trip": trip → Completed, vehicle → Available. */
  const demobilize = async (v) => {
    if (!v.activeTrip) return;
    const where = v.activeTrip.deployment_location || "its site";
    if (!(await confirmDialog({ title: "Demobilize vehicle", message: `Demobilize ${v.registrationNumber} from ${where}? The deployment will be marked Completed and the vehicle set to Available.`, confirmLabel: "Demobilize", tone: "danger" }))) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.from(TRIPS_TABLE).update({ trip_status: "Completed" }).eq("id", v.activeTrip.id);
      if (e) throw e;
      const { error: se } = await supabase.from(VEHICLES_TABLE).update({ vehicle_status: "Available" }).eq("id", v.fleetId);
      if (se) toast.warning("Partial success", "Deployment completed, but the vehicle status could not be set to Available.");
      toast.success("Demobilized", `${v.registrationNumber} demobilized`);
      await load();
    } catch (e) {
      console.error("Fire Tender Management: demobilize failed", e);
      toast.error("Demobilize failed", fleetQueryErrorMessage(e) || String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const goTo = (nextTab, opts = {}) => {
    if (nextTab === "register") {
      setRegisterFilters({ ...DEFAULT_REGISTER_FILTERS, ...(opts.status ? { status: opts.status } : {}), ...(opts.ownership ? { ownership: opts.ownership } : {}) });
    }
    if (nextTab === "deployment") setDeployFilters({ ...DEFAULT_DEPLOY_FILTERS, location: opts.location || "all", status: opts.status || "all" });
    if (nextTab === "contracts") setContractFilters({ search: "", window: opts.window || "all" });
    setTab(nextTab);
  };

  const showMovement = (v) => {
    setMovementId(v.id);
    setOpenVehicleId(null);
    setTab("movement");
  };

  const openDrawer = (v) => setOpenVehicleId(v.id);

  return (
    <PageShell>
      <PageTaskHeader title="Fire Tender Management" subtitle="Deployment, availability, movements and contract periods of fire tenders — live from Fleet Management.">
        {loadedAt ? (
          <span className="type-meta text-ink-muted hidden sm:inline">
            Updated <Mono>{loadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Mono>
          </span>
        ) : null}
        <SecondaryButton onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </SecondaryButton>
        <PrimaryButton onClick={() => openAssign(null)} disabled={!vehicles.length}>
          <Plus className="w-3.5 h-3.5" />
          Assign Vehicle
        </PrimaryButton>
      </PageTaskHeader>

      {error ? <InlineAlert tone="warning">{error}</InlineAlert> : null}

      <nav className="flex gap-1 border-b border-divider overflow-x-auto overflow-y-hidden [scrollbar-width:none]" aria-label="Fire tender sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] transition-colors duration-theme ${
                active ? "text-ink font-medium" : "text-ink-muted hover:text-ink"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {active ? <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-accent" /> : null}
            </button>
          );
        })}
      </nav>

      {loading && !fleetRows.length ? (
        <LoadingBlock rows={6} />
      ) : !vehicles.length ? (
        <EmptyState
          icon={Truck}
          title="No fire tenders found"
          message="No fire tender vehicles are visible in Fleet Management. Register them under IEV → Fleet Management; viewing them requires Site Operations or Fire Tender access."
        />
      ) : (
        <>
          {tab === "dashboard" ? <DashboardView vehicles={vehicles} d={d} onOpen={openDrawer} goTo={goTo} /> : null}
          {tab === "register" ? (
            <RegisterView vehicles={vehicles} filters={registerFilters} setFilters={setRegisterFilters} onOpen={openDrawer} onAssign={openAssign} activeId={openVehicleId} />
          ) : null}
          {tab === "deployment" ? (
            <DeploymentView vehicles={vehicles} filters={deployFilters} setFilters={setDeployFilters} onOpen={openDrawer} onAssign={openAssign} activeId={openVehicleId} />
          ) : null}
          {tab === "movement" ? <MovementView vehicles={vehicles} selectedId={movementId} setSelectedId={setMovementId} onOpen={openDrawer} /> : null}
          {tab === "contracts" ? <ContractsView d={d} filters={contractFilters} setFilters={setContractFilters} onOpen={openDrawer} /> : null}
        </>
      )}

      <VehicleDrawer
        vehicle={assignOpen ? null : openVehicle}
        onClose={() => setOpenVehicleId(null)}
        onShowMovement={showMovement}
        onAssign={openAssign}
        onDemobilize={demobilize}
        busy={saving}
      />
      <AssignVehicleModal
        open={assignOpen}
        initialVehicle={assignTarget}
        vehicles={vehicles}
        onClose={() => setAssignOpen(false)}
        onSave={saveDeployment}
        saving={saving}
      />
    </PageShell>
  );
}
