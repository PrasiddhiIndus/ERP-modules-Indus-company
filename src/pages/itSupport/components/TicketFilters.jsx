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
 *   requesterId?: string,
 *   categoryId?: string,
 *   erpModuleKey?: string,
 *   breachedOnly?: boolean,
 *   agents?: Array<{id:string,username?:string,email?:string,employee_code?:string}>,
 *   raisers?: Array<{id:string,label:string,employee_code?:string}>,
 *   categories?: Array<{id:string,name:string}>,
 *   modules?: Array<{value:string,label:string}>,
 *   onChange: (patch: object) => void,
 *   showAgentFilters?: boolean,
 * }} props
 */
export default function TicketFilters({
  search,
  status,
  priority = "",
  assigneeId = "",
  requesterId = "",
  categoryId = "",
  erpModuleKey = "",
  breachedOnly = false,
  agents = [],
  raisers = [],
  categories = [],
  modules = [],
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
                  {a.employee_code ? ` · ${a.employee_code}` : ""}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="w-[170px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Raised by</label>
            <TinySelect
              value={requesterId}
              onChange={(e) => onChange({ requesterId: e.target.value })}
              className="w-full"
            >
              <option value="">Anyone</option>
              {raisers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                  {r.employee_code ? ` · ${r.employee_code}` : ""}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="w-[150px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Module</label>
            <TinySelect
              value={erpModuleKey}
              onChange={(e) => onChange({ erpModuleKey: e.target.value })}
              className="w-full"
            >
              <option value="">All</option>
              {modules.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="w-[150px]">
            <label className="block text-[10px] font-medium text-ink-muted mb-0.5">Issue type</label>
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
