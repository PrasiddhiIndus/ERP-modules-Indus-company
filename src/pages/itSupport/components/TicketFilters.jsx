import React from "react";
import { FilterBar, TinyInput, TinySelect } from "../../../components/erpUi";
import { PRIORITIES, STATUSES } from "../itSupportConstants";

/**
 * Shared filter strip for queue / my-tickets.
 * @param {{
 *   search: string,
 *   status: string,
 *   priority?: string,
 *   assigneeId?: string,
 *   categoryId?: string,
 *   breachedOnly?: boolean,
 *   agents?: Array<{id:string,username?:string,email?:string}>,
 *   categories?: Array<{id:string,name:string}>,
 *   onChange: (patch: object) => void,
 *   showAgentFilters?: boolean,
 * }} props
 */
export default function TicketFilters({
  search,
  status,
  priority = "",
  assigneeId = "",
  categoryId = "",
  breachedOnly = false,
  agents = [],
  categories = [],
  onChange,
  showAgentFilters = false,
}) {
  return (
    <FilterBar>
      <div className="min-w-[160px] flex-1">
        <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Search</label>
        <TinyInput
          value={search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Ticket no or title…"
          className="w-full"
        />
      </div>
      <div className="w-[140px]">
        <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Status</label>
        <TinySelect
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
          className="w-full"
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </TinySelect>
      </div>
      {showAgentFilters ? (
        <>
          <div className="w-[130px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Priority</label>
            <TinySelect
              value={priority}
              onChange={(e) => onChange({ priority: e.target.value })}
              className="w-full"
            >
              <option value="">All</option>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="w-[160px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Assigned to</label>
            <TinySelect
              value={assigneeId}
              onChange={(e) => onChange({ assigneeId: e.target.value })}
              className="w-full"
            >
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username || a.email || a.id}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="w-[150px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Category</label>
            <TinySelect
              value={categoryId}
              onChange={(e) => onChange({ categoryId: e.target.value })}
              className="w-full"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </TinySelect>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-secondary pb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={breachedOnly}
              onChange={(e) => onChange({ breachedOnly: e.target.checked })}
              className="rounded border-border"
            />
            SLA breached
          </label>
        </>
      ) : null}
    </FilterBar>
  );
}
