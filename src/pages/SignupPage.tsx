// src/pages/SignupPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import trayflowIcon from "../assets/trayflow-icon.png";
import { supabase } from "../utils/supabaseClient";

const GREEN = "#047857";

export default function SignupPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 8 &&
    confirm.length >= 8 &&
    !loading;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErr("Please enter your email.");
      return;
    }

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      setMsg("Account created. Next, choose your TrayFlow plan.");
      navigate("/choose-plan", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Could not create account.");
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <img
            src={trayflowIcon}
            alt="TrayFlow"
            style={{ width: 44, height: 44, objectFit: "contain" }}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: "#0f172a" }}>
              Create Account
            </div>
            <div style={{ marginTop: 6, color: "#475569", fontSize: 16 }}>
              Start your TrayFlow workspace.
            </div>
          </div>
        </div>

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

        <form onSubmit={handleSignup} style={{ display: "grid", gap: 12 }}>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
              Confirm Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
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
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 16,
              border: "none",
              background: GREEN,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: !canSubmit ? "not-allowed" : "pointer",
              opacity: !canSubmit ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 16,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
              fontSize: 17,
              fontWeight: 800,
              cursor: "pointer",
              marginTop: 4,
            }}
          >
            Back to login
          </button>
        </form>
      </div>
    </div>
  );
}