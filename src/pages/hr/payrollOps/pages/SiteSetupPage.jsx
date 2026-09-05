import React, { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, GripVertical, Plus, Trash2, X } from "lucide-react";
import { SectionCard } from "../../../adminOperations/components/AdminUi";
import { DEFAULT_COMPONENTS } from "../payrollOpsData";
import { usePayrollOps } from "../payrollOpsScope";
import { shortSiteName } from "../payrollOpsData";

function DraggableComponentList({ components, setComponents }) {
  const dragIdx = useRef(null);

  return (
    <div className="space-y-1.5">
      {components.map((c, i) => (
        <div
          key={c.id}
          draggable
          onDragStart={() => { dragIdx.current = i; }}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragIdx.current == null || dragIdx.current === i) return;
            setComponents((cur) => {
              const next = [...cur];
              const [moved] = next.splice(dragIdx.current, 1);
              next.splice(i, 0, moved);
              dragIdx.current = i;
              return next;
            });
          }}
          className={`flex flex-col gap-2 rounded-md border border-border px-3 py-2 ${c.enabled === false ? "bg-surface-sunken" : "bg-surface"}`}
        >
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 cursor-grab text-ink-muted" />
            <span className="w-4 text-[11px] text-ink-muted">{i + 1}</span>
            <p className={`min-w-0 flex-1 text-xs font-semibold ${c.enabled === false ? "text-ink-muted" : "text-ink"}`}>{c.label}</p>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${c.type === "earning" ? "bg-emerald-50 text-emerald-800" : "bg-critical-soft text-critical"}`}>
              {c.type}
            </span>
            <label className="flex items-center gap-1 text-[11px] text-ink-secondary">
              <input
                type="checkbox"
                checked={c.enabled !== false}
                onChange={() => setComponents((cur) => cur.map((x) => (x.id === c.id ? { ...x, enabled: !x.enabled } : x)))}
              />
              Enabled
            </label>
            {c.custom ? (
              <button
                type="button"
                className="text-ink-muted hover:text-critical"
                onClick={() => setComponents((cur) => cur.filter((x) => x.id !== c.id))}
                aria-label="Remove component"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {c.custom ? (
            <div className="ml-8 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2">
              <input
                value={c.formula || ""}
                onChange={(e) => setComponents((cur) => cur.map((x) => (x.id === c.id ? { ...x, formula: e.target.value } : x)))}
                placeholder="e.g. 40% of Earned Basic"
                className="h-8 min-w-[180px] flex-1 rounded-md border border-gray-300 px-2 text-xs"
              />
              <label className="flex items-center gap-1 text-[11px] text-ink-secondary">
                <input
                  type="checkbox"
                  checked={Boolean(c.autoAdjust)}
                  onChange={() => setComponents((cur) => cur.map((x) => (x.id === c.id ? { ...x, autoAdjust: !x.autoAdjust } : x)))}
                />
                Auto-adjust
              </label>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function PayrollOpsSiteSetupPage() {
  const { sites, setSites, setEmployeesBySite, setExtraSheets } = usePayrollOps();
  const [siteId, setSiteId] = useState("__new__");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [ocNo, setOcNo] = useState("");
  const [cycleDay, setCycleDay] = useState(5);
  const [components, setComponents] = useState(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
  const [sheetTemplates, setSheetTemplates] = useState(["OT Sheet"]);
  const [newSheetName, setNewSheetName] = useState("");
  const [saved, setSaved] = useState(false);

  const loadSite = (id) => {
    setSiteId(id);
    setSaved(false);
    if (id === "__new__") {
      setName("");
      setClient("");
      setLocation("");
      setOcNo("");
      setCycleDay(5);
      setComponents(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
      setSheetTemplates([]);
      return;
    }
    const s = sites.find((x) => x.id === id);
    if (!s) return;
    setName(s.name);
    setClient(s.client);
    setLocation(s.location);
    setOcNo(s.ocNo);
    setCycleDay(s.cycleDay);
    setComponents(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
    setSheetTemplates(s.sheets);
  };

  const addSheetTemplate = () => {
    if (!newSheetName.trim()) return;
    setSheetTemplates((cur) => [...cur, newSheetName.trim()]);
    setNewSheetName("");
  };

  const save = () => {
    if (!name.trim()) return;
    if (siteId === "__new__") {
      const id = `s${sites.length + 1}_${Date.now().toString().slice(-4)}`;
      const next = {
        id,
        name,
        client,
        location,
        ocNo,
        cycleDay: Number(cycleDay),
        status: "pending",
        sheets: sheetTemplates,
        attendanceCycleStart: 1,
        attendanceCycleEnd: 31,
        expectedDisbursement: new Date().toISOString().slice(0, 10),
      };
      setSites((cur) => [...cur, next]);
      setEmployeesBySite((cur) => ({ ...cur, [id]: [] }));
      setExtraSheets((cur) => ({ ...cur, [id]: [] }));
      setSiteId(id);
    } else {
      setSites((cur) =>
        cur.map((s) => (s.id === siteId ? { ...s, name, client, location, ocNo, cycleDay: Number(cycleDay), sheets: sheetTemplates } : s))
      );
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => loadSite("__new__")}
          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold ${
            siteId === "__new__" ? "border-accent bg-accent text-white" : "border-border bg-surface text-ink"
          }`}
        >
          <Plus className="h-3.5 w-3.5" /> New site
        </button>
        {sites.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => loadSite(s.id)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              siteId === s.id ? "border-accent bg-accent-soft text-ink" : "border-border bg-surface text-ink"
            }`}
          >
            {shortSiteName(s)}
          </button>
        ))}
        {saved ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Site details">
          <div className="space-y-3">
            <label className="block text-[11px] font-semibold text-ink-muted">
              Site name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" placeholder="e.g. Sajjan India Ltd, Ankleshwar" />
            </label>
            <label className="block text-[11px] font-semibold text-ink-muted">
              Client
              <input value={client} onChange={(e) => setClient(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" />
            </label>
            <label className="block text-[11px] font-semibold text-ink-muted">
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold text-ink-muted">
                OC / Contract No.
                <input value={ocNo} onChange={(e) => setOcNo(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" />
              </label>
              <label className="block text-[11px] font-semibold text-ink-muted">
                Salary cycle day
                <input type="number" value={cycleDay} onChange={(e) => setCycleDay(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-gray-300 px-2 text-xs" />
              </label>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold text-ink-muted">Additional sheet templates</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {sheetTemplates.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-1 text-[11px] font-semibold text-info">
                    <FileSpreadsheet className="h-3 w-3" /> {s}
                    <button type="button" onClick={() => setSheetTemplates((cur) => cur.filter((x) => x !== s))} aria-label={`Remove ${s}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newSheetName}
                  onChange={(e) => setNewSheetName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSheetTemplate()}
                  placeholder="e.g. TPT Allowance"
                  className="h-8 flex-1 rounded-md border border-gray-300 px-2 text-xs"
                />
                <button type="button" onClick={addSheetTemplate} className="h-8 rounded-md border border-border px-3 text-xs font-semibold">
                  Add
                </button>
              </div>
            </div>
            <button type="button" onClick={save} className="h-9 w-full rounded-md bg-accent text-xs font-semibold text-white">
              {siteId === "__new__" ? "Create site" : "Save changes"}
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Salary component structure">
          <p className="mb-3 text-[11px] text-ink-muted">
            Drag to reorder how components appear on this site&apos;s salary sheet. Add a formula and turn on auto-adjust when Basic or Gross changes.
          </p>
          <div className="mb-3 flex flex-wrap gap-2 rounded-md border border-dashed border-border bg-surface-sunken p-2">
            <AddComponentForm onAdd={(c) => setComponents((cur) => [...cur, c])} />
          </div>
          <DraggableComponentList components={components} setComponents={setComponents} />
        </SectionCard>
      </div>
    </div>
  );
}

function AddComponentForm({ onAdd }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("earning");
  const [formula, setFormula] = useState("");
  const [autoAdjust, setAutoAdjust] = useState(true);

  return (
    <>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Component name" className="h-8 min-w-[160px] flex-1 rounded-md border border-gray-300 px-2 text-xs" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-md border border-gray-300 px-2 text-xs">
        <option value="earning">Earning</option>
        <option value="deduction">Deduction</option>
      </select>
      <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="Formula" className="h-8 min-w-[160px] flex-1 rounded-md border border-gray-300 px-2 text-xs" />
      <label className="flex items-center gap-1 text-[11px] text-ink-secondary">
        <input type="checkbox" checked={autoAdjust} onChange={(e) => setAutoAdjust(e.target.checked)} /> Auto-adjust
      </label>
      <button
        type="button"
        onClick={() => {
          if (!label.trim()) return;
          onAdd({
            id: `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString().slice(-4)}`,
            label: label.trim(),
            type,
            formula: formula.trim(),
            autoAdjust,
            enabled: true,
            custom: true,
            editable: true,
          });
          setLabel("");
          setFormula("");
        }}
        className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-semibold text-white"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </>
  );
}
