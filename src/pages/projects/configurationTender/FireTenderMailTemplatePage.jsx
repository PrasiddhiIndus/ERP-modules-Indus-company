import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import FireTenderNavbar from "../FireTenderNavbar";

const FireTenderMailTemplatePage = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [editId, setEditId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "Quotation Template",
    subject: "",
    content: "",
  });

  // Load templates from database
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error("User error:", userError);
        alert("Authentication error. Please login again.");
        setLoading(false);
        return;
      }

      console.log("Current user ID:", user?.id);

      // Load ALL templates from quotation_templates table
      const { data, error } = await supabase
        .from("quotation_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Query error:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        alert("Error loading templates: " + error.message);
        throw error;
      }

      console.log("✅ Loaded templates from DB:", data);
      console.log("✅ Number of templates:", data?.length || 0);
      if (data && data.length > 0) {
        console.log("✅ Template types found:", data.map(t => t.type));
        console.log("✅ Template names:", data.map(t => t.name));
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
      type: "Quotation Template",
      subject: "",
      content: "",
    });
    setEditId(null);
    setIsViewMode(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from("quotation_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setTemplates(templates.filter((t) => t.id !== id));
      alert("✅ Template deleted successfully!");
      // Reload templates to ensure we have the latest data
      await loadTemplates();
    } catch (err) {
      console.error("Error deleting template:", err);
      alert("Failed to delete template: " + (err.message || err));
    }
  };

  const handleSave = async () => {
    if (!formData.name) return alert("Name is required");
    
    // Validate based on template type
    if (formData.type === "Quotation Template") {
      if (!formData.subject) return alert("Subject Header is required for Quotation Template");
      if (!formData.content) return alert("Quotation Body Text is required for Quotation Template");
    } else if (formData.type === "Terms & Condition") {
      if (!formData.content) return alert("Terms and Conditions content is required");
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
        const { data: updatedData, error } = await supabase
          .from("quotation_templates")
          .update({
            name: formData.name,
            type: formData.type,
            subject: formData.subject || null,
            content: formData.content,
            updated_at: new Date().toISOString(),
          })
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
        const { data, error } = await supabase
          .from("quotation_templates")
          .insert({
            name: formData.name,
            type: formData.type,
            subject: formData.subject || null,
            content: formData.content,
            user_id: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        setTemplates([data, ...templates]);
      }

      alert("✅ Template saved successfully!");
      resetForm();
      setIsFormOpen(false);
      // Reload templates to ensure we have the latest data
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
      <FireTenderNavbar />
      {!isFormOpen ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Quotation Templates</h2>
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
                            t.type === "Quotation Template" ? "bg-green-100 text-green-800" :
                            t.type === "Terms & Condition" ? "bg-orange-100 text-orange-800" :
                            t.type === "Fire Tender Email Templates" ? "bg-blue-100 text-blue-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {t.type || "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-2 border">{t.subject || "N/A"}</td>
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
              ? `View ${formData.type} Template`
              : editId
              ? `Edit ${formData.type} Template`
              : `New ${formData.type} Template`}
          </h3>
          
          {/* Template Type Indicator */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <span className="text-sm font-medium text-blue-800">
                Template Type: 
              </span>
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                {formData.type}
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
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value })
              }
              disabled={isViewMode}
              className="w-full border rounded px-3 py-2"
            >
              <option>Quotation Template</option>
              <option>Terms & Condition</option>
            </select>
          </div>

          {/* Quotation Template Fields */}
          {formData.type === "Quotation Template" && (
            <>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>Quotation Template:</strong> This template will be used to populate the Subject and Body fields in quotations.
                </p>
              </div>
              
              <div className="mb-4">
                <label className="block mb-1">Subject Header *</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  disabled={isViewMode}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter subject header for quotation"
                />
                <p className="text-xs text-gray-500 mt-1">This will populate the Subject field in quotations</p>
              </div>
              
              <div className="mb-4">
                <label className="block mb-1">Quotation Body Text *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  disabled={isViewMode}
                  rows={6}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter quotation body text content"
                />
                <p className="text-xs text-gray-500 mt-1">This will populate the Quotation Body Text field in quotations</p>
              </div>
            </>
          )}

          {/* Terms & Conditions Template Fields */}
          {formData.type === "Terms & Condition" && (
            <>
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  <strong>Terms & Conditions Template:</strong> This template will be used to populate the Terms and Conditions field in quotations.
                </p>
              </div>
              
              <div className="mb-4">
                <label className="block mb-1">Terms and Conditions *</label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
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

export default FireTenderMailTemplatePage;
