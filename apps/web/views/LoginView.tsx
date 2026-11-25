"use client";

import { TEST_IDS } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "../components/BrandMark";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import { errorMessage } from "../lib/api";
import { useNotifications } from "../lib/notifications";
import { ROLE_HOME } from "../lib/roles";
import { useSession } from "../lib/session";
import styles from "./LoginView.module.css";

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
      // The sign-in replaces any earlier toast (a failed attempt, an expired session).
      clear();
    } catch (error) {
      notifyError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Brand />
        <h1 className={styles.title}>Sign in</h1>
        <form className={styles.form} onSubmit={onSubmit}>
          <Field label="Email">
            {({ id }) => (
              <Input
                id={id}
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
            )}
          </Field>
          <Field label="Password">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid={TEST_IDS.loginPasswordInput}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            block
            busy={submitting}
            data-testid={TEST_IDS.loginSubmitButton}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
      <p className={styles.footnote}>
        ShiftPatch is a demo. All agencies, nurses and shifts are fictional.
      </p>
    </main>
  );
}
