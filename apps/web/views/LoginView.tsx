"use client";

import { TEST_IDS } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "../components/BrandMark";
import { NotificationBanner } from "../components/NotificationBanner";
import { errorMessage } from "../lib/api";
import { useNotifications } from "../lib/notifications";
import { ROLE_HOME } from "../lib/roles";
import { useSession } from "../lib/session";

export function LoginView() {
  const { state, login } = useSession();
  const { notifyError, clear } = useNotifications();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Signed in already, or just now: go to the role's home.
  const home =
    state.status === "authenticated" ? ROLE_HOME[state.user.role] : null;
  useEffect(() => {
    if (home) router.replace(home);
  }, [home, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // The sign-in replaces any earlier banner (a failed attempt, an expired session).
      clear();
    } catch (error) {
      notifyError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card card">
        <Brand />
        <div className="login-intro">
          <h1>Sign in</h1>
          <p className="muted">
            Post, claim and track nursing shifts across your agencies.
          </p>
        </div>
        <NotificationBanner />
        <form className="form-stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid={TEST_IDS.loginEmailInput}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid={TEST_IDS.loginPasswordInput}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            aria-disabled={submitting || undefined}
            data-testid={TEST_IDS.loginSubmitButton}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="login-footnote muted">
        ShiftPatch is a demo. All agencies, nurses and shifts are fictional.
      </p>
    </main>
  );
}
