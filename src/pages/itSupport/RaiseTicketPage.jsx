import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Paperclip } from "lucide-react";
import {
  EmptyState,
  FormField,
  InlineAlert,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../lib/toast";
import { canRaise } from "./itSupportAccess";
import { IMPACT_OPTIONS } from "./itSupportConstants";
import { createTicket, IT_SUPPORT_MAX_FILE_BYTES, listCategories } from "./itSupportApi";
import RichTextField from "./components/RichTextField";

const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|xlsx?|docx?)$/i;

export default function RaiseTicketPage() {
  const { user, userProfile } = useAuth();
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [impact, setImpact] = useState("only_me");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { categories: cats, subcategories: subs } = await listCategories();
        if (!cancelled) {
          setCategories((cats || []).filter((c) => c.is_active !== false));
          setSubcategories((subs || []).filter((s) => s.is_active !== false));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load categories.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSubs = useMemo(
    () => subcategories.filter((s) => String(s.category_id) === String(categoryId)),
    [subcategories, categoryId]
  );

  if (!canRaise(userProfile)) {
    return (
      <EmptyState
        title="No access"
        message="You do not have permission to raise IT support tickets."
      />
    );
  }

  if (created) {
    return (
      <SectionCard title="Ticket submitted">
        <div className="text-center py-8 px-4">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-3" />
          <p className="text-sm text-ink-secondary">Your ticket has been created</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-strong">
            {created.ticket_no || created.id}
          </p>
          <p className="mt-2 text-xs text-ink-muted max-w-md mx-auto">
            Keep this number for your records. The IT team will pick it up shortly.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to={`/app/it-support/tickets/${created.id}`}>
              <PrimaryButton>View ticket</PrimaryButton>
            </Link>
            <SecondaryButton
              onClick={() => {
                setCreated(null);
                setTitle("");
                setDescription("");
                setCategoryId("");
                setSubcategoryId("");
                setImpact("only_me");
                setFiles([]);
              }}
            >
              Raise another
            </SecondaryButton>
            <Link to="/app/it-support/my">
              <SecondaryButton>My tickets</SecondaryButton>
            </Link>
          </div>
        </div>
      </SectionCard>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Please enter a short title.");
      return;
    }
    if (!description || description === "<br>" || description === "<div><br></div>") {
      setError("Please describe the issue.");
      return;
    }
    if (!categoryId) {
      setError("Please choose a category.");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await createTicket({
        title,
        description,
        categoryId,
        subcategoryId: subcategoryId || null,
        impact,
        requesterId: user?.id,
        requesterEmployeeCode: userProfile?.employee_code || null,
        requesterDepartment: userProfile?.team || null,
        files,
      });
      setCreated(ticket);
      if (ticket?._attachmentWarnings?.length) {
        toast.error(
          `Ticket created, but some files did not reach Cloudflare: ${ticket._attachmentWarnings.join("; ")}`
        );
      } else {
        toast.success("Ticket submitted.");
      }
    } catch (err) {
      setError(err.message || "Could not submit the ticket.");
      toast.error(err.message || "Could not submit the ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTaskHeader
        title="Raise a ticket"
        subtitle="Tell us what you need help with. The IT team will respond as soon as they can."
      />
      {error ? (
        <InlineAlert tone="error" onDismiss={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}
      <SectionCard title="New request">
        <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
          <FormField label="Title" required>
            <TinyInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cannot connect to VPN"
              className="w-full"
              maxLength={200}
            />
          </FormField>

          <FormField label="Description" required hint="Include steps to reproduce and any error messages.">
            <RichTextField value={description} onChange={setDescription} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Category" required>
              <TinySelect
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId("");
                }}
                className="w-full"
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </TinySelect>
            </FormField>
            <FormField label="Subcategory">
              <TinySelect
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full"
                disabled={!categoryId}
              >
                <option value="">Optional…</option>
                {filteredSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </TinySelect>
            </FormField>
          </div>

          <FormField label="Who is affected?" required>
            <TinySelect value={impact} onChange={(e) => setImpact(e.target.value)} className="w-full max-w-xs">
              {IMPACT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </FormField>

          <FormField
            label="Attachments"
            hint="Stored on Cloudflare (R2). Max 10 MB each. Allowed: pdf, jpg, png, webp, xls, xlsx, doc, docx."
          >
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-control border border-border bg-surface text-xs text-ink-secondary cursor-pointer hover:bg-surface-sunken">
              <Paperclip className="w-3.5 h-3.5" />
              Add files
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  const ok = [];
                  const bad = [];
                  for (const f of picked) {
                    if (!ALLOWED_EXT.test(f.name)) {
                      bad.push(`${f.name}: file type not allowed`);
                      continue;
                    }
                    if (f.size > IT_SUPPORT_MAX_FILE_BYTES) {
                      bad.push(`${f.name}: over 10 MB`);
                      continue;
                    }
                    ok.push(f);
                  }
                  setFiles(ok);
                  if (bad.length) {
                    setError(bad.join(". "));
                    toast.error(bad[0]);
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {files.length > 0 ? (
              <ul className="mt-2 text-[11px] text-ink-muted space-y-0.5">
                {files.map((f) => (
                  <li key={f.name + f.size}>
                    {f.name} ({Math.round(f.size / 1024)} KB) → Cloudflare R2
                  </li>
                ))}
              </ul>
            ) : null}
          </FormField>

          <div className="pt-2">
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </PrimaryButton>
          </div>
        </form>
      </SectionCard>
    </>
  );
}
