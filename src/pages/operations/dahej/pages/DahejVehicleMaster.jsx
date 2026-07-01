import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import {
  EnterpriseDataTable,
  FormField,
  FormInput,
  FormSelect,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";;
import { formatDateDdMmYyyy } from "../../../../utils/dateDisplay";


const VEHICLE_TYPE_OPTIONS = ["Tata Yodha", "Mahindra Bolero Ambulance", "Hero Glamour", "Maruti Eco", "Fire Tender", "Other"];

export default function DahejVehicleMaster() {
  const { theme } = useOperations();
  const { vehicles, saveVehicle, refresh } = useDahejExpenses();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", registration_no: "", vehicle_type: "", is_active: true });

  const handleSave = () => {
    if (!form.name.trim()) {
      window.alert("Vehicle name is required");
      return;
    }
    saveVehicle(form);
    setOpen(false);
    setForm({ name: "", registration_no: "", vehicle_type: "", is_active: true });
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Vehicle Master"
        subtitle="Configurable vehicles for Dahej expense tracking (Tata Yodha, Bolero Ambulance, Hero Glamour, Maruti Eco, Fire Tender, etc.)"
        onRefresh={refresh}
        primaryAction={<PrimaryButton icon={Plus} onClick={() => setOpen(true)}>Add Vehicle</PrimaryButton>}
        theme={theme}
      />

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "name", label: "Vehicle Name", sortable: true },
          { key: "registration_no", label: "Registration No." },
          { key: "vehicle_type", label: "Type" },
          { key: "is_active", label: "Status", render: (r) => (r.is_active ? "Active" : "Inactive") },
          { key: "modified_at", label: "Last Modified", render: (r) => (r.modified_at ? formatDateDdMmYyyy(r.modified_at) : "—") },
          {
            key: "actions",
            label: "Actions",
            sortable: false,
            render: (r) => (
              <button type="button" className="text-[11px] text-[#1F3A8A]" onClick={() => { setForm(r); setOpen(true); }}>
                Edit
              </button>
            ),
          },
        ]}
        rows={vehicles}
        emptyTitle="No vehicles configured"
        emptyDescription="Add vehicles to enable vehicle-wise expense tracking and filters."
      />

      <Modal open={open} title={form.id ? "Edit Vehicle" : "Add Vehicle"} onClose={() => setOpen(false)} footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
        </div>
      }>
        <div className="space-y-3">
          <FormField label="Vehicle Name" required>
            <FormInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tata Yodha" />
          </FormField>
          <FormField label="Registration No.">
            <FormInput value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} placeholder="e.g. GJ06BX5697" />
          </FormField>
          <FormField label="Vehicle Type">
            <FormSelect value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
              <option value="">Select type</option>
              {VEHICLE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Status">
            <FormSelect value={form.is_active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </FormSelect>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
