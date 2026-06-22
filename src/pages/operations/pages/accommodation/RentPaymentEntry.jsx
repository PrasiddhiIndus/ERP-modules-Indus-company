import React, { useState } from "react";
import { useOperations } from "../../contexts/OperationsContext";
import { getBreadcrumbs } from "../../navConfig";
import { formatCurrency } from "../../data/mockOperationsData";
import {
  Breadcrumbs,
  DemoBanner,
  FormField,
  FormInput,
  FormSelect,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  useThemeClasses,
} from "../../components/OperationsUi";

export default function RentPaymentEntry() {
  const { data, refresh, theme, getProperty } = useOperations();
  const t = useThemeClasses(theme);
  const [form, setForm] = useState({
    property_id: "",
    month: "2026-06",
    amount: "",
    payment_date: "",
    mode: "NEFT",
    reference: "",
  });
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  const selectedProperty = getProperty(form.property_id);

  const validate = () => {
    const next = {};
    if (!form.property_id) next.property_id = "Property required";
    if (!form.amount || Number(form.amount) <= 0) next.amount = "Valid amount required";
    if (!form.payment_date) next.payment_date = "Payment date required";
    if (!form.reference.trim()) next.reference = "Reference required";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaved(true);
    window.alert("Rent payment recorded (UI preview)");
  };

  return (
    <div className="space-y-4">
      <DemoBanner />
      <Breadcrumbs items={getBreadcrumbs("rent-entry")} theme={theme} />
      <PageHeader title="Rent Payment Entry" subtitle="Record monthly rent payments for accommodation properties" onRefresh={refresh} theme={theme} />

      <div className="max-w-2xl">
        <SectionCard title="Payment details" className={t.card}>
          {saved ? (
            <div className="text-center py-6">
              <p className="text-sm font-medium text-emerald-700">Payment entry saved successfully (UI preview)</p>
              <SecondaryButton onClick={() => { setSaved(false); setForm({ property_id: "", month: "2026-06", amount: "", payment_date: "", mode: "NEFT", reference: "" }); }} className="mt-3">
                New entry
              </SecondaryButton>
            </div>
          ) : (
            <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={handleSubmit}>
              <FormField label="Property" required error={errors.property_id} className="sm:col-span-2">
                <FormSelect value={form.property_id} error={errors.property_id} onChange={(e) => {
                  const prop = getProperty(e.target.value);
                  setForm({ ...form, property_id: e.target.value, amount: prop ? String(prop.monthly_rent) : "" });
                }}>
                  <option value="">Select property</option>
                  {(data?.properties || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.property_code} — {p.name}</option>
                  ))}
                </FormSelect>
              </FormField>
              {selectedProperty && (
                <p className="sm:col-span-2 text-xs text-gray-500">
                  Standard rent: {formatCurrency(selectedProperty.monthly_rent)} · Landlord: {selectedProperty.landlord}
                </p>
              )}
              <FormField label="Rent Month">
                <FormInput type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
              </FormField>
              <FormField label="Amount (₹)" required error={errors.amount}>
                <FormInput type="number" value={form.amount} error={errors.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </FormField>
              <FormField label="Payment Date" required error={errors.payment_date}>
                <FormInput type="date" value={form.payment_date} error={errors.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
              </FormField>
              <FormField label="Payment Mode">
                <FormSelect value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  {["NEFT", "RTGS", "Cheque", "Cash", "UPI"].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label="Reference / UTR" required error={errors.reference} className="sm:col-span-2">
                <FormInput value={form.reference} error={errors.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Transaction reference" />
              </FormField>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <SecondaryButton type="button" onClick={() => setForm({ property_id: "", month: "2026-06", amount: "", payment_date: "", mode: "NEFT", reference: "" })}>Reset</SecondaryButton>
                <PrimaryButton type="submit">Save Payment</PrimaryButton>
              </div>
            </form>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
