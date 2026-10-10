import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip, makeMoneyAxisFormatter, truncateLabel } from '../../../../components/charts/DashboardCharts';
import { TOKENS } from '../../../../theme/tokens';
import { MASKED_SECRET, salaryFiguresHidden } from '../salaryPrivacy';
import { formatInr } from './misMetrics';

const AXIS = { fontSize: 11, fill: TOKENS.textMuted, fontFamily: 'IBM Plex Mono, ui-monospace, monospace' };

export const moneyTip = (v) => (salaryFiguresHidden() ? MASKED_SECRET : `₹${formatInr(v)}`);

/** 12-month Total CTC (left axis) and headcount (right axis). */
export function CtcHeadcountTrend({ data, height = 240 }) {
  const hidden = salaryFiguresHidden();
  const moneyAxis = makeMoneyAxisFormatter(data.map((d) => d.totalCtc));
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={TOKENS.chartGrid} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis yAxisId="ctc" tick={AXIS} axisLine={false} tickLine={false} width={58}
          tickFormatter={hidden ? () => '' : moneyAxis} />
        <YAxis yAxisId="hc" orientation="right" tick={AXIS} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
        <Tooltip content={<ChartTooltip formatter={(v, name) => (name === 'Headcount' ? v : moneyTip(v))} titleKey="label" />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Line yAxisId="ctc" type="monotone" dataKey="totalCtc" name="Total CTC" stroke={TOKENS.accent} strokeWidth={2} dot={{ r: 3 }} />
        <Line yAxisId="hc" type="monotone" dataKey="headcount" name="Headcount" stroke={TOKENS.info} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Waterfall: previous total, each driver floating on the running total, current total. */
export function VarianceWaterfall({ bars, height = 280 }) {
  const hidden = salaryFiguresHidden();
  const moneyAxis = makeMoneyAxisFormatter(bars.map((b) => b.base + b.value));
  const color = (kind) => (kind === 'total' ? TOKENS.accent : kind === 'down' ? TOKENS.critical : TOKENS.success);
  const data = bars.map((b) => ({ ...b, fullName: b.label, shown: b.kind === 'total' ? b.value : b.amount }));
  const min = Math.min(...bars.filter((b) => b.kind !== 'total').map((b) => b.base), ...bars.map((b) => b.value));
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={TOKENS.chartGrid} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0}
          tickFormatter={(v) => truncateLabel(v, 11)} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={58}
          domain={[Math.max(0, Math.floor(min * 0.97)), 'auto']}
          tickFormatter={hidden ? () => '' : moneyAxis} allowDataOverflow />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = payload[0].payload;
          return (
            <ChartTooltip active payload={[{ name: row.kind === 'total' ? 'Total CTC' : 'Impact', value: row.shown, payload: row, color: color(row.kind) }]}
              formatter={(v) => moneyTip(v)} />
          );
        }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]} maxBarSize={44}>
          {data.map((d, i) => <Cell key={i} fill={color(d.kind)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
