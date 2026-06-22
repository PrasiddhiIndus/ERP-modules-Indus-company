import React, { useMemo, useState } from "react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  EnterpriseDataTable,
  FilterBar,
  FormField,
  FormInput,
  FormSelect,
  LinkedEmployeeChip,
  Modal,
  OpsStatusBadge,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  TinySelect,
} from "../../components/OperationsUi";

export default function AdvanceSettlement() {
  const { data, refresh, theme, getEmployee } = useOperations();
  const [settleOpen, setSettleOpen] = useState(false);
  const [advanceId, setAdvanceId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Expense Voucher");
  const [errors, setErrors] = useState({});

  const openAdvances = useMemo(
    () => (data?.advances || []).filter((a) => ["approved", "partially_settled"].includes(a.status) && a.balance > 0),
    [data]
  );

  const selectedAdvance = openAdvances.find((a) => a.id === advanceId);

  const handleSettle = () => {
    const next = {};
    if (!advanceId) next.advanceId = "Select advance";
    if (!amount || Number(amount) <= 0) next.amount = "Valid amount required";
    if (selectedAdvance && Number(amount) > selectedAdvance.balance) next.amount = "Exceeds balance";
    setErrors(next);
    if (Object.keys(next).length) return;
    window.alert("Settlement recorded (UI preview)");
    setSettleOpen(false);
    setAdvanceId("");
    setAmount("");
  };

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("advance-settlement")} theme={theme} />
      <PageHeader
        title="Advance Settlement"
        subtitle="Post settlements against approved advances"
        onRefresh={refresh}
        primaryAction={<PrimaryButton onClick={() => setSettleOpen(true)}>New Settlement</PrimaryButton>}
        theme={theme}
      />

      <FilterBar>
        <label className="text-[11px] text-gray-600">
          Open advances
          <TinySelect value={advanceId} onChange={(e) => setAdvanceId(e.target.value)} className="block mt-0.5 w-64">
            <option value="">Select to filter settlements</option>
            {openAdvances.map((a) => (
              <option key={a.id} value={a.id}>{a.request_no} — {formatCurrency(a.balance)} outstanding</option>
            ))}
          </TinySelect>
        </label>
      </FilterBar>

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "settlement_no", label: "Settlement No." },
          { key: "advance_id", label: "Advance", render: (r) => data?.advances?.find((a) => a.id === r.advance_id)?.request_no },
          { key: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
          { key: "settlement_date", label: "Date" },
          { key: "mode", label: "Mode" },
          { key: "status", label: "Status", render: (r) => <OpsStatusBadge status={r.status} /> },
          { key: "remarks", label: "Remarks" },
        ]}
        rows={(data?.settlements || []).filter((s) => !advanceId || s.advance_id === advanceId)}
      />

      <Modal
        open={settleOpen}
        title="Record Settlement"
        onClose={() => setSettleOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setSettleOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSettle}>Post Settlement</PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label="Advance" required error={errors.advanceId}>
            <FormSelect value={advanceId} error={errors.advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
              <option value="">Select advance</option>
              {openAdvances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.request_no} — {getEmployee(a.employee_id)?.name} — Bal {formatCurrency(a.balance)}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Settlement Amount (₹)" required error={errors.amount}>
            <FormInput type="number" value={amount} error={errors.amount} onChange={(e) => setAmount(e.target.value)} max={selectedAdvance?.balance} />
          </FormField>
          <FormField label="Settlement Mode">
            <FormSelect value={mode} onChange={(e) => setMode(e.target.value)}>
              {["Expense Voucher", "Cash Return", "Bank Transfer", "Adjustment"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </FormSelect>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
