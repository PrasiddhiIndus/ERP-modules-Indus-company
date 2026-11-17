/**
 * Full ERP activity history — Super Admins only (Internal Utilities).
 * Optimised for large logs: server pagination, debounced text filters,
 * estimated counts, lean list rows, deferred detail fetch, live page-1 updates.
 */
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, ScrollText } from 'lucide-react'
import {
  PageTaskHeader,
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
  KpiTile,
  CollapsibleHelp,
  SecondaryButton,
  EmptyState,
  LoadingBlock,
  InlineAlert,
  PaginationBar,
} from '../../components/erpUi'
import { supabase } from '../../lib/supabase'
import { ROUTE_MODULE_MAP } from '../../lib/activityDescriptors'
import {
  activityBadge,
  activityOutcome,
  actorLabel,
  badgeLabel,
  badgeSeverity,
  changePreviewLines,
  changeRows,
  exactLocation,
  fetchActivityActors,
  formatActivityTime,
  moduleOf,
  narrativeStory,
  operationalImpact,
  recordIdentity,
  recordRefOf,
  summaryOf,
} from '../../lib/activityLogView'

const PAGE_SIZE_OPTIONS = [25, 50]
const TEXT_DEBOUNCE_MS = 350
const DEFAULT_RANGE_DAYS = '7'

/** List payload: keep change preview tiny; full field list loads when a row is opened. */
const LIST_SELECT = [
  'id',
  'created_at',
  'user_id',
  'user_email',
  'action',
  'entity',
  'route',
  'module',
  'record_ref',
  'success',
  'status_code',
  'details',
].join(',')

const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'CREATED', label: 'Created' },
  { value: 'UPDATED', label: 'Updated / changed' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'RAN', label: 'Ran a process' },
]

const OUTCOME_FILTERS = [
  { value: '', label: 'All outcomes' },
  { value: 'success', label: 'Applied' },
  { value: 'failed', label: 'Failed (not saved)' },
  { value: 'denied', label: 'Denied (no permission)' },
]

const RANGE_PRESETS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'Entire history' },
]

function daysAgoIso(days) {
  const d = new Date()
  if (days === 1) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function startOfDayIso(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function endOfDayIso(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T23:59:59.999`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function staticModuleOptions() {
  const set = new Set(ROUTE_MODULE_MAP.map(([, label]) => label))
  return [...set].sort((a, b) => a.localeCompare(b))
}

function escapeFilterValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '')
    .replace(/"/g, '')
}

/** Prefer indexed columns; avoid expensive JSON scans unless needed. */
function applyActivityFilters(query, filters) {
  const {
    sinceIso,
    untilIso,
    moduleFilter,
    actionFilter,
    outcomeFilter,
    whoFilter,
    whereFilter,
    search,
  } = filters

  let q = query
  if (sinceIso) q = q.gte('created_at', sinceIso)
  if (untilIso) q = q.lte('created_at', untilIso)

  // Indexed module column only (fast). Older rows without module may need "All modules".
  if (moduleFilter) q = q.eq('module', moduleFilter)

  if (actionFilter === 'CREATED') q = q.eq('action', 'INSERT')
  else if (actionFilter === 'UPDATED') q = q.eq('action', 'UPDATE')
  else if (actionFilter === 'DELETED') q = q.eq('action', 'DELETE')
  else if (actionFilter === 'RAN') q = q.in('action', ['CALL', 'RPC'])
  else if (actionFilter === 'APPROVED' || actionFilter === 'REJECTED' || actionFilter === 'SUBMITTED') {
    q = q.eq('details->>badge', actionFilter)
  }

  if (outcomeFilter === 'success') q = q.eq('success', true)
  else if (outcomeFilter === 'failed') {
    q = q.eq('success', false).not('status_code', 'in', '(401,403)')
  } else if (outcomeFilter === 'denied') {
    q = q.in('status_code', [401, 403])
  }

  const who = whoFilter.trim()
  if (who) q = q.ilike('user_email', `%${who}%`)

  const where = whereFilter.trim()
  if (where) {
    const w = escapeFilterValue(where)
    q = q.or(`route.ilike.%${w}%,module.ilike.%${w}%`)
  }

  const qText = search.trim()
  if (qText) {
    const s = escapeFilterValue(qText)
    // Keep search on indexed / top-level columns first; summary only as extra.
    q = q.or(
      [
        `user_email.ilike.%${s}%`,
        `record_ref.ilike.%${s}%`,
        `route.ilike.%${s}%`,
        `module.ilike.%${s}%`,
        `entity.ilike.%${s}%`,
        `details->>summary.ilike.%${s}%`,
      ].join(',')
    )
  }

  return q
}

/** Trim bulky field dumps for the list grid; full detail is fetched on open. */
function slimListRow(row) {
  if (!row || typeof row !== 'object') return row
  const details = row.details && typeof row.details === 'object' ? row.details : null
  if (!details) return row
  const changes = Array.isArray(details.changes) ? details.changes.slice(0, 3) : null
  return {
    ...row,
    details: {
      summary: details.summary ?? null,
      badge: details.badge ?? null,
      trigger: details.trigger ?? null,
      entity_label: details.entity_label ?? null,
      screen: details.screen ?? null,
      module: details.module ?? null,
      record_ref: details.record_ref ?? null,
      record_id: details.record_id ?? null,
      outcome: details.outcome ?? null,
      detail: details.detail ?? null,
      old_values_captured: details.old_values_captured,
      rows_affected: details.rows_affected,
      module_source: details.module_source ?? null,
      changes,
      _slim: true,
    },
  }
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

export default function ActivityLogHistoryPage() {
  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [appliedCount, setAppliedCount] = useState(0)
  const [blockedCount, setBlockedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [countsLoading, setCountsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actors, setActors] = useState({})
  const actorsRef = useRef({})
  const [selected, setSelected] = useState(null)
  const [selectedLoading, setSelectedLoading] = useState(false)

  const [rangePreset, setRangePreset] = useState(DEFAULT_RANGE_DAYS)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [whoFilter, setWhoFilter] = useState('')
  const [whereFilter, setWhereFilter] = useState('')
  const [search, setSearch] = useState('')

  const debouncedWho = useDebouncedValue(whoFilter, TEXT_DEBOUNCE_MS)
  const debouncedWhere = useDebouncedValue(whereFilter, TEXT_DEBOUNCE_MS)
  const debouncedSearch = useDebouncedValue(search, TEXT_DEBOUNCE_MS)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [moduleOptions] = useState(() => staticModuleOptions())

  const pageRequestId = useRef(0)
  const countsRequestId = useRef(0)

  const sinceIso = useMemo(() => {
    if (dateFrom) return startOfDayIso(dateFrom)
    if (rangePreset === 'all') return null
    const days = Number(rangePreset) || 7
    return daysAgoIso(days)
  }, [dateFrom, rangePreset])

  const untilIso = useMemo(() => (dateTo ? endOfDayIso(dateTo) : null), [dateTo])

  const filterArgs = useMemo(
    () => ({
      sinceIso,
      untilIso,
      moduleFilter,
      actionFilter,
      outcomeFilter,
      whoFilter: debouncedWho,
      whereFilter: debouncedWhere,
      search: debouncedSearch,
    }),
    [sinceIso, untilIso, moduleFilter, actionFilter, outcomeFilter, debouncedWho, debouncedWhere, debouncedSearch]
  )

  const filterKey = useMemo(() => JSON.stringify(filterArgs), [filterArgs])

  const loadPage = useCallback(async () => {
    const reqId = ++pageRequestId.current
    const hasRows = rows.length > 0
    if (hasRows) setRefreshing(true)
    else setLoading(true)
    setLoadError('')

    try {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      const pageQuery = applyActivityFilters(
        supabase
          .from('erp_activity_log')
          .select(LIST_SELECT, { count: 'estimated' })
          .order('created_at', { ascending: false })
          .range(from, to),
        filterArgs
      )

      const { data, error, count } = await pageQuery
      if (reqId !== pageRequestId.current) return
      if (error) throw error

      startTransition(() => {
        setRows((data || []).map(slimListRow))
        setTotalCount(typeof count === 'number' ? count : 0)
      })
    } catch (e) {
      if (reqId !== pageRequestId.current) return
      setRows([])
      setTotalCount(0)
      const raw = e?.message || String(e || '')
      setLoadError(
        /relation|does not exist|permission denied|PGRST|schema/i.test(raw)
          ? 'Activity history is not available right now. Please try again later.'
          : raw || 'Could not load activity history.'
      )
      if (import.meta.env.DEV) console.error('[Activity history]', e)
    } finally {
      if (reqId === pageRequestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    // rows.length intentionally omitted — only used for soft vs hard loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterArgs, page, pageSize])

  const loadCounts = useCallback(async () => {
    const reqId = ++countsRequestId.current
    setCountsLoading(true)
    try {
      const appliedQuery = applyActivityFilters(
        supabase.from('erp_activity_log').select('id', { count: 'estimated', head: true }).eq('success', true),
        { ...filterArgs, outcomeFilter: '' }
      )
      const blockedQuery = applyActivityFilters(
        supabase.from('erp_activity_log').select('id', { count: 'estimated', head: true }).eq('success', false),
        { ...filterArgs, outcomeFilter: '' }
      )
      const [appliedRes, blockedRes] = await Promise.all([appliedQuery, blockedQuery])
      if (reqId !== countsRequestId.current) return
      setAppliedCount(appliedRes.error ? 0 : appliedRes.count || 0)
      setBlockedCount(blockedRes.error ? 0 : blockedRes.count || 0)
    } catch {
      if (reqId !== countsRequestId.current) return
      setAppliedCount(0)
      setBlockedCount(0)
    } finally {
      if (reqId === countsRequestId.current) setCountsLoading(false)
    }
  }, [filterArgs])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  // Counts only when filters change — not on every page flip
  useEffect(() => {
    void loadCounts()
  }, [filterKey, loadCounts])

  useEffect(() => {
    setPage(1)
  }, [filterKey, pageSize])

  useEffect(() => {
    actorsRef.current = actors
  }, [actors])

  useEffect(() => {
    const missing = [
      ...new Set(rows.map((r) => r?.user_id).filter((id) => id && !(id in actorsRef.current))),
    ]
    if (!missing.length) return undefined
    let cancelled = false
    void fetchActivityActors(missing).then((found) => {
      if (cancelled) return
      setActors((prev) => {
        const next = { ...prev }
        for (const id of missing) next[id] = found[id] || null
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [rows])

  // Live feed on first page when filters are light (feels dynamic without reloading history)
  useEffect(() => {
    if (page !== 1) return undefined
    if (debouncedSearch || debouncedWho || debouncedWhere || moduleFilter || actionFilter) return undefined

    let channel = null
    try {
      channel = supabase
        .channel('erp-activity-history-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'erp_activity_log' },
          (payload) => {
            const r = payload?.new
            if (!r?.id) return
            if (sinceIso && r.created_at < sinceIso) return
            if (untilIso && r.created_at > untilIso) return
            if (outcomeFilter === 'success' && r.success === false) return
            if (outcomeFilter === 'failed' && r.success !== false) return
            if (outcomeFilter === 'denied' && !(r.status_code === 401 || r.status_code === 403)) return

            startTransition(() => {
              setRows((prev) => {
                if (prev.some((x) => x.id === r.id)) return prev
                return [slimListRow(r), ...prev].slice(0, pageSize)
              })
              setTotalCount((n) => n + 1)
              if (r.success === false) setBlockedCount((n) => n + 1)
              else setAppliedCount((n) => n + 1)
            })
          }
        )
        .subscribe()
    } catch {
      /* realtime optional */
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* ignore */
        }
      }
    }
  }, [
    page,
    pageSize,
    sinceIso,
    untilIso,
    outcomeFilter,
    debouncedSearch,
    debouncedWho,
    debouncedWhere,
    moduleFilter,
    actionFilter,
  ])

  const openDetail = useCallback(async (row) => {
    setSelected(slimListRow(row))
    setSelectedLoading(true)
    try {
      const { data, error } = await supabase
        .from('erp_activity_log')
        .select('*')
        .eq('id', row.id)
        .maybeSingle()
      if (error) throw error
      if (data) setSelected(data)
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Activity history] detail fetch', e)
      // Keep slim row so the drawer still shows something
    } finally {
      setSelectedLoading(false)
    }
  }, [])

  const pagePeople = useMemo(() => {
    const people = new Set()
    for (const r of rows) {
      if (r.user_id) people.add(r.user_id)
      else if (r.user_email) people.add(r.user_email)
    }
    return people.size
  }, [rows])

  const textFilterPending =
    whoFilter !== debouncedWho || whereFilter !== debouncedWhere || search !== debouncedSearch

  const columns = useMemo(
    () => [
      {
        key: 'when',
        label: 'When',
        render: (r) => (
          <span className="tabular-nums text-[12px] text-ink whitespace-nowrap">
            {formatActivityTime(r.created_at)}
          </span>
        ),
      },
      {
        key: 'who',
        label: 'Who',
        render: (r) => {
          const { who, email, code } = actorLabel(r, actors)
          return (
            <div className="min-w-[140px] max-w-[200px]">
              <p className="font-medium text-ink-strong truncate" title={email || undefined}>
                {who}
                {code ? <span className="text-ink-muted font-normal"> ({code})</span> : null}
              </p>
              {email ? <p className="text-[11px] text-ink-muted truncate">{email}</p> : null}
            </div>
          )
        },
      },
      {
        key: 'what',
        label: 'What happened (exact)',
        render: (r) => {
          const badge = activityBadge(r)
          const ref = recordRefOf(r)
          const preview = changePreviewLines(r, 3)
          const totalChanges = changeRows(r).length
          const moreHint = r.details?._slim
            ? 'Open for full field list'
            : totalChanges > preview.length
              ? `+${totalChanges - preview.length} more — open for full detail`
              : null
          return (
            <div className="min-w-[280px] max-w-[520px]">
              <div className="flex flex-wrap items-center gap-1 mb-0.5">
                <StatusChip label={badgeLabel(badge)} severity={badgeSeverity(badge)} />
                {activityOutcome(r) !== 'success' ? (
                  <StatusChip
                    label={activityOutcome(r) === 'denied' ? 'Denied' : 'Failed'}
                    severity="critical"
                  />
                ) : null}
                {r.details?.trigger === 'automatic' ? (
                  <StatusChip label="Automatic" severity="warning" />
                ) : null}
              </div>
              <p className="text-[13px] text-ink leading-snug">
                {summaryOf(r)}
                {ref ? <span className="ml-1.5 text-[11px] text-ink-muted">· {ref}</span> : null}
              </p>
              {preview.length ? (
                <ul className="mt-1 space-y-0.5">
                  {preview.map((line, i) => (
                    <li key={i} className="text-[11px] text-ink-muted leading-snug truncate" title={line}>
                      · {line}
                    </li>
                  ))}
                  {moreHint ? <li className="text-[11px] text-accent">{moreHint}</li> : null}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-ink-muted">Open row for full exact detail</p>
              )}
            </div>
          )
        },
      },
      {
        key: 'module',
        label: 'Module',
        render: (r) => (
          <span className="text-[12px] text-ink max-w-[160px] block truncate" title={moduleOf(r) || undefined}>
            {moduleOf(r) || '—'}
          </span>
        ),
      },
      {
        key: 'where',
        label: 'Where (exact screen)',
        render: (r) => {
          const loc = exactLocation(r)
          return (
            <div className="min-w-[140px] max-w-[200px]">
              <p className="text-[12px] text-ink truncate" title={loc.screen || undefined}>
                {loc.screen || '—'}
              </p>
              {loc.pathBreadcrumb ? (
                <p className="text-[10px] text-ink-muted truncate" title={loc.path || undefined}>
                  {loc.pathBreadcrumb}
                </p>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'impact',
        label: 'Operational effect',
        render: (r) => {
          const o = activityOutcome(r)
          return (
            <p
              className={`text-[12px] leading-snug max-w-[220px] ${
                o === 'success' ? 'text-ink-muted' : 'text-rose-800'
              }`}
            >
              {operationalImpact(r)}
            </p>
          )
        },
      },
    ],
    [actors]
  )

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Activity history"
        subtitle="Internal Utilities · loads one page at a time from the full database history — Super Admins only."
      >
        <SecondaryButton
          type="button"
          onClick={() => {
            void loadPage()
            void loadCounts()
          }}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </SecondaryButton>
      </PageTaskHeader>

      <CollapsibleHelp label="How this page stays fast">
        <ul className="list-disc pl-4 space-y-1 text-[12px] text-ink-muted">
          <li>Only the current page is fetched from the database — never the whole log.</li>
          <li>Text filters wait briefly while you type; totals are approximate for speed on large ranges.</li>
          <li>Full field-level detail loads when you open a row. New events appear live on page 1.</li>
          <li>Prefer a shorter date range (24h / 7 days) for the snappiest results.</li>
        </ul>
      </CollapsibleHelp>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Matching events"
          value={totalCount}
          sub={countsLoading || refreshing ? 'Updating…' : 'Approx. · paginated'}
        />
        <KpiTile label="Applied" value={appliedCount} sub={countsLoading ? 'Updating…' : 'Approx.'} />
        <KpiTile label="Blocked / failed" value={blockedCount} sub={countsLoading ? 'Updating…' : 'Approx.'} />
        <KpiTile label="People on this page" value={pagePeople} />
      </div>

      <SectionCard title="Filters">
        <FilterBar>
          <TinySelect
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value)}
            aria-label="Time range"
          >
            {RANGE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </TinySelect>
          <TinyInput
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              if (e.target.value) setRangePreset('all')
            }}
            aria-label="From date"
            title="From date"
          />
          <TinyInput
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              if (e.target.value) setRangePreset('all')
            }}
            aria-label="To date"
            title="To date"
          />
          <TinySelect
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Module"
          >
            <option value="">All modules</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </TinySelect>
          <TinySelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Action"
          >
            {ACTION_FILTERS.map((a) => (
              <option key={a.value || 'all'} value={a.value}>
                {a.label}
              </option>
            ))}
          </TinySelect>
          <TinySelect
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            aria-label="Outcome"
          >
            {OUTCOME_FILTERS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </TinySelect>
          <TinyInput
            placeholder="Who (email)"
            value={whoFilter}
            onChange={(e) => setWhoFilter(e.target.value)}
            aria-label="Who"
          />
          <TinyInput
            placeholder="Where (screen path)"
            value={whereFilter}
            onChange={(e) => setWhereFilter(e.target.value)}
            aria-label="Where"
          />
          <TinyInput
            placeholder="Search what happened…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
            className="min-w-[180px]"
          />
        </FilterBar>
        {textFilterPending ? (
          <p className="mt-2 text-[11px] text-ink-muted">Updating results as you type…</p>
        ) : null}
      </SectionCard>

      {loadError ? <InlineAlert tone="error">{loadError}</InlineAlert> : null}

      <SectionCard
        title="History"
        right={
          <span className="text-[11px] text-ink-muted tabular-nums">
            {refreshing ? 'Refreshing…' : `${totalCount} event${totalCount === 1 ? '' : 's'}`}
          </span>
        }
      >
        {loading && !rows.length ? <LoadingBlock /> : null}
        {!loading && !rows.length && !loadError ? (
          <EmptyState
            icon={ScrollText}
            title="No activity matched"
            message="Try widening the date range or clearing filters."
          />
        ) : null}
        {rows.length ? (
          <div className={refreshing ? 'opacity-70 transition-opacity' : undefined}>
            <DenseTable columns={columns} rows={rows} onRowClick={(r) => void openDetail(r)} density="compact" />
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={(p) => startTransition(() => setPage(p))}
              onPageSizeChange={(n) => startTransition(() => setPageSize(n))}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </div>
        ) : null}
      </SectionCard>

      <Drawer
        open={Boolean(selected)}
        title="Exact activity detail"
        onClose={() => setSelected(null)}
        widthClass="max-w-xl"
      >
        {selected ? (
          <>
            {selectedLoading ? (
              <p className="text-[12px] text-ink-muted mb-3">Loading full field detail…</p>
            ) : null}
            <ActivityDetailBody row={selected} actors={actors} />
          </>
        ) : null}
      </Drawer>
    </div>
  )
}

function DetailLabel({ children }) {
  return <p className="text-[11px] uppercase tracking-wide text-ink-muted mb-0.5">{children}</p>
}

function ActivityDetailBody({ row, actors }) {
  const { who, email, code } = actorLabel(row, actors)
  const badge = activityBadge(row)
  const fieldRows = changeRows(row)
  const outcome = activityOutcome(row)
  const loc = exactLocation(row)
  const identity = recordIdentity(row)
  const story = narrativeStory(row, actors)
  const detailFallback = String(row?.details?.detail || '').trim()

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <StatusChip label={badgeLabel(badge)} severity={badgeSeverity(badge)} />
        {outcome !== 'success' ? (
          <StatusChip label={outcome === 'denied' ? 'Denied' : 'Failed'} severity="critical" />
        ) : (
          <StatusChip label="Applied" severity="info" />
        )}
        {row.details?.trigger === 'automatic' ? <StatusChip label="Automatic" severity="warning" /> : null}
        {fieldRows.length ? (
          <StatusChip label={`${fieldRows.length} field${fieldRows.length === 1 ? '' : 's'}`} severity="neutral" />
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-surface-sunken/50 px-3 py-2.5">
        <DetailLabel>Full story</DetailLabel>
        <p className="text-ink leading-relaxed">{story}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <DetailLabel>When</DetailLabel>
          <p className="text-ink-strong tabular-nums">{formatActivityTime(row.created_at)}</p>
        </div>
        <div>
          <DetailLabel>Who</DetailLabel>
          <p className="text-ink-strong">
            {who}
            {code ? ` (${code})` : ''}
          </p>
          {email ? <p className="text-[12px] text-ink-muted break-all">{email}</p> : null}
        </div>
      </div>

      <div>
        <DetailLabel>What happened</DetailLabel>
        <p className="text-ink leading-snug">{summaryOf(row)}</p>
      </div>

      <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
        <DetailLabel>Where exactly</DetailLabel>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <p className="text-[11px] text-ink-muted">Module</p>
            <p className="text-ink">{loc.module || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-muted">Screen</p>
            <p className="text-ink">{loc.screen || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-ink-muted">Page path</p>
            <p className="text-ink break-all">{loc.pathBreadcrumb || loc.path || '—'}</p>
            {loc.path && loc.pathBreadcrumb !== loc.path ? (
              <p className="text-[11px] text-ink-muted mt-0.5 break-all">{loc.path}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
        <DetailLabel>Record affected</DetailLabel>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <p className="text-[11px] text-ink-muted">Type</p>
            <p className="text-ink">{identity.type || '—'}</p>
          </div>
          {identity.ref ? (
            <div>
              <p className="text-[11px] text-ink-muted">Business reference</p>
              <p className="text-ink-strong">{identity.ref}</p>
            </div>
          ) : null}
          {identity.id ? (
            <div>
              <p className="text-[11px] text-ink-muted">Record ID</p>
              <p className="text-[12px] text-ink break-all">{identity.id}</p>
            </div>
          ) : null}
          {row.details?.rows_affected != null ? (
            <div>
              <p className="text-[11px] text-ink-muted">Rows affected</p>
              <p className="text-ink">{row.details.rows_affected}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <DetailLabel>Operational effect</DetailLabel>
        <p className={outcome === 'success' ? 'text-ink' : 'text-rose-800'}>{operationalImpact(row)}</p>
      </div>

      {fieldRows.length ? (
        <div>
          <DetailLabel>Exact fields written ({fieldRows.length})</DetailLabel>
          <div className="mt-1 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left">
              <thead className="bg-surface-sunken/70 text-[11px] text-ink-muted">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">Field</th>
                  {fieldRows.some((x) => x.old != null) ? (
                    <th className="px-2.5 py-1.5 font-medium">Previous</th>
                  ) : null}
                  <th className="px-2.5 py-1.5 font-medium">Set to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fieldRows.map((c) => (
                  <tr key={c.field} className="align-top">
                    <td className="px-2.5 py-1.5 text-[12px] text-ink-strong">{c.label}</td>
                    {fieldRows.some((x) => x.old != null) ? (
                      <td className="px-2.5 py-1.5 text-[12px] text-ink-muted line-through break-words">
                        {c.old ?? '—'}
                      </td>
                    ) : null}
                    <td className="px-2.5 py-1.5 text-[12px] text-ink break-words">{c.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {row.details?.old_values_captured === false ? (
            <p className="text-[11px] text-ink-muted mt-1.5">
              Previous values were not captured for this entry — only the values that were written are shown.
            </p>
          ) : null}
          {row.details?._slim ? (
            <p className="text-[11px] text-ink-muted mt-1.5">Showing preview fields — full detail is still loading.</p>
          ) : null}
        </div>
      ) : detailFallback ? (
        <div>
          <DetailLabel>Recorded detail</DetailLabel>
          <p className="text-ink leading-snug break-words whitespace-pre-wrap">{detailFallback}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
          <p className="text-[12px] text-ink-muted leading-snug">
            No field-level values were stored for this older entry.
          </p>
        </div>
      )}
    </div>
  )
}
