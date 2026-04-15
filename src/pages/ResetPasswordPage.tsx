// src/pages/ResetPasswordPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

const GREEN = "#047857";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        setErr(error.message);
      } else if (!data.session) {
        setErr("Reset link is invalid or expired. Please request a new password reset email.");
      }

      setChecking(false);
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Password updated successfully. You can now continue into TrayFlow.");
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (e: any) {
      setErr(e?.message ?? "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ fontWeight: 700, opacity: 0.7 }}>Loading…</div>
      </div>
    );
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
        <div style={{ fontSize: 34, fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
          Reset Password
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

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>New Password</span>
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
              Confirm New Password
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
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 16,
              border: "none",
              background: GREEN,
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: 6,
            }}
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}