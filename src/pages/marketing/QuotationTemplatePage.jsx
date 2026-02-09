import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { ArrowLeft } from "lucide-react";

const QuotationTemplatePage = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editId, setEditId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    template_type: "Subject",
    subject_title: "",
    subject_content: "",
    terms_and_conditions: "",
  });

  // Load templates from database
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error("User error:", userError);
        alert("Authentication error. Please login again.");
        setLoading(false);
        return;
      }

      // Load templates from marketing_mail_templates table
      const { data, error } = await supabase
        .from("marketing_mail_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Query error:", error);
        if (error.message.includes("marketing_mail_templates") && error.message.includes("schema cache")) {
          alert("⚠️ Table 'marketing_mail_templates' not found!\n\nPlease run the SQL migration file:\n'marketing_mail_templates_schema.sql'\n\nin your Supabase SQL Editor to create the table.");
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
    setFormData({
      name: "",
      template_type: "Subject",
      subject_title: "",
      subject_content: "",
      terms_and_conditions: "",
    });
    setEditId(null);
    setIsViewMode(false);
  };

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

  const handleSave = async () => {
    if (!formData.name) return alert("Name is required");
    
    // Validate based on template type
    if (formData.template_type === "Subject") {
      if (!formData.subject_title) return alert("Subject Title is required for Subject Template");
      if (!formData.subject_content) return alert("Subject Content is required for Subject Template");
    } else if (formData.template_type === "Terms & Condition") {
      if (!formData.terms_and_conditions) return alert("Terms and Conditions content is required");
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

      if (editId) {
        // Update existing template
        const updateData = {
          name: formData.name,
          template_type: formData.template_type,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        };

        if (formData.template_type === "Subject") {
          updateData.subject_title = formData.subject_title || null;
          updateData.subject_content = formData.subject_content || null;
          updateData.terms_and_conditions = null;
        } else {
          updateData.terms_and_conditions = formData.terms_and_conditions || null;
          updateData.subject_title = null;
          updateData.subject_content = null;
        }

        const { data: updatedData, error } = await supabase
          .from("marketing_mail_templates")
          .update(updateData)
          .eq("id", editId)
          .select()
          .single();

        if (error) throw error;

        setTemplates(
          templates.map((t) =>
            t.id === editId ? updatedData : t
          )
        );
      } else {
        // Add new template
        const insertData = {
          name: formData.name,
          template_type: formData.template_type,
          created_by: user.id,
          updated_by: user.id,
        };

        if (formData.template_type === "Subject") {
          insertData.subject_title = formData.subject_title || null;
          insertData.subject_content = formData.subject_content || null;
        } else {
          insertData.terms_and_conditions = formData.terms_and_conditions || null;
        }

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
    setFormData(template);
    setEditId(template.id);
    setIsFormOpen(true);
    setIsViewMode(false);
  };

  const handleView = (template) => {
    setFormData(template);
    setIsFormOpen(true);
    setIsViewMode(true);
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
                    <th className="px-4 py-2 border">Subject</th>
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
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            t.template_type === "Subject" ? "bg-green-100 text-green-800" :
                            t.template_type === "Terms & Condition" ? "bg-orange-100 text-orange-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {t.template_type || "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-2 border">{t.subject_title || t.terms_and_conditions?.substring(0, 50) || "N/A"}</td>
                        <td className="px-4 py-2 border">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleView(t)}
                              className="text-blue-600 hover:underline text-sm"
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
          
          {/* Template Type Indicator */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <span className="text-sm font-medium text-blue-800">
                Template Type: 
              </span>
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                {formData.template_type}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
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
                  ...formData, 
                  template_type: e.target.value,
                  subject_title: "",
                  subject_content: "",
                  terms_and_conditions: ""
                })
              }
              disabled={isViewMode}
              className="w-full border rounded px-3 py-2"
            >
              <option value="Subject">Subject</option>
              <option value="Terms & Condition">Terms & Condition</option>
            </select>
          </div>

          {/* Subject Template Fields */}
          {formData.template_type === "Subject" && (
            <>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Subject Template:</strong> This template will be used to populate the Subject Title and Subject Content fields in internal quotations.
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
                <p className="text-xs text-gray-500 mt-1">This will populate the Subject Title field in quotations</p>
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
                <p className="text-xs text-gray-500 mt-1">This will populate the Subject (description) field in quotations</p>
              </div>
            </>
          )}

          {/* Terms & Conditions Template Fields */}
          {formData.template_type === "Terms & Condition" && (
            <>
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  <strong>Terms & Conditions Template:</strong> This template will be used to populate the Terms and Conditions field in quotations.
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
                <p className="text-xs text-gray-500 mt-1">This will populate the Terms and Conditions field in quotations</p>
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

