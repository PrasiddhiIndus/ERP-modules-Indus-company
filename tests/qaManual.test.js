import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  MANUAL_SECTION_IDS,
  QA_HELP_ANCHORS,
  loadManualSections,
  helpHrefForPath,
} from "../src/pages/qa/manual/loadManual.js";
import { parseFrontMatter, parseMarkdownBlocks, sectionSearchText } from "../src/pages/qa/manual/parseManualMd.js";
import ManualPage from "../src/pages/qa/manual/ManualPage.jsx";
import { QA_BASE } from "../src/pages/qa/qaConstants.js";

const SHOW_ME_ROUTES = [
  "/app/qa",
  "/app/qa/requests",
  "/app/qa/cases",
  "/app/qa/cases/new",
  "/app/qa/execution",
  "/app/qa/defects",
  "/app/qa/traceability",
  "/app/qa/release-gate",
  "/app/qa/audit",
];

/** Labels the manual promises that must still exist in QA UI source. */
const LABEL_SOURCES = {
  "New QA request": "src/pages/qa/RequestsBoardPage.jsx",
  "Create request": "src/pages/qa/RequestFormModal.jsx",
  "New case": "src/pages/qa/TestCasesPage.jsx",
  "Create case": "src/pages/qa/TestCaseFormPage.jsx",
  "Approve version": "src/pages/qa/TestCaseDetailPage.jsx",
  "Request changes": "src/pages/qa/TestCaseDetailPage.jsx",
  "Mark obsolete": "src/pages/qa/TestCaseDetailPage.jsx",
  "New test run": "src/pages/qa/ExecutionPage.jsx",
  "Create run": "src/pages/qa/ExecutionPage.jsx",
  "Record result": "src/pages/qa/ExecutionPage.jsx",
  "Retest (new attempt)": "src/pages/qa/ExecutionPage.jsx",
  "Log defect": "src/pages/qa/DefectsPage.jsx",
  "Save waiver": "src/pages/qa/ReleaseGatePage.jsx",
  "Confirm sign-off": "src/pages/qa/ReleaseGatePage.jsx",
  "Copy test completion report": "src/pages/qa/ReleaseGatePage.jsx",
  "Export CSV": "src/pages/qa/TraceabilityPage.jsx",
  "Verify chain": "src/pages/qa/AuditTrailPage.jsx",
  "Evidence link": "src/pages/qa/RequestDetailPage.jsx",
  "Save link": "src/pages/qa/RequestDetailPage.jsx",
};

describe("QA user manual content", () => {
  it("loads every expected section id in order", () => {
    const sections = loadManualSections();
    expect(sections.map((s) => s.id)).toEqual(MANUAL_SECTION_IDS);
    expect(sections).toHaveLength(27);
  });

  it("parses front matter and markdown blocks", () => {
    const raw = `---
id: "demo"
title: "Demo"
roles: ["tester"]
order: 1
showMeRoute: "/app/qa"
---

Hello **world**.

1. Step one
2. Step two

> **Remember:** Be kind.
`;
    const { meta, body } = parseFrontMatter(raw);
    expect(meta.id).toBe("demo");
    expect(meta.roles).toEqual(["tester"]);
    expect(meta.showMeRoute).toBe("/app/qa");
    const blocks = parseMarkdownBlocks(body);
    expect(blocks.some((b) => b.type === "p")).toBe(true);
    expect(blocks.some((b) => b.type === "ol")).toBe(true);
    expect(blocks.some((b) => b.type === "callout")).toBe(true);
  });

  it("search text includes section body words", () => {
    const sections = loadManualSections();
    const welcome = sections.find((s) => s.id === "welcome");
    expect(welcome.searchText).toContain("bakery");
    const words = sections.find((s) => s.id === "words");
    expect(sectionSearchText(words)).toContain("defect");
  });

  it("help anchors map to existing section ids", () => {
    const ids = new Set(MANUAL_SECTION_IDS);
    for (const [path, anchor] of Object.entries(QA_HELP_ANCHORS)) {
      expect(ids.has(anchor), `${path} → #${anchor}`).toBe(true);
    }
    expect(helpHrefForPath("/app/qa/requests")).toBe(`${QA_BASE}/manual#new-request`);
    expect(helpHrefForPath("/app/qa/execution")).toBe(`${QA_BASE}/manual#run-a-test`);
    expect(helpHrefForPath("/app/qa/defects/DEF-1")).toBe(`${QA_BASE}/manual#bugs`);
  });

  it("every Show me route is a known QA path", () => {
    const sections = loadManualSections();
    for (const s of sections) {
      if (!s.showMeRoute) continue;
      const ok =
        SHOW_ME_ROUTES.includes(s.showMeRoute) ||
        s.showMeRoute.startsWith("/app/qa/");
      expect(ok, `${s.id} showMeRoute ${s.showMeRoute}`).toBe(true);
    }
  });

  it("renders all section headings and anchors", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/app/qa/manual"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/app/qa/manual",
            element: React.createElement(ManualPage),
          })
        )
      )
    );
    for (const id of MANUAL_SECTION_IDS) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("User manual");
    expect(html).toContain("I am a");
    expect(html).toContain("Search this manual");
  });
});

describe("QA manual label checklist (source grep)", () => {
  it("manual-mentioned button labels still appear in UI files", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const root = resolve(process.cwd());
    for (const [label, rel] of Object.entries(LABEL_SOURCES)) {
      const text = readFileSync(resolve(root, rel), "utf8");
      expect(text.includes(label), `"${label}" missing from ${rel}`).toBe(true);
    }
  });
});
