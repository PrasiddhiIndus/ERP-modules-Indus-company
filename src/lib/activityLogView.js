/**
 * Shared view helpers for the Activity Log drawer and full-history page.
 * Business language only — no schema / REST jargon in user-facing strings.
 */
import { ERP_TIMEZONE } from '../utils/dateDisplay'
import { humanEntityName, resolveModule } from './activityDescriptors'
import { supabase } from './supabase'

export const ACTIVITY_LOG_PATH = '/app/activity-history'

const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ERP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function formatActivityTime(ts) {
  if (!ts) return ''
  const dt = new Date(ts)
  if (Number.isNaN(dt.getTime())) return String(ts)
  const p = Object.fromEntries(IST_PARTS.formatToParts(dt).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second} IST`
}

export function activityOutcome(r) {
  const o = String(r?.details?.outcome || '').toLowerCase()
  if (o) return o
  if (r?.success === false) return r?.status_code === 401 || r?.status_code === 403 ? 'denied' : 'failed'
  return 'success'
}

export function activityBadge(r) {
  const b = String(r?.details?.badge || '').trim().toUpperCase()
  if (b) return b
  const a = String(r?.action || '').toUpperCase()
  if (a === 'INSERT') return 'CREATED'
  if (a === 'UPDATE') return 'UPDATED'
  if (a === 'DELETE') return 'DELETED'
  if (a === 'CALL' || a === 'RPC') return 'RAN'
  return a || 'ACTIVITY'
}

/** Plain-English badge for chips / filters. */
export function badgeLabel(code) {
  const c = String(code || '').toUpperCase()
  const map = {
    CREATED: 'Created',
    UPDATED: 'Updated',
    DELETED: 'Deleted',
    CHANGED: 'Changed',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    SUBMITTED: 'Submitted',
    DRAFT: 'Saved as draft',
    RPC: 'Ran a process',
    CALL: 'Ran a process',
    RAN: 'Ran a process',
    ACTIVITY: 'Activity',
  }
  return map[c] || c.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase())
}

export function badgeToneClass(code) {
  const c = String(code || '').toUpperCase()
  if (c === 'CREATED' || c === 'DRAFT') return 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/70'
  if (c === 'UPDATED' || c === 'CHANGED') return 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/70'
  if (c === 'DELETED') return 'bg-rose-100 text-rose-900 ring-1 ring-rose-200/70'
  if (c === 'APPROVED') return 'bg-green-100 text-green-900 ring-1 ring-green-200/70'
  if (c === 'REJECTED') return 'bg-red-100 text-red-900 ring-1 ring-red-200/70'
  if (c === 'SUBMITTED') return 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200/70'
  if (c === 'RPC' || c === 'CALL' || c === 'RAN') return 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/70'
  return 'bg-slate-100 text-slate-800 ring-1 ring-slate-200/70'
}

export function badgeSeverity(code) {
  const c = String(code || '').toUpperCase()
  if (c === 'DELETED' || c === 'REJECTED') return 'critical'
  if (c === 'APPROVED' || c === 'CREATED') return 'info'
  if (c === 'SUBMITTED' || c === 'DRAFT') return 'warning'
  return 'neutral'
}

export function moduleOf(r) {
  return String(r?.module || r?.details?.module || r?.details?.screen || '').trim() || null
}

export function recordRefOf(r) {
  return String(r?.record_ref || r?.details?.record_ref || '').trim() || null
}

export function summaryOf(r) {
  const fromDetails = String(r?.details?.summary || '').trim()
  if (fromDetails) return fromDetails
  const badge = activityBadge(r)
  const entity = String(r?.details?.entity_label || '').trim() || humanEntityName(r?.entity)
  const verb = String(r?.details?.verb || '').trim() || badgeLabel(badge).toLowerCase()
  return `${verb} ${entity}`.replace(/\s+/g, ' ').trim()
}

/** Where the person was working when the change happened. */
export function whereOf(r) {
  const route = String(r?.route || '').trim()
  if (!route) return null
  return resolveModule(route) || route
}

/**
 * What this activity means for operations — plain English, not HTTP codes.
 */
export function operationalImpact(r) {
  const outcome = activityOutcome(r)
  const badge = activityBadge(r)
  const isAuto = r?.details?.trigger === 'automatic'
  const changes = Array.isArray(r?.details?.changes) ? r.details.changes : []
  const parts = []

  if (outcome === 'denied') {
    parts.push('Did not take effect — permission was denied.')
  } else if (outcome === 'failed') {
    parts.push('Did not take effect — the change failed before it was saved.')
  } else if (badge === 'APPROVED') {
    parts.push('Applied — related registers or workflows may have been updated.')
  } else if (badge === 'REJECTED') {
    parts.push('Applied — the request was turned down; no further workflow steps.')
  } else if (badge === 'DELETED') {
    parts.push('Applied — the record was removed.')
  } else if (badge === 'CREATED' || badge === 'SUBMITTED') {
    parts.push('Applied — a new record or request is now in the system.')
  } else if (changes.length) {
    parts.push(`Applied — ${changes.length} field${changes.length === 1 ? '' : 's'} updated.`)
  } else {
    parts.push('Applied successfully.')
  }

  if (isAuto && outcome === 'success') {
    parts.push('Triggered automatically (not from a click).')
  }

  return parts.join(' ')
}

export function friendlyUserNameFromEmail(email) {
  const e = String(email || '').trim()
  if (!e.includes('@')) return 'Someone'
  const local = e.split('@')[0] || ''
  const raw = (local.split('.')[0] || local).trim()
  if (!raw) return 'Someone'
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

/** Resolve user_id → profile (email, employee code) → employee master (full name). */
export async function fetchActivityActors(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {}
  const out = {}
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, username, employee_code')
      .in('id', ids)
    const codes = [...new Set((profiles || []).map((p) => String(p.employee_code || '').trim()).filter(Boolean))]
    let names = {}
    if (codes.length) {
      const { data: emps } = await supabase
        .from('admin_ifsp_employee_master')
        .select('employee_code, full_name')
        .in('employee_code', codes)
      names = Object.fromEntries((emps || []).map((e) => [String(e.employee_code).trim(), e.full_name]))
    }
    for (const p of profiles || []) {
      const code = String(p.employee_code || '').trim() || null
      out[p.id] = {
        name: (code && names[code]) || p.username || null,
        code,
        email: p.email || null,
      }
    }
  } catch {
    /* identity enrichment is optional */
  }
  return out
}

export function actorLabel(row, actors) {
  const actor = row?.user_id ? actors?.[row.user_id] : null
  const email = actor?.email || row?.user_email || ''
  const who =
    actor?.name ||
    (email
      ? friendlyUserNameFromEmail(email)
      : row?.user_id
        ? `User ${String(row.user_id).slice(0, 8)}…`
        : 'Unknown user')
  return { who, email, code: actor?.code || null }
}

/** Turn snake_case / dotted keys into readable field labels. */
export function humanFieldLabel(field) {
  const raw = String(field || '').trim()
  if (!raw) return 'Field'
  return raw
    .replace(/\./g, ' → ')
    .replace(/_/g, ' ')
    .replace(/\bid\b/gi, 'ID')
    .replace(/\bgstin\b/gi, 'GSTIN')
    .replace(/\bpo\b/gi, 'PO')
    .replace(/\bwo\b/gi, 'WO')
    .replace(/\bctc\b/gi, 'CTC')
    .replace(/\brpc\b/gi, 'process')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (ch) => ch.toUpperCase())
}

export function formatDisplayValue(value) {
  if (value == null) return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  const s = String(value).trim()
  if (!s) return '(empty)'
  if (s === '(hidden)') return 'Hidden (sensitive)'
  if (s === '(complex value)' || s === '(details)') return 'Structured data'
  if (s === '(empty)') return '(empty)'
  return s
}

/**
 * Exact field-level rows for the detail panel.
 * Prefer structured `details.changes`; fall back to parsing `details.detail`.
 */
export function changeRows(r) {
  const changes = Array.isArray(r?.details?.changes) ? r.details.changes : null
  if (changes?.length) {
    return changes.map((c) => ({
      field: String(c.field || 'field'),
      label: humanFieldLabel(c.field),
      old: c.old !== undefined ? formatDisplayValue(c.old) : null,
      next: formatDisplayValue(c.new),
    }))
  }
  const detail = String(r?.details?.detail || '').trim()
  if (!detail) return []
  // "field → value; field2 → value2"
  return detail
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const arrow = part.split('→').map((x) => x.trim())
      if (arrow.length >= 2) {
        return {
          field: arrow[0],
          label: humanFieldLabel(arrow[0]),
          old: null,
          next: formatDisplayValue(arrow.slice(1).join('→')),
        }
      }
      return { field: part, label: humanFieldLabel(part), old: null, next: 'Updated' }
    })
}

export function changeLines(r) {
  return changeRows(r).map((row) => {
    if (row.old != null) return `${row.label}: ${row.old} → ${row.next}`
    return `${row.label}: ${row.next}`
  })
}

/** Exact place in the product: screen label + page path. */
export function exactLocation(r) {
  const screen =
    String(r?.details?.screen || '').trim() ||
    whereOf(r) ||
    null
  const path = String(r?.route || '').trim() || null
  const module = moduleOf(r)
  return {
    module,
    screen: screen || module || null,
    path,
    pathBreadcrumb: path
      ? path
          .replace(/^\/app\/?/, '')
          .split('/')
          .filter(Boolean)
          .map((seg) => seg.replace(/[-_]/g, ' '))
          .join(' › ')
      : null,
  }
}

export function recordIdentity(r) {
  const ref = recordRefOf(r)
  const type = String(r?.details?.entity_label || '').trim() || humanEntityName(r?.entity)
  const id = String(r?.details?.record_id || '').trim() || null
  return { type, ref, id }
}

/** One plain-English paragraph covering who / what / where / effect. */
export function narrativeStory(r, actors) {
  const { who, code } = actorLabel(r, actors)
  const whoPart = code ? `${who} (${code})` : who
  const what = summaryOf(r)
  const loc = exactLocation(r)
  const wherePart = loc.screen || loc.pathBreadcrumb || 'an unknown screen'
  const modulePart = loc.module && loc.module !== loc.screen ? ` in ${loc.module}` : ''
  const rows = changeRows(r)
  const fieldPart =
    rows.length === 0
      ? ''
      : rows.length === 1
        ? ` Exact detail: ${rows[0].label} set to ${rows[0].next}.`
        : ` Exact detail: ${rows.length} fields were written (${rows
            .slice(0, 4)
            .map((x) => x.label)
            .join(', ')}${rows.length > 4 ? `, +${rows.length - 4} more` : ''}).`
  const effect = operationalImpact(r)
  return `${whoPart} ${what}${modulePart} while on ${wherePart}.${fieldPart} ${effect}`.replace(/\s+/g, ' ').trim()
}

export function changePreviewLines(r, limit = 3) {
  const rows = changeRows(r)
  if (!rows.length) {
    const detail = String(r?.details?.detail || '').trim()
    return detail ? [detail] : []
  }
  return rows.slice(0, limit).map((row) =>
    row.old != null ? `${row.label}: ${row.old} → ${row.next}` : `${row.label}: ${row.next}`
  )
}
