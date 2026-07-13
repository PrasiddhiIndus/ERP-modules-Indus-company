import React from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import { API_STATUS_LABELS } from "../config/apiConstants";

function ChartTooltip({ active, payload, label, t }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div
      className="rounded-lg border px-2.5 py-2 text-[11px] shadow-lg"
      style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder }}
    >
      <p className="font-medium" style={{ color: t.text }}>
        {formatDateTimeDdMmYyyy(label || row?.time)}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className={t.muted}>
          {p.name}:{" "}
          <span className="font-semibold" style={{ color: t.text }}>
            {p.value}
            {p.dataKey === "availability" ? "%" : p.dataKey === "latencyMs" ? " ms" : ""}
          </span>
        </p>
      ))}
      {row?.status ? (
        <p className={`mt-0.5 ${t.muted}`}>Status: {API_STATUS_LABELS[row.status] || row.status}</p>
      ) : null}
    </div>
  );
}

function ChartEmpty({ message, t }) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 gap-2 ${t.muted}`}>
      <BarChart3 className="w-8 h-8 opacity-40" strokeWidth={1.25} />
      <p className="text-xs">{message}</p>
    </div>
  );
}

export function LatencyTrendChart({ data, t, reducedMotion, compact = false }) {
  const height = compact ? 160 : 200;
  const anim = reducedMotion ? 0 : 350;

  if (!data?.length) {
    return <ChartEmpty message="No check history yet." t={t} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
        <XAxis dataKey="time" tick={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: t.chartTick }} width={40} unit="ms" />
        <Tooltip content={<ChartTooltip t={t} />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={() => <span style={{ color: t.chartTick }}>Response time (ms)</span>}
        />
        <Line
          type="monotone"
          dataKey="latencyMs"
          name="Response time"
          stroke={t.dark ? "#60a5fa" : "#1F3A8A"}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={anim}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AvailabilityTrendChart({ data, t, reducedMotion, compact = false }) {
  const height = compact ? 160 : 200;
  const anim = reducedMotion ? 0 : 350;
  const stroke = t.dark ? "#34d399" : "#059669";
  const fill = t.dark ? "#064e3b" : "#d1fae5";

  if (!data?.length) {
    return <ChartEmpty message="No availability data yet." t={t} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <defs>
          <linearGradient id="availGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={fill} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
        <XAxis dataKey="time" tick={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: t.chartTick }} width={40} unit="%" />
        <Tooltip content={<ChartTooltip t={t} />} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={() => <span style={{ color: t.chartTick }}>Availability (%)</span>}
        />
        <Area
          type="stepAfter"
          dataKey="availability"
          name="Availability"
          stroke={stroke}
          fill="url(#availGradient)"
          strokeWidth={2}
          animationDuration={anim}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
