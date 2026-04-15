// src/pages/CostingSheet.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Building2, Calculator, Loader2, Package, ClipboardList } from "lucide-react";
import { supabase } from "../../lib/supabase";
import CostingTable from "./CostingTable";
import AccessoriesTable from "./AccessoriesTable";
import MocTable from "./MocTable";
import FireTenderNavbar from "./FireTenderNavbar";

const tabs = [
  { id: "costing", label: "Costing sheet", icon: Calculator },
  { id: "accessories", label: "Accessories sheet", icon: Package },
  { id: "moc", label: "MOC", icon: ClipboardList },
];

const CostingSheet = () => {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("costing");
  const [accessoriesTotal, setAccessoriesTotal] = useState(0);

  useEffect(() => {
    const fetchTender = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenders")
        .select("*")
        .eq("id", id)
        .eq("status", "Approved")
        .single();

      if (error) {
        console.error("Error fetching tender:", error.message);
        setTender(null);
      } else {
        setTender(data);
      }
      setLoading(false);
    };

    fetchTender();
  }, [id]);

  useEffect(() => {
    if (activeTab === "accessories" && tender) {
      // AccessoriesTable reports total via onTotalChange
    }
  }, [activeTab, tender]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="mb-3 h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-medium">Loading costing sheet…</p>
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50/80 px-6 py-8 text-center shadow-sm">
          <p className="text-base font-semibold text-red-900">Tender not available</p>
          <p className="mt-2 text-sm text-red-800/90">
            This tender was not found or is not approved. Only approved tenders can open the costing sheet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
        <FireTenderNavbar />

        <div className="h-1.5 shrink-0 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-amber-400" aria-hidden />

        <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 ring-1 ring-red-100">
                <Calculator className="h-6 w-6 text-red-600" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600/90">Costing</p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {tender.tender_number || "Tender"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">Approved tender — build costing, accessories, and MOC below.</p>
              </div>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-4 sm:px-6">
            <div className="mt-0.5 rounded-xl bg-red-50 p-2.5 ring-1 ring-red-100/80">
              <Building2 className="h-5 w-5 text-red-600" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Client details</h2>
              <p className="mt-0.5 text-xs text-slate-500">Reference for this costing workbook</p>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-6 sm:p-6">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client</p>
              <p className="text-sm font-medium text-slate-900">{tender.client}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</p>
              <p className="text-sm text-slate-800">{tender.email || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phone</p>
              <p className="text-sm text-slate-800">{tender.phone || "—"}</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Address</p>
              <p className="text-sm leading-relaxed text-slate-800">
                {[tender.street, tender.city, tender.state, tender.country].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
          </div>
        </section>

        <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="border-b border-slate-100 px-2 pt-2 sm:px-4">
            <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Costing sections">
              {tabs.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(id)}
                    className={`relative flex items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors ${
                      active
                        ? "text-red-700 after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-gradient-to-r after:from-red-600 after:to-amber-500"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-red-600" : "text-slate-400"}`} strokeWidth={2} />
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-6">
            {activeTab === "costing" && <CostingTable tenderId={tender.id} accessoriesTotal={accessoriesTotal} />}
            {activeTab === "accessories" && (
              <AccessoriesTable tenderId={tender.id} onTotalChange={setAccessoriesTotal} />
            )}
            {activeTab === "moc" && <MocTable tenderId={tender.id} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostingSheet;
