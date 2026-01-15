import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Handle both styles:
        // 1) ?code=... (PKCE flow)
        // 2) #access_token=... (implicit/hash flow)
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
        } else {
          // If it's a hash-token link, Supabase will pick it up on getSession
          const { data, error: sessErr } = await supabase.auth.getSession();
          if (sessErr) throw sessErr;

          // No session => user opened /reset-password directly
          if (!data.session) {
            setError("Please open the password reset link from your email again.");
            setReady(false);
            return;
          }
        }

        if (!alive) return;
        setReady(true);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Could not open reset session. Please re-open the link from your email.");
        setReady(false);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleSave = async () => {
    setError(null);

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;

      // Optional but recommended: sign out so they re-login with the new password
      await supabase.auth.signOut();

      navigate("/login", { replace: true });
    } catch (e: any) {
      setError(e?.message ?? "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h1 className="page-title">Reset password</h1>

      {loading ? (
        <p className="page-text">Opening reset session…</p>
      ) : !ready ? (
        <p className="page-text" style={{ color: "#b91c1c" }}>
          {error ?? "Please re-open the reset link from your email."}
        </p>
      ) : (
        <>
          <p className="page-text" style={{ opacity: 0.8 }}>
            Enter a new password for your TrayFlow account.
          </p>

          {error && (
            <p className="page-text" style={{ color: "#b91c1c" }}>
              {error}
            </p>
          )}

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>New password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.8rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid #cbd5f5",
                  fontSize: 16,
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Confirm password</div>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.8rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid #cbd5f5",
                  fontSize: 16,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "0.7rem 1.2rem",
                  borderRadius: 999,
                  border: "none",
                  background: "#047857",
                  color: "white",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving…" : "Save new password"}
              </button>

              <button
                onClick={() => navigate("/login")}
                style={{
                  padding: "0.7rem 1.2rem",
                  borderRadius: 999,
                  border: "1px solid #cbd5f5",
                  background: "#fff",
                  color: "#0f172a",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Back to login
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
