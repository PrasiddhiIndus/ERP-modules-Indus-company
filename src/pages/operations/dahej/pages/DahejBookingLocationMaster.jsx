import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useDahejExpenses } from "../contexts/DahejExpensesContext";
import {
  EnterpriseDataTable,
  FormField,
  FormInput,
  FormSelect,
  LinkedSiteChip,
  Modal,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";
import { DAHEJ_BOOKING_LOCATION_TYPES } from "../constants/columns";

export default function DahejBookingLocationMaster() {
  const { theme } = useOperations();
  const { bookingLocations, sites, saveBookingLocation, refresh } = useDahejExpenses();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location_type: "", site_id: "", is_active: true });

  const getSite = (id) => sites.find((s) => String(s.id) === String(id));

  const handleSave = () => {
    if (!form.name.trim()) {
      window.alert("Location name is required");
      return;
    }
    saveBookingLocation(form);
    setOpen(false);
    setForm({ name: "", location_type: "", site_id: "", is_active: true });
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Expense Booking Locations"
        subtitle="Master for Expense Booked Under — Branch Office, Site Office, Client/Project locations. Link to Site Master where applicable."
        onRefresh={refresh}
        primaryAction={<PrimaryButton icon={Plus} onClick={() => setOpen(true)}>Add Location</PrimaryButton>}
        theme={theme}
      />

      <EnterpriseDataTable
        theme={theme}
        columns={[
          { key: "name", label: "Location Name", sortable: true },
          { key: "location_type", label: "Type" },
          { key: "site_id", label: "Linked Site", render: (r) => (r.site_id ? <LinkedSiteChip site={getSite(r.site_id)} /> : "—") },
          { key: "is_active", label: "Status", render: (r) => (r.is_active ? "Active" : "Inactive") },
          {
            key: "actions",
            label: "Actions",
            sortable: false,
            render: (r) => (
              <button type="button" className="text-[11px] text-[#1F3A8A]" onClick={() => { setForm({ ...r, site_id: r.site_id || "" }); setOpen(true); }}>
                Edit
              </button>
            ),
          },
        ]}
        rows={bookingLocations}
      />

      <Modal open={open} title={form.id ? "Edit Location" : "Add Location"} onClose={() => setOpen(false)} footer={
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
        </div>
      }>
        <div className="space-y-3">
          <FormField label="Location Name" required>
            <FormInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Location Type">
            <FormSelect value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })}>
              <option value="">Select</option>
              {DAHEJ_BOOKING_LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </FormSelect>
          </FormField>
          <FormField label="Link to Site Master (optional)">
            <FormSelect value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
              <option value="">None</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.site_code} — {s.site_name}</option>
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
