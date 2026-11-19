"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { fetchMyComplaints, fetchNotifications, markAllNotificationsRead, type SessionUser } from "@/lib/api";
import { departmentLabel, formatWhen, labelize, statusLabel } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function AccountPage() {
  const { user, ready, signIn, signUp, signOut } = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complaints, setComplaints] = useState<Record<string, string | null>[]>([]);
  const [notes, setNotes] = useState<{ id: string; title: string; body: string; created_at: string; unread: boolean }[]>([]);

  useEffect(() => {
    if (!user) return;
    void fetchMyComplaints().then((body) => setComplaints(body.complaints)).catch(() => setComplaints([]));
    void fetchNotifications().then((body) => setNotes(body.notifications)).catch(() => setNotes([]));
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") await signUp(name, email, password);
      else await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="page"><p className="empty">Checking the session…</p></main>;

  return (
    <main className="page">
      <section className="intro">
        <h1>{user ? user.name : "Your civic record"}</h1>
        <p>
          {user
            ? `${user.email} · ${user.role === "citizen" ? "Citizen" : user.role === "admin" ? "Administrator" : departmentLabel(user.department)}`
            : "Sign in to keep a complaint history and receive status updates. Filing a report still works without an account."}
        </p>
      </section>
      {!user && (
        <form className="card form" onSubmit={submit}>
          <div className="language-row">
            <button type="button" className={mode === "in" ? "chip on" : "chip"} onClick={() => setMode("in")}>
              Sign in
            </button>
            <button type="button" className={mode === "up" ? "chip on" : "chip"} onClick={() => setMode("up")}>
              Create account
            </button>
          </div>
          {mode === "up" && (
            <label className="field">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
            </label>
          )}
          <label className="field">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "up" ? "Create citizen account" : "Sign in"}
          </button>
          <p className="hint">Demo citizen: citizen@civicmind.in / Citizen@12345. Department desks sign in from the command center.</p>
        </form>
      )}
      {user && (
        <>
          <div className="row-actions">
            <button className="button secondary" type="button" onClick={() => void signOut()}>
              Sign out
            </button>
            {user.role !== "citizen" && (
              <Link className="button" href="/authority">
                Open command center
              </Link>
            )}
          </div>
          <section className="card">
            <div className="id-row">
              <h2>Notifications</h2>
              {notes.some((item) => item.unread) && (
                <button className="ghost" type="button" onClick={() => void markAllNotificationsRead().then(() => setNotes((current) => current.map((item) => ({ ...item, unread: false }))))}>
                  Mark all read
                </button>
              )}
            </div>
            {notes.length === 0 && <p className="empty">No notifications yet.</p>}
            <div className="records">
              {notes.map((item) => (
                <article className="record" key={item.id}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <p className="quiet">{formatWhen(item.created_at)}{item.unread ? " · unread" : ""}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="card">
            <h2>My complaints</h2>
            {complaints.length === 0 && <p className="empty">Complaints filed while signed in appear here.</p>}
            <div className="records">
              {complaints.map((item) => (
                <article className="record" key={String(item.id)}>
                  <header>
                    <span className="badge">{statusLabel(item.status)}</span>
                    <span className="badge">{departmentLabel(item.department)}</span>
                  </header>
                  <h3>{labelize(String(item.issue_type || "complaint"))}</h3>
                  <p>{item.description}</p>
                  <div className="meta">
                    {item.tracking_code && (
                      <Link href={`/track/${item.tracking_code}`}>{item.tracking_code}</Link>
                    )}
                    {item.incident_tracking_code && <span>{item.incident_tracking_code}</span>}
                    {item.timestamp && <span>{formatWhen(item.timestamp)}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export type { SessionUser };
