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
import { canAdmin } from "./itSupportAccess";
import { IMPACT_OPTIONS, PRIORITIES } from "./itSupportConstants";
import {
  listCategories,
  listSlaRules,
  upsertCategory,
  upsertSlaRule,
  upsertSubcategory,
} from "./itSupportApi";

export default function MastersPage() {
  const { userProfile } = useAuth();
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [slaRules, setSlaRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catModal, setCatModal] = useState({ open: false, row: null });
  const [subModal, setSubModal] = useState({ open: false, row: null });
  const [slaModal, setSlaModal] = useState({ open: false, row: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cats, rules] = await Promise.all([listCategories(), listSlaRules()]);
      setCategories(cats.categories || []);
      setSubcategories(cats.subcategories || []);
      setSlaRules(rules);
    } catch (err) {
      setError(err.message || "Could not load masters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!canAdmin(userProfile)) {
    return <EmptyState title="No access" message="Masters are available to IT Support admins only." />;
  }

  const catColumns = [
    { key: "name", label: "Name" },
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

  return (
    <>
      <PageTaskHeader
        title="Masters"
        subtitle="Categories and SLA rules used when tickets are raised."
      />

      <div className="flex gap-2 mb-2">
        {[
          { id: "categories", label: "Categories" },
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
                  setCatModal({ open: true, row: { name: "", description: "", is_active: true, sort_order: 0 } })
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
    </>
  );
}
