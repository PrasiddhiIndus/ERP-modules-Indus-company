import { parseFrontMatter, parseMarkdownBlocks, sectionSearchText } from "./parseManualMd.js";
import { QA_BASE } from "../qaConstants";
import welcomeRaw from "./content/01-welcome.md?raw";
import wordsRaw from "./content/02-words.md?raw";
import rolesRaw from "./content/03-roles.md?raw";
import journeyRaw from "./content/04-journey.md?raw";
import coloursRaw from "./content/05-colours.md?raw";
import findYourWayRaw from "./content/06-find-your-way.md?raw";
import dashboardRaw from "./content/07-dashboard.md?raw";
import newRequestRaw from "./content/08-new-request.md?raw";
import classAndRiskRaw from "./content/09-class-and-risk.md?raw";
import nextStationRaw from "./content/10-next-station.md?raw";
import writeATestRaw from "./content/11-write-a-test.md?raw";
import checkATestRaw from "./content/12-check-a-test.md?raw";
import makeARunRaw from "./content/13-make-a-run.md?raw";
import runATestRaw from "./content/14-run-a-test.md?raw";
import reportABugRaw from "./content/15-report-a-bug.md?raw";
import bugsRaw from "./content/16-bugs.md?raw";
import retestRaw from "./content/17-retest.md?raw";
import signRaw from "./content/18-sign.md?raw";
import traceabilityRaw from "./content/19-traceability.md?raw";
import releaseGateRaw from "./content/20-release-gate.md?raw";
import reportRaw from "./content/21-report.md?raw";
import auditRaw from "./content/22-audit.md?raw";
import shortcutsRaw from "./content/23-shortcuts.md?raw";
import yourDayRaw from "./content/24-your-day.md?raw";
import whyCantIRaw from "./content/25-why-cant-i.md?raw";
import goldenRulesRaw from "./content/26-golden-rules.md?raw";
import faqRaw from "./content/27-faq.md?raw";

export const QA_BASE_MANUAL = `${QA_BASE}/manual`;

const RAW_FILES = [
  welcomeRaw,
  wordsRaw,
  rolesRaw,
  journeyRaw,
  coloursRaw,
  findYourWayRaw,
  dashboardRaw,
  newRequestRaw,
  classAndRiskRaw,
  nextStationRaw,
  writeATestRaw,
  checkATestRaw,
  makeARunRaw,
  runATestRaw,
  reportABugRaw,
  bugsRaw,
  retestRaw,
  signRaw,
  traceabilityRaw,
  releaseGateRaw,
  reportRaw,
  auditRaw,
  shortcutsRaw,
  yourDayRaw,
  whyCantIRaw,
  goldenRulesRaw,
  faqRaw,
];

/** Map of QA page paths → manual section ids for contextual help. */
export const QA_HELP_ANCHORS = {
  "/app/qa": "dashboard",
  "/app/qa/dashboard": "dashboard",
  "/app/qa/requests": "new-request",
  "/app/qa/cases": "write-a-test",
  "/app/qa/execution": "run-a-test",
  "/app/qa/defects": "bugs",
  "/app/qa/traceability": "traceability",
  "/app/qa/release-gate": "release-gate",
  "/app/qa/audit": "audit",
  "/app/qa/standards": "golden-rules",
  "/app/qa/manual": "welcome",
};

export const MANUAL_SECTION_IDS = [
  "welcome",
  "words",
  "roles",
  "journey",
  "colours",
  "find-your-way",
  "dashboard",
  "new-request",
  "class-and-risk",
  "next-station",
  "write-a-test",
  "check-a-test",
  "make-a-run",
  "run-a-test",
  "report-a-bug",
  "bugs",
  "retest",
  "sign",
  "traceability",
  "release-gate",
  "report",
  "audit",
  "shortcuts",
  "your-day",
  "why-cant-i",
  "golden-rules",
  "faq",
];

let cached = null;

export function loadManualSections() {
  if (cached) return cached;
  cached = RAW_FILES.map((raw) => {
    const { meta, body } = parseFrontMatter(raw);
    const blocks = parseMarkdownBlocks(body);
    const section = {
      id: meta.id,
      title: meta.title,
      roles: Array.isArray(meta.roles) ? meta.roles : [],
      order: Number(meta.order) || 0,
      showMeRoute: meta.showMeRoute || null,
      example: meta.example || null,
      blocks,
    };
    section.searchText = sectionSearchText(section);
    return section;
  }).sort((a, b) => a.order - b.order);
  return cached;
}

export function helpHrefForPath(pathname) {
  const clean = String(pathname || "").replace(/\/+$/, "") || "/";
  const exact = QA_HELP_ANCHORS[clean];
  if (exact) return `${QA_BASE_MANUAL}#${exact}`;
  const prefix = Object.keys(QA_HELP_ANCHORS)
    .filter((k) => k !== "/app/qa" && clean.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return `${QA_BASE_MANUAL}#${QA_HELP_ANCHORS[prefix]}`;
  if (clean.startsWith("/app/qa")) return `${QA_BASE_MANUAL}#welcome`;
  return QA_BASE_MANUAL;
}
