import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { KpiTile, PageTaskHeader, StatusChip } from '../adminOperations/components/AdminUi';
import {
  AreaTrendChart,
  BarCompareChart,
  CHART_SERIES,
  ChartPanel,
  DonutChart,
} from '../../components/charts/DashboardCharts';
import {
  LEAD_DIMENSIONS,
  activeFilterEntries,
  bucketLeadsByMonth,
  emptyLeadFilters,
  filterLeads,
  groupLeadsBy,
  summarizeLeads,
  topSlices,
} from './lib/leadInsights';

const MAX_LEADS = 5000;

/** Colour dots + counts under each chart; clicking a row filters the dashboard. */
function BreakdownList({ rows, activeValue, onPick, colorFrom = 0 }) {
  if (!rows.length) {
    return <p className="type-meta text-ink-muted px-1 py-2">Nothing recorded yet.</p>;
  }
  return (
    <ul className="space-y-0.5 max-h-[168px] overflow-y-auto pr-1">
      {rows.map((row, i) => {
        const selected = activeValue === row.name;
        return (
          <li key={row.name}>
            <button
              type="button"
              onClick={() => onPick(row.name)}
              disabled={row.__rest}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                selected ? 'bg-accent-soft' : 'hover:bg-row-hover'
              } ${row.__rest ? 'cursor-default opacity-70' : ''}`}
              title={row.__rest ? 'Smaller values grouped together' : `Show only ${row.name}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: CHART_SERIES[(i + colorFrom) % CHART_SERIES.length] }}
              />
              <span className={`type-table-cell truncate ${selected ? 'text-ink font-medium' : 'text-ink-secondary'}`}>
                {row.name}
              </span>
              <span className="type-num ml-auto tabular-nums text-ink">{row.value}</span>
              <span className="type-meta text-ink-muted w-9 text-right tabular-nums">{row.share}%</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function LeadDashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState(emptyLeadFilters);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const { data, error } = await supabase
        .from('marketing_leads')
        .select(
          'id, company, project, industry, project_state, project_stage, project_type, ownership, location, district, contact_person, sheet_updated_on, created_at'
        )
        .order('sheet_updated_on', { ascending: false, nullsFirst: false })
        .limit(MAX_LEADS);
      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
      const msg = String(error?.message || '');
      setLoadError(
        /relation|does not exist|schema cache/i.test(msg)
          ? 'Lead records are not available yet. Ask support to apply the latest update, then refresh.'
          : 'Could not load leads. Try again.'
      );
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  /** Clicking the same value again clears that filter. */
  const pick = (key) => (value) => {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const clearAll = () => setFilters(emptyLeadFilters());

  const activeFilters = activeFilterEntries(filters);
  const filtered = useMemo(() => filterLeads(leads, filters), [leads, filters]);
  const summary = useMemo(() => summarizeLeads(filtered), [filtered]);
  const totals = useMemo(() => summarizeLeads(leads), [leads]);

  /** Each chart ignores its own filter so users can switch selection inside it. */
  const breakdowns = useMemo(() => {
    const out = {};
    LEAD_DIMENSIONS.forEach((d) => {
      out[d.key] = groupLeadsBy(filterLeads(leads, filters, d.key), d.key);
    });
    return out;
  }, [leads, filters]);

  const trend = useMemo(() => bucketLeadsByMonth(filtered, 12), [filtered]);

  const countFormatter = (v) => `${v} lead${v === 1 ? '' : 's'}`;

  const stageRows = topSlices(breakdowns.project_stage || [], 6);
  const stageTotal = stageRows.reduce((sum, r) => sum + r.value, 0);
  const industryRows = topSlices(breakdowns.industry || [], 8);
  const stateRows = topSlices(breakdowns.project_state || [], 8);
  const typeRows = topSlices(breakdowns.project_type || [], 5);
  const ownershipRows = topSlices(breakdowns.ownership || [], 5);

  const isEmpty = !loading && !loadError && leads.length === 0;

  return (
    <div className="w-full h-screen overflow-y-auto bg-canvas p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <PageTaskHeader
          title="Lead Dashboard"
          subtitle="Where the project leads sit — by industry, state and stage. Click any slice, bar or list row to focus the whole page on it."
        >
          <button
            type="button"
            onClick={loadLeads}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-sm text-ink-secondary hover:border-accent-border disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/marketing/lead-master')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-deep"
          >
            Open Lead Master
            <ArrowRight className="w-4 h-4" />
          </button>
        </PageTaskHeader>

        {loadError ? (
          <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning">
            {loadError}
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-card border border-border bg-surface shadow-card p-10 text-center">
            <p className="type-card-title text-ink">No leads to chart yet</p>
            <p className="type-meta text-ink-muted mt-1.5">
              Upload the lead sheet in Lead Master and this dashboard fills in automatically.
            </p>
            <button
              type="button"
              onClick={() => navigate('/app/marketing/lead-master')}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent-deep"
            >
              Go to Lead Master
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                label="Leads in view"
                value={loading ? '…' : summary.leads}
                sub={activeFilters.length ? `of ${totals.leads} total` : 'All leads'}
              />
              <KpiTile
                label="Companies"
                value={loading ? '…' : summary.companies}
                sub="Distinct organisations"
              />
              <KpiTile
                label="States covered"
                value={loading ? '…' : summary.states}
                sub="Project locations"
              />
              <KpiTile
                label="Industries"
                value={loading ? '…' : summary.industries}
                sub={`${summary.stages} stage${summary.stages === 1 ? '' : 's'} in play`}
              />
            </div>

            {activeFilters.length ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-border bg-accent-soft px-3 py-2">
                <span className="type-meta text-ink-secondary">Focused on:</span>
                {activeFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, [f.key]: null }))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-ink hover:border-accent"
                    title={`Remove ${f.label} filter`}
                  >
                    <span className="text-ink-muted">{f.label}:</span>
                    {f.value}
                    <X className="w-3 h-3" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-auto text-xs font-medium text-accent hover:underline"
                >
                  Clear all
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <ChartPanel
                title="Project stage"
                subtitle="Share of leads at each stage"
                height={190}
                right={
                  filters.project_stage ? (
                    <StatusChip label={filters.project_stage} severity="info" />
                  ) : null
                }
              >
                <DonutChart
                  data={stageRows}
                  height={190}
                  centerLabel="Leads"
                  centerValue={stageTotal}
                  formatter={countFormatter}
                  activeName={filters.project_stage}
                  onSliceClick={(d) => d?.name && !d.__rest && pick('project_stage')(d.name)}
                />
              </ChartPanel>

              <ChartPanel title="Industry" subtitle="Top industries by lead count" height={190}>
                <BarCompareChart
                  data={industryRows}
                  height={190}
                  layout="horizontal"
                  categoryWidth={132}
                  series={[{ key: 'value', name: 'Leads', color: CHART_SERIES[1] }]}
                  xTickFormatter={(v) => String(v)}
                  formatter={countFormatter}
                  activeName={filters.industry}
                  onBarClick={(d) => d?.name && !d.__rest && pick('industry')(d.name)}
                />
              </ChartPanel>

              <ChartPanel title="Project state" subtitle="Where the projects are" height={190}>
                <BarCompareChart
                  data={stateRows}
                  height={190}
                  layout="horizontal"
                  categoryWidth={122}
                  series={[{ key: 'value', name: 'Leads', color: CHART_SERIES[2] }]}
                  xTickFormatter={(v) => String(v)}
                  formatter={countFormatter}
                  activeName={filters.project_state}
                  onBarClick={(d) => d?.name && !d.__rest && pick('project_state')(d.name)}
                />
              </ChartPanel>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-card border border-border bg-surface shadow-card p-3 sm:p-4">
                <p className="type-mono-caption text-ink-muted mb-2">All stages</p>
                <BreakdownList
                  rows={breakdowns.project_stage || []}
                  activeValue={filters.project_stage}
                  onPick={pick('project_stage')}
                />
              </div>
              <div className="rounded-card border border-border bg-surface shadow-card p-3 sm:p-4">
                <p className="type-mono-caption text-ink-muted mb-2">All industries</p>
                <BreakdownList
                  rows={breakdowns.industry || []}
                  activeValue={filters.industry}
                  onPick={pick('industry')}
                  colorFrom={1}
                />
              </div>
              <div className="rounded-card border border-border bg-surface shadow-card p-3 sm:p-4">
                <p className="type-mono-caption text-ink-muted mb-2">All project states</p>
                <BreakdownList
                  rows={breakdowns.project_state || []}
                  activeValue={filters.project_state}
                  onPick={pick('project_state')}
                  colorFrom={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
              <ChartPanel title="Project type" subtitle="New vs expansion" height={170}>
                <div className="flex items-center gap-2 h-full">
                  <div className="w-[46%] min-w-0">
                    <DonutChart
                      data={typeRows}
                      height={166}
                      formatter={countFormatter}
                      activeName={filters.project_type}
                      onSliceClick={(d) => d?.name && !d.__rest && pick('project_type')(d.name)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <BreakdownList
                      rows={typeRows}
                      activeValue={filters.project_type}
                      onPick={pick('project_type')}
                    />
                  </div>
                </div>
              </ChartPanel>

              <ChartPanel title="Ownership" subtitle="Who owns the project" height={170}>
                <div className="flex items-center gap-2 h-full">
                  <div className="w-[46%] min-w-0">
                    <DonutChart
                      data={ownershipRows}
                      height={166}
                      formatter={countFormatter}
                      activeName={filters.ownership}
                      onSliceClick={(d) => d?.name && !d.__rest && pick('ownership')(d.name)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <BreakdownList
                      rows={ownershipRows}
                      activeValue={filters.ownership}
                      onPick={pick('ownership')}
                    />
                  </div>
                </div>
              </ChartPanel>

              <ChartPanel
                title="Lead activity"
                subtitle="Leads by the sheet's Updated On, last 12 months"
                height={170}
                className="xl:col-span-2"
              >
                <AreaTrendChart
                  data={trend}
                  height={170}
                  series={[{ key: 'value', name: 'Leads', color: CHART_SERIES[0] }]}
                  yTickFormatter={(v) => String(v)}
                  formatter={countFormatter}
                />
              </ChartPanel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
