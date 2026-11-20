"use client";

import { useLocale, useTranslations } from "@/lib/i18n";

const FEATURES = [
  {
    title: "Complaint Classification & Routing",
    text: "Identifies the issue and routes it to the right department.",
  },
  {
    title: "Multimodal Understanding",
    text: "Understands a complaint from the written report and, when one is attached, the photo.",
  },
  {
    title: "Severity & Priority Detection",
    text: "Identifies urgent complaints so they can be taken up first.",
  },
  {
    title: "Predictive Analytics & Civic Alerts",
    text: "Finds trends, forecasts complaint volume, and gives authorities a basis for timely civic notices.",
  },
  {
    title: "Duplicate Detection",
    text: "Finds similar complaints using the meaning of the report, the location, and the time.",
  },
  {
    title: "Complaint Tracking",
    text: "Tracks a complaint from submission through to resolution.",
  },
  {
    title: "GIS-Based Issue Mapping",
    text: "Maps complaints so recurring civic hotspots are visible.",
  },
  {
    title: "RAG-Based Policy Assistance",
    text: "Retrieves relevant policies to support how a complaint is resolved.",
  },
];

export function Features() {
  const { t } = useLocale();
  const lines = useTranslations(FEATURES.flatMap((feature) => [feature.title, feature.text]));
  return (
    <section className="features" aria-labelledby="features-title">
      <p className="eyebrow">{t("features.eyebrow")}</p>
      <h2 id="features-title">{t("features.title")}</h2>
      <div className="feature-grid">
        {FEATURES.map((feature, index) => (
          <article className="feature" key={feature.title}>
            <p className="feature-index">{String(index + 1).padStart(2, "0")}</p>
            <h3>{lines[index * 2] || feature.title}</h3>
            <p>{lines[index * 2 + 1] || feature.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
