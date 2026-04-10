import { useMemo, type CSSProperties } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsTimeseriesPoint } from "../lib/playground";
import { InlineState } from "./playground-ui";

export type AnalyticsMetricKey =
  | "errors"
  | "keywordMentions"
  | "estimatedCostUsd"
  | "inputTokens"
  | "outputTokens";

const METRIC_META: Record<AnalyticsMetricKey, {
  label: string;
  color: string;
  axis: "signals" | "cost" | "tokens";
  areaFill?: string;
  glow: string;
}> = {
  errors: {
    label: "Errors",
    color: "#ff6b7a",
    axis: "signals",
    glow: "rgba(255, 107, 122, 0.24)",
  },
  keywordMentions: {
    label: "Keywords",
    color: "#f5b73b",
    axis: "signals",
    glow: "rgba(245, 183, 59, 0.24)",
  },
  estimatedCostUsd: {
    label: "Estimated cost",
    color: "#22b8a2",
    axis: "cost",
    glow: "rgba(34, 184, 162, 0.22)",
  },
  inputTokens: {
    label: "Input tokens",
    color: "#5f86ff",
    axis: "tokens",
    areaFill: "rgba(95, 134, 255, 0.16)",
    glow: "rgba(95, 134, 255, 0.22)",
  },
  outputTokens: {
    label: "Output tokens",
    color: "#7dd3fc",
    axis: "tokens",
    areaFill: "rgba(125, 211, 252, 0.14)",
    glow: "rgba(125, 211, 252, 0.2)",
  },
};

const AXIS_META: Array<{ id: "signals" | "tokens" | "cost"; label: string }> = [
  { id: "signals", label: "Left axis · incidents" },
  { id: "tokens", label: "Layered area · token volume" },
  { id: "cost", label: "Right axis · spend" },
];

function formatBucketLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(date);
}

function formatMetric(metric: AnalyticsMetricKey, value: number): string {
  if (metric === "estimatedCostUsd") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 4,
    }).format(value);
  }

  return new Intl.NumberFormat().format(value);
}

function MetricLegendItem(props: { metric: AnalyticsMetricKey }) {
  const meta = METRIC_META[props.metric];
  return (
    <div
      className="analytics-chart-legend-item"
      style={{
        "--analytics-chart-series-color": meta.color,
        "--analytics-chart-series-glow": meta.glow,
      } as CSSProperties}
    >
      <span className="analytics-chart-legend-swatch" />
      <span>{meta.label}</span>
    </div>
  );
}

function AnalyticsTimeseriesTooltip(props: TooltipProps<number, string>) {
  const rows = props.payload?.filter((entry) => {
    return typeof entry.dataKey === "string" && entry.dataKey in METRIC_META;
  }) ?? [];

  if (!props.active || !props.label || rows.length === 0) {
    return null;
  }

  return (
    <div className="analytics-chart-tooltip">
      <div className="analytics-chart-tooltip-label">{formatBucketLabel(String(props.label))}</div>
      <div className="analytics-chart-tooltip-list">
        {rows.map((entry) => {
          const metric = entry.dataKey as AnalyticsMetricKey;
          return (
            <div key={metric} className="analytics-chart-tooltip-row">
              <div className="analytics-chart-tooltip-meta">
                <span
                  className="analytics-chart-tooltip-dot"
                  style={{ backgroundColor: METRIC_META[metric].color }}
                />
                <span>{METRIC_META[metric].label}</span>
              </div>
              <span className="analytics-chart-tooltip-value">
                {formatMetric(metric, Number(entry.value ?? 0))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsTimeseries(props: {
  points: AnalyticsTimeseriesPoint[];
  metrics: AnalyticsMetricKey[];
  loading?: boolean;
  error?: string | null;
}) {
  const activeMetrics = useMemo(
    () => props.metrics.filter((metric) => metric in METRIC_META),
    [props.metrics]
  );
  const hasSignalMetrics = activeMetrics.some((metric) => METRIC_META[metric].axis === "signals");
  const hasTokenMetrics = activeMetrics.some((metric) => METRIC_META[metric].axis === "tokens");
  const hasCostMetrics = activeMetrics.some((metric) => METRIC_META[metric].axis === "cost");

  if (props.error) {
    return (
      <InlineState
        variant="error"
        title="Could not load the analytics timeseries"
        detail={props.error}
      />
    );
  }

  if (!props.loading && props.points.length === 0) {
    return (
      <InlineState
        variant="neutral"
        title="No analytics points yet"
        detail="Run backfill or wait for middleware traffic to populate the local warehouse."
      />
    );
  }

  return (
    <div className="analytics-chart-shell">
      <div className="analytics-chart-header">
        <div className="analytics-chart-legend">
          {activeMetrics.map((metric) => (
            <MetricLegendItem key={metric} metric={metric} />
          ))}
        </div>
        <div className="analytics-chart-axis-notes">
          {AXIS_META.filter((axis) =>
            (axis.id === "signals" && hasSignalMetrics)
            || (axis.id === "tokens" && hasTokenMetrics)
            || (axis.id === "cost" && hasCostMetrics)
          ).map((axis) => (
            <span key={axis.id}>{axis.label}</span>
          ))}
        </div>
      </div>
      <div className="analytics-chart-stage">
        <div className="analytics-chart-glow analytics-chart-glow-a" />
        <div className="analytics-chart-glow analytics-chart-glow-b" />
        <div className="analytics-chart-glow analytics-chart-glow-c" />
      </div>
      <div className="analytics-chart-frame">
        <div className="h-[410px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={props.points} margin={{ top: 12, right: 24, bottom: 12, left: 2 }}>
            <defs>
              <linearGradient id="analytics-input-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METRIC_META.inputTokens.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={METRIC_META.inputTokens.color} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="analytics-output-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={METRIC_META.outputTokens.color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={METRIC_META.outputTokens.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--analytics-chart-grid)" strokeDasharray="3 11" vertical={false} />
            <XAxis
              dataKey="bucket"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fontSize: 11, fill: "var(--analytics-chart-axis)" }}
              tickFormatter={formatBucketLabel}
              padding={{ left: 10, right: 10 }}
              minTickGap={24}
            />
            <YAxis
              yAxisId="signals"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fontSize: 11, fill: "var(--analytics-chart-axis)" }}
              width={52}
              domain={[0, "auto"]}
              hide={!hasSignalMetrics}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fontSize: 11, fill: METRIC_META.estimatedCostUsd.color }}
              width={60}
              domain={[0, "auto"]}
              hide={!hasCostMetrics}
            />
            <YAxis
              yAxisId="tokens"
              orientation="right"
              hide
              domain={[0, "auto"]}
            />
            <Tooltip
              cursor={{ stroke: "var(--analytics-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 6" }}
              content={<AnalyticsTimeseriesTooltip />}
              wrapperStyle={{ outline: "none", zIndex: 20 }}
              contentStyle={{
                background: "transparent",
                border: "none",
                boxShadow: "none",
                padding: 0,
              }}
            />
            {activeMetrics.includes("inputTokens") ? (
              <Area
                yAxisId="tokens"
                type="monotone"
                dataKey="inputTokens"
                name={METRIC_META.inputTokens.label}
                stroke={METRIC_META.inputTokens.color}
                fill="url(#analytics-input-fill)"
                fillOpacity={1}
                strokeWidth={2.2}
                strokeLinecap="round"
                dot={false}
                activeDot={false}
              />
            ) : null}
            {activeMetrics.includes("outputTokens") ? (
              <Area
                yAxisId="tokens"
                type="monotone"
                dataKey="outputTokens"
                name={METRIC_META.outputTokens.label}
                stroke={METRIC_META.outputTokens.color}
                fill="url(#analytics-output-fill)"
                fillOpacity={1}
                strokeWidth={2.2}
                strokeLinecap="round"
                dot={false}
                activeDot={false}
              />
            ) : null}
            {activeMetrics.includes("errors") ? (
              <Line
                yAxisId="signals"
                type="monotone"
                dataKey="errors"
                name={METRIC_META.errors.label}
                stroke={METRIC_META.errors.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 2.5, fill: METRIC_META.errors.color, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "var(--surface-strong)", strokeWidth: 2 }}
              />
            ) : null}
            {activeMetrics.includes("keywordMentions") ? (
              <Line
                yAxisId="signals"
                type="monotone"
                dataKey="keywordMentions"
                name={METRIC_META.keywordMentions.label}
                stroke={METRIC_META.keywordMentions.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 2.5, fill: METRIC_META.keywordMentions.color, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "var(--surface-strong)", strokeWidth: 2 }}
              />
            ) : null}
            {activeMetrics.includes("estimatedCostUsd") ? (
              <Line
                yAxisId="cost"
                type="monotone"
                dataKey="estimatedCostUsd"
                name={METRIC_META.estimatedCostUsd.label}
                stroke={METRIC_META.estimatedCostUsd.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="8 6"
                dot={false}
              />
            ) : null}
            <Brush
              dataKey="bucket"
              height={28}
              travellerWidth={8}
              fill="var(--analytics-chart-brush-fill)"
              stroke="var(--analytics-chart-brush-stroke)"
              tickFormatter={formatBucketLabel}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
}
