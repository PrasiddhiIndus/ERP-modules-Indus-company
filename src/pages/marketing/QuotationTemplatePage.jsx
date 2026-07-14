import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const TEMPLATE_TYPES = ["Subject", "Terms & Condition", "Annexure"];

const emptyForm = () => ({
  name: "",
  template_type: "Subject",
  subject_title: "",
  subject_content: "",
  terms_and_conditions: "",
  annexure_description: "",
});

const QuotationTemplatePage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editId, setEditId] = useState(null);

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("User error:", userError);
        alert("Authentication error. Please login again.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("marketing_mail_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Query error:", error);
        if (
          error.message.includes("marketing_mail_templates") &&
          error.message.includes("schema cache")
        ) {
          alert(
            "⚠️ Table 'marketing_mail_templates' not found!\n\nPlease run the SQL migration file:\n'marketing_mail_templates_schema.sql'\n\nin your Supabase SQL Editor to create the table."
          );
        } else {
          alert("Error loading templates: " + error.message);
        }
        throw error;
      }

      setTemplates(data || []);
    } catch (err) {
      console.error("Error loading templates:", err);
      alert("Failed to load templates: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditId(null);
    setIsViewMode(false);
  };

  const toFormState = (template) => ({
    name: template.name || "",
    template_type: template.template_type || "Subject",
    subject_title: template.subject_title || "",
    subject_content: template.subject_content || "",
    terms_and_conditions: template.terms_and_conditions || "",
    // Annexure description is stored in subject_content
    annexure_description:
      template.template_type === "Annexure"
        ? template.subject_content || template.terms_and_conditions || ""
        : "",
  });

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from("marketing_mail_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setTemplates(templates.filter((t) => t.id !== id));
      alert("✅ Template deleted successfully!");
      await loadTemplates();
    } catch (err) {
      console.error("Error deleting template:", err);
      alert("Failed to delete template: " + (err.message || err));
    }
  };

  const buildPayloadFields = () => {
    if (formData.template_type === "Subject") {
      return {
        subject_title: formData.subject_title || null,
        subject_content: formData.subject_content || null,
        terms_and_conditions: null,
      };
    }
    if (formData.template_type === "Terms & Condition") {
      return {
        subject_title: null,
        subject_content: null,
        terms_and_conditions: formData.terms_and_conditions || null,
      };
    }
    // Annexure — single description (stored in subject_content)
    return {
      subject_title: null,
      subject_content: formData.annexure_description || null,
      terms_and_conditions: null,
    };
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Name is required");

    if (formData.template_type === "Subject") {
      if (!formData.subject_title) return alert("Subject Title is required for Subject Template");
      if (!formData.subject_content) return alert("Subject Content is required for Subject Template");
    } else if (formData.template_type === "Terms & Condition") {
      if (!formData.terms_and_conditions) return alert("Terms and Conditions content is required");
    } else if (formData.template_type === "Annexure") {
      if (!formData.annexure_description?.trim()) {
        return alert("Description is required for Annexure Template");
      }
    }

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        alert("User not authenticated. Please login.");
        return;
      }

      const typeFields = buildPayloadFields();

      if (editId) {
        const updateData = {
          name: formData.name,
          template_type: formData.template_type,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
          ...typeFields,
        };

        const { data: updatedData, error } = await supabase
          .from("marketing_mail_templates")
          .update(updateData)
          .eq("id", editId)
          .select()
          .single();

        if (error) throw error;

        setTemplates(templates.map((t) => (t.id === editId ? updatedData : t)));
      } else {
        const insertData = {
          name: formData.name,
          template_type: formData.template_type,
          created_by: user.id,
          updated_by: user.id,
          ...typeFields,
        };

        const { data, error } = await supabase
          .from("marketing_mail_templates")
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;

        setTemplates([data, ...templates]);
      }

      alert("✅ Template saved successfully!");
      resetForm();
      setIsFormOpen(false);
      await loadTemplates();
    } catch (err) {
      console.error("Error saving template:", err);
      alert("Failed to save template: " + (err.message || err));
    }
  };

  const handleEdit = (template) => {
    setFormData(toFormState(template));
    setEditId(template.id);
    setIsFormOpen(true);
    setIsViewMode(false);
  };

  const handleView = (template) => {
    setFormData(toFormState(template));
    setIsFormOpen(true);
    setIsViewMode(true);
  };

  const previewText = (t) => {
    if (t.template_type === "Subject") return t.subject_title || "N/A";
    if (t.template_type === "Terms & Condition") {
      return t.terms_and_conditions?.substring(0, 50) || "N/A";
    }
    if (t.template_type === "Annexure") {
      return (
        t.subject_content?.substring(0, 80) ||
        t.terms_and_conditions?.substring(0, 80) ||
        "N/A"
      );
    }
    return "N/A";
  };

  const typeBadgeClass = (type) => {
    if (type === "Subject") return "bg-green-100 text-green-800";
    if (type === "Terms & Condition") return "bg-orange-100 text-orange-800";
    if (type === "Annexure") return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="p-6">
      {!isFormOpen ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Marketing Mail Templates</h2>
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="bg-purple-600 text-white px-4 py-2 rounded"
            >
              New
            </button>
          </div>

          <div className="bg-white shadow rounded-lg">
            {loading ? (
              <div className="p-6 text-center">
                <p className="text-gray-500">Loading templates...</p>
              </div>
            ) : (
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="px-4 py-2 border">Name</th>
                    <th className="px-4 py-2 border">Template Type</th>
                    <th className="px-4 py-2 border">Preview</th>
                    <th className="px-4 py-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                        No templates found. Create your first template!
                      </td>
                    </tr>
                  ) : (
                    templates.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 border">{t.name}</td>
                        <td className="px-4 py-2 border">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${typeBadgeClass(
                              t.template_type
                            )}`}
                          >
                            {t.template_type || "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-2 border">{previewText(t)}</td>
                        <td className="px-4 py-2 border">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleView(t)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleEdit(t)}
                              className="text-green-600 hover:underline text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">
            {isViewMode
              ? `View ${formData.template_type} Template`
              : editId
                ? `Edit ${formData.template_type} Template`
                : `New ${formData.template_type} Template`}
          </h3>

          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <span className="text-sm font-medium text-red-800">Template Type:</span>
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                {formData.template_type}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isViewMode}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="mb-4">
            <label className="block mb-1">Template Type</label>
            <select
              value={formData.template_type}
              onChange={(e) =>
                setFormData({
                  ...emptyForm(),
                  name: formData.name,
                  template_type: e.target.value,
                })
              }
              disabled={isViewMode}
              className="w-full border rounded px-3 py-2"
            >
              {TEMPLATE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {formData.template_type === "Subject" && (
            <>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Subject Template:</strong> Used for Subject Title and Subject Content
                  on internal quotations.
                </p>
              </div>

              <div className="mb-4">
                <label className="block mb-1">Subject Title *</label>
                <input
                  type="text"
                  value={formData.subject_title}
                  onChange={(e) =>
                    setFormData({ ...formData, subject_title: e.target.value })
                  }
                  disabled={isViewMode}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter subject title/header"
                />
              </div>

              <div className="mb-4">
                <label className="block mb-1">Subject Content *</label>
                <textarea
                  value={formData.subject_content}
                  onChange={(e) =>
                    setFormData({ ...formData, subject_content: e.target.value })
                  }
                  disabled={isViewMode}
                  rows={6}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter subject content/description"
                />
              </div>
            </>
          )}

          {formData.template_type === "Terms & Condition" && (
            <>
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  <strong>Terms & Conditions Template:</strong> Used for Terms and Conditions on
                  quotations.
                </p>
              </div>

              <div className="mb-4">
                <label className="block mb-1">Terms and Conditions *</label>
                <textarea
                  value={formData.terms_and_conditions}
                  onChange={(e) =>
                    setFormData({ ...formData, terms_and_conditions: e.target.value })
                  }
                  disabled={isViewMode}
                  rows={8}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter terms and conditions content"
                />
              </div>
            </>
          )}

          {formData.template_type === "Annexure" && (
            <>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Annexure Template:</strong> Only a description line is required. Create,
                  edit, and delete annexure text the same way as other templates.
                </p>
              </div>

              <div className="mb-4">
                <label className="block mb-1">Description *</label>
                <textarea
                  value={formData.annexure_description}
                  onChange={(e) =>
                    setFormData({ ...formData, annexure_description: e.target.value })
                  }
                  disabled={isViewMode}
                  rows={6}
                  className="w-full border rounded px-3 py-2"
                  placeholder={'ANNEXURE "A" - Civil Work (SOW)\n1. First point description...\n2. Second point description...\n\nANNEXURE "B" - Technical Specification\n1. Spec details...'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only the description is saved for this template type.
                </p>
              </div>
            </>
          )}

          <div className="flex gap-4">
            {!isViewMode && (
              <button
                onClick={handleSave}
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                Save
              </button>
            )}
            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(false);
              }}
              className="bg-gray-400 text-white px-4 py-2 rounded"
            >
              {isViewMode ? "Back" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationTemplatePage;
