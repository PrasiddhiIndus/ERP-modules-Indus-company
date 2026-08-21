import React, { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_SERIES, CHART_SERIES_AREA, TOKENS } from "../../theme/tokens";

const AXIS = { fontSize: 11, fill: TOKENS.textMuted, fontFamily: "IBM Plex Mono, ui-monospace, monospace" };
const GRID = TOKENS.chartGrid;
const TIP_STYLE = {
  background: TOKENS.surface,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: TOKENS.text,
  boxShadow: "0 8px 24px rgba(18,21,26,0.08)",
  maxWidth: 280,
};

/** Compact INR for axis ticks (avoids clipping long numbers). */
export function compactInrTick(n) {
  const num = Number(n) || 0;
  const a = Math.abs(num);
  const s = num < 0 ? "-" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}k`;
  return `${s}${Math.round(a)}`;
}

/** Same unit for every tick on a chart (prevents Cr / L mixing on one axis). */
export function makeMoneyAxisFormatter(sampleValues = []) {
  const max = Math.max(0, ...sampleValues.map((v) => Math.abs(Number(v) || 0)));
  if (max >= 1e7) {
    return (n) => {
      const num = Number(n) || 0;
      const s = num < 0 ? "-" : "";
      return `${s}${(Math.abs(num) / 1e7).toFixed(1)}Cr`;
    };
  }
  if (max >= 1e5) {
    return (n) => {
      const num = Number(n) || 0;
      const s = num < 0 ? "-" : "";
      return `${s}${(Math.abs(num) / 1e5).toFixed(1)}L`;
    };
  }
  if (max >= 1e3) {
    return (n) => {
      const num = Number(n) || 0;
      const s = num < 0 ? "-" : "";
      return `${s}${(Math.abs(num) / 1e3).toFixed(0)}k`;
    };
  }
  return (n) => String(Math.round(Number(n) || 0));
}

export function truncateLabel(text, max = 14) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

export function ChartTooltip({ active, payload, label, formatter, titleKey = "fullName" }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const heading = row[titleKey] || row.name || label;
  return (
    <div style={TIP_STYLE} className="px-3 py-2.5">
      {heading != null && heading !== "" ? (
        <p className="type-body-medium text-ink mb-1.5 leading-snug break-words">{heading}</p>
      ) : null}
      {payload.map((p, i) => {
        const raw = p.value;
        const shown = formatter ? formatter(raw, p.name, p) : raw;
        return (
          <div key={i} className="flex items-center gap-2 type-table-cell text-ink py-0.5">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: p.color || CHART_SERIES[i % CHART_SERIES.length] }} />
            <span className="text-ink-secondary">{p.name}</span>
            <span className="type-num ml-auto tabular-nums">{shown}</span>
          </div>
        );
      })}
      {row._hint ? <p className="type-meta text-ink-muted mt-1.5">{row._hint}</p> : null}
    </div>
  );
}

/** Soft panel wrapper for dashboard charts */
export function ChartPanel({ title, subtitle, right, children, className = "", height = 240, onOpen, openLabel = "Open" }) {
  return (
    <div className={`bg-surface rounded-card border border-border shadow-card ${className}`}>
      {(title || right || onOpen) && (
        <div className="erp-card-header border-b border-divider flex items-center justify-between gap-3 min-h-[48px] bg-surface-raised rounded-t-card px-4">
          <div className="min-w-0">
            {title ? <h3 className="type-card-title text-ink type-truncate">{title}</h3> : null}
            {subtitle ? <p className="type-meta text-ink-muted mt-0.5 type-truncate">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {right}
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="type-meta text-accent font-medium hover:underline"
              >
                {openLabel} →
              </button>
            ) : null}
          </div>
        </div>
      )}
      <div className="p-3 sm:p-4 overflow-visible min-w-0" style={{ height: typeof height === "number" ? height + 28 : undefined }}>
        <div className="min-w-0 w-full" style={{ height: typeof height === "number" ? height : height }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** KPI with embedded sparkline — replaces bare number cards */
export function SparkKpi({
  label,
  value,
  sub,
  series = [],
  color = CHART_SERIES[0],
  onClick,
  className = "",
}) {
  const gid = useId().replace(/:/g, "");
  const data = useMemo(
    () => (Array.isArray(series) ? series : []).map((v, i) => ({ i, v: Number(v) || 0 })),
    [series]
  );
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left w-full rounded-card border border-border bg-surface shadow-card px-4 py-3.5 transition-[border-color,background-color] duration-theme ease-theme ${
        onClick ? "cursor-pointer hover:border-accent-border hover:bg-row-hover" : ""
      } ${className}`}
    >
      <p className="type-mono-caption text-ink-muted">{label}</p>
      <div className="flex items-end justify-between gap-3 mt-1.5">
        <div className="min-w-0">
          <p className="type-figure text-ink">{value}</p>
          {sub ? <p className="type-meta text-ink-muted mt-1 type-truncate">{sub}</p> : null}
        </div>
        {data.length > 1 ? (
          <div className="w-[88px] h-10 shrink-0 opacity-90">
            <ResponsiveContainer width={88} height={40} minWidth={0}>
              <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#spk-${gid})`} isAnimationActive animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </Wrapper>
  );
}

export function AreaTrendChart({
  data = [],
  xKey = "name",
  series = [{ key: "value", name: "Value", color: CHART_SERIES[0] }],
  height = 220,
  formatter,
  yTickFormatter = compactInrTick,
  onPointClick,
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`area-${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color || CHART_SERIES[i % CHART_SERIES.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color || CHART_SERIES[i % CHART_SERIES.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={58}
          tickFormatter={yTickFormatter}
          tickMargin={6}
        />
        <Tooltip content={<ChartTooltip formatter={formatter} />} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} /> : null}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name || s.key}
            stroke={s.color || CHART_SERIES[i % CHART_SERIES.length]}
            fill={`url(#area-${gid}-${i})`}
            strokeWidth={2}
            isAnimationActive
            animationDuration={800}
            activeDot={
              onPointClick
                ? {
                    r: 5,
                    cursor: "pointer",
                    onClick: (_, payload) => onPointClick(payload?.payload),
                  }
                : undefined
            }
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarCompareChart({
  data = [],
  xKey = "name",
  series = [{ key: "value", name: "Value", color: CHART_SERIES[0] }],
  height = 220,
  layout = "vertical",
  formatter,
  stacked = false,
  yTickFormatter,
  xTickFormatter,
  categoryWidth = 118,
  onBarClick,
}) {
  const horizontal = layout === "horizontal";
  const moneyAxis = yTickFormatter || xTickFormatter || compactInrTick;
  const catTick = (v) => truncateLabel(v, horizontal ? 16 : 12);

  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={
          horizontal
            ? { top: 8, right: 16, left: 8, bottom: 4 }
            : { top: 8, right: 12, left: 4, bottom: 4 }
        }
      >
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={moneyAxis}
              tickMargin={6}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              width={categoryWidth}
              tickFormatter={catTick}
              tickMargin={8}
              interval={0}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval={0} tickFormatter={catTick} />
            <YAxis
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={moneyAxis}
              tickMargin={6}
            />
          </>
        )}
        <Tooltip
          cursor={{ fill: TOKENS.rowHover, opacity: 0.55 }}
          content={<ChartTooltip formatter={formatter} />}
        />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} /> : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name || s.key}
            fill={s.color || CHART_SERIES[i % CHART_SERIES.length]}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            stackId={stacked ? "a" : undefined}
            isAnimationActive
            animationDuration={750}
            maxBarSize={36}
            cursor={onBarClick ? "pointer" : "default"}
            onClick={(entry) => onBarClick?.(entry?.payload || entry)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data = [],
  nameKey = "name",
  valueKey = "value",
  height = 220,
  innerRadius = "58%",
  outerRadius = "78%",
  centerLabel,
  centerValue,
  formatter,
  onSliceClick,
}) {
  const rows = (data || []).filter((d) => (Number(d[valueKey]) || 0) > 0);
  const total = rows.reduce((a, d) => a + (Number(d[valueKey]) || 0), 0);
  return (
    <div className="relative w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Pie
            data={rows}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke={TOKENS.surface}
            strokeWidth={2}
            isAnimationActive
            animationDuration={800}
            onClick={(entry) => onSliceClick?.(entry?.payload || entry)}
            style={{ cursor: onSliceClick ? "pointer" : "default" }}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={formatter} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel != null || centerValue != null) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue != null ? <p className="type-figure text-ink">{centerValue ?? total}</p> : null}
          {centerLabel ? <p className="type-mono-caption text-ink-muted mt-0.5">{centerLabel}</p> : null}
        </div>
      )}
    </div>
  );
}

export function RadialScoreChart({
  value = 0,
  max = 100,
  label = "Score",
  color = CHART_SERIES[0],
  height = 180,
  onClick,
}) {
  const pct = max > 0 ? Math.min(100, Math.round((Number(value) / max) * 100)) : 0;
  const data = [{ name: label, value: pct, fill: color }];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full min-w-0 block text-left bg-transparent border-0 p-0 ${onClick ? "cursor-pointer" : "cursor-default"}`}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: TOKENS.surfaceSunken }} dataKey="value" cornerRadius={8} isAnimationActive animationDuration={900} />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="type-figure text-ink">{pct}%</p>
        <p className="type-mono-caption text-ink-muted mt-0.5">{label}</p>
      </div>
    </button>
  );
}

export function ComposedTrendChart({
  data = [],
  xKey = "name",
  bars = [],
  lines = [],
  areas = [],
  height = 220,
  formatter,
  yTickFormatter = compactInrTick,
  onPointClick,
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
        <defs>
          {areas.map((s, i) => (
            <linearGradient key={s.key} id={`cmp-${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color || CHART_SERIES[i % CHART_SERIES.length]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color || CHART_SERIES[i % CHART_SERIES.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" tickMargin={6} />
        <YAxis
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          width={58}
          tickFormatter={yTickFormatter}
          tickMargin={6}
        />
        <Tooltip content={<ChartTooltip formatter={formatter} />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        {areas.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name || s.key}
            stroke={s.color || CHART_SERIES[i % CHART_SERIES.length]}
            fill={`url(#cmp-${gid}-${i})`}
            strokeWidth={2}
            activeDot={
              onPointClick
                ? { r: 5, cursor: "pointer", onClick: (_, p) => onPointClick(p?.payload) }
                : { r: 4 }
            }
          />
        ))}
        {bars.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name || s.key}
            fill={s.color || CHART_SERIES[(i + 2) % CHART_SERIES.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            cursor={onPointClick ? "pointer" : "default"}
            onClick={(entry) => onPointClick?.(entry?.payload || entry)}
          />
        ))}
        {lines.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name || s.key}
            stroke={s.color || CHART_SERIES[(i + 1) % CHART_SERIES.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={
              onPointClick
                ? { r: 5, cursor: "pointer", onClick: (_, p) => onPointClick(p?.payload) }
                : { r: 4 }
            }
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Build a gentle fake spark from a single total (stable, deterministic). */
export function sparkFromValue(n, points = 10) {
  const base = Math.max(0, Number(n) || 0);
  if (base === 0) return Array.from({ length: points }, () => 0);
  const out = [];
  let v = base * 0.55;
  for (let i = 0; i < points; i++) {
    const wave = Math.sin(i * 0.9 + base * 0.01) * 0.12 + (i / (points - 1)) * 0.35;
    v = base * (0.55 + wave);
    out.push(Math.max(0, Math.round(v)));
  }
  out[out.length - 1] = base;
  return out;
}

/** Group dates into last N buckets for trend charts. */
export function bucketByDay(rows, dateKey, days = 14, valueFn = () => 1) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  const map = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { name: label, value: 0, _key: key });
  }
  for (const row of rows || []) {
    const raw = row?.[dateKey];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (map.has(key)) {
      const cell = map.get(key);
      cell.value += Number(valueFn(row)) || 0;
    }
  }
  return [...map.values()].map(({ name, value }) => ({ name, value }));
}

export function countByKey(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const k = keyFn(row) || "Other";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export { CHART_SERIES, CHART_SERIES_AREA, TOKENS };
