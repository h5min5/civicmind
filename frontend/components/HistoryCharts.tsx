"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryView, NamedCount } from "@/lib/history";

const tooltipStyle = {
  background: "rgba(7, 14, 10, 0.94)",
  border: "1px solid rgba(61, 220, 132, 0.28)",
  borderRadius: 12,
  color: "#e9fff2",
};

const tick = { fill: "#93b5a0", fontSize: 12 };
const grid = "rgba(61, 220, 132, 0.12)";

const SEVERITY_COLOR: Record<string, string> = {
  Low: "#7dcea0",
  Medium: "#3ddc84",
  High: "#e0b15a",
  Critical: "#ff7a7a",
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
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={tick}
                interval={singleYear ? 0 : 11}
                tickFormatter={(label: string) => (singleYear ? label : label.split(" ")[1] || label)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
              <Area type="monotone" dataKey="count" name="Complaints" stroke="#3ddc84" fill="rgba(61,220,132,0.18)" strokeWidth={2} />
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
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="name" tick={tick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
                <Bar dataKey="count" name="Complaints" radius={[6, 6, 0, 0]}>
                  {data.severities.map((item) => (
                    <Cell key={item.name} fill={SEVERITY_COLOR[item.name] || "#3ddc84"} />
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

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function HorizontalBars({ title, data }: { title: string; data: NamedCount[] }) {
  const narrow = useNarrow();
  const height = Math.max(220, data.length * (narrow ? 36 : 32));
  return (
    <article className="card chart-card">
      <h3>{title}</h3>
      <div className="chart-frame" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={narrow ? 92 : 168}
              tick={tick}
              tickFormatter={(name: string) => (narrow && name.length > 14 ? `${name.slice(0, 13)}…` : name)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCount(Number(value)), "Complaints"]} />
            <Bar dataKey="count" name="Complaints" fill="#3ddc84" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function formatCount(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-IN") : "0";
}
