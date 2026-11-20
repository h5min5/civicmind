"use client";

import { useState } from "react";
import { askCitizen } from "@/lib/api";
import { useLocale, useTranslations, ViewText } from "@/lib/i18n";

type Turn = { role: "you" | "civic"; text: string; sources?: { title: string; source: string; excerpt: string }[]; mode?: string };

const PROMPTS = [
  "Which department handles a pothole?",
  "What has to be true for two complaints to join the same incident?",
  "How is the priority score calculated?",
  "What should I include when I report a problem?",
];

export default function AssistantPage() {
  const { t } = useLocale();
  const prompts = useTranslations(PROMPTS);
  const [question, setQuestion] = useState("");
  const [code, setCode] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const cleaned = text.trim();
    if (cleaned.length < 3) return;
    setBusy(true);
    setError(null);
    setTurns((current) => [...current, { role: "you", text: cleaned }]);
    setQuestion("");
    try {
      const reply = await askCitizen(cleaned, code.trim() || undefined);
      setTurns((current) => [...current, { role: "civic", text: reply.answer, sources: reply.sources, mode: reply.mode }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="intro">
        <h1>{t("assistant.title")}</h1>
        <p>
          The assistant answers from CivicMind’s operating notes and, if you add a tracking code, from that complaint’s stored
          status. It does not invent counts or circular numbers.
        </p>
      </section>
      <section className="card stack">
        <label className="field">
          Tracking code, optional
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="CM- or INC-" />
        </label>
        <div className="language-row">
          {PROMPTS.map((prompt, index) => (
            <button key={prompt} className="chip" type="button" onClick={() => void ask(prompt)} disabled={busy}>
              {prompts[index] || prompt}
            </button>
          ))}
        </div>
        <div className="chat-log">
          {turns.length === 0 && <p className="empty">Ask about reporting, routing, duplicates, or a tracking code.</p>}
          {turns.map((turn, index) => (
            <article key={`${turn.role}-${index}`} className={turn.role === "you" ? "bubble you" : "bubble"}>
              <p>{turn.role === "civic" ? <ViewText text={turn.text} /> : turn.text}</p>
              {turn.mode && <p className="quiet">{turn.mode === "model" ? "Answered by the language model from the notes below." : "Assembled from retrieved notes. The language model was not used."}</p>}
              {turn.sources && turn.sources.length > 0 && (
                <ul className="sources">
                  {turn.sources.map((source, index) => (
                    <li key={`${source.source}-${source.title}-${index}`}>
                      <strong>{source.title}</strong> · {source.source}
                      <span>{source.excerpt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a civic problem or a tracking code" />
          <button className="button" type="submit" disabled={busy || question.trim().length < 3}>
            {busy ? "Reading…" : "Ask"}
          </button>
        </form>
      </section>
    </main>
  );
}
