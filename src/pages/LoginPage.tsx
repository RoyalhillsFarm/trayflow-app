// src/pages/LoginPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim();

      if (!trimmedEmail) throw new Error("Enter an email.");
      if (!password) throw new Error("Enter a password.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) throw new Error(error.message);

        navigate("/", { replace: true });
        return;
      }

      // SIGN UP
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      if (error) throw new Error(error.message);

      // If email confirmation is enabled in Supabase, session may be null until confirmed.
      const hasSession = Boolean(data.session);

      if (hasSession) {
        navigate("/", { replace: true });
      } else {
        setInfoMsg(
          "Account created. Check your email for a confirmation link, then come back and sign in."
        );
        setMode("signin");
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: 380, maxWidth: "90vw" }}>
        <h1 style={{ marginBottom: 8 }}>
          {mode === "signin" ? "Admin Login" : "Create Account"}
        </h1>

        <p style={{ opacity: 0.7, marginTop: 0, marginBottom: 16 }}>
          {mode === "signin"
            ? "Sign in to manage orders, tasks, and customers."
            : "Create an account to access TrayFlow."}
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
            />
            {mode === "signup" && (
              <small style={{ opacity: 0.7 }}>At least 6 characters.</small>
            )}
          </label>

          {errorMsg && (
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,0,0,0.08)" }}>
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(0,128,0,0.08)" }}>
              {infoMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "#111",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading
              ? mode === "signin"
                ? "Signing in..."
                : "Creating..."
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
          {mode === "signin" ? (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setInfoMsg(null);
                setMode("signup");
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                opacity: 0.85,
              }}
            >
              Don’t have an account? Create one
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setInfoMsg(null);
                setMode("signin");
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                opacity: 0.85,
              }}
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
