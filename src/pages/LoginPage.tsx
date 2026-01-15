// src/pages/LoginPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import trayflowIcon from "../assets/trayflow-icon.png";
import { supabase } from "../utils/supabaseClient";

const GREEN = "#047857";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // AppShell / RequireAuth will route them into the app after session exists
      navigate("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErr("Enter your email first, then click “Forgot your password?”");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      setMsg("Password reset email sent. Check your inbox (and spam) for the TrayFlow reset link.");
    } catch (e: any) {
      setErr(e?.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "#f7fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 18,
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          padding: 22,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <img
            src={trayflowIcon}
            alt="TrayFlow"
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#0f172a" }}>Admin Login</div>
            <div style={{ marginTop: 6, color: "#475569", fontSize: 16 }}>
              Sign in to manage orders, tasks, and customers.
            </div>
          </div>
        </div>

        {/* Messages */}
        {err && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #fecaca",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}

        {msg && (
          <div
            style={{
              background: "#dcfce7",
              color: "#065f46",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #bbf7d0",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {msg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSignIn} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                outline: "none",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 16,
              border: "none",
              background: GREEN,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: !canSubmit || loading ? "not-allowed" : "pointer",
              opacity: !canSubmit || loading ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {loading ? "Working…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            style={{
              background: "transparent",
              border: "none",
              color: GREEN,
              fontWeight: 900,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              textDecoration: "underline",
              textAlign: "left",
              padding: 0,
              marginTop: 2,
            }}
          >
            Forgot your password?
          </button>
        </form>

        <div style={{ marginTop: 14, color: "#64748b", fontSize: 12, opacity: 0.9 }}>
          Tip: Enter your email above, click “Forgot your password?”, then use the link in the email to set a new password.
        </div>
      </div>
    </div>
  );
}
