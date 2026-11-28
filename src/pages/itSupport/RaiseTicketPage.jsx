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
import { useProbationReviewsAccess } from "../adminOperations/probationReviews/probationAccess";
import { toast } from "../../lib/toast";
import { resolveSupportTypeAccess } from "./itSupportAccess";
import { IMPACT_OPTIONS, IT_SUPPORT_BASE } from "./itSupportConstants";
import { createTicket, IT_SUPPORT_MAX_FILE_BYTES, listCategories } from "./itSupportApi";
import {
  findModuleOption,
  findSubmoduleOption,
  getItSupportModuleOptionsForUser,
} from "./itSupportModuleOptions";
import { useSupportType } from "./SupportTypeContext";
import CcEmployeePicker from "./components/CcEmployeePicker";
import RichTextField from "./components/RichTextField";
import TicketFileList from "./components/TicketFileList";

const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|xlsx?|docx?)$/i;

const fieldClass = "w-full";

export default function RaiseTicketPage() {
  const { user, userProfile, accessibleModules, subModulePaths } = useAuth();
  const { supportType, supportTypeLabel } = useSupportType();
  const isHardware = supportType === "hardware";
  const typeAccess = resolveSupportTypeAccess(userProfile, supportType);
  const { canAccess: canSeeProbationReviews } = useProbationReviewsAccess();
  const assignmentKey = useMemo(
    () =>
      JSON.stringify({
        team: userProfile?.team ?? null,
        role: userProfile?.role ?? null,
        modules: userProfile?.allowed_modules ?? [],
        subs: userProfile?.allowed_sub_modules ?? [],
        access: accessibleModules ? [...accessibleModules].sort() : [],
        paths: subModulePaths ? [...subModulePaths].sort() : [],
        probation: Boolean(canSeeProbationReviews),
      }),
    [
      userProfile?.team,
      userProfile?.role,
      userProfile?.allowed_modules,
      userProfile?.allowed_sub_modules,
      accessibleModules,
      subModulePaths,
      canSeeProbationReviews,
    ]
  );
  const moduleOptions = useMemo(
    () =>
      getItSupportModuleOptionsForUser(
        userProfile,
        accessibleModules,
        {
          ...(user?.user_metadata || {}),
          email: userProfile?.email || user?.email || "",
        },
        subModulePaths,
        { probationReviews: Boolean(canSeeProbationReviews) }
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignmentKey, userProfile, accessibleModules, subModulePaths, user?.user_metadata, user?.email, canSeeProbationReviews]
  );
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [erpModuleKey, setErpModuleKey] = useState("");
  const [erpSubmoduleKey, setErpSubmoduleKey] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [impact, setImpact] = useState("only_me");
  const [ccPeople, setCcPeople] = useState([]);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setCategoryId("");
    setCreated(null);
    (async () => {
      try {
        const { categories: cats } = await listCategories({
          forRaise: true,
          supportType,
        });
        if (!cancelled) {
          setCategories((cats || []).filter((c) => c.is_active !== false));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load issue types.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supportType]);

  useEffect(() => {
    if (erpModuleKey && !moduleOptions.some((m) => m.value === erpModuleKey)) {
      setErpModuleKey("");
      setErpSubmoduleKey("");
      return;
    }
    const mod = findModuleOption(erpModuleKey, moduleOptions);
    const subs = mod?.subModules || [];
    if (erpSubmoduleKey && !subs.some((s) => s.value === erpSubmoduleKey)) {
      setErpSubmoduleKey("");
    }
  }, [moduleOptions, erpModuleKey, erpSubmoduleKey]);

  const selectedModule = useMemo(
    () => findModuleOption(erpModuleKey, moduleOptions),
    [erpModuleKey, moduleOptions]
  );
  const erpSubOptions = selectedModule?.subModules || [];
  const submoduleRequired = erpSubOptions.length > 0;

  const resetForm = () => {
    setCreated(null);
    setTitle("");
    setDescription("");
    setErpModuleKey("");
    setErpSubmoduleKey("");
    setCategoryId("");
    setImpact("only_me");
    setCcPeople([]);
    setFiles([]);
    setError("");
  };

  if (!typeAccess.canRaise) {
    return (
      <EmptyState
        title="No access"
        message={
          isHardware
            ? "You do not have permission to raise Hardware Support tickets."
            : "You do not have permission to raise Software Support tickets."
        }
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
            {ccPeople.length
              ? ` People on CC can follow it from My Tickets.`
              : ""}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to={`${IT_SUPPORT_BASE}/tickets/${created.id}`}>
              <PrimaryButton>View ticket</PrimaryButton>
            </Link>
            <SecondaryButton onClick={resetForm}>Raise another</SecondaryButton>
            <Link to={`${IT_SUPPORT_BASE}/my`}>
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
    if (!isHardware) {
      if (!erpModuleKey) {
        setError("Please choose which module the issue is in.");
        return;
      }
      if (submoduleRequired && !erpSubmoduleKey) {
        setError("Please choose the sub-module where the issue happened.");
        return;
      }
    }
    if (!categoryId) {
      setError("Please choose an issue type.");
      return;
    }
    const modOpt = isHardware
      ? { label: "Hardware" }
      : findModuleOption(erpModuleKey, moduleOptions);
    const subOpt = isHardware
      ? null
      : findSubmoduleOption(erpModuleKey, erpSubmoduleKey, moduleOptions);
    setSubmitting(true);
    try {
      const ticket = await createTicket({
        title,
        description,
        categoryId,
        subcategoryId: null,
        impact,
        supportType,
        erpModuleKey: isHardware ? "hardware" : erpModuleKey,
        erpModuleLabel: isHardware ? "Hardware" : modOpt?.label || erpModuleKey,
        erpSubmoduleKey: isHardware ? null : erpSubmoduleKey || null,
        erpSubmoduleLabel: isHardware ? null : subOpt?.label || null,
        ccUserIds: ccPeople.map((p) => p.profileId),
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
    <div className="w-full min-w-0">
      <PageTaskHeader
        className="mb-3"
        title={`Raise a ${isHardware ? "hardware" : "software"} ticket`}
        subtitle={
          isHardware
            ? "Laptops, desktops, printers, networking, peripherals and repairs."
            : "ERP, Indus One, application bugs, login issues, data errors and related software requests."
        }
      />
      {error ? (
        <div className="mb-3">
          <InlineAlert tone="error" onDismiss={() => setError("")}>
            {error}
          </InlineAlert>
        </div>
      ) : null}
      <SectionCard title="New request" className="w-full">
        <form onSubmit={onSubmit} className="w-full min-w-0 space-y-4">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 lg:grid-cols-12">
            <div className="lg:col-span-12">
              <FormField label="Title" required>
                <TinyInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cannot open Attendance register"
                  className={fieldClass}
                  maxLength={200}
                />
              </FormField>
            </div>

            <div className="lg:col-span-12">
              <FormField
                label="Description"
                required
                hint="Steps to reproduce and any error messages."
                htmlFor="it-raise-description"
              >
                <RichTextField
                  id="it-raise-description"
                  value={description}
                  onChange={setDescription}
                  className="w-full"
                />
              </FormField>
            </div>

            {!isHardware ? (
              <>
                <div className="lg:col-span-6 min-w-0">
                  <FormField label="Module" required>
                    <TinySelect
                      value={erpModuleKey}
                      onChange={(e) => {
                        setErpModuleKey(e.target.value);
                        setErpSubmoduleKey("");
                      }}
                      className={fieldClass}
                    >
                      <option value="">Select…</option>
                      {moduleOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </TinySelect>
                  </FormField>
                </div>
                <div className="lg:col-span-6 min-w-0">
                  <FormField
                    label="Sub Module"
                    required={submoduleRequired}
                    hint={
                      !erpModuleKey
                        ? "Select a module first."
                        : submoduleRequired
                          ? "Same labels as the sidebar."
                          : "Not needed for this module."
                    }
                  >
                    <TinySelect
                      value={erpSubmoduleKey}
                      onChange={(e) => setErpSubmoduleKey(e.target.value)}
                      className={fieldClass}
                      disabled={!erpModuleKey || !submoduleRequired}
                    >
                      <option value="">
                        {!erpModuleKey ? "Select a module first…" : submoduleRequired ? "Select…" : "—"}
                      </option>
                      {erpSubOptions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </TinySelect>
                  </FormField>
                </div>
              </>
            ) : null}

            <div className="lg:col-span-6 min-w-0">
              <FormField
                label="Issue type"
                required
                hint={`${supportTypeLabel} categories only.`}
              >
                <TinySelect
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </TinySelect>
              </FormField>
            </div>
            <div className="lg:col-span-6 min-w-0">
              <FormField label="Who is affected?" required>
                <TinySelect
                  value={impact}
                  onChange={(e) => setImpact(e.target.value)}
                  className={fieldClass}
                >
                  {IMPACT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </TinySelect>
              </FormField>
            </div>

            <div className="lg:col-span-8 min-w-0">
              <FormField
                label="CC"
                hint="Type a name, then select from Employee Master. They see this ticket under My Tickets."
                htmlFor="it-raise-cc"
              >
                <CcEmployeePicker value={ccPeople} onChange={setCcPeople} disabled={submitting} />
              </FormField>
            </div>
            <div className="lg:col-span-4 min-w-0">
              <FormField
                label="Attachments"
                hint="Max 10 MB each · pdf, jpg, png, webp, xls, xlsx, doc, docx"
              >
                <div className="flex flex-col gap-2">
                  <label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 text-xs text-ink-secondary hover:bg-surface-sunken">
                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
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
                        setFiles((prev) => {
                          const keys = new Set(prev.map((x) => `${x.name}|${x.size}|${x.lastModified}`));
                          const next = [...prev];
                          for (const f of ok) {
                            const k = `${f.name}|${f.size}|${f.lastModified}`;
                            if (!keys.has(k)) next.push(f);
                          }
                          return next;
                        });
                        if (bad.length) {
                          setError(bad.join(". "));
                          toast.error(bad[0]);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <TicketFileList
                    mode="pending"
                    files={files}
                    disabled={submitting}
                    onRemovePending={(index) =>
                      setFiles((prev) => prev.filter((_, i) => i !== index))
                    }
                  />
                </div>
              </FormField>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-end border-t border-border pt-3">
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </PrimaryButton>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
