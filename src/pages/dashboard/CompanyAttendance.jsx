import React, { useMemo, useState } from "react";

const SEGMENTS = [
  ["on", "On time", "var(--success)"],
  ["late", "Late", "var(--warning)"],
  ["leave", "On leave", "var(--info)"],
  ["absent", "Absent", "var(--critical)"],
];

function tone(pct) {
  if (pct >= 92) return "var(--success)";
  if (pct >= 88) return "var(--warning)";
  return "var(--critical)";
}

function Donut({ stats, roster }) {
  const expected = stats?.expected || 0;
  const radius = 70;
  const circ = 2 * Math.PI * radius;
  let cursor = 0;
  const rings = SEGMENTS.map(([key, label, color]) => {
    const count = stats?.[key] || 0;
    const length = expected ? (count / expected) * circ : 0;
    const ring = { key, label, color, count, length, offset: cursor };
    cursor += length;
    return ring;
  });
  const pct = stats?.pct || 0;
  const idle = !expected;
  const idleLabel = roster > 0 ? "Weekly off" : "Not recorded";

  return (
    <svg className="ca-donut" viewBox="0 0 200 200" role="img" aria-label="Attendance today">
      <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--border)" strokeWidth="22" />
      {rings.map((ring) =>
        ring.length > 0 ? (
          <circle
            key={ring.key}
            className="ca-seg"
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={ring.color}
            strokeWidth="22"
            strokeDasharray={`${ring.length} ${circ - ring.length}`}
            strokeDashoffset={-ring.offset}
            transform="rotate(-90 100 100)"
          >
            <title>{`${ring.label}: ${ring.count}`}</title>
          </circle>
        ) : null
      )}
      <text x="100" y="96" textAnchor="middle" className="ca-donut-pct">
        {idle ? "—" : `${pct.toFixed(1)}%`}
      </text>
      <text x="100" y="118" textAnchor="middle" className="ca-donut-sub">
        {idle ? idleLabel : `${stats.present} of ${expected} present`}
      </text>
    </svg>
  );
}

export default function CompanyAttendance({ loading, error, snapshot, canOpen, onOpen }) {
  const [dept, setDept] = useState("");
  const company = snapshot?.company;
  const selected = useMemo(
    () => snapshot?.departments?.find((row) => row.name === dept) || null,
    [dept, snapshot]
  );
  const stats = selected || company;

  return (
    <section className="ca" aria-label="Attendance">
      {!snapshot ? (
        <article className="cp-panel">
          <div className="cp-panel-head">
            <h2>Company attendance today</h2>
            {canOpen ? (
              <button type="button" className="ca-clear" onClick={onOpen}>
                Open attendance
              </button>
            ) : null}
          </div>
          <p className="cp-note">{error || (loading ? "Loading attendance…" : "Attendance figures are not available right now.")}</p>
        </article>
      ) : (
        <>
      <div className="ca-row">
        <article className="cp-panel">
          <div className="cp-panel-head">
            <h2>{selected ? `${selected.name} today` : "Company attendance today"}</h2>
            {selected ? (
              <button type="button" className="ca-clear" onClick={() => setDept("")}>
                Whole company
              </button>
            ) : canOpen ? (
              <button type="button" className="ca-clear" onClick={onOpen}>
                Open attendance
              </button>
            ) : null}
          </div>
          {error ? <p className="cp-note">{error}</p> : null}
            <div className="ca-today">
              <Donut stats={stats} roster={snapshot?.roster || 0} />
              <div className="ca-legend">
                {SEGMENTS.map(([key, label, color]) => {
                  const count = stats?.[key] || 0;
                  const share = stats?.expected ? (count / stats.expected) * 100 : 0;
                  return (
                    <div key={key} style={{ "--c": color }}>
                      <i />
                      <span>{label}</span>
                      <b>{count}</b>
                      <small>{stats?.expected ? `${share.toFixed(1)}%` : "—"}</small>
                    </div>
                  );
                })}
              </div>
            </div>
        </article>

        <article className="cp-panel">
          <div className="cp-panel-head">
            <h2>Attendance by department</h2>
            <span className="ca-note">tick = {snapshot?.target || 92}% target</span>
          </div>
          <div className="ca-depts">
            {(snapshot?.departments || []).map((row) => (
              <button
                key={row.name}
                type="button"
                className={dept === row.name ? "is-on" : ""}
                style={{ "--c": tone(row.pct), "--tick": `${snapshot?.target || 92}%` }}
                onClick={() => setDept((current) => (current === row.name ? "" : row.name))}
              >
                <span>{row.name}</span>
                <span className="ca-track">
                  <i className="ca-fill" style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }} />
                </span>
                <em>{Math.round(row.pct)}%</em>
              </button>
            ))}
            {!snapshot.departments.length ? <p className="cp-note">No department attendance for today.</p> : null}
          </div>
        </article>
      </div>
        </>
      )}
    </section>
  );
}
