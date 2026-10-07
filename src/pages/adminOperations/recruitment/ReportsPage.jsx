import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { PIPELINE_STAGES, STAGE_INDEX } from "./recruitmentConfig";
import { listCandidates, listInterviews, listOffers, listRequisitions } from "./recruitmentService";
import { AsyncBoundary, Card, DataTable, ProgressBar, StatTile, btn, useRecruitmentData } from "./RecruitmentUi";

async function loadReports() {
  const [candidates, interviews, offers, requisitions] = await Promise.all([listCandidates(), listInterviews(), listOffers(), listRequisitions()]);
  return { candidates, interviews, offers, requisitions };
}

function exportCsv(fileName, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map((h) => esc(h.label)).join(","), ...rows.map((r) => headers.map((h) => esc(r[h.key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const hasJoined = (c) => STAGE_INDEX[c.stage] >= STAGE_INDEX.joined;
const tooltipStyle = { fontSize: 11, borderRadius: 6, border: "1px solid var(--border)" };

export default function ReportsPage() {
  const { data, loading, error, reload } = useRecruitmentData(loadReports);
  return (
    <AsyncBoundary loading={loading} error={error} onRetry={reload} rows={8}>
      {data ? <ReportsBody data={data} /> : null}
    </AsyncBoundary>
  );
}

function ReportsBody({ data }) {
  const { candidates, interviews, offers, requisitions } = data;

  const funnel = useMemo(
    () =>
      PIPELINE_STAGES.map((s) => ({
        label: s.label,
        reached: candidates.filter((c) => STAGE_INDEX[c.stage] >= STAGE_INDEX[s.key]).length,
      })),
    [candidates]
  );

  const sources = useMemo(() => {
    const map = {};
    candidates.forEach((c) => {
      const key = c.source || "Unknown";
      const row = (map[key] = map[key] || { id: key, source: key, candidates: 0, interviewed: 0, offered: 0, joined: 0 });
      row.candidates += 1;
      if (STAGE_INDEX[c.stage] >= STAGE_INDEX.interview) row.interviewed += 1;
      if (STAGE_INDEX[c.stage] >= STAGE_INDEX.offer) row.offered += 1;
      if (hasJoined(c)) row.joined += 1;
    });
    return Object.values(map).map((r) => ({ ...r, conversion: pct(r.joined, r.candidates) }));
  }, [candidates]);

  const timeToHire = useMemo(
    () =>
      requisitions.map((r) => {
        const hires = candidates.filter((c) => c.requisitionId === r.id && c.actualJoining);
        const days = hires.map((c) => Math.max(0, Math.round((new Date(c.actualJoining) - new Date(c.addedOn)) / 86400000)));
        return {
          id: r.id,
          requisitionNo: r.requisitionNo,
          designation: r.designation,
          positions: r.positions,
          filled: r.filled,
          hires: hires.length,
          avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
        };
      }),
    [requisitions, candidates]
  );

  const recruiters = useMemo(() => {
    const map = {};
    candidates.forEach((c) => {
      const key = c.recruiter || "Unassigned";
      const row = (map[key] = map[key] || { id: key, recruiter: key, candidates: 0, shortlisted: 0, joined: 0 });
      row.candidates += 1;
      if (STAGE_INDEX[c.stage] >= STAGE_INDEX.shortlisted) row.shortlisted += 1;
      if (hasJoined(c)) row.joined += 1;
    });
    return Object.values(map);
  }, [candidates]);

  const attended = interviews.filter((i) => ["attended", "evaluated"].includes(i.status)).length;
  const noShow = interviews.filter((i) => i.status === "no_show").length;
  const accepted = offers.filter((o) => o.status === "accepted").length;
  const closedOffers = offers.filter((o) => ["accepted", "declined", "expired"].includes(o.status)).length;
  const avgHire = timeToHire.filter((t) => t.avgDays != null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Interview attendance" value={`${pct(attended, attended + noShow)}%`} sub={`${attended} attended · ${noShow} no-shows`} tone="success" />
        <StatTile label="Offer acceptance" value={`${pct(accepted, closedOffers)}%`} sub={`${accepted} of ${closedOffers} closed offers`} tone="accent" />
        <StatTile label="Overall conversion" value={`${pct(candidates.filter(hasJoined).length, candidates.length)}%`} sub="Candidate → joined" tone="info" />
        <StatTile label="Avg. time to hire" value={avgHire.length ? `${Math.round(avgHire.reduce((s, t) => s + t.avgDays, 0) / avgHire.length)} d` : "—"} sub="Added → joined" />
      </div>

      <Card title="Pipeline conversion" right={<button type="button" className={btn.ghost} onClick={() => exportCsv("pipeline-conversion.csv", [{ key: "label", label: "Stage" }, { key: "reached", label: "Candidates reached" }], funnel)}><Download className="h-3.5 w-3.5" /> CSV</button>}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-secondary)" }} interval={0} angle={-20} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--row-hover)" }} />
              <Bar dataKey="reached" name="Reached stage" fill="var(--info)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card
          title="Source effectiveness"
          right={
            <button type="button" className={btn.ghost} onClick={() => exportCsv("source-effectiveness.csv", [{ key: "source", label: "Source" }, { key: "candidates", label: "Candidates" }, { key: "interviewed", label: "Interviewed" }, { key: "offered", label: "Offered" }, { key: "joined", label: "Joined" }, { key: "conversion", label: "Conversion %" }], sources)}>
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          }
        >
          <DataTable
            rowKey="id"
            columns={[
              { key: "source", label: "Source" },
              { key: "candidates", label: "Candidates", align: "right" },
              { key: "interviewed", label: "Interviewed", align: "right" },
              { key: "offered", label: "Offered", align: "right" },
              { key: "joined", label: "Joined", align: "right" },
              { key: "conversion", label: "Conversion", render: (r) => <div className="w-24"><ProgressBar value={r.conversion} total={100} showLabel={false} tone="success" /><span className="text-[10px] text-ink-muted">{r.conversion}%</span></div> },
            ]}
            rows={sources}
            initialSort={{ key: "candidates", dir: "desc" }}
          />
        </Card>

        <Card
          title="Recruiter productivity"
          right={
            <button type="button" className={btn.ghost} onClick={() => exportCsv("recruiter-productivity.csv", [{ key: "recruiter", label: "Recruiter" }, { key: "candidates", label: "Candidates" }, { key: "shortlisted", label: "Shortlisted" }, { key: "joined", label: "Joined" }], recruiters)}>
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          }
        >
          <DataTable
            rowKey="id"
            columns={[
              { key: "recruiter", label: "Recruiter" },
              { key: "candidates", label: "Candidates", align: "right" },
              { key: "shortlisted", label: "Shortlisted", align: "right" },
              { key: "joined", label: "Joined", align: "right" },
            ]}
            rows={recruiters}
            initialSort={{ key: "candidates", dir: "desc" }}
          />
        </Card>
      </div>

      <Card
        title="Requisition fulfilment & time to hire"
        right={
          <button type="button" className={btn.ghost} onClick={() => exportCsv("time-to-hire.csv", [{ key: "requisitionNo", label: "Requisition" }, { key: "designation", label: "Position" }, { key: "positions", label: "Required" }, { key: "filled", label: "Filled" }, { key: "avgDays", label: "Avg days to hire" }], timeToHire)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        }
      >
        <DataTable
          rowKey="id"
          columns={[
            { key: "requisitionNo", label: "Requisition", render: (r) => <span className="font-mono text-[11px]">{r.requisitionNo}</span> },
            { key: "designation", label: "Position" },
            { key: "filled", label: "Filled", sortValue: (r) => r.filled / r.positions, render: (r) => <div className="w-28"><ProgressBar value={r.filled} total={r.positions} tone={r.filled >= r.positions ? "success" : "accent"} /></div> },
            { key: "avgDays", label: "Avg. days to hire", align: "right", render: (r) => (r.avgDays == null ? "—" : `${r.avgDays} d`) },
          ]}
          rows={timeToHire}
          initialSort={{ key: "requisitionNo", dir: "asc" }}
        />
      </Card>
    </div>
  );
}
