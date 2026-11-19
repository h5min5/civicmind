"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, loginAccount, logoutAccount, registerAccount, type SessionUser } from "@/lib/api";

const TOKEN_KEY = "civicmind.token";
const USER_KEY = "civicmind.user";

type SessionValue = {
  user: SessionUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signUp: (name: string, email: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

function persist(token: string, user: SessionUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    void fetchMe()
      .then((body) => {
        setUser(body.user);
        window.localStorage.setItem(USER_KEY, JSON.stringify(body.user));
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      async signIn(email, password) {
        const body = await loginAccount(email, password);
        persist(body.token, body.user);
        setUser(body.user);
        return body.user;
      },
      async signUp(name, email, password) {
        const body = await registerAccount(name, email, password);
        persist(body.token, body.user);
        setUser(body.user);
        return body.user;
      },
      async signOut() {
        try {
          await logoutAccount();
        } catch {
          /* the local session is cleared either way */
        }
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
        setUser(null);
      },
    }),
    [ready, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session is unavailable.");
  return value;
}
