import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FinanceProvider, useFinance } from "./contexts/FinanceContext";
import { isFinanceSchemaError } from "../../services/financeApi";
import { FINANCE_NAV, financePath, getFinanceTabFromPath } from "./navConfig";
import FinanceTabNav from "./components/FinanceTabNav";
import Settings from "./Settings";
import SiteLedgerApp from "./SiteLedgerApp";

const PAGE_MAP = {
  "site-ledger": () => <SiteLedgerApp embedded />,
  settings: Settings,
};

function FinanceSchemaBanner() {
  const { error } = useFinance();
  if (!error || !isFinanceSchemaError({ message: error })) return null;
  return (
    <div className="mx-4 sm:mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-semibold">Finance database not configured</p>
      <p className="mt-1 text-red-700">{error}</p>
    </div>
  );
}

function FinanceRedirect({ to }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return null;
}

function FinanceShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = getFinanceTabFromPath(location.pathname);
  const ActivePage = PAGE_MAP[activeId] || PAGE_MAP["site-ledger"];
  const isSiteLedger = activeId === "site-ledger";
  const path = location.pathname.replace(/\/$/, "");

  if (path === "/app/accounts-finance") {
    return <FinanceRedirect to={financePath("site-ledger")} />;
  }

  if (isSiteLedger) {
    return (
      <div className="min-h-screen bg-slate-50">
        <FinanceSchemaBanner />
        <SiteLedgerApp embedded />
      </div>
    );
  }

  const activeNav = FINANCE_NAV.find((n) => n.id === activeId);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-3">
          <h1 className="text-xl font-bold text-gray-900">Finance / P&amp;L</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeNav?.label || "Settings"} · Multi-site profit &amp; loss
          </p>
        </div>
        <FinanceTabNav
          items={FINANCE_NAV}
          activeId={activeId}
          onSelect={(id) => {
            const item = FINANCE_NAV.find((n) => n.id === id);
            if (item?.path) navigate(item.path);
          }}
        />
      </div>
      <FinanceSchemaBanner />
      <div className="px-4 sm:px-6 py-4 max-w-[1600px] mx-auto">
        <ActivePage />
      </div>
    </div>
  );
}

export default function Finance() {
  return (
    <FinanceProvider>
      <FinanceShell />
    </FinanceProvider>
  );
}
