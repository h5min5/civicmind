"use client";

import type { PriorityScore } from "@/lib/api";

export function PriorityMeter({ priority }: { priority: PriorityScore }) {
  const factors = priority.factors ?? [
    { key: "impact", label: "Impact", weight: 0.3, score: priority.impact, detail: "" },
    { key: "risk", label: "Safety risk", weight: 0.25, score: priority.risk, detail: "" },
    { key: "volume", label: "Report volume", weight: 0.2, score: priority.volume, detail: "" },
    { key: "location", label: "Location", weight: 0.15, score: priority.location, detail: "" },
    { key: "duration", label: "Duration", weight: 0.1, score: priority.duration, detail: "" },
  ];
  return (
    <div className="priority-meter">
      <div className="priority-score">
        <strong>{priority.score.toFixed(1)}</strong>
        <span>/ 10 priority{priority.urgent ? " · urgent" : ""}</span>
      </div>
      <div className="factor-list">
        {factors.map((factor) => (
          <div key={factor.key}>
            <div className="factor-label">
              <span>
                {factor.label} · {Math.round(factor.weight * 100)}%
              </span>
              <span>{factor.score}/10</span>
            </div>
            <div className="factor-track" aria-hidden="true">
              <i style={{ width: `${factor.score * 10}%` }} />
            </div>
            {factor.detail && <p className="hint">{factor.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
