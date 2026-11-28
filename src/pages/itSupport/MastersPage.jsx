import React, { useCallback, useEffect, useState } from "react";
import {
  DenseTable,
  EmptyState,
  FormField,
  InlineAlert,
  LoadingBlock,
  Modal,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toast";
import { resolveItSupportAccess, resolveSupportTypeAccess } from "./itSupportAccess";
import { IMPACT_OPTIONS, PRIORITIES, SUPPORT_TYPES } from "./itSupportConstants";
import { useSupportType } from "./SupportTypeContext";
import {
  listAssigneeMaster,
  listCategories,
  listSlaRules,
  softDeleteAssigneeMaster,
  upsertAssigneeMaster,
  upsertCategory,
  upsertSlaRule,
  upsertSubcategory,
} from "./itSupportApi";
import CcEmployeePicker from "./components/CcEmployeePicker";

export default function MastersPage() {
  const { userProfile } = useAuth();
  const { supportType } = useSupportType();
  const moduleAccess = resolveItSupportAccess(userProfile);
  const typeAccess = resolveSupportTypeAccess(userProfile, supportType);
  const allowed = typeAccess.canMasters || moduleAccess.software.canMasters || moduleAccess.hardware.canMasters;
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [slaRules, setSlaRules] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catModal, setCatModal] = useState({ open: false, row: null });
  const [subModal, setSubModal] = useState({ open: false, row: null });
  const [slaModal, setSlaModal] = useState({ open: false, row: null });
  const [assigneeModal, setAssigneeModal] = useState({ open: false, row: null, pick: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cats, rules, agentRows] = await Promise.all([
        listCategories(),
        listSlaRules(),
        listAssigneeMaster(),
      ]);
      setCategories(cats.categories || []);
      setSubcategories(cats.subcategories || []);
      setSlaRules(rules);
      setAssignees(agentRows || []);
    } catch (err) {
      setError(err.message || "Could not load masters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!allowed) {
    return <EmptyState title="No access" message="Masters are available to IT Support admins only." />;
  }

  const catColumns = [
    { key: "name", label: "Name" },
    {
      key: "support_type",
      label: "Support",
      render: (r) => (r.support_type === "hardware" ? "Hardware" : "Software"),
    },
    { key: "description", label: "Description", render: (r) => r.description || "—" },
    {
      key: "is_active",
      label: "Active",
      render: (r) => (r.is_active === false ? "No" : "Yes"),
    },
    { key: "sort_order", label: "Order" },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <SecondaryButton onClick={() => setCatModal({ open: true, row: { ...r } })}>Edit</SecondaryButton>
      ),
    },
  ];

  const subColumns = [
    {
      key: "category",
      label: "Category",
      render: (r) => categories.find((c) => c.id === r.category_id)?.name || "—",
    },
    { key: "name", label: "Name" },
    {
      key: "is_active",
      label: "Active",
      render: (r) => (r.is_active === false ? "No" : "Yes"),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <SecondaryButton onClick={() => setSubModal({ open: true, row: { ...r } })}>Edit</SecondaryButton>
      ),
    },
  ];

  const slaColumns = [
    { key: "name", label: "Name" },
    { key: "impact", label: "Impact", render: (r) => r.impact || "—" },
    { key: "priority", label: "Priority", render: (r) => r.priority || "—" },
    { key: "first_response_mins", label: "First response (min)" },
    { key: "resolution_mins", label: "Resolution (min)" },
    {
      key: "is_active",
      label: "Active",
      render: (r) => (r.is_active === false ? "No" : "Yes"),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <SecondaryButton onClick={() => setSlaModal({ open: true, row: { ...r } })}>Edit</SecondaryButton>
      ),
    },
  ];

  const assigneeColumns = [
    { key: "display_name", label: "Name" },
    { key: "employee_code", label: "Code", render: (r) => r.employee_code || "—" },
    { key: "sort_order", label: "Order" },
    {
      key: "is_active",
      label: "Active",
      render: (r) => (r.is_active === false ? "No" : "Yes"),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          <SecondaryButton
            onClick={() => setAssigneeModal({ open: true, row: { ...r }, pick: [] })}
          >
            Edit
          </SecondaryButton>
          <SecondaryButton
            onClick={async () => {
              try {
                await softDeleteAssigneeMaster(r.id);
                toast.success("Assignee removed");
                load();
              } catch (err) {
                toast.error(err.message || "Remove failed");
              }
            }}
          >
            Remove
          </SecondaryButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTaskHeader
        title="Masters"
        subtitle="Issue types, assignees for Assigned to, and SLA rules."
      />

      <div className="flex gap-2 mb-2">
        {[
          { id: "categories", label: "Categories" },
          { id: "assignees", label: "Assignees" },
          { id: "sla", label: "SLA rules" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-9 px-3.5 rounded-md text-sm font-medium border ${
              tab === t.id
                ? "bg-accent text-white border-accent"
                : "bg-slate-50 text-slate-700 border-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      {loading ? (
        <LoadingBlock label="Loading masters…" />
      ) : tab === "categories" ? (
        <div className="space-y-4">
          <SectionCard
            title="Categories"
            right={
              <PrimaryButton
                onClick={() =>
                  setCatModal({
                    open: true,
                    row: { name: "", description: "", is_active: true, sort_order: 0, support_type: "software" },
                  })
                }
              >
                Add category
              </PrimaryButton>
            }
          >
            <DenseTable columns={catColumns} rows={categories} rowKey="id" />
          </SectionCard>
          <SectionCard
            title="Subcategories"
            right={
              <PrimaryButton
                onClick={() =>
                  setSubModal({
                    open: true,
                    row: {
                      name: "",
                      category_id: categories[0]?.id || "",
                      is_active: true,
                      sort_order: 0,
                    },
                  })
                }
              >
                Add subcategory
              </PrimaryButton>
            }
          >
            <DenseTable columns={subColumns} rows={subcategories} rowKey="id" />
          </SectionCard>
        </div>
      ) : tab === "assignees" ? (
        <SectionCard
          title="Assignees"
          right={
            <PrimaryButton
              onClick={() =>
                setAssigneeModal({
                  open: true,
                  row: {
                    display_name: "",
                    employee_code: "",
                    profile_id: "",
                    is_active: true,
                    sort_order: assignees.length,
                  },
                  pick: [],
                })
              }
            >
              Add assignee
            </PrimaryButton>
          }
        >
          <p className="mb-3 text-[11px] text-ink-muted">
            People shown in the ticket <span className="font-medium text-ink-secondary">Assigned to</span> dropdown.
            Pick from Employee Master (same idea as Categories).
          </p>
          <DenseTable columns={assigneeColumns} rows={assignees} rowKey="id" />
        </SectionCard>
      ) : (
        <SectionCard
          title="SLA rules"
          right={
            <PrimaryButton
              onClick={() =>
                setSlaModal({
                  open: true,
                  row: {
                    name: "",
                    impact: "only_me",
                    priority: "medium",
                    first_response_mins: 60,
                    resolution_mins: 480,
                    is_active: true,
                  },
                })
              }
            >
              Add SLA rule
            </PrimaryButton>
          }
        >
          <DenseTable columns={slaColumns} rows={slaRules} rowKey="id" />
        </SectionCard>
      )}

      <Modal
        open={catModal.open}
        title={catModal.row?.id ? "Edit category" : "New category"}
        onClose={() => setCatModal({ open: false, row: null })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setCatModal({ open: false, row: null })}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={async () => {
                try {
                  await upsertCategory(catModal.row);
                  toast.success("Category saved");
                  setCatModal({ open: false, row: null });
                  load();
                } catch (err) {
                  toast.error(err.message || "Save failed");
                }
              }}
            >
              Save
            </PrimaryButton>
          </div>
        }
      >
        {catModal.row ? (
          <div className="space-y-3">
            <FormField label="Name" required>
              <TinyInput
                className="w-full"
                value={catModal.row.name || ""}
                onChange={(e) => setCatModal((m) => ({ ...m, row: { ...m.row, name: e.target.value } }))}
              />
            </FormField>
            <FormField label="Support type" required>
              <TinySelect
                className="w-full"
                value={catModal.row.support_type === "hardware" ? "hardware" : "software"}
                onChange={(e) =>
                  setCatModal((m) => ({ ...m, row: { ...m.row, support_type: e.target.value } }))
                }
              >
                {SUPPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Description">
              <TinyInput
                className="w-full"
                value={catModal.row.description || ""}
                onChange={(e) =>
                  setCatModal((m) => ({ ...m, row: { ...m.row, description: e.target.value } }))
                }
              />
            </FormField>
            <FormField label="Sort order">
              <TinyInput
                type="number"
                className="w-full"
                value={catModal.row.sort_order ?? 0}
                onChange={(e) =>
                  setCatModal((m) => ({ ...m, row: { ...m.row, sort_order: Number(e.target.value) } }))
                }
              />
            </FormField>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={catModal.row.is_active !== false}
                onChange={(e) =>
                  setCatModal((m) => ({ ...m, row: { ...m.row, is_active: e.target.checked } }))
                }
              />
              Active
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={subModal.open}
        title={subModal.row?.id ? "Edit subcategory" : "New subcategory"}
        onClose={() => setSubModal({ open: false, row: null })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setSubModal({ open: false, row: null })}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={async () => {
                try {
                  await upsertSubcategory(subModal.row);
                  toast.success("Subcategory saved");
                  setSubModal({ open: false, row: null });
                  load();
                } catch (err) {
                  toast.error(err.message || "Save failed");
                }
              }}
            >
              Save
            </PrimaryButton>
          </div>
        }
      >
        {subModal.row ? (
          <div className="space-y-3">
            <FormField label="Category" required>
              <TinySelect
                className="w-full"
                value={subModal.row.category_id || ""}
                onChange={(e) =>
                  setSubModal((m) => ({ ...m, row: { ...m.row, category_id: e.target.value } }))
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Name" required>
              <TinyInput
                className="w-full"
                value={subModal.row.name || ""}
                onChange={(e) => setSubModal((m) => ({ ...m, row: { ...m.row, name: e.target.value } }))}
              />
            </FormField>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={subModal.row.is_active !== false}
                onChange={(e) =>
                  setSubModal((m) => ({ ...m, row: { ...m.row, is_active: e.target.checked } }))
                }
              />
              Active
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={slaModal.open}
        title={slaModal.row?.id ? "Edit SLA rule" : "New SLA rule"}
        onClose={() => setSlaModal({ open: false, row: null })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setSlaModal({ open: false, row: null })}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={async () => {
                try {
                  await upsertSlaRule(slaModal.row);
                  toast.success("SLA rule saved");
                  setSlaModal({ open: false, row: null });
                  load();
                } catch (err) {
                  toast.error(err.message || "Save failed");
                }
              }}
            >
              Save
            </PrimaryButton>
          </div>
        }
      >
        {slaModal.row ? (
          <div className="space-y-3">
            <FormField label="Name" required>
              <TinyInput
                className="w-full"
                value={slaModal.row.name || ""}
                onChange={(e) => setSlaModal((m) => ({ ...m, row: { ...m.row, name: e.target.value } }))}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Impact">
                <TinySelect
                  className="w-full"
                  value={slaModal.row.impact || ""}
                  onChange={(e) =>
                    setSlaModal((m) => ({ ...m, row: { ...m.row, impact: e.target.value } }))
                  }
                >
                  <option value="">Any</option>
                  {IMPACT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </TinySelect>
              </FormField>
              <FormField label="Priority">
                <TinySelect
                  className="w-full"
                  value={slaModal.row.priority || ""}
                  onChange={(e) =>
                    setSlaModal((m) => ({ ...m, row: { ...m.row, priority: e.target.value } }))
                  }
                >
                  <option value="">Any</option>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </TinySelect>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="First response (minutes)">
                <TinyInput
                  type="number"
                  className="w-full"
                  value={slaModal.row.first_response_mins ?? 0}
                  onChange={(e) =>
                    setSlaModal((m) => ({
                      ...m,
                      row: { ...m.row, first_response_mins: Number(e.target.value) },
                    }))
                  }
                />
              </FormField>
              <FormField label="Resolution (minutes)">
                <TinyInput
                  type="number"
                  className="w-full"
                  value={slaModal.row.resolution_mins ?? 0}
                  onChange={(e) =>
                    setSlaModal((m) => ({
                      ...m,
                      row: { ...m.row, resolution_mins: Number(e.target.value) },
                    }))
                  }
                />
              </FormField>
            </div>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={slaModal.row.is_active !== false}
                onChange={(e) =>
                  setSlaModal((m) => ({ ...m, row: { ...m.row, is_active: e.target.checked } }))
                }
              />
              Active
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={assigneeModal.open}
        title={assigneeModal.row?.id ? "Edit assignee" : "New assignee"}
        onClose={() => setAssigneeModal({ open: false, row: null, pick: [] })}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setAssigneeModal({ open: false, row: null, pick: [] })}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={async () => {
                try {
                  const row = assigneeModal.row || {};
                  await upsertAssigneeMaster(row);
                  toast.success("Assignee saved");
                  setAssigneeModal({ open: false, row: null, pick: [] });
                  load();
                } catch (err) {
                  toast.error(err.message || "Save failed");
                }
              }}
            >
              Save
            </PrimaryButton>
          </div>
        }
      >
        {assigneeModal.row ? (
          <div className="space-y-3">
            {!assigneeModal.row.id ? (
              <FormField
                label="Employee"
                required
                hint="Type a name and select from Employee Master."
              >
                <CcEmployeePicker
                  value={assigneeModal.pick || []}
                  onChange={(people) => {
                    const person = people?.[people.length - 1] || null;
                    setAssigneeModal((m) => ({
                      ...m,
                      pick: person ? [person] : [],
                      row: {
                        ...m.row,
                        profile_id: person?.profileId || "",
                        display_name: person?.fullName || m.row.display_name || "",
                        employee_code: person?.employeeCode || "",
                      },
                    }));
                  }}
                />
              </FormField>
            ) : null}
            <FormField label="Display name" required>
              <TinyInput
                className="w-full"
                value={assigneeModal.row.display_name || ""}
                onChange={(e) =>
                  setAssigneeModal((m) => ({
                    ...m,
                    row: { ...m.row, display_name: e.target.value },
                  }))
                }
              />
            </FormField>
            <FormField label="Employee code">
              <TinyInput
                className="w-full"
                value={assigneeModal.row.employee_code || ""}
                onChange={(e) =>
                  setAssigneeModal((m) => ({
                    ...m,
                    row: { ...m.row, employee_code: e.target.value },
                  }))
                }
              />
            </FormField>
            <FormField label="Sort order">
              <TinyInput
                type="number"
                className="w-full"
                value={assigneeModal.row.sort_order ?? 0}
                onChange={(e) =>
                  setAssigneeModal((m) => ({
                    ...m,
                    row: { ...m.row, sort_order: Number(e.target.value) },
                  }))
                }
              />
            </FormField>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={assigneeModal.row.is_active !== false}
                onChange={(e) =>
                  setAssigneeModal((m) => ({
                    ...m,
                    row: { ...m.row, is_active: e.target.checked },
                  }))
                }
              />
              Active
            </label>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
