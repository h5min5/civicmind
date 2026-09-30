"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryView, NamedCount } from "@/lib/history";

const tooltipStyle = {
  background: "#fff8f3",
  border: "1px solid rgba(68, 93, 72, 0.18)",
  borderRadius: 12,
  color: "#1c2820",
};

const SEVERITY_COLOR: Record<string, string> = {
  Low: "#445D48",
  Medium: "#8A7340",
  High: "#A15C2A",
  Critical: "#8F3D32",
};

export function HistoryCharts({ data }: { data: HistoryView }) {
  const singleYear = data.timeline.length <= 12;
  if (data.total === 0) {
    return <p className="empty">No historical complaints match these filters.</p>;
  }
  return (
    <div className="chart-stack">
      <article className="card chart-card">
        <h3>Complaints over time</h3>
        <p className="hint">{singleYear ? "Month by month for the selected year." : "Monthly volume across the archive."}</p>
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(68, 93, 72, 0.12)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#3e4a43", fontSize: 12 }}
                interval={singleYear ? 0 : 11}
                tickFormatter={(label: string) => (singleYear ? label : label.split(" ")[1] || label)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={{ fill: "#3e4a43", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
              <Area type="monotone" dataKey="count" name="Complaints" stroke="#445D48" fill="#D6CC99" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
      <HorizontalBars title="By category" data={data.categories} />
      <div className="chart-grid">
        <article className="card chart-card">
          <h3>By severity</h3>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.severities} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(68, 93, 72, 0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#3e4a43", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#3e4a43", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
                <Bar dataKey="count" name="Complaints" radius={[6, 6, 0, 0]}>
                  {data.severities.map((item) => (
                    <Cell key={item.name} fill={SEVERITY_COLOR[item.name] || "#445D48"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <HorizontalBars title="By status" data={data.statuses} />
      </div>
      <HorizontalBars title="By area" data={data.wards} />
    </div>
  );
}

function HorizontalBars({ title, data }: { title: string; data: NamedCount[] }) {
  const height = Math.max(220, data.length * 32);
  return (
    <article className="card chart-card">
      <h3>{title}</h3>
      <div className="chart-frame" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(68, 93, 72, 0.12)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fill: "#3e4a43", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={210} tick={{ fill: "#3e4a43", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
            <Bar dataKey="count" name="Complaints" fill="#445D48" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function formatCount(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-IN") : "0";
}
