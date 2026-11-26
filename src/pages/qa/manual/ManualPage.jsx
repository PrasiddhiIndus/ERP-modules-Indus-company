import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { BookOpen, Link2, Printer, Search } from "lucide-react";
import {
  InlineAlert,
  PageTaskHeader,
  PrimaryButton,
  SecondaryButton,
  TinyInput,
  TinySelect,
} from "../../../components/erpUi";
import { QA_ROLES } from "../qaConstants";
import { loadManualSections } from "./loadManual";
import { ManualExample } from "./ManualExamples";
import { plainTextFromParts } from "./parseManualMd";

const ROLE_OPTIONS = [{ value: "everyone", label: "Everyone" }, ...QA_ROLES.filter((r) => r.value !== "viewer")];

const YOUR_DAY = {
  tester: "Write tests, run them, log bugs, and retest fixes.",
  qa_lead: "Triage requests and bugs, approve tests, watch the release gate.",
  developer: "Fix bugs, set Fixed in build, attach unit evidence.",
  product_owner: "Write clear acceptance notes and sign when ready.",
  business_owner: "Try the work in UAT and sign when you are happy.",
  everyone: "Read Big words, the five stations, then Your day for your job.",
};

const SHOW_ME_LABELS = {
  "/app/qa": "Go to Dashboard",
  "/app/qa/requests": "Go to QA requests",
  "/app/qa/cases": "Go to Test cases",
  "/app/qa/cases/new": "Go to New case",
  "/app/qa/execution": "Go to Test execution",
  "/app/qa/defects": "Go to Defects",
  "/app/qa/traceability": "Go to Traceability",
  "/app/qa/release-gate": "Go to Release gate",
  "/app/qa/audit": "Go to Audit trail",
};

function highlightParts(parts, query) {
  if (!query) return parts;
  const q = query.toLowerCase();
  const out = [];
  for (const p of parts || []) {
    const text = p.value || "";
    const lower = text.toLowerCase();
    let start = 0;
    let idx = lower.indexOf(q, start);
    if (idx < 0) {
      out.push(p);
      continue;
    }
    while (idx >= 0) {
      if (idx > start) out.push({ type: p.type, value: text.slice(start, idx) });
      out.push({ type: "mark", value: text.slice(idx, idx + q.length) });
      start = idx + q.length;
      idx = lower.indexOf(q, start);
    }
    if (start < text.length) out.push({ type: p.type, value: text.slice(start) });
  }
  return out;
}

function InlineParts({ parts, query }) {
  return highlightParts(parts, query).map((p, i) => {
    if (p.type === "mark") {
      return (
        <mark key={i} className="bg-warning-soft text-ink rounded px-0.5">
          {p.value}
        </mark>
      );
    }
    if (p.type === "strong") return <strong key={i}>{p.value}</strong>;
    if (p.type === "em") return <em key={i}>{p.value}</em>;
    if (p.type === "code") {
      return (
        <code key={i} className="text-[0.85em] px-1 py-0.5 rounded bg-surface-sunken border border-border">
          {p.value}
        </code>
      );
    }
    return <React.Fragment key={i}>{p.value}</React.Fragment>;
  });
}

function Callout({ kind, parts, query }) {
  const tone = kind === "warning" ? "warning" : kind === "neutral" ? "info" : "info";
  return (
    <InlineAlert tone={tone} className="my-3 text-sm">
      <InlineParts parts={parts} query={query} />
    </InlineAlert>
  );
}

function Blocks({ blocks, query }) {
  return (blocks || []).map((b, i) => {
    if (b.type === "p") {
      return (
        <p key={i} className="mb-3 text-ink leading-relaxed">
          <InlineParts parts={b.parts} query={query} />
        </p>
      );
    }
    if (b.type === "callout") return <Callout key={i} kind={b.kind} parts={b.parts} query={query} />;
    if (b.type === "ul") {
      return (
        <ul key={i} className="mb-3 list-disc pl-5 space-y-1.5 text-ink leading-relaxed">
          {b.items.map((it, j) => (
            <li key={j}>
              <InlineParts parts={it} query={query} />
            </li>
          ))}
        </ul>
      );
    }
    if (b.type === "ol") {
      return (
        <ol key={i} className="mb-3 list-decimal pl-5 space-y-1.5 text-ink leading-relaxed">
          {b.items.map((it, j) => (
            <li key={j}>
              <InlineParts parts={it} query={query} />
            </li>
          ))}
        </ol>
      );
    }
    if (b.type === "table") {
      return (
        <div key={i} className="mb-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-surface-sunken" : ""}>
                  {row.map((cell, ci) => {
                    const Tag = ri === 0 ? "th" : "td";
                    return (
                      <Tag
                        key={ci}
                        className="border border-border px-2.5 py-1.5 text-left align-top font-normal text-ink"
                      >
                        <InlineParts parts={cell} query={query} />
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (b.type === "heading") {
      const text = plainTextFromParts(b.parts);
      if (b.level >= 3) {
        return (
          <h3 key={i} className="text-base font-semibold text-ink mt-4 mb-2">
            <InlineParts parts={b.parts} query={query} />
          </h3>
        );
      }
      return (
        <h3 key={i} className="text-base font-semibold text-ink mt-4 mb-2">
          {text}
        </h3>
      );
    }
    return null;
  });
}

function CopyLinkButton({ id }) {
  const [done, setDone] = useState(false);
  const onCopy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <SecondaryButton type="button" onClick={onCopy} className="!min-h-[44px]" title="Copy link">
      <Link2 className="w-3.5 h-3.5" aria-hidden />
      <span className="sr-only sm:not-sr-only sm:inline">{done ? "Copied" : "Copy link"}</span>
    </SecondaryButton>
  );
}

export default function ManualPage() {
  const { qaRole } = useOutletContext() || {};
  const location = useLocation();
  const sections = useMemo(() => loadManualSections(), []);
  const [roleView, setRoleView] = useState("everyone");
  const [query, setQuery] = useState("");
  const [jump, setJump] = useState("");

  useEffect(() => {
    if (qaRole && ROLE_OPTIONS.some((o) => o.value === qaRole)) {
      setRoleView(qaRole);
    }
  }, [qaRole]);

  useEffect(() => {
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, sections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => s.searchText.includes(q) || s.title.toLowerCase().includes(q));
  }, [sections, query]);

  const dayBlurb = YOUR_DAY[roleView] || YOUR_DAY.everyone;

  const onPrint = () => {
    window.print();
  };

  return (
    <div className="qa-manual">
      <style>{`
        @media print {
          .qa-manual-nav, .qa-manual-toolbar, .qa-layout-tabs, aside { display: none !important; }
          .qa-manual-section { break-inside: avoid; }
          .qa-manual-main { max-width: none !important; }
        }
      `}</style>

      <PageTaskHeader
        title="User manual"
        subtitle="How to use the QA module — short steps, real button names."
      >
        <div className="qa-manual-toolbar flex flex-wrap items-center gap-2">
          <PrimaryButton type="button" icon={Printer} onClick={onPrint}>
            Print / Save as PDF
          </PrimaryButton>
        </div>
      </PageTaskHeader>

      <div className="qa-manual-toolbar mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink min-w-[10rem]">
            <span className="block text-[11px] font-medium text-ink-muted mb-1">I am a…</span>
            <TinySelect
              value={roleView}
              onChange={(e) => setRoleView(e.target.value)}
              aria-label="Role for highlighting sections"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="text-sm text-ink flex-1 min-w-[12rem]">
            <span className="block text-[11px] font-medium text-ink-muted mb-1">Search this manual</span>
            <span className="relative block">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <TinyInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a word…"
                className="!pl-8"
                aria-label="Search manual"
              />
            </span>
          </label>
        </div>
        <div className="rounded-md border border-accent-border/40 bg-accent-soft/40 px-3 py-2">
          <p className="text-[11px] font-semibold text-accent uppercase tracking-wide">Your day</p>
          <p className="text-sm text-ink mt-0.5">{dayBlurb}</p>
        </div>
        <label className="md:hidden text-sm text-ink">
          <span className="block text-[11px] font-medium text-ink-muted mb-1">Jump to section</span>
          <TinySelect
            value={jump}
            onChange={(e) => {
              const id = e.target.value;
              setJump(id);
              if (id) {
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                window.history.replaceState(null, "", `#${id}`);
              }
            }}
            aria-label="Jump to section"
          >
            <option value="">Choose a section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.order}. {s.title}
              </option>
            ))}
          </TinySelect>
        </label>
      </div>

      <div className="flex gap-6 items-start">
        <nav
          className="qa-manual-nav hidden md:block sticky top-3 w-56 shrink-0 max-h-[calc(100vh-6rem)] overflow-y-auto"
          aria-label="Manual contents"
        >
          <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" aria-hidden />
            Contents
          </p>
          <ol className="space-y-0.5 text-sm">
            {sections.map((s) => {
              const forRole =
                roleView === "everyone" ||
                (s.roles || []).includes("everyone") ||
                (s.roles || []).includes(roleView);
              const hiddenBySearch = query.trim() && !filtered.some((f) => f.id === s.id);
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`block rounded px-2 py-1.5 min-h-[36px] leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                      forRole && !hiddenBySearch
                        ? "text-ink bg-accent-soft/50 border border-accent-border/30"
                        : "text-ink-muted hover:text-ink"
                    } ${hiddenBySearch ? "opacity-40" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById(s.id);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.history.replaceState(null, "", `#${s.id}`);
                    }}
                  >
                    <span className="text-[10px] text-ink-muted mr-1">{s.order}.</span>
                    {s.title}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="qa-manual-main min-w-0 flex-1 max-w-[42rem] text-[16px] leading-[1.65]">
          {filtered.length === 0 ? (
            <InlineAlert tone="info">No sections match your search. Try another word.</InlineAlert>
          ) : null}
          {filtered.map((s) => {
            const forRole =
              roleView === "everyone" ||
              (s.roles || []).includes("everyone") ||
              (s.roles || []).includes(roleView);
            return (
              <section
                key={s.id}
                id={s.id}
                className={`qa-manual-section scroll-mt-4 mb-10 rounded-lg border p-4 sm:p-5 ${
                  forRole ? "border-accent-border/50 bg-accent-soft/15" : "border-border bg-surface"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <h2 className="text-xl font-semibold text-ink tracking-tight">{s.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <CopyLinkButton id={s.id} />
                    {s.showMeRoute ? (
                      <Link
                        to={s.showMeRoute}
                        className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-md border border-border bg-surface text-sm font-medium text-accent hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {SHOW_ME_LABELS[s.showMeRoute] || "Show me"}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {s.example ? <ManualExample kind={s.example} /> : null}
                <Blocks blocks={s.blocks} query={query.trim()} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
